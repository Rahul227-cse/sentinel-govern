import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { AuditLedger } from '../src/models/AuditLedger.js';
import {
  updateModelApiConfig,
  getModelEndpointConfig,
  testEndpointConnection,
  getModelVersions
} from '../src/controllers/modelController.js';

test('Dynamic Monitoring Config: 1. Fetch Endpoint Config & Inheritance Metadata', async () => {
  const modelId = new mongoose.Types.ObjectId();
  const versionId = new mongoose.Types.ObjectId();

  const mockModelDoc = new Model({
    _id: modelId,
    name: 'Credit Risk LightGBM',
    description: 'Credit risk model',
    owner: 'MLOps Lead',
    team: 'Risk Engineering',
    purpose: 'Default risk',
    apiConfig: {
      endpointUrl: 'https://credit-base.example.com',
      healthEndpoint: '/health',
      predictEndpoint: '/score',
      method: 'POST',
      authType: 'API_KEY',
      authHeaderName: 'X-API-Key',
      authHeaderValue: 'super-secret-key-1',
      responseMapping: { predictionField: 'probability_of_default' }
    }
  });

  const mockVersionDoc = new ModelVersion({
    _id: versionId,
    modelId: modelId,
    version: 'v2.0',
    apiConfig: {
      endpointUrl: 'https://credit-v2.example.com',
      predictEndpoint: '/v2/score',
      responseMapping: { predictionField: 'v2_probability' }
    }
  });

  const origModelFindById = Model.findById;
  const origVersionFindById = ModelVersion.findById;

  Model.findById = () => ({ select: () => Promise.resolve(mockModelDoc) });
  ModelVersion.findById = () => ({ select: () => Promise.resolve(mockVersionDoc) });

  try {
    let result = null;
    const req = {
      params: { id: String(modelId) },
      query: { versionId: String(versionId) }
    };
    const res = {
      status: () => res,
      json: (data) => { result = data; }
    };

    await getModelEndpointConfig(req, res);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.modelId, modelId);
    assert.strictEqual(result.data.versionId, versionId);

    // Verify secret redaction
    assert.strictEqual(result.data.modelApiConfig.authHeaderValue, undefined);
    assert.strictEqual(result.data.modelApiConfig.hasAuthSecret, true);

    // Verify effective inheritance
    assert.strictEqual(result.data.effectiveApiConfig.endpointUrl, 'https://credit-v2.example.com');
    assert.strictEqual(result.data.effectiveApiConfig.predictEndpoint, '/v2/score');
    assert.strictEqual(result.data.effectiveApiConfig.healthEndpoint, '/health'); // Inherited from model!
    assert.strictEqual(result.data.effectiveApiConfig.authType, 'API_KEY'); // Inherited from model!

    // Verify isOverridden flags
    assert.strictEqual(result.data.isOverridden.endpointUrl, true);
    assert.strictEqual(result.data.isOverridden.predictEndpoint, true);
    assert.strictEqual(result.data.isOverridden.healthEndpoint, false);
    assert.strictEqual(result.data.isOverridden.authType, false);
  } finally {
    Model.findById = origModelFindById;
    ModelVersion.findById = origVersionFindById;
  }
});

test('Dynamic Monitoring Config: 2. Save Version-Level Override and Clear Override', async () => {
  const modelId = new mongoose.Types.ObjectId();
  const versionId = new mongoose.Types.ObjectId();

  const mockModelDoc = new Model({
    _id: modelId,
    name: 'Insurance Model',
    description: 'Insurance model',
    owner: 'MLOps Lead',
    team: 'Risk Engineering',
    purpose: 'Pricing',
    apiConfig: {
      endpointUrl: 'https://insurance-base.example.com',
      predictEndpoint: '/predict'
    }
  });

  const mockVersionDoc = new ModelVersion({
    _id: versionId,
    modelId: modelId,
    version: 'v1.5',
    apiConfig: null
  });

  const origAuditFindOne = AuditLedger.findOne;
  const origAuditCreate = AuditLedger.create;
  AuditLedger.findOne = () => ({ sort: () => Promise.resolve(null) });
  AuditLedger.create = () => Promise.resolve({ hash: 'mock-hash' });

  const origModelFindById = Model.findById;
  const origVersionFindById = ModelVersion.findById;

  Model.findById = () => ({ select: () => Promise.resolve(mockModelDoc) });
  ModelVersion.findById = () => {
    const p = Promise.resolve(mockVersionDoc);
    p.select = () => Promise.resolve(mockVersionDoc);
    return p;
  };
  mockVersionDoc.save = () => Promise.resolve(mockVersionDoc);

  try {
    // 1. Save version-level override
    let saveResult = null;
    const reqSave = {
      params: { modelId: String(modelId), versionId: String(versionId) },
      body: {
        endpointUrl: 'https://insurance-v15.example.com',
        predictEndpoint: '/v15/predict',
        authType: 'BEARER',
        authHeaderValue: 'secret-token-v15'
      },
      user: { name: 'Lead', role: 'ML_LEAD' }
    };
    const res = {
      status: () => res,
      json: (data) => { saveResult = data; }
    };

    await updateModelApiConfig(reqSave, res);

    assert.strictEqual(saveResult.success, true);
    assert.strictEqual(saveResult.data.scope, 'VERSION');
    assert.strictEqual(saveResult.data.isOverridden, true);
    assert.strictEqual(saveResult.data.effectiveApiConfig.endpointUrl, 'https://insurance-v15.example.com');
    assert.strictEqual(saveResult.data.versionApiConfig.hasAuthSecret, true);
    assert.strictEqual(saveResult.data.versionApiConfig.authHeaderValue, undefined); // Redacted!

    // 2. Clear version-level override (revert to inheriting from model)
    let clearResult = null;
    const reqClear = {
      params: { modelId: String(modelId), versionId: String(versionId) },
      body: { clearOverride: true },
      user: { name: 'Lead', role: 'ML_LEAD' }
    };
    const resClear = {
      status: () => resClear,
      json: (data) => { clearResult = data; }
    };

    await updateModelApiConfig(reqClear, resClear);
    assert.strictEqual(clearResult.success, true);
    assert.strictEqual(clearResult.data.isOverridden, false);
    assert.strictEqual(clearResult.data.versionApiConfig, null);
    assert.strictEqual(clearResult.data.effectiveApiConfig.endpointUrl, 'https://insurance-base.example.com');
  } finally {
    Model.findById = origModelFindById;
    ModelVersion.findById = origVersionFindById;
    AuditLedger.findOne = origAuditFindOne;
    AuditLedger.create = origAuditCreate;
  }
});

test('Dynamic Monitoring Config: 3. Prevent Stale Cross-Model Selection on Save', async () => {
  const modelAId = new mongoose.Types.ObjectId();
  const modelBId = new mongoose.Types.ObjectId();
  const versionBId = new mongoose.Types.ObjectId();

  const mockModelA = new Model({
    _id: modelAId,
    name: 'Model A',
    description: 'A',
    owner: 'Lead',
    team: 'Risk',
    purpose: 'Test'
  });

  const mockVersionB = new ModelVersion({
    _id: versionBId,
    modelId: modelBId, // Belongs to Model B!
    version: 'v1.0'
  });

  const origModelFindById = Model.findById;
  const origVersionFindById = ModelVersion.findById;

  Model.findById = () => ({ select: () => Promise.resolve(mockModelA) });
  ModelVersion.findById = () => ({ select: () => Promise.resolve(mockVersionB) });

  try {
    let errResult = null;
    let statusCode = null;
    const req = {
      params: { modelId: String(modelAId), versionId: String(versionBId) },
      body: { endpointUrl: 'https://example.com' },
      user: { name: 'Lead', role: 'ML_LEAD' }
    };
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { errResult = data; }
    };

    await updateModelApiConfig(req, res);

    assert.strictEqual(statusCode, 400);
    assert.strictEqual(errResult.success, false);
    assert.match(errResult.error, /does not belong to specified model/);
  } finally {
    Model.findById = origModelFindById;
    ModelVersion.findById = origVersionFindById;
  }
});

test('Dynamic Monitoring Config: 4. In-Flight Connection Testing (Health & Prediction Smoke Test)', async () => {
  let receivedMethod = null;
  let receivedPath = null;
  let receivedHeader = null;
  let receivedBody = null;

  const mockServer = http.createServer((req, res) => {
    receivedMethod = req.method;
    receivedPath = req.url;
    receivedHeader = req.headers['authorization'];

    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', () => {
      receivedBody = bodyStr ? JSON.parse(bodyStr) : null;

      if (req.url === '/custom-health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'UP', load: 0.12 }));
      } else if (req.url === '/custom-predict' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: {
            score: 0.941,
            tier: 'TIER_1'
          }
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
    name: 'Test Model',
    description: 'Test',
    owner: 'Lead',
    team: 'Risk',
    purpose: 'Test',
    apiConfig: {
      authHeaderValue: 'existing-saved-secret-token'
    }
  });

  const origModelFindById = Model.findById;
  Model.findById = () => ({ select: () => Promise.resolve(mockModelDoc) });

  try {
    // 1. In-flight Health Check Test
    let healthResult = null;
    const reqHealth = {
      params: { id: String(mockModelId) },
      body: {
        endpointUrl: mockBaseUrl,
        healthEndpoint: '/custom-health',
        authType: 'BEARER',
        authHeaderValue: '***', // Preserves existing saved secret!
        testType: 'HEALTH'
      }
    };
    const resHealth = {
      status: () => resHealth,
      json: (data) => { healthResult = data; }
    };

    await testEndpointConnection(reqHealth, resHealth);

    assert.strictEqual(healthResult.success, true);
    assert.strictEqual(healthResult.testType, 'HEALTH');
    assert.strictEqual(healthResult.statusCode, 200);
    assert.strictEqual(receivedPath, '/custom-health');
    assert.strictEqual(receivedHeader, 'Bearer existing-saved-secret-token');

    // 2. In-flight Prediction Smoke Test with payload & response extraction
    let predictResult = null;
    const reqPredict = {
      params: { id: String(mockModelId) },
      body: {
        endpointUrl: mockBaseUrl,
        predictEndpoint: '/custom-predict',
        method: 'POST',
        authType: 'BEARER',
        authHeaderValue: '***',
        requestMapping: { wrapperKey: 'inputs' },
        responseMapping: { predictionField: 'data.score' },
        testType: 'PREDICTION',
        testPayload: { age: 30, income: 80000 }
      }
    };
    const resPredict = {
      status: () => resPredict,
      json: (data) => { predictResult = data; }
    };

    await testEndpointConnection(reqPredict, resPredict);

    assert.strictEqual(predictResult.success, true);
    assert.strictEqual(predictResult.testType, 'PREDICTION');
    assert.strictEqual(predictResult.predictionExtracted, true);
    assert.strictEqual(predictResult.prediction, 0.941);
    assert.strictEqual(receivedPath, '/custom-predict');
    assert.deepStrictEqual(receivedBody, { inputs: { age: 30, income: 80000 } });

    // 3. Prediction Smoke Test failure when configured field is absent in response
    const reqPredictFail = {
      params: { id: String(mockModelId) },
      body: {
        endpointUrl: mockBaseUrl,
        predictEndpoint: '/custom-predict',
        responseMapping: { predictionField: 'non_existent_field' },
        testType: 'PREDICTION',
        testPayload: { age: 30 }
      }
    };
    let predictFailResult = null;
    const resFail = {
      status: () => resFail,
      json: (data) => { predictFailResult = data; }
    };

    await testEndpointConnection(reqPredictFail, resFail);

    // Endpoint reached 200, but extraction failed -> success is false!
    assert.strictEqual(predictFailResult.success, false);
    assert.strictEqual(predictFailResult.predictionExtracted, false);
    assert.match(predictFailResult.extractionError, /non_existent_field/);

    // 4. SSRF Rejection on In-Flight Test
    let ssrfResult = null;
    let ssrfStatusCode = null;
    const reqSsrf = {
      params: { id: String(mockModelId) },
      body: {
        endpointUrl: 'http://169.254.169.254',
        testType: 'HEALTH'
      }
    };
    const resSsrf = {
      status: (code) => { ssrfStatusCode = code; return resSsrf; },
      json: (data) => { ssrfResult = data; }
    };

    await testEndpointConnection(reqSsrf, resSsrf);
    assert.strictEqual(ssrfStatusCode, 400);
    assert.strictEqual(ssrfResult.success, false);
    assert.match(ssrfResult.error, /SSRF BLOCKED/);
  } finally {
    Model.findById = origModelFindById;
    await new Promise(resolve => mockServer.close(resolve));
  }
});

test('Dynamic Monitoring Config: 5. Enforce ML_LEAD Role Authorization', async () => {
  const { requireRole } = await import('../src/middleware/authMiddleware.js');
  const guard = requireRole('ML_LEAD');

  // 1. Authorized active ML_LEAD succeeds
  let nextCalled = false;
  const reqMlLead = { user: { role: 'ML_LEAD', status: 'ACTIVE' } };
  const resDummy = { status: () => resDummy, json: () => {} };
  guard(reqMlLead, resDummy, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);

  // 2. Unauthorized roles rejected with 403
  for (const role of ['GOVERNANCE_OFFICER', 'PLATFORM_ADMIN', 'EXECUTIVE_APPROVER', 'VIEWER']) {
    let statusCode = null;
    let errResult = null;
    const reqUnauthorized = { user: { role, status: 'ACTIVE' } };
    const res = {
      status: (code) => { statusCode = code; return res; },
      json: (data) => { errResult = data; }
    };

    guard(reqUnauthorized, res, () => {
      assert.fail(`Role ${role} should not have been allowed past requireRole('ML_LEAD')`);
    });

    assert.strictEqual(statusCode, 403);
    assert.strictEqual(errResult.success, false);
    assert.match(errResult.error, /Forbidden/i);
  }
});
