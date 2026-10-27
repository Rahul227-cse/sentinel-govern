import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import { buildRequestBody, extractByPath, resolveEffectiveApiConfig } from '../src/services/inferenceService.js';
import { testEndpointConnection } from '../src/controllers/modelController.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { verifyAuditChainIntegrity } from '../src/services/auditEngine.js';

const TEST_PAYLOAD = {
  "AMT_ANNUITY": 25000,
  "AMT_CREDIT": 400000,
  "AMT_INCOME_TOTAL": 250000,
  "DAYS_BIRTH": -14600,
  "DAYS_EMPLOYED": -4380,
  "DAYS_CREDIT": -4380,
  "EXT_SOURCE_1": 0.85,
  "EXT_SOURCE_2": 0.8,
  "EXT_SOURCE_3": 0.82
};

test('CreditLens v2.0 Smoke-Test & Request Building Verification Suite', async (t) => {
  await mongoose.connect(process.env.MONGODB_URI);

  const model = await Model.findOne({ name: 'CreditLens' });
  assert.ok(model, 'CreditLens model must exist');
  const v1 = await ModelVersion.findOne({ modelId: model._id, version: 'v1.0' });
  const v2 = await ModelVersion.findOne({ modelId: model._id, version: 'v2.0' });
  assert.ok(v1, 'CreditLens v1.0 must exist');
  assert.ok(v2, 'CreditLens v2.0 must exist');

  await t.test('1. Request Building: v2.0 with empty wrapperKey sends payload unchanged without applicant wrapper', () => {
    const v2RequestMapping = {
      wrapperKey: '',
      isArray: false,
      fieldMap: {},
      customHeaders: {},
      staticFields: null
    };

    const outgoing = buildRequestBody(TEST_PAYLOAD, v2RequestMapping, {
      endpointUrl: 'https://credit-risk-scoring-58zh.onrender.com',
      predictEndpoint: '/score'
    });

    // Verification 1: Root contains AMT_INCOME_TOTAL
    assert.equal(outgoing.AMT_INCOME_TOTAL, 250000, 'AMT_INCOME_TOTAL must be directly at the root');
    assert.equal(outgoing.AMT_CREDIT, 400000, 'AMT_CREDIT must be at the root');
    assert.equal(outgoing.DAYS_BIRTH, -14600, 'DAYS_BIRTH must be at the root');

    // Verification 2: applicant wrapper is strictly ABSENT
    assert.equal(outgoing.applicant, undefined, 'applicant wrapper must NOT exist');
    assert.equal(outgoing.inputs, undefined, 'inputs wrapper must NOT exist');
    assert.equal(outgoing.data, undefined, 'data wrapper must NOT exist');

    // Verification 3: No default static model selector injected
    assert.equal(outgoing.model, undefined, 'No static model selector should be injected');

    // Verification 4: Deep equality with input payload
    assert.deepEqual(outgoing, TEST_PAYLOAD, 'Outgoing JSON must match the exact test payload');
  });

  await t.test('2. Request Building: v1.0 Model Default preserves applicant wrapper and model: "stacking"', () => {
    const v1RequestMapping = model.apiConfig?.requestMapping || {
      wrapperKey: 'applicant',
      staticFields: { model: 'stacking' }
    };

    const outgoing = buildRequestBody(TEST_PAYLOAD, v1RequestMapping, model.apiConfig);

    assert.ok(outgoing.applicant, 'v1.0 payload must have applicant wrapper');
    assert.equal(outgoing.model, 'stacking', 'v1.0 must preserve model: "stacking" static field');
  });

  await t.test('3. Live Endpoint Verification: testEndpointConnection returns HTTP 200 and extracts probability_of_default', async () => {
    const req = {
      params: { id: String(model._id) },
      body: {
        versionId: String(v2._id),
        endpointUrl: 'https://credit-risk-scoring-58zh.onrender.com',
        healthEndpoint: '/health',
        predictEndpoint: '/score',
        method: 'POST',
        authType: 'NONE',
        requestMapping: {
          wrapperKey: '',
          isArray: false,
          fieldMap: {},
          customHeaders: {},
          staticFields: null
        },
        responseMapping: {
          predictionField: 'probability_of_default',
          latencyField: ''
        },
        timeoutMs: 30000,
        testType: 'PREDICTION',
        testPayload: TEST_PAYLOAD
      }
    };

    let responseData = null;
    let responseStatus = 200;
    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    await testEndpointConnection(req, res);

    assert.ok(responseData, 'Response data must be returned');
    console.log('   Live Test Response StatusCode:', responseData.statusCode);
    console.log('   Live Test Latency:', responseData.latencyMs, 'ms');
    console.log('   Live Test Raw Response:', JSON.stringify(responseData.rawResponse));
    console.log('   Live Test Extracted Prediction:', responseData.extractedPrediction);

    assert.equal(responseData.success, true, 'Test connection must succeed');
    assert.equal(responseData.statusCode, 200, 'HTTP status code must be 200');
    assert.ok(responseData.rawResponse, 'Raw response must be present');
    assert.equal(typeof responseData.rawResponse.probability_of_default, 'number', 'probability_of_default must be a number');
    assert.equal(responseData.rawResponse.decision, 'approve', 'decision must be approve');

    // Extracted prediction must match probability_of_default
    assert.equal(
      responseData.extractedPrediction,
      responseData.rawResponse.probability_of_default,
      'Extracted prediction must match probability_of_default'
    );
    assert.notEqual(responseData.extractedPrediction, undefined, 'Extracted prediction must NOT be undefined');
  });

  await t.test('4. Safety & State Invariance: No automated saves, telemetry, or audit corruption', async () => {
    // 4a. Verify v2.0 apiConfig has NOT been saved
    const refreshedV2 = await ModelVersion.findById(v2._id);
    assert.equal(refreshedV2.apiConfig?.endpointUrl, null, 'v2.0 apiConfig.endpointUrl must remain null until user saves');

    // 4b. Verify v1.0 has 9 healthy telemetry batches preserved
    const v1Telemetries = await Telemetry.find({ modelId: model._id, versionId: v1._id });
    assert.equal(v1Telemetries.length, 9, 'v1.0 must still have all 9 healthy batches');

    // 4c. Verify v2.0 has 0 telemetry batches
    const v2Telemetries = await Telemetry.find({ modelId: model._id, versionId: v2._id });
    assert.equal(v2Telemetries.length, 0, 'v2.0 must have 0 telemetry batches');

    // 4d. Verify audit ledger chain
    const auditChain = await verifyAuditChainIntegrity();
    assert.equal(auditChain.valid, true, 'Audit ledger chain must be 100% valid');
  });

  await mongoose.disconnect();
});
