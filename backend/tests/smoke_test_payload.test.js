import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { testEndpointConnection } from '../src/controllers/modelController.js';

/**
 * Regression Test: Smoke-Test Payload State Preservation
 * 
 * Verifies that the payload entered in the smoke-test textarea (testPayloadText)
 * is parsed and sent to the backend, preserving top-level objects like "applicant"
 * and preventing fallback to an empty object {}.
 */

// Model of frontend handleTestConnection payload parsing in Monitoring.jsx
function parseSmokeTestPayload({ testMode, testPayloadText, endpointForm }) {
  let parsedTestPayload = undefined;
  if (testMode === 'PREDICTION') {
    if (!endpointForm.predictEndpoint) {
      return { error: 'Predict path is required for prediction smoke test.' };
    }
    // Corrected logic: reads testPayloadText instead of endpointForm.testPayloadText
    if (testPayloadText && testPayloadText.trim()) {
      try {
        parsedTestPayload = JSON.parse(testPayloadText);
      } catch (e) {
        return { error: 'Invalid JSON in Test Payload: ' + e.message };
      }
    } else {
      parsedTestPayload = {};
    }
  }
  return { parsedTestPayload };
}

// Buggy legacy frontend parsing for contract comparison
function legacyBuggyParse({ testMode, endpointForm }) {
  let parsedTestPayload = undefined;
  if (testMode === 'PREDICTION') {
    if (!endpointForm.predictEndpoint) {
      return { error: 'Predict path is required for prediction smoke test.' };
    }
    // Buggy: checks endpointForm.testPayloadText which is always undefined in Monitoring.jsx
    if (endpointForm.testPayloadText && endpointForm.testPayloadText.trim()) {
      try {
        parsedTestPayload = JSON.parse(endpointForm.testPayloadText);
      } catch (e) {
        return { error: 'Invalid JSON in Test Payload: ' + e.message };
      }
    } else {
      parsedTestPayload = {};
    }
  }
  return { parsedTestPayload };
}

test('Smoke Test Payload: 1. Frontend state handler preserves testPayloadText rather than defaulting to empty object', () => {
  const sampleCreditLensPayload = JSON.stringify({
    applicant: {
      amt_income: 162000,
      amt_credit: 640000,
      amt_annuity: 31500,
      age: 36,
      emp_years: 3.5,
      region_rating: 2,
      cnt_children: 1,
      ext_source_1: 0.42,
      ext_source_2: 0.48,
      ext_source_3: 0.43,
      bureau_active: 2,
      bureau_dpd: 0,
      bureau_debt: 165000,
      prev_approval: 0.58,
      prev_refused: 1,
      prev_count: 4
    },
    model: 'xgboost',
    low: 0.3,
    high: 0.7
  }, null, 2);

  const endpointForm = {
    endpointUrl: 'https://mohamedgamal04-creditlens.hf.space',
    predictEndpoint: '/predict',
    method: 'POST',
    wrapperKey: ''
  };

  // Buggy legacy behavior: always returns {}
  const legacyResult = legacyBuggyParse({
    testMode: 'PREDICTION',
    endpointForm
  });
  assert.deepStrictEqual(legacyResult.parsedTestPayload, {}, 'Legacy bug caused payload to be completely empty {}');

  // Corrected behavior: parses and preserves testPayloadText
  const fixedResult = parseSmokeTestPayload({
    testMode: 'PREDICTION',
    testPayloadText: sampleCreditLensPayload,
    endpointForm
  });

  assert.ok(fixedResult.parsedTestPayload, 'Parsed payload should not be undefined');
  assert.ok(fixedResult.parsedTestPayload.applicant, 'Top-level applicant object must be preserved');
  assert.strictEqual(fixedResult.parsedTestPayload.applicant.amt_income, 162000);
  assert.strictEqual(fixedResult.parsedTestPayload.applicant.age, 36);
  assert.strictEqual(fixedResult.parsedTestPayload.applicant.bureau_debt, 165000);
  assert.strictEqual(fixedResult.parsedTestPayload.model, 'xgboost');
  assert.strictEqual(fixedResult.parsedTestPayload.low, 0.3);
  assert.strictEqual(fixedResult.parsedTestPayload.high, 0.7);
});

test('Smoke Test Payload: 2. Backend testEndpointConnection transmits full applicant payload to external service', async () => {
  let receivedMethod = null;
  let receivedPath = null;
  let receivedBody = null;

  const mockServer = http.createServer((req, res) => {
    receivedMethod = req.method;
    receivedPath = req.url;

    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', () => {
      receivedBody = bodyStr ? JSON.parse(bodyStr) : null;

      if (req.url === '/predict' && req.method === 'POST') {
        // Verify mock server receives the required applicant schema
        if (!receivedBody || !receivedBody.applicant) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            detail: [{ type: 'missing', loc: ['body', 'applicant'], msg: 'Field required', input: receivedBody }]
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          probability: 0.142,
          band: 'low',
          decision: 'approve',
          model: receivedBody.model || 'lgbm',
          features: receivedBody.applicant
        }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const mockBaseUrl = `http://127.0.0.1:${port}`;

  const mockModelId = new mongoose.Types.ObjectId();
  const mockModelDoc = new Model({
    _id: mockModelId,
    name: 'CreditLens Demo Model',
    description: 'Credit scoring model',
    owner: 'Alex Lead',
    team: 'Risk Engineering',
    purpose: 'Credit risk prediction',
    apiConfig: {
      endpointUrl: mockBaseUrl,
      predictEndpoint: '/predict',
      method: 'POST',
      authType: 'NONE'
    }
  });

  const origModelFindById = Model.findById;
  Model.findById = () => ({ select: () => Promise.resolve(mockModelDoc) });

  try {
    const rawPayloadText = JSON.stringify({
      applicant: {
        amt_income: 162000,
        amt_credit: 640000,
        amt_annuity: 31500,
        age: 36,
        emp_years: 3.5,
        region_rating: 2,
        cnt_children: 1,
        ext_source_1: 0.42,
        ext_source_2: 0.48,
        ext_source_3: 0.43,
        bureau_active: 2,
        bureau_dpd: 0,
        bureau_debt: 165000,
        prev_approval: 0.58,
        prev_refused: 1,
        prev_count: 4
      },
      model: 'xgboost',
      low: 0.3,
      high: 0.7
    });

    const { parsedTestPayload } = parseSmokeTestPayload({
      testMode: 'PREDICTION',
      testPayloadText: rawPayloadText,
      endpointForm: { predictEndpoint: '/predict' }
    });

    let endpointResult = null;
    const req = {
      params: { id: String(mockModelId) },
      body: {
        endpointUrl: mockBaseUrl,
        predictEndpoint: '/predict',
        method: 'POST',
        authType: 'NONE',
        requestMapping: { wrapperKey: '' }, // Cleared wrapper key
        responseMapping: { predictionField: 'decision' },
        testType: 'PREDICTION',
        testPayload: parsedTestPayload
      }
    };
    const res = {
      status: () => res,
      json: (data) => { endpointResult = data; }
    };

    await testEndpointConnection(req, res);

    assert.strictEqual(receivedMethod, 'POST');
    assert.strictEqual(receivedPath, '/predict');
    assert.notDeepStrictEqual(receivedBody, {}, 'Received body must NOT be empty {}');
    assert.ok(receivedBody.applicant, 'Received body must contain top-level "applicant" object');
    assert.strictEqual(receivedBody.applicant.amt_income, 162000);
    assert.strictEqual(receivedBody.applicant.age, 36);
    assert.strictEqual(receivedBody.applicant.prev_count, 4);
    assert.strictEqual(receivedBody.model, 'xgboost');
    assert.strictEqual(receivedBody.low, 0.3);
    assert.strictEqual(receivedBody.high, 0.7);

    assert.strictEqual(endpointResult.success, true);
    assert.strictEqual(endpointResult.statusCode, 200);
    assert.strictEqual(endpointResult.prediction, 'approve');
    assert.strictEqual(endpointResult.predictionExtracted, true);
  } finally {
    Model.findById = origModelFindById;
    await new Promise(resolve => mockServer.close(resolve));
  }
});
