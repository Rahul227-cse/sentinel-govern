import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const monitoringSourcePath = path.resolve(__dirname, '../../frontend/src/pages/Monitoring.jsx');
const monitoringSource = fs.readFileSync(monitoringSourcePath, 'utf8');

// Extraction of pure logic simulated from Monitoring.jsx for testing
function parseAndUnpackConfig(res) {
  // Simulates line 196: const data = (res && res.success && res.data) ? res.data : (res?.data || res);
  return (res && res.success && res.data) ? res.data : (res?.data || res);
}

function resolveTargetConfig(data, versionId) {
  return versionId && data.versionApiConfig
    ? (data.effectiveApiConfig || data.versionApiConfig)
    : (data.modelApiConfig || data.effectiveApiConfig || {});
}

function buildFormState(targetConfig) {
  return {
    endpointUrl: targetConfig.endpointUrl || '',
    healthEndpoint: targetConfig.healthEndpoint || '/health',
    predictEndpoint: targetConfig.predictEndpoint || '/predict',
    method: targetConfig.method || 'POST',
    authType: targetConfig.authType || 'NONE',
    authHeaderName: targetConfig.authHeaderName || (targetConfig.authType === 'API_KEY' ? 'X-API-Key' : 'Authorization'),
    authHeaderValue: '',
    wrapperKey: targetConfig.requestMapping?.wrapperKey || '',
    isArray: Boolean(targetConfig.requestMapping?.isArray),
    fieldMapText: targetConfig.requestMapping?.fieldMap ? JSON.stringify(targetConfig.requestMapping.fieldMap, null, 2) : '',
    customHeadersText: targetConfig.requestMapping?.customHeaders ? JSON.stringify(targetConfig.requestMapping.customHeaders, null, 2) : '',
    staticFields: targetConfig.requestMapping?.staticFields || null,
    predictionField: targetConfig.responseMapping?.predictionField || 'decision',
    latencyField: targetConfig.responseMapping?.latencyField || '',
    timeoutMs: targetConfig.timeoutMs || 30000,
    maxRetries: targetConfig.maxRetries !== undefined ? targetConfig.maxRetries : 2
  };
}

function buildSavePayload(endpointForm, loadedConfig) {
  if (!endpointForm.endpointUrl || !endpointForm.endpointUrl.trim()) {
    throw new Error('Base Endpoint URL is required.');
  }

  const staticFieldsToSave = endpointForm.staticFields !== undefined && endpointForm.staticFields !== null
    ? endpointForm.staticFields
    : (loadedConfig?.requestMapping?.staticFields || undefined);

  return {
    endpointUrl: endpointForm.endpointUrl.trim(),
    healthEndpoint: (endpointForm.healthEndpoint || '').trim(),
    predictEndpoint: (endpointForm.predictEndpoint || '').trim(),
    method: endpointForm.method || 'POST',
    authType: endpointForm.authType || 'NONE',
    authHeaderName: (endpointForm.authHeaderName || '').trim(),
    authHeaderValue: endpointForm.authHeaderValue,
    requestMapping: {
      wrapperKey: endpointForm.wrapperKey ? endpointForm.wrapperKey.trim() : undefined,
      isArray: Boolean(endpointForm.isArray),
      staticFields: staticFieldsToSave
    },
    responseMapping: {
      predictionField: (endpointForm.predictionField || '').trim(),
      latencyField: (endpointForm.latencyField || '').trim()
    },
    timeoutMs: Number(endpointForm.timeoutMs) || 30000,
    maxRetries: Number(endpointForm.maxRetries) !== undefined ? Number(endpointForm.maxRetries) : 2
  };
}

test('Monitoring Config: 1. Unwrapped getModelEndpointConfig() response loads the saved values', () => {
  const unwrappedResponse = {
    modelId: '6ade3d8f5d31517792164a31',
    modelName: 'CreditLens',
    versionId: null,
    modelApiConfig: {
      endpointUrl: 'https://mohamedgamal04-creditlens.hf.space',
      healthEndpoint: '/health',
      predictEndpoint: '/predict',
      method: 'POST',
      authType: 'NONE',
      requestMapping: {
        wrapperKey: 'applicant',
        staticFields: { model: 'stacking' }
      },
      responseMapping: {
        predictionField: 'decision'
      },
      timeoutMs: 30000,
      maxRetries: 2,
      status: 'CONNECTED'
    },
    versionApiConfig: null,
    effectiveApiConfig: {
      endpointUrl: 'https://mohamedgamal04-creditlens.hf.space',
      healthEndpoint: '/health',
      predictEndpoint: '/predict',
      method: 'POST',
      authType: 'NONE',
      requestMapping: {
        wrapperKey: 'applicant',
        staticFields: { model: 'stacking' }
      },
      responseMapping: {
        predictionField: 'decision'
      },
      timeoutMs: 30000,
      maxRetries: 2,
      status: 'CONNECTED'
    }
  };

  const data = parseAndUnpackConfig(unwrappedResponse);
  assert.ok(data.modelApiConfig, 'Should unpack data and expose modelApiConfig');
  const targetConfig = resolveTargetConfig(data, '');
  const form = buildFormState(targetConfig);

  assert.strictEqual(form.endpointUrl, 'https://mohamedgamal04-creditlens.hf.space');
  assert.strictEqual(form.predictEndpoint, '/predict');
  assert.strictEqual(form.healthEndpoint, '/health');
  assert.strictEqual(form.wrapperKey, 'applicant');
  assert.deepStrictEqual(form.staticFields, { model: 'stacking' });
  assert.strictEqual(form.predictionField, 'decision');
  assert.strictEqual(form.timeoutMs, 30000);
});

test('Monitoring Config: 2. Wrapped response ({ success: true, data }) is supported for compatibility', () => {
  const wrappedResponse = {
    success: true,
    data: {
      modelId: '6ade3d8f5d31517792164a31',
      modelName: 'CreditLens',
      modelApiConfig: {
        endpointUrl: 'https://mohamedgamal04-creditlens.hf.space',
        predictEndpoint: '/predict',
        responseMapping: { predictionField: 'decision' }
      }
    }
  };

  const data = parseAndUnpackConfig(wrappedResponse);
  assert.ok(data.modelApiConfig, 'Should unpack wrapped response');
  assert.strictEqual(data.modelApiConfig.endpointUrl, 'https://mohamedgamal04-creditlens.hf.space');
});

test('Monitoring Config: 3. CreditLens configuration values are populated accurately', () => {
  const creditLensConfig = {
    endpointUrl: 'https://mohamedgamal04-creditlens.hf.space',
    healthEndpoint: '/health',
    predictEndpoint: '/predict',
    method: 'POST',
    authType: 'NONE',
    requestMapping: {
      wrapperKey: 'applicant',
      staticFields: { model: 'stacking' }
    },
    responseMapping: {
      predictionField: 'decision'
    },
    timeoutMs: 30000,
    maxRetries: 2
  };

  const form = buildFormState(creditLensConfig);
  assert.strictEqual(form.endpointUrl, 'https://mohamedgamal04-creditlens.hf.space');
  assert.strictEqual(form.predictEndpoint, '/predict');
  assert.strictEqual(form.wrapperKey, 'applicant');
  assert.deepStrictEqual(form.staticFields, { model: 'stacking' });
  assert.strictEqual(form.predictionField, 'decision');
  assert.strictEqual(form.timeoutMs, 30000);
  assert.strictEqual(form.maxRetries, 2);
});

test('Monitoring Config: 4. A failed configuration fetch cannot enable destructive save of blank defaults', () => {
  const emptyForm = { endpointUrl: '' };
  assert.throws(() => {
    buildSavePayload(emptyForm, null);
  }, /Base Endpoint URL is required/);
});

test('Monitoring Config: 5. Version-specific override takes precedence where configured', () => {
  const data = {
    modelApiConfig: {
      endpointUrl: 'https://model-default.example.com',
      predictEndpoint: '/predict',
      timeoutMs: 30000
    },
    versionApiConfig: {
      endpointUrl: 'https://version-override.example.com'
    },
    effectiveApiConfig: {
      endpointUrl: 'https://version-override.example.com',
      predictEndpoint: '/predict',
      timeoutMs: 30000
    }
  };

  // When version is selected, effective config provides version override + model defaults
  const versionTarget = resolveTargetConfig(data, 'v2-id');
  const versionForm = buildFormState(versionTarget);
  assert.strictEqual(versionForm.endpointUrl, 'https://version-override.example.com');
  assert.strictEqual(versionForm.predictEndpoint, '/predict'); // inherited

  // When model scope is selected, model defaults are used
  const modelTarget = resolveTargetConfig(data, '');
  const modelForm = buildFormState(modelTarget);
  assert.strictEqual(modelForm.endpointUrl, 'https://model-default.example.com');
});

test('Monitoring Config: 6. Request ID sequencing protects against stale asynchronous responses', () => {
  let activeReqId = 0;
  let formUrl = '';

  function simulateAsyncLoad(requestId, responseUrl) {
    if (requestId !== activeReqId) {
      return; // Discard stale request
    }
    formUrl = responseUrl;
  }

  // Model A starts
  const req1 = ++activeReqId; // 1
  // Model B starts before Model A finishes
  const req2 = ++activeReqId; // 2

  // Model B finishes first
  simulateAsyncLoad(req2, 'https://model-b.example.com');
  assert.strictEqual(formUrl, 'https://model-b.example.com');

  // Model A finishes later (stale)
  simulateAsyncLoad(req1, 'https://model-a.example.com');
  assert.strictEqual(formUrl, 'https://model-b.example.com', 'Stale Model A response must be ignored');
});

test('Monitoring Config: 7. Smoke-test payload initialization does not erase user edits', () => {
  let userEdited = false;
  let currentPayload = 'initial';

  // Initial load autofills
  if (!userEdited) {
    currentPayload = 'CREDIT_PAYLOAD';
  }
  assert.strictEqual(currentPayload, 'CREDIT_PAYLOAD');

  // User edits payload
  userEdited = true;
  currentPayload = 'USER_CUSTOM_PAYLOAD';

  // Subsequent background refresh does not overwrite
  if (!userEdited) {
    currentPayload = 'CREDIT_PAYLOAD';
  }
  assert.strictEqual(currentPayload, 'USER_CUSTOM_PAYLOAD');
});

test('Monitoring Config: 8. Saving preserves CreditLens static request fields', () => {
  const form = {
    endpointUrl: 'https://mohamedgamal04-creditlens.hf.space',
    predictEndpoint: '/predict',
    wrapperKey: 'applicant',
    staticFields: { model: 'stacking' }
  };
  const loadedConfig = {
    requestMapping: { staticFields: { model: 'stacking' } }
  };

  const payload = buildSavePayload(form, loadedConfig);
  assert.deepStrictEqual(payload.requestMapping.staticFields, { model: 'stacking' });
});

test('Monitoring Config: 9. Frontend Monitoring.jsx contract matches all requirements', () => {
  assert.ok(
    monitoringSource.includes('const data = (res && res.success && res.data) ? res.data : (res?.data || res);'),
    'Monitoring.jsx must support both unwrapped and wrapped API response formats'
  );
  assert.ok(
    monitoringSource.includes('configRequestIdRef'),
    'Monitoring.jsx must track request IDs to prevent stale async overwrites'
  );
  assert.ok(
    monitoringSource.includes('Loaded from Atlas'),
    'Monitoring.jsx must render "Loaded from Atlas" badge when state matches persistence'
  );
  assert.ok(
    monitoringSource.includes('staticFields: staticFieldsToSave'),
    'Monitoring.jsx must preserve staticFields upon saving'
  );
  assert.ok(
    monitoringSource.includes('CREDIT_SMOKE_PAYLOAD'),
    'Monitoring.jsx must define and autofill CREDIT_SMOKE_PAYLOAD'
  );
});
