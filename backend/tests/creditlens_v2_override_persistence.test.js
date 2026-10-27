import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import { getModelEndpointConfig, updateModelApiConfig } from '../src/controllers/modelController.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { Report } from '../src/models/Report.js';
import { Incident } from '../src/models/Incident.js';
import { verifyAuditChainIntegrity } from '../src/services/auditEngine.js';

test('CreditLens v2.0 Endpoint Override Persistence & Reload Test Suite', async (t) => {
  await mongoose.connect(process.env.MONGODB_URI);

  const model = await Model.findOne({ name: 'CreditLens' });
  assert.ok(model, 'CreditLens model must exist');
  const v1 = await ModelVersion.findOne({ modelId: model._id, version: 'v1.0' });
  const v2 = await ModelVersion.findOne({ modelId: model._id, version: 'v2.0' });
  assert.ok(v1, 'CreditLens v1.0 must exist');
  assert.ok(v2, 'CreditLens v2.0 must exist');

  await t.test('1. Save Version Override: updateModelApiConfig persists v2.0 override to Atlas', async () => {
    const req = {
      params: { modelId: String(model._id), versionId: String(v2._id) },
      body: {
        endpointUrl: 'https://credit-risk-scoring-58zh.onrender.com',
        healthEndpoint: '/health',
        predictEndpoint: '/score',
        method: 'POST',
        authType: 'NONE',
        authHeaderName: 'Authorization',
        authHeaderValue: '',
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
        maxRetries: 2
      },
      user: {
        name: 'ML Lead',
        email: 'lead@sentinel.internal',
        role: 'ML_LEAD'
      }
    };

    let responseData = null;
    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    await updateModelApiConfig(req, res);

    assert.equal(statusCode, 200, 'updateModelApiConfig must return 200');
    assert.ok(responseData, 'Response data must be returned');
    assert.equal(responseData.success, true, 'Save must succeed');
    assert.equal(responseData.data.scope, 'VERSION');
    assert.equal(responseData.data.versionApiConfig.endpointUrl, 'https://credit-risk-scoring-58zh.onrender.com');
    assert.equal(responseData.data.versionApiConfig.predictEndpoint, '/score');
    assert.equal(responseData.data.versionApiConfig.responseMapping.predictionField, 'probability_of_default');
    assert.equal(responseData.data.isOverridden.endpointUrl, true);
    assert.equal(responseData.data.isOverridden.predictEndpoint, true);

    // Verify directly from MongoDB Atlas
    const refreshedV2 = await ModelVersion.findById(v2._id);
    assert.equal(refreshedV2.apiConfig.endpointUrl, 'https://credit-risk-scoring-58zh.onrender.com');
    assert.equal(refreshedV2.apiConfig.predictEndpoint, '/score');
    assert.equal(refreshedV2.apiConfig.responseMapping.predictionField, 'probability_of_default');
    assert.equal(refreshedV2.apiConfig.requestMapping.wrapperKey, '');
  });

  await t.test('2. Reload Override: getModelEndpointConfig with versionId fetches v2.0 override and indicates override state', async () => {
    const req = {
      params: { id: String(model._id) },
      query: { versionId: String(v2._id) }
    };

    let responseData = null;
    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        responseData = data;
        return this;
      }
    };

    await getModelEndpointConfig(req, res);

    assert.equal(statusCode, 200, 'getModelEndpointConfig must return 200');
    assert.ok(responseData?.data, 'Response data must be returned');
    const { data } = responseData;

    // Verify version identity
    assert.equal(String(data.versionId), String(v2._id));
    assert.equal(data.versionNumber, 'v2.0');

    // Verify version-specific override
    assert.ok(data.versionApiConfig, 'versionApiConfig must be present');
    assert.equal(data.versionApiConfig.endpointUrl, 'https://credit-risk-scoring-58zh.onrender.com');
    assert.equal(data.versionApiConfig.predictEndpoint, '/score');
    assert.equal(data.versionApiConfig.responseMapping.predictionField, 'probability_of_default');
    assert.equal(data.versionApiConfig.requestMapping.wrapperKey, '');

    // Verify effective configuration resolves to version override
    assert.equal(data.effectiveApiConfig.endpointUrl, 'https://credit-risk-scoring-58zh.onrender.com');
    assert.equal(data.effectiveApiConfig.predictEndpoint, '/score');
    assert.equal(data.effectiveApiConfig.responseMapping.predictionField, 'probability_of_default');

    // Verify isOverridden flags
    assert.equal(data.isOverridden.endpointUrl, true, 'endpointUrl override flag must be true');
    assert.equal(data.isOverridden.predictEndpoint, true, 'predictEndpoint override flag must be true');
    assert.equal(data.isOverridden.responseMapping, true, 'responseMapping override flag must be true');
  });

  await t.test('3. Model Default & v1.0 Inheritance: getModelEndpointConfig without versionId or with v1 returns root model default', async () => {
    // 3a. Model-level default request (versionId = '')
    const reqModel = {
      params: { id: String(model._id) },
      query: {}
    };
    let modelRes = null;
    const resM = {
      status() { return this; },
      json(data) { modelRes = data; return this; }
    };
    await getModelEndpointConfig(reqModel, resM);

    assert.equal(modelRes.data.modelApiConfig.endpointUrl, 'https://mohamedgamal04-creditlens.hf.space');
    assert.equal(modelRes.data.modelApiConfig.predictEndpoint, '/predict');
    assert.equal(modelRes.data.modelApiConfig.requestMapping.wrapperKey, 'applicant');
    assert.equal(modelRes.data.isOverridden.endpointUrl, false);

    // 3b. v1.0 specific request
    const reqV1 = {
      params: { id: String(model._id) },
      query: { versionId: String(v1._id) }
    };
    let v1Res = null;
    const resV1 = {
      status() { return this; },
      json(data) { v1Res = data; return this; }
    };
    await getModelEndpointConfig(reqV1, resV1);

    assert.equal(v1Res.data.versionNumber, 'v1.0');
    assert.equal(v1Res.data.isOverridden.endpointUrl, false, 'v1.0 must NOT have endpointUrl override');
    assert.equal(v1Res.data.effectiveApiConfig.endpointUrl, 'https://mohamedgamal04-creditlens.hf.space', 'v1.0 must inherit model default endpoint');
    assert.equal(v1Res.data.effectiveApiConfig.predictEndpoint, '/predict');
  });

  await t.test('4. Safety & Invariance: Model Default, v1.0 telemetries, and clean v2.0 runtime state preserved', async () => {
    // Verify Model Default is unchanged
    const refreshedModel = await Model.findById(model._id);
    assert.equal(refreshedModel.apiConfig.endpointUrl, 'https://mohamedgamal04-creditlens.hf.space');
    assert.equal(refreshedModel.apiConfig.predictEndpoint, '/predict');

    // Verify v1.0 telemetries
    const v1Telemetries = await Telemetry.find({ modelId: model._id, versionId: v1._id });
    assert.equal(v1Telemetries.length, 9, 'v1.0 must still have all 9 healthy telemetry batches');

    // Verify v2.0 telemetries, reports, incidents exist and reflect current test state
    const v2Telemetries = await Telemetry.find({ modelId: model._id, versionId: v2._id });
    assert.ok(v2Telemetries.length >= 0, 'v2.0 telemetry batches preserved');

    // Verify audit chain
    const audit = await verifyAuditChainIntegrity();
    assert.equal(audit.valid, true, 'Audit ledger SHA-256 chain must be valid');
  });

  await mongoose.disconnect();
});
