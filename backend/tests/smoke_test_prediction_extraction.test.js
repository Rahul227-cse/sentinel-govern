import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { extractByPath } from '../src/services/inferenceService.js';
import { testEndpointConnection } from '../src/controllers/modelController.js';
import { Model } from '../src/models/Model.js';
import mongoose from 'mongoose';

/**
 * Regression Tests: Smoke-Test Result Prediction Extraction
 * 
 * Verifies that:
 * 1. Prediction values are extracted correctly from CreditLens responses:
 *    { "decision": "approve", "probability": 0.013 }
 * 2. responseMapping.predictionField is respected (e.g. "decision", "prediction", nested dot-paths).
 * 3. Direct scalar predictions (strings, numbers, booleans) are extracted cleanly.
 * 4. Fallback extraction handles responses containing "decision" when predictionField is omitted.
 * 5. Both "prediction" and "extractedPrediction" fields are returned to prevent frontend "undefined" display.
 * 6. Nested dot-path extraction (e.g. "outputs.decision", "data.0.result") works reliably.
 */

// Frontend dot-path resolver replication to test client contract
function extractDotPath(obj, path) {
  if (obj === null || obj === undefined) return undefined;
  if (!path || typeof path !== 'string' || !path.trim()) {
    if (typeof obj !== 'object') return obj;
    if (obj.prediction !== undefined) return obj.prediction;
    if (obj.decision !== undefined) return obj.decision;
    if (obj.result !== undefined) return obj.result;
    return undefined;
  }
  const normalizedPath = path.trim().replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
  const segments = normalizedPath.split('.');
  let current = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    current = current[seg];
  }
  return current;
}

function resolveFrontendFeedback(res, configuredPath) {
  let resolvedPrediction = res?.extractedPrediction !== undefined
    ? res.extractedPrediction
    : res?.prediction !== undefined
      ? res.prediction
      : extractDotPath(res?.rawResponse, configuredPath);

  if (resolvedPrediction === undefined && res?.rawResponse !== undefined) {
    resolvedPrediction = extractDotPath(res.rawResponse, configuredPath);
  }

  return {
    ...res,
    prediction: resolvedPrediction !== undefined ? resolvedPrediction : res?.prediction,
    extractedPrediction: resolvedPrediction !== undefined ? resolvedPrediction : res?.extractedPrediction
  };
}

test('Prediction Extraction: 1. extractByPath extracts configured dot-path and bracket notation', () => {
  const creditLensResponse = { decision: 'approve', probability: 0.013, model: 'stacking' };
  assert.strictEqual(extractByPath(creditLensResponse, 'decision'), 'approve');
  assert.strictEqual(extractByPath(creditLensResponse, 'probability'), 0.013);

  const nestedResponse = {
    data: {
      assessment: {
        decision: 'reject',
        score: 0.89
      }
    },
    items: [{ status: 'complete', code: 200 }]
  };
  assert.strictEqual(extractByPath(nestedResponse, 'data.assessment.decision'), 'reject');
  assert.strictEqual(extractByPath(nestedResponse, 'data.assessment.score'), 0.89);
  assert.strictEqual(extractByPath(nestedResponse, 'items[0].status'), 'complete');
  assert.strictEqual(extractByPath(nestedResponse, 'items.0.status'), 'complete');
  assert.strictEqual(extractByPath(nestedResponse, 'nonexistent.path'), undefined);
});

test('Prediction Extraction: 2. Frontend extraction resolver prevents "undefined" display', () => {
  // Scenario A: Legacy backend only returned `prediction: "approve"` (without extractedPrediction)
  const legacyBackendRes = {
    success: true,
    testType: 'PREDICTION',
    prediction: 'approve',
    rawResponse: { decision: 'approve', probability: 0.013 }
  };
  const resolvedA = resolveFrontendFeedback(legacyBackendRes, 'decision');
  assert.strictEqual(resolvedA.extractedPrediction, 'approve');
  assert.strictEqual(resolvedA.prediction, 'approve');

  // Scenario B: Updated backend returns both `prediction` and `extractedPrediction`
  const modernBackendRes = {
    success: true,
    testType: 'PREDICTION',
    prediction: 'approve',
    extractedPrediction: 'approve',
    rawResponse: { decision: 'approve' }
  };
  const resolvedB = resolveFrontendFeedback(modernBackendRes, 'decision');
  assert.strictEqual(resolvedB.extractedPrediction, 'approve');

  // Scenario C: Neither prediction key present, but rawResponse has configured dot-path
  const fallbackBackendRes = {
    success: true,
    testType: 'PREDICTION',
    rawResponse: { outcome: { decision: 'approve' } }
  };
  const resolvedC = resolveFrontendFeedback(fallbackBackendRes, 'outcome.decision');
  assert.strictEqual(resolvedC.extractedPrediction, 'approve');
});

test('Prediction Extraction: 3. End-to-end testEndpointConnection with CreditLens response shape', async (t) => {
  let server;
  let mockPort;
  let lastReceivedBody = null;

  await new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try { lastReceivedBody = JSON.parse(body); } catch {}
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify({
          decision: 'approve',
          probability: 0.013,
          model: 'stacking'
        }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      mockPort = server.address().port;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  const dummyModelId = new mongoose.Types.ObjectId();
  const originalFindById = Model.findById;
  t.after(() => {
    Model.findById = originalFindById;
  });

  Model.findById = () => ({
    select: () => Promise.resolve({
      _id: dummyModelId,
      name: 'CreditLens',
      workload: 'credit-decisioning',
      apiConfig: {
        endpointUrl: `http://127.0.0.1:${mockPort}`,
        predictEndpoint: '/predict',
        responseMapping: { predictionField: 'decision' }
      }
    })
  });

  // Call testEndpointConnection with responseMapping.predictionField = "decision"
  let responseData = null;
  const mockReq = {
    params: { id: dummyModelId.toString() },
    body: {
      endpointUrl: `http://127.0.0.1:${mockPort}`,
      predictEndpoint: '/predict',
      method: 'POST',
      responseMapping: {
        predictionField: 'decision'
      },
      testType: 'PREDICTION',
      testPayload: {
        applicant: { amt_income: 50000 },
        model: 'stacking'
      }
    }
  };
  const mockRes = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { responseData = payload; return this; }
  };

  await testEndpointConnection(mockReq, mockRes);

  assert.ok(responseData, 'Should return a response payload');
  assert.strictEqual(responseData.success, true, 'Prediction smoke test should succeed');
  assert.strictEqual(responseData.statusCode, 200, 'HTTP status should be 200');
  assert.strictEqual(responseData.prediction, 'approve', 'Should extract "approve" using responseMapping.predictionField');
  assert.strictEqual(responseData.extractedPrediction, 'approve', 'Should provide extractedPrediction key matching prediction');
  assert.strictEqual(responseData.predictionExtracted, true);
  assert.deepStrictEqual(responseData.rawResponse, {
    decision: 'approve',
    probability: 0.013,
    model: 'stacking'
  });
});

test('Prediction Extraction: 4. End-to-end testEndpointConnection fallback to "decision" when predictionField is omitted', async (t) => {
  let server;
  let mockPort;

  await new Promise((resolve) => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({
        decision: 'approved_tier_1',
        probability: 0.025
      }));
    });
    server.listen(0, '127.0.0.1', () => {
      mockPort = server.address().port;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  const dummyModelId = new mongoose.Types.ObjectId();
  const originalFindById = Model.findById;
  t.after(() => {
    Model.findById = originalFindById;
  });

  Model.findById = () => ({
    select: () => Promise.resolve({
      _id: dummyModelId,
      name: 'CreditLens',
      apiConfig: {
        endpointUrl: `http://127.0.0.1:${mockPort}`,
        predictEndpoint: '/predict'
      }
    })
  });

  let responseData = null;
  const mockReq = {
    params: { id: dummyModelId.toString() },
    body: {
      endpointUrl: `http://127.0.0.1:${mockPort}`,
      predictEndpoint: '/predict',
      method: 'POST',
      // responseMapping omitted or empty
      testType: 'PREDICTION',
      testPayload: {}
    }
  };
  const mockRes = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { responseData = payload; return this; }
  };

  await testEndpointConnection(mockReq, mockRes);

  assert.ok(responseData, 'Should return response payload');
  assert.strictEqual(responseData.success, true);
  assert.strictEqual(responseData.prediction, 'approved_tier_1');
  assert.strictEqual(responseData.extractedPrediction, 'approved_tier_1');
});

test('Prediction Extraction: 5. End-to-end testEndpointConnection handles direct scalar string/number predictions', async (t) => {
  let server;
  let mockPort;

  await new Promise((resolve) => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      // Returns a direct string JSON: "approve"
      res.end(JSON.stringify('approve'));
    });
    server.listen(0, '127.0.0.1', () => {
      mockPort = server.address().port;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  const dummyModelId = new mongoose.Types.ObjectId();
  const originalFindById = Model.findById;
  t.after(() => {
    Model.findById = originalFindById;
  });

  Model.findById = () => ({
    select: () => Promise.resolve({
      _id: dummyModelId,
      apiConfig: { endpointUrl: `http://127.0.0.1:${mockPort}`, predictEndpoint: '/predict' }
    })
  });

  let responseData = null;
  const mockReq = {
    params: { id: dummyModelId.toString() },
    body: {
      endpointUrl: `http://127.0.0.1:${mockPort}`,
      predictEndpoint: '/predict',
      method: 'POST',
      responseMapping: { predictionField: 'decision' },
      testType: 'PREDICTION',
      testPayload: {}
    }
  };
  const mockRes = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { responseData = payload; return this; }
  };

  await testEndpointConnection(mockReq, mockRes);

  assert.ok(responseData);
  assert.strictEqual(responseData.success, true);
  assert.strictEqual(responseData.prediction, 'approve');
  assert.strictEqual(responseData.extractedPrediction, 'approve');
});

test('Prediction Extraction: 6. End-to-end testEndpointConnection extracts nested dot-path fields', async (t) => {
  let server;
  let mockPort;

  await new Promise((resolve) => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({
        results: {
          model_output: {
            decision: 'approve_tier_a',
            confidence: 0.96
          }
        }
      }));
    });
    server.listen(0, '127.0.0.1', () => {
      mockPort = server.address().port;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  const dummyModelId = new mongoose.Types.ObjectId();
  const originalFindById = Model.findById;
  t.after(() => {
    Model.findById = originalFindById;
  });

  Model.findById = () => ({
    select: () => Promise.resolve({
      _id: dummyModelId,
      apiConfig: { endpointUrl: `http://127.0.0.1:${mockPort}`, predictEndpoint: '/predict' }
    })
  });

  let responseData = null;
  const mockReq = {
    params: { id: dummyModelId.toString() },
    body: {
      endpointUrl: `http://127.0.0.1:${mockPort}`,
      predictEndpoint: '/predict',
      method: 'POST',
      responseMapping: { predictionField: 'results.model_output.decision' },
      testType: 'PREDICTION',
      testPayload: {}
    }
  };
  const mockRes = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { responseData = payload; return this; }
  };

  await testEndpointConnection(mockReq, mockRes);

  assert.ok(responseData);
  assert.strictEqual(responseData.success, true);
  assert.strictEqual(responseData.prediction, 'approve_tier_a');
  assert.strictEqual(responseData.extractedPrediction, 'approve_tier_a');
});

test('Prediction Extraction: 7. End-to-end testEndpointConnection reports clean error when configured field is missing', async (t) => {
  let server;
  let mockPort;

  await new Promise((resolve) => {
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({
        unrelated_key: 12345
      }));
    });
    server.listen(0, '127.0.0.1', () => {
      mockPort = server.address().port;
      resolve();
    });
  });

  t.after(() => {
    server.close();
  });

  const dummyModelId = new mongoose.Types.ObjectId();
  const originalFindById = Model.findById;
  t.after(() => {
    Model.findById = originalFindById;
  });

  Model.findById = () => ({
    select: () => Promise.resolve({
      _id: dummyModelId,
      apiConfig: { endpointUrl: `http://127.0.0.1:${mockPort}`, predictEndpoint: '/predict' }
    })
  });

  let responseData = null;
  const mockReq = {
    params: { id: dummyModelId.toString() },
    body: {
      endpointUrl: `http://127.0.0.1:${mockPort}`,
      predictEndpoint: '/predict',
      method: 'POST',
      responseMapping: { predictionField: 'nonexistent_key' },
      testType: 'PREDICTION',
      testPayload: {}
    }
  };
  const mockRes = {
    status(code) { this.statusCode = code; return this; },
    json(payload) { responseData = payload; return this; }
  };

  await testEndpointConnection(mockReq, mockRes);

  assert.ok(responseData);
  assert.strictEqual(responseData.success, false);
  assert.strictEqual(responseData.predictionExtracted, false);
  assert.match(responseData.extractionError, /Configured prediction field "nonexistent_key" not found in response/);
});

