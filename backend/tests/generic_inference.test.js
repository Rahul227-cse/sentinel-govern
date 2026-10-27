import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import {
  extractByPath,
  buildRequestBody,
  buildAuthHeaders,
  buildFullEndpointUrl,
  resolveEffectiveApiConfig,
  safeFetch,
  executeModelInference,
  checkModelEndpointHealth
} from '../src/services/inferenceService.js';
import {
  validateEndpointUrl,
  validateSafeEndpointUrl,
  isPrivateOrInternalIp,
  LIFECYCLE_STAGES
} from '../src/services/lifecycleService.js';

test('1. Model and ModelVersion Schema Validation (Canonical RETIRED, Legacy DEPRECATED, apiConfig override)', () => {
  // Test Model schema defaults
  const testModel = new Model({
    name: 'Dynamic Test Model',
    description: 'A dynamic test model description',
    owner: 'MLOps Lead',
    team: 'Risk Engineering',
    purpose: 'Validation of generic model schema'
  });

  assert.strictEqual(testModel.lifecycleStatus, 'DRAFT');
  assert.strictEqual(testModel.apiConfig.endpointUrl, '');
  assert.strictEqual(testModel.apiConfig.status, 'CONFIGURATION_REQUIRED');
  assert.strictEqual(testModel.apiConfig.method, 'POST');
  assert.strictEqual(testModel.apiConfig.authType, 'NONE');
  assert.strictEqual(testModel.apiConfig.timeoutMs, 30000);
  assert.strictEqual(testModel.apiConfig.maxRetries, 2);

  // Validate lifecycleStatus enum accepts canonical RETIRED
  testModel.lifecycleStatus = 'RETIRED';
  assert.strictEqual(testModel.validateSync(), undefined);

  // Validate lifecycleStatus enum safely accepts legacy DEPRECATED for un-mutated database compatibility
  testModel.lifecycleStatus = 'DEPRECATED';
  assert.strictEqual(testModel.validateSync(), undefined);

  // Validate lifecycleStatus enum rejects invalid arbitrary status
  testModel.lifecycleStatus = 'INVALID_OBSOLETE_STATUS';
  const invalidModelErr = testModel.validateSync();
  assert.ok(invalidModelErr?.errors?.lifecycleStatus);

  // Test ModelVersion schema with referenceDataset and optional version apiConfig override
  const testVersion = new ModelVersion({
    modelId: new mongoose.Types.ObjectId(),
    version: 'v1.0.0',
    lifecycleStatus: 'RETIRED',
    referenceDataset: {
      filename: 'baseline_sample.csv',
      rowCount: 1500,
      featureColumns: ['age', 'income', 'debt_to_income'],
      targetColumn: 'defaulted',
      protectedAttributes: ['age', 'gender'],
      dataHash: 'sha256-abcdef1234567890'
    },
    apiConfig: {
      endpointUrl: 'https://v1.model-service.internal/predict',
      timeoutMs: 15000
    }
  });

  const versionValErr = testVersion.validateSync();
  assert.strictEqual(versionValErr, undefined);
  assert.strictEqual(testVersion.referenceDataset.rowCount, 1500);
  assert.strictEqual(testVersion.referenceDataset.targetColumn, 'defaulted');
  assert.strictEqual(testVersion.referenceDataset.featureColumns.length, 3);
  assert.strictEqual(testVersion.lifecycleStatus, 'RETIRED');
  assert.strictEqual(testVersion.apiConfig.endpointUrl, 'https://v1.model-service.internal/predict');
});

test('2. Lifecycle Stages Constants and Normalization', () => {
  assert.ok(LIFECYCLE_STAGES.includes('RETIRED'));
  assert.strictEqual(LIFECYCLE_STAGES.includes('DEPRECATED'), false);
  assert.ok(LIFECYCLE_STAGES.includes('IN_PRODUCTION'));
  assert.ok(LIFECYCLE_STAGES.includes('APPROVED'));
});

test('3. Response Path Extraction (extractByPath)', () => {
  const sampleResponse = {
    statusCode: 200,
    prediction: 0.88,
    metrics: {
      accuracy: 0.94,
      latency: 42.5
    },
    results: [
      { id: 'item_1', score: 0.99 },
      { id: 'item_2', score: 0.12 }
    ],
    deeply: {
      nested: {
        value: 'APPROVED'
      }
    }
  };

  assert.strictEqual(extractByPath(sampleResponse, 'prediction'), 0.88);
  assert.strictEqual(extractByPath(sampleResponse, 'metrics.accuracy'), 0.94);
  assert.strictEqual(extractByPath(sampleResponse, 'metrics.latency'), 42.5);
  assert.strictEqual(extractByPath(sampleResponse, 'results.0.score'), 0.99);
  assert.strictEqual(extractByPath(sampleResponse, 'results[1].score'), 0.12);
  assert.strictEqual(extractByPath(sampleResponse, 'deeply.nested.value'), 'APPROVED');
  assert.strictEqual(extractByPath(sampleResponse, 'non_existent_field'), undefined);
  assert.strictEqual(extractByPath(null, 'prediction'), undefined);
  assert.strictEqual(extractByPath(sampleResponse, ''), undefined);
});

test('4. Request Body Transformation (buildRequestBody)', () => {
  const rawInput = {
    age: 35,
    income: 75000,
    creditScore: 720
  };

  // Pass-through when no mapping
  assert.deepStrictEqual(buildRequestBody(rawInput, {}), rawInput);

  // Field renaming
  const withRenaming = buildRequestBody(rawInput, {
    fieldMap: {
      age: 'ApplicantAge',
      income: 'AnnualIncome'
    }
  });
  assert.deepStrictEqual(withRenaming, {
    ApplicantAge: 35,
    AnnualIncome: 75000,
    creditScore: 720
  });

  // Array wrapping
  const withArray = buildRequestBody(rawInput, { isArray: true });
  assert.deepStrictEqual(withArray, [rawInput]);

  // Wrapper key
  const withWrapper = buildRequestBody(rawInput, { wrapperKey: 'features' });
  assert.deepStrictEqual(withWrapper, { features: rawInput });

  // Combined field mapping, array wrapping, and wrapper key
  const combined = buildRequestBody(rawInput, {
    fieldMap: { age: 'Age' },
    isArray: true,
    wrapperKey: 'inputs'
  });
  assert.deepStrictEqual(combined, {
    inputs: [{ Age: 35, income: 75000, creditScore: 720 }]
  });
});

test('5. Auth Headers Construction (buildAuthHeaders)', () => {
  // NONE
  assert.deepStrictEqual(buildAuthHeaders({ authType: 'NONE' }), {});

  // BEARER
  assert.deepStrictEqual(
    buildAuthHeaders({ authType: 'BEARER', authHeaderValue: 'my-jwt-token' }),
    { Authorization: 'Bearer my-jwt-token' }
  );

  // API_KEY default header
  assert.deepStrictEqual(
    buildAuthHeaders({ authType: 'API_KEY', authHeaderValue: 'key-12345' }),
    { 'X-API-Key': 'key-12345' }
  );

  // API_KEY with custom header name
  assert.deepStrictEqual(
    buildAuthHeaders({ authType: 'API_KEY', authHeaderName: 'x-custom-key', authHeaderValue: 'key-12345' }),
    { 'x-custom-key': 'key-12345' }
  );

  // CUSTOM_HEADER
  assert.deepStrictEqual(
    buildAuthHeaders({ authType: 'CUSTOM_HEADER', authHeaderName: 'X-App-Secret', authHeaderValue: 'supersecret' }),
    { 'X-App-Secret': 'supersecret' }
  );

  // Empty value returns empty headers
  assert.deepStrictEqual(
    buildAuthHeaders({ authType: 'BEARER', authHeaderValue: '   ' }),
    {}
  );
});

test('6. SSRF Protection: IP Ranges, Protocols, and Metadata Blocking', () => {
  // Test isPrivateOrInternalIp helper
  assert.strictEqual(isPrivateOrInternalIp('127.0.0.1'), true);
  assert.strictEqual(isPrivateOrInternalIp('127.255.255.255'), true);
  assert.strictEqual(isPrivateOrInternalIp('10.0.0.1'), true);
  assert.strictEqual(isPrivateOrInternalIp('172.16.0.1'), true);
  assert.strictEqual(isPrivateOrInternalIp('172.31.255.255'), true);
  assert.strictEqual(isPrivateOrInternalIp('192.168.1.1'), true);
  assert.strictEqual(isPrivateOrInternalIp('169.254.169.254'), true);
  assert.strictEqual(isPrivateOrInternalIp('100.64.0.1'), true);
  assert.strictEqual(isPrivateOrInternalIp('::1'), true);
  assert.strictEqual(isPrivateOrInternalIp('::ffff:127.0.0.1'), true);
  assert.strictEqual(isPrivateOrInternalIp('::ffff:169.254.169.254'), true);
  assert.strictEqual(isPrivateOrInternalIp('fe80::1'), true);
  assert.strictEqual(isPrivateOrInternalIp('fc00::1'), true);

  // Public IPs must not be flagged as private
  assert.strictEqual(isPrivateOrInternalIp('8.8.8.8'), false);
  assert.strictEqual(isPrivateOrInternalIp('52.57.67.6'), false);
  assert.strictEqual(isPrivateOrInternalIp('172.32.0.1'), false);

  // Cloud metadata blocked unconditionally across all environments
  assert.throws(() => validateEndpointUrl('http://169.254.169.254/latest/meta-data', { allowLocal: true }), /SSRF BLOCKED/);
  assert.throws(() => validateEndpointUrl('http://metadata.google.internal/computeMetadata/v1', { allowLocal: true }), /SSRF BLOCKED/);
  assert.throws(() => validateEndpointUrl('http://instance-data/latest/meta-data', { allowLocal: true }), /SSRF BLOCKED/);

  // Invalid protocols rejected
  assert.throws(() => validateEndpointUrl('ftp://api.external-ai.com'), /Only HTTP and HTTPS/);
  assert.throws(() => validateEndpointUrl('file:///etc/passwd'), /Only HTTP and HTTPS/);
  assert.throws(() => validateEndpointUrl('gopher://127.0.0.1:6379/_'), /Only HTTP and HTTPS/);

  // Production environment blocks all internal/private network destinations
  const origEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.throws(() => validateEndpointUrl('http://localhost:8000/score'), /SSRF BLOCKED/);
    assert.throws(() => validateEndpointUrl('http://127.0.0.1:8000/health'), /SSRF BLOCKED/);
    assert.throws(() => validateEndpointUrl('http://192.168.1.100:8000/score'), /SSRF BLOCKED/);
    assert.throws(() => validateEndpointUrl('http://10.0.0.5:8000/score'), /SSRF BLOCKED/);
    assert.throws(() => validateEndpointUrl('http://172.20.0.5:8000/score'), /SSRF BLOCKED/);
    assert.throws(() => validateEndpointUrl('http://[::1]:8000/score'), /SSRF BLOCKED/);

    // Public HTTPS URL passes in production
    assert.strictEqual(validateEndpointUrl('https://ai.example.org/v1/predict'), true);
  } finally {
    process.env.NODE_ENV = origEnv;
  }
});

test('7. SSRF Protection: Redirect Interception and Blocking', async () => {
  // Spin up an HTTP server that attempts to redirect to a prohibited cloud metadata IP
  const evilRedirectServer = http.createServer((req, res) => {
    if (req.url === '/redirect-to-metadata') {
      res.writeHead(302, {
        Location: 'http://169.254.169.254/latest/meta-data/'
      });
      res.end();
    } else if (req.url === '/redirect-to-private') {
      res.writeHead(302, {
        Location: 'http://10.0.0.1/admin'
      });
      res.end();
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    }
  });

  await new Promise(resolve => evilRedirectServer.listen(0, '127.0.0.1', resolve));
  const port = evilRedirectServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. safeFetch must intercept and block redirect to cloud metadata
    await assert.rejects(
      async () => {
        await safeFetch(`${baseUrl}/redirect-to-metadata`, {}, { allowLocal: true });
      },
      (err) => {
        assert.match(err.message, /SSRF BLOCKED/);
        assert.match(err.message, /cloud metadata/i);
        return true;
      }
    );

    // 2. safeFetch in production mode must intercept and block redirect to private network
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await assert.rejects(
        async () => {
          await safeFetch(`${baseUrl}/redirect-to-private`, {}, { allowLocal: false });
        },
        (err) => {
          assert.match(err.message, /SSRF BLOCKED/);
          return true;
        }
      );
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  } finally {
    await new Promise(resolve => evilRedirectServer.close(resolve));
  }
});

test('8. End-to-End Dynamic Model Inference with Mock Provider Server', async () => {
  let receivedHeader = null;
  let receivedBody = null;
  let receivedPath = null;

  const mockServer = http.createServer((req, res) => {
    receivedHeader = req.headers['x-api-key'];
    receivedPath = req.url;

    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', () => {
      receivedBody = bodyStr ? JSON.parse(bodyStr) : null;

      if (req.url === '/v2/predict' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          data: {
            score: 0.875,
            decision: 'APPROVE',
            latency: 18.2
          }
        }));
      } else if (req.url === '/v2/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', uptime: 3600 }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      }
    });
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const mockBaseUrl = `http://127.0.0.1:${port}`;

  try {
    const mockModelId = new mongoose.Types.ObjectId();
    const mockVersionId = new mongoose.Types.ObjectId();

    const mockModelDoc = new Model({
      _id: mockModelId,
      name: 'Generic Risk Model',
      description: 'Model description',
      owner: 'MLOps Lead',
      team: 'Risk Engineering',
      purpose: 'Risk assessment',
      currentProductionVersionId: mockVersionId,
      lifecycleStatus: 'IN_PRODUCTION',
      apiConfig: {
        endpointUrl: mockBaseUrl,
        healthEndpoint: '/v2/health',
        predictEndpoint: '/v2/predict',
        method: 'POST',
        authType: 'API_KEY',
        authHeaderName: 'X-API-Key',
        authHeaderValue: 'test-secret-key-9988',
        requestMapping: {
          fieldMap: { userAge: 'age', userIncome: 'income' },
          wrapperKey: 'features'
        },
        responseMapping: {
          predictionField: 'data.score',
          latencyField: 'data.latency'
        },
        timeoutMs: 5000,
        maxRetries: 1
      }
    });

    const mockVersionDoc = new ModelVersion({
      _id: mockVersionId,
      modelId: mockModelId,
      version: 'v2.1.0',
      lifecycleStatus: 'IN_PRODUCTION',
      deploymentStatus: 'IN_PRODUCTION'
    });

    const origModelFindById = Model.findById;
    const origVersionFindById = ModelVersion.findById;
    const origModelSave = mockModelDoc.save;

    Model.findById = (id) => ({
      select: () => Promise.resolve(String(id) === String(mockModelId) ? mockModelDoc : null)
    });
    ModelVersion.findById = (id) => ({
      select: () => Promise.resolve(String(id) === String(mockVersionId) ? mockVersionDoc : null)
    });
    mockModelDoc.save = () => Promise.resolve(mockModelDoc);

    try {
      const result = await executeModelInference({
        modelId: String(mockModelId),
        versionId: String(mockVersionId),
        inputPayload: {
          userAge: 42,
          userIncome: 120000
        },
        options: { allowLocal: true }
      });

      assert.strictEqual(receivedPath, '/v2/predict');
      assert.strictEqual(receivedHeader, 'test-secret-key-9988');
      assert.deepStrictEqual(receivedBody, {
        features: {
          age: 42,
          income: 120000
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.prediction, 0.875);
      assert.strictEqual(result.latencyMs, 18.2);
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.version, 'v2.1.0');
      assert.strictEqual(result.modelName, 'Generic Risk Model');

      const healthResult = await checkModelEndpointHealth(String(mockModelId), { allowLocal: true });
      assert.strictEqual(healthResult.status, 'CONNECTED');
      assert.strictEqual(healthResult.statusCode, 200);
      assert.strictEqual(healthResult.details.status, 'healthy');
    } finally {
      Model.findById = origModelFindById;
      ModelVersion.findById = origVersionFindById;
      mockModelDoc.save = origModelSave;
    }
  } finally {
    await new Promise(resolve => mockServer.close(resolve));
  }
});

test('9. Lifecycle Gate Enforcement during Inference', async () => {
  const mockModelId = new mongoose.Types.ObjectId();
  const mockVersionId = new mongoose.Types.ObjectId();

  const mockModelDoc = new Model({
    _id: mockModelId,
    name: 'Draft Risk Model',
    description: 'Draft model testing gating',
    owner: 'MLOps Lead',
    team: 'Risk Engineering',
    purpose: 'Gating test',
    lifecycleStatus: 'DRAFT',
    apiConfig: {
      endpointUrl: 'https://example.com',
      predictEndpoint: '/predict'
    }
  });

  const mockDraftVersion = new ModelVersion({
    _id: mockVersionId,
    modelId: mockModelId,
    version: 'v0.1.0-draft',
    lifecycleStatus: 'DRAFT',
    deploymentStatus: 'PENDING'
  });

  const origModelFindById = Model.findById;
  const origVersionFindById = ModelVersion.findById;

  Model.findById = () => ({ select: () => Promise.resolve(mockModelDoc) });
  ModelVersion.findById = () => ({ select: () => Promise.resolve(mockDraftVersion) });

  try {
    await assert.rejects(
      async () => {
        await executeModelInference({
          modelId: String(mockModelId),
          versionId: String(mockVersionId),
          inputPayload: { test: 123 }
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.match(err.message, /INFERENCE GATE BLOCKED/);
        return true;
      }
    );
  } finally {
    Model.findById = origModelFindById;
    ModelVersion.findById = origVersionFindById;
  }
});

test('10. Strict Response Extraction: No Guessing, Clear Ambiguity Rejection', async () => {
  let mockServerResponse = {};
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockServerResponse));
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const mockBaseUrl = `http://127.0.0.1:${port}`;

  try {
    const mockModelId = new mongoose.Types.ObjectId();
    const mockVersionId = new mongoose.Types.ObjectId();

    const mockModelDoc = new Model({
      _id: mockModelId,
      name: 'Strict Extraction Model',
      description: 'Model testing strict response extraction',
      owner: 'MLOps Lead',
      team: 'Risk Engineering',
      purpose: 'Strict extraction testing',
      lifecycleStatus: 'IN_PRODUCTION',
      apiConfig: {
        endpointUrl: mockBaseUrl,
        predictEndpoint: '/score',
        responseMapping: { predictionField: 'output.risk_score' }
      }
    });

    const mockVersionDoc = new ModelVersion({
      _id: mockVersionId,
      modelId: mockModelId,
      version: 'v1.0.0',
      lifecycleStatus: 'IN_PRODUCTION',
      deploymentStatus: 'IN_PRODUCTION'
    });

    const origModelFindById = Model.findById;
    const origVersionFindById = ModelVersion.findById;
    Model.findById = () => ({ select: () => Promise.resolve(mockModelDoc) });
    ModelVersion.findById = () => ({ select: () => Promise.resolve(mockVersionDoc) });

    try {
      // 1. Success when configured field exists
      mockServerResponse = { output: { risk_score: 0.742 } };
      const res1 = await executeModelInference({
        modelId: String(mockModelId),
        versionId: String(mockVersionId),
        inputPayload: { foo: 'bar' },
        options: { allowLocal: true }
      });
      assert.strictEqual(res1.prediction, 0.742);

      // 2. Reject with clear error when configured field is absent in response
      mockServerResponse = { output: { wrong_field: 0.742 } };
      await assert.rejects(
        async () => {
          await executeModelInference({
            modelId: String(mockModelId),
            versionId: String(mockVersionId),
            inputPayload: { foo: 'bar' },
            options: { allowLocal: true }
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 502);
          assert.match(err.message, /Configured prediction field "output\.risk_score" was not found in model response/);
          return true;
        }
      );

      // 3. Reject with clear error when NO predictionField is configured and response is ambiguous object (NO GUESSING)
      mockModelDoc.apiConfig.responseMapping.predictionField = '';
      mockServerResponse = { probability_of_default: 0.25, score: 0.90 }; // Ambiguous object
      await assert.rejects(
        async () => {
          await executeModelInference({
            modelId: String(mockModelId),
            versionId: String(mockVersionId),
            inputPayload: { foo: 'bar' },
            options: { allowLocal: true }
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 502);
          assert.match(err.message, /Ambiguous model response/);
          return true;
        }
      );

      // 4. Accept primitive number response when no predictionField is configured
      mockServerResponse = 0.45;
      const res4 = await executeModelInference({
        modelId: String(mockModelId),
        versionId: String(mockVersionId),
        inputPayload: { foo: 'bar' },
        options: { allowLocal: true }
      });
      assert.strictEqual(res4.prediction, 0.45);

      // 5. Accept standard { prediction: ... } object when no predictionField is configured
      mockServerResponse = { prediction: 0.62 };
      const res5 = await executeModelInference({
        modelId: String(mockModelId),
        versionId: String(mockVersionId),
        inputPayload: { foo: 'bar' },
        options: { allowLocal: true }
      });
      assert.strictEqual(res5.prediction, 0.62);
    } finally {
      Model.findById = origModelFindById;
      ModelVersion.findById = origVersionFindById;
    }
  } finally {
    await new Promise(resolve => mockServer.close(resolve));
  }
});

test('11. Cross-Model Isolation: Cannot use Model A config with Model B version', async () => {
  const modelAId = new mongoose.Types.ObjectId();
  const modelBId = new mongoose.Types.ObjectId();
  const versionBId = new mongoose.Types.ObjectId();

  const modelA = new Model({
    _id: modelAId,
    name: 'Model A',
    description: 'Description A',
    owner: 'MLOps Lead',
    team: 'Risk Engineering',
    purpose: 'Purpose A',
    lifecycleStatus: 'IN_PRODUCTION',
    apiConfig: { endpointUrl: 'https://model-a.example.com' }
  });

  const versionB = new ModelVersion({
    _id: versionBId,
    modelId: modelBId, // Belongs to Model B!
    version: 'v1.0.0',
    lifecycleStatus: 'IN_PRODUCTION'
  });

  const origModelFindById = Model.findById;
  const origVersionFindById = ModelVersion.findById;
  Model.findById = () => ({ select: () => Promise.resolve(modelA) });
  ModelVersion.findById = () => ({ select: () => Promise.resolve(versionB) });

  try {
    await assert.rejects(
      async () => {
        await executeModelInference({
          modelId: String(modelAId),
          versionId: String(versionBId),
          inputPayload: { foo: 'bar' }
        });
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /does not belong to model/);
        return true;
      }
    );
  } finally {
    Model.findById = origModelFindById;
    ModelVersion.findById = origVersionFindById;
  }
});

test('12. Version-Level apiConfig Override Precedence', () => {
  const modelConfig = {
    endpointUrl: 'https://model-base.example.com',
    predictEndpoint: '/score',
    method: 'POST',
    authType: 'API_KEY',
    authHeaderName: 'X-API-Key',
    authHeaderValue: 'base-secret',
    requestMapping: { wrapperKey: 'base_wrapper' },
    responseMapping: { predictionField: 'base_score' },
    timeoutMs: 30000
  };

  const versionConfig = {
    endpointUrl: 'https://version-v2.example.com',
    predictEndpoint: '/v2/predict',
    requestMapping: { wrapperKey: 'v2_wrapper' },
    responseMapping: { predictionField: 'v2_score' },
    timeoutMs: 12000
  };

  const effective = resolveEffectiveApiConfig(modelConfig, versionConfig);

  // Version-specific overrides take precedence
  assert.strictEqual(effective.endpointUrl, 'https://version-v2.example.com');
  assert.strictEqual(effective.predictEndpoint, '/v2/predict');
  assert.strictEqual(effective.timeoutMs, 12000);
  assert.strictEqual(effective.requestMapping.wrapperKey, 'v2_wrapper');
  assert.strictEqual(effective.responseMapping.predictionField, 'v2_score');

  // Unoverridden fields inherit seamlessly from model
  assert.strictEqual(effective.authType, 'API_KEY');
  assert.strictEqual(effective.authHeaderName, 'X-API-Key');
  assert.strictEqual(effective.authHeaderValue, 'base-secret');
  assert.strictEqual(effective.method, 'POST');
});

test('13. Secret Preservation and Redaction in Endpoint Updates', async () => {
  const { updateModelApiConfig } = await import('../src/controllers/modelController.js');
  const { AuditLedger } = await import('../src/models/AuditLedger.js');

  const origAuditFindOne = AuditLedger.findOne;
  const origAuditCreate = AuditLedger.create;
  AuditLedger.findOne = () => ({ sort: () => Promise.resolve(null) });
  AuditLedger.create = () => Promise.resolve({ hash: 'mock-hash' });

  const mockModelId = new mongoose.Types.ObjectId();
  const mockModelDoc = new Model({
    _id: mockModelId,
    name: 'Secret Preservation Model',
    description: 'Testing secret preservation',
    owner: 'MLOps Lead',
    team: 'Risk Engineering',
    purpose: 'Secret preservation test',
    lifecycleStatus: 'IN_PRODUCTION',
    apiConfig: {
      endpointUrl: 'https://ai.example.org',
      predictEndpoint: '/score',
      healthEndpoint: '/health',
      authType: 'BEARER',
      authHeaderValue: 'existing-secret-12345'
    }
  });

  const origFindById = Model.findById;
  Model.findById = () => {
    const p = Promise.resolve(mockModelDoc);
    p.select = () => Promise.resolve(mockModelDoc);
    return p;
  };
  mockModelDoc.save = () => Promise.resolve(mockModelDoc);

  // Spin up an ephemeral HTTP mock server to answer the dynamic probe quickly
  const mockHealthServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy' }));
  });
  await new Promise(resolve => mockHealthServer.listen(0, '127.0.0.1', resolve));
  const healthPort = mockHealthServer.address().port;
  const healthBaseUrl = `http://127.0.0.1:${healthPort}`;

  try {
    // 1. Submit with masked secret '***'
    let responseData = null;
    let statusCode = null;
    const reqMasked = {
      params: { id: String(mockModelId) },
      body: {
        endpointUrl: healthBaseUrl,
        healthEndpoint: '/health',
        authType: 'BEARER',
        authHeaderValue: '***'
      },
      user: { name: 'Lead', role: 'ML_LEAD' }
    };
    const resMock = {
      status: (code) => { statusCode = code; return resMock; },
      json: (data) => { responseData = data; }
    };

    await updateModelApiConfig(reqMasked, resMock);

    // Secret must be preserved internally
    assert.strictEqual(mockModelDoc.apiConfig.authHeaderValue, 'existing-secret-12345');
    // Secret must NOT be returned in API response
    assert.strictEqual(responseData.success, true);
    assert.strictEqual(responseData.data.apiConfig.authHeaderValue, undefined);
    assert.strictEqual(responseData.data.apiConfig.hasAuthSecret, true);

    // 2. Submit with authType NONE - secret must be cleared
    const reqNone = {
      params: { id: String(mockModelId) },
      body: {
        endpointUrl: healthBaseUrl,
        authType: 'NONE'
      },
      user: { name: 'Lead', role: 'ML_LEAD' }
    };

    await updateModelApiConfig(reqNone, resMock);
    assert.strictEqual(mockModelDoc.apiConfig.authHeaderValue, '');
    assert.strictEqual(responseData.data.apiConfig.hasAuthSecret, false);
  } finally {
    Model.findById = origFindById;
    AuditLedger.findOne = origAuditFindOne;
    AuditLedger.create = origAuditCreate;
    await new Promise(resolve => mockHealthServer.close(resolve));
  }
});
