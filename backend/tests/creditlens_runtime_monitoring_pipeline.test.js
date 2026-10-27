import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  buildRequestBody,
  normalizeCreditApplicantPayload
} from '../src/services/inferenceService.js';
import {
  WORKLOAD_IDS,
  scoreWorkloadBatch,
  generateWorkloadSyntheticInputs
} from '../src/services/workloadService.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';

test('CreditLens Pipeline 1: normalizeCreditApplicantPayload maps flat features into standard applicant schema', () => {
  const flatCreditItem = {
    AMT_INCOME_TOTAL: 242500,
    AMT_CREDIT: 400000,
    DAYS_BIRTH: -13880,
    AMT_ANNUITY: 25000,
    DAYS_EMPLOYED: -1800,
    EXT_SOURCE_1: 0.75,
    EXT_SOURCE_2: 0.65,
    EXT_SOURCE_3: 0.70,
    isSyntheticWalkthroughTraffic: true
  };

  const normalized = normalizeCreditApplicantPayload(flatCreditItem);
  assert.ok(normalized.applicant, 'Must produce a nested applicant object');
  assert.equal(normalized.applicant.amt_income, 242500);
  assert.equal(normalized.applicant.amt_credit, 400000);
  assert.equal(normalized.applicant.amt_annuity, 25000);
  assert.equal(normalized.applicant.age, 38); // |-13880| / 365.25 rounded
  assert.equal(normalized.applicant.emp_years, 4.9); // |-1800| / 365.25 rounded to 1 dec
  assert.equal(normalized.applicant.region_rating, 2);
  assert.equal(normalized.applicant.ext_source_1, 0.75);
  assert.equal(normalized.model, 'lgbm');
});

test('CreditLens Pipeline 2: normalizeCreditApplicantPayload is idempotent and prevents double-wrapping', () => {
  const alreadyStructuredPayload = {
    applicant: {
      amt_income: 180000,
      amt_credit: 500000,
      age: 40
    },
    model: 'xgboost',
    low: 0.25,
    high: 0.75
  };

  const result = normalizeCreditApplicantPayload(alreadyStructuredPayload);
  assert.deepEqual(result, alreadyStructuredPayload, 'Already structured payload must remain untouched');
  assert.equal(result.applicant.applicant, undefined, 'Must not create double-nested applicant.applicant');
});

test('CreditLens Pipeline 3: buildRequestBody prevents double-wrapping when wrapperKey is explicitly configured', () => {
  const flatPayload = {
    AMT_INCOME_TOTAL: 200000,
    AMT_CREDIT: 350000,
    DAYS_BIRTH: -14000
  };

  const wrapped = buildRequestBody(flatPayload, { wrapperKey: 'applicant' });
  assert.ok(wrapped.applicant, 'Must have applicant key');
  assert.equal(wrapped.applicant.applicant, undefined, 'Must not double-wrap applicant.applicant');

  const alreadyStructured = {
    applicant: {
      amt_income: 200000,
      amt_credit: 350000
    }
  };
  const wrappedAgain = buildRequestBody(alreadyStructured, { wrapperKey: 'applicant' });
  assert.equal(wrappedAgain.applicant.applicant, undefined, 'Must not double-wrap when already structured');
});

test('CreditLens Pipeline 4: non-credit workloads (Fraud, Insurance) remain untouched by credit applicant normalization', () => {
  const fraudItem = {
    amount: 150.75,
    channel: 'CARD_NOT_PRESENT',
    country: 'US',
    timestamp: new Date().toISOString()
  };
  assert.deepEqual(normalizeCreditApplicantPayload(fraudItem), fraudItem);

  const insuranceItem = {
    age: 45,
    bmi: 27.5,
    children: 2,
    smoker: 'no',
    region: 'northwest'
  };
  assert.deepEqual(normalizeCreditApplicantPayload(insuranceItem), insuranceItem);
});

test('CreditLens Pipeline 5: scoreWorkloadBatch maps external CreditLens probability into probability_of_default', async () => {
  const modelId = new mongoose.Types.ObjectId();
  const versionId = new mongoose.Types.ObjectId();

  const origModelFindById = Model.findById;
  const origVersionFindById = ModelVersion.findById;
  const origFetch = global.fetch;

  Model.findById = () => ({
    select: () => Promise.resolve({
      _id: modelId,
      name: 'CreditLens',
      currentProductionVersionId: versionId,
      apiConfig: {
        endpointUrl: 'https://mohamedgamal04-creditlens.hf.space',
        predictEndpoint: '/predict',
        method: 'POST',
        responseMapping: { predictionField: 'decision' },
        status: 'CONNECTED'
      }
    })
  });

  ModelVersion.findById = () => ({
    select: () => Promise.resolve({
      _id: versionId,
      modelId,
      version: 'v1.0',
      lifecycleStatus: 'IN_PRODUCTION'
    })
  });

  let interceptedUrl = null;
  let interceptedBody = null;

  global.fetch = async (url, opts) => {
    interceptedUrl = url;
    interceptedBody = opts.body ? JSON.parse(opts.body) : null;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({
        probability: 0.0452,
        decision: 'approve',
        band: 'low',
        model: 'lgbm'
      })
    };
  };

  try {
    const inputs = [{
      AMT_INCOME_TOTAL: 220000,
      AMT_CREDIT: 380000,
      DAYS_BIRTH: -13500,
      AMT_ANNUITY: 24000,
      isSyntheticWalkthroughTraffic: true
    }];

    const scored = await scoreWorkloadBatch(WORKLOAD_IDS.CREDIT_RISK, inputs, {
      modelId,
      versionId,
      allowDraft: false
    });

    assert.equal(scored.length, 1);
    const rec = scored[0];

    // Verify outbound request had properly structured applicant schema
    assert.ok(interceptedBody.applicant, 'Outbound fetch must contain nested applicant');
    assert.equal(interceptedBody.applicant.amt_income, 220000);
    assert.equal(interceptedBody.applicant.amt_credit, 380000);

    // Verify scored telemetry record has all 5 required Evidently columns aligned with reference_credit_risk.csv
    assert.equal(rec.probability_of_default, 0.0452, 'probability must map to probability_of_default');
    assert.equal(rec.decision, 'approve');
    assert.equal(rec.AMT_INCOME_TOTAL, 220000);
    assert.equal(rec.AMT_CREDIT, 380000);
    assert.equal(rec.DAYS_BIRTH, -13500);
    assert.ok(typeof rec.latency_ms === 'number');
  } finally {
    Model.findById = origModelFindById;
    ModelVersion.findById = origVersionFindById;
    global.fetch = origFetch;
  }
});

test('CreditLens Pipeline 6: Monitoring.jsx contract verifies dynamic workload label, autofill protection, and URL validation', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const monitoringPath = path.resolve(__dirname, '../../frontend/src/pages/Monitoring.jsx');
  const source = await fs.readFile(monitoringPath, 'utf8');

  // Hardcoded subtitle replaced
  assert.equal(
    source.includes('Workload: <strong>Fraud Detection AI</strong>'),
    false,
    'Static Fraud Detection AI subtitle must not exist on model card'
  );
  assert.ok(
    source.includes('monitoringData?.workloadConfig?.name'),
    'Model card must use dynamic workloadConfig name'
  );

  // Autofill protection present on endpoint input
  assert.ok(
    source.includes('autoComplete="off"'),
    'Endpoint input must have autoComplete off'
  );

  // Frontend origin protection present in handleSaveEndpointConfig
  assert.ok(
    source.includes('cleanInputUrl === frontendOrigin') || source.includes('localhost:3000'),
    'handleSaveEndpointConfig must reject saving frontend origin localhost:3000'
  );
});
