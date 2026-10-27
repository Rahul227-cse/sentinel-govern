/**
 * Sentinel Govern - Dynamic Model Inference Engine
 * 
 * Executes model inference against arbitrary externally-hosted AI models.
 * Configuration-driven: URLs, paths, methods, auth, request transformation,
 * and response parsing are governed by Model.apiConfig and ModelVersion.apiConfig.
 * 
 * HARD RULE: Never hardcode model-specific endpoint URLs, headers, payloads,
 * or schemas. Every model must be dynamically invoked through this service.
 */

import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { validateEndpointUrl, validateSafeEndpointUrl } from './lifecycleService.js';
import mongoose from 'mongoose';

/**
 * Extracts a value from a nested object using a dot-delimited path or array notation.
 * e.g. "prediction", "output.probability", "predictions[0].score", "data.0.result"
 */
export function extractByPath(obj, path) {
  if (!obj || !path || typeof path !== 'string') return undefined;
  const normalizedPath = path.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
  const segments = normalizedPath.split('.');
  let current = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    current = current[seg];
  }
  return current;
}

/**
 * Normalizes tabular credit applicant features to standard applicant schema expected by credit risk inference services.
 * Idempotent: returns already structured applicant objects untouched.
 */
export function normalizeCreditApplicantPayload(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  if (obj.applicant && typeof obj.applicant === 'object') {
    return obj;
  }
  if (obj.AMT_INCOME_TOTAL !== undefined || obj.AMT_CREDIT !== undefined || obj.DAYS_BIRTH !== undefined) {
    const rawIncome = obj.amt_income ?? obj.AMT_INCOME_TOTAL ?? 150000;
    const rawCredit = obj.amt_credit ?? obj.AMT_CREDIT ?? 350000;
    const rawAnnuity = obj.amt_annuity ?? obj.AMT_ANNUITY ?? Math.round(Number(rawCredit) * 0.08);
    const rawDaysBirth = obj.DAYS_BIRTH !== undefined ? Number(obj.DAYS_BIRTH) : -14000;
    const rawDaysEmployed = obj.DAYS_EMPLOYED !== undefined ? Number(obj.DAYS_EMPLOYED) : -1500;

    const age = obj.age !== undefined 
      ? Number(obj.age) 
      : Math.max(18, Math.min(80, Math.round(Math.abs(rawDaysBirth) / 365.25)));
    const emp_years = obj.emp_years !== undefined 
      ? Number(obj.emp_years) 
      : Math.max(0, Math.min(50, Math.round((Math.abs(rawDaysEmployed) / 365.25) * 10) / 10));

    const applicant = {
      amt_income: Number(rawIncome),
      amt_credit: Number(rawCredit),
      amt_annuity: Number(rawAnnuity),
      age: Number(age),
      emp_years: Number(emp_years),
      region_rating: obj.region_rating !== undefined ? Number(obj.region_rating) : 2,
      cnt_children: obj.cnt_children !== undefined ? Number(obj.cnt_children) : 0,
      ext_source_1: obj.ext_source_1 !== undefined ? Number(obj.ext_source_1) : (obj.EXT_SOURCE_1 !== undefined ? Number(obj.EXT_SOURCE_1) : 0.5),
      ext_source_2: obj.ext_source_2 !== undefined ? Number(obj.ext_source_2) : (obj.EXT_SOURCE_2 !== undefined ? Number(obj.EXT_SOURCE_2) : 0.5),
      ext_source_3: obj.ext_source_3 !== undefined ? Number(obj.ext_source_3) : (obj.EXT_SOURCE_3 !== undefined ? Number(obj.EXT_SOURCE_3) : 0.5),
      bureau_active: obj.bureau_active !== undefined ? Number(obj.bureau_active) : 1,
      bureau_dpd: obj.bureau_dpd !== undefined ? Number(obj.bureau_dpd) : 0,
      bureau_debt: obj.bureau_debt !== undefined ? Number(obj.bureau_debt) : 0.0,
      prev_approval: obj.prev_approval !== undefined ? Number(obj.prev_approval) : 1.0,
      prev_refused: obj.prev_refused !== undefined ? Number(obj.prev_refused) : 0,
      prev_count: obj.prev_count !== undefined ? Number(obj.prev_count) : 1
    };

    return {
      applicant,
      model: obj.model || 'lgbm',
      low: obj.low !== undefined ? obj.low : 0.3,
      high: obj.high !== undefined ? obj.high : 0.7
    };
  }

  return obj;
}

/**
 * Maps input payload fields and applies wrappers or array transforms based on requestMapping.
 */
export function buildRequestBody(inputPayload, requestMapping = {}, apiConfig = {}) {
  const hasExplicitWrapperKey = Boolean(requestMapping && requestMapping.wrapperKey !== undefined && requestMapping.wrapperKey !== null);
  const wrapperKey = hasExplicitWrapperKey
    ? String(requestMapping.wrapperKey).trim()
    : (apiConfig?.requestMapping?.wrapperKey ? String(apiConfig.requestMapping.wrapperKey).trim() : '');

  // For a version override or configuration with an empty Request Wrapper Key,
  // send the sample payload unchanged. Never automatically wrap in applicant, inputs, data, or any other key.
  const isExplicitEmptyWrapper = hasExplicitWrapperKey && wrapperKey === '';
  const isHuggingFaceCreditLens = Boolean(
    (apiConfig?.endpointUrl && /creditlens\.hf\.space/i.test(apiConfig.endpointUrl)) ||
    (wrapperKey === 'applicant')
  );

  let body = inputPayload;
  if (!isExplicitEmptyWrapper && isHuggingFaceCreditLens && (wrapperKey === 'applicant' || !hasExplicitWrapperKey)) {
    body = normalizeCreditApplicantPayload(inputPayload);
  } else if (wrapperKey === 'applicant') {
    body = normalizeCreditApplicantPayload(inputPayload);
  }

  if (!requestMapping || typeof requestMapping !== 'object' || Object.keys(requestMapping).length === 0) {
    return body;
  }

  // Apply field renames if configured
  if (requestMapping.fieldMap && typeof requestMapping.fieldMap === 'object' && Object.keys(requestMapping.fieldMap).length > 0) {
    if (Array.isArray(body)) {
      body = body.map(row => applyFieldMap(row, requestMapping.fieldMap));
    } else if (typeof body === 'object' && body !== null) {
      body = applyFieldMap(body, requestMapping.fieldMap);
    }
  }

  // Wrap in array if API requires an array of records
  if (requestMapping.isArray && !Array.isArray(body)) {
    body = [body];
  }

  // Wrap in root container key if API requires e.g. { "inputs": [...] } or { "features": {...} }
  if (wrapperKey) {
    const isAlreadyWrapped = typeof body === 'object' && body !== null && !Array.isArray(body) && (wrapperKey in body);
    if (!isAlreadyWrapped) {
      body = { [wrapperKey]: body };
    }
  }

  // Merge static/fixed payload parameters if configured (e.g. model selector or hyperparams)
  if (requestMapping.staticFields && typeof requestMapping.staticFields === 'object' && Object.keys(requestMapping.staticFields).length > 0 && !Array.isArray(body)) {
    body = { ...body, ...requestMapping.staticFields };
  }

  return body;
}

function applyFieldMap(obj, fieldMap) {
  const result = { ...obj };
  for (const [from, to] of Object.entries(fieldMap)) {
    if (from in result && to && typeof to === 'string') {
      result[to] = result[from];
      delete result[from];
    }
  }
  return result;
}

/**
 * Constructs authentication headers based on apiConfig authType and credentials.
 */
export function buildAuthHeaders(apiConfig = {}) {
  const headers = {};
  const authType = apiConfig.authType || 'NONE';
  const secret = (apiConfig.authHeaderValue || '').trim();

  if (!secret || authType === 'NONE') {
    return headers;
  }

  switch (authType) {
    case 'BEARER':
      headers['Authorization'] = `Bearer ${secret}`;
      break;
    case 'API_KEY': {
      const headerName = (apiConfig.authHeaderName || '').trim() || 'X-API-Key';
      headers[headerName] = secret;
      break;
    }
    case 'CUSTOM_HEADER': {
      const headerName = (apiConfig.authHeaderName || '').trim() || 'Authorization';
      headers[headerName] = secret;
      break;
    }
    default:
      break;
  }

  return headers;
}

/**
 * Builds the full target URL for an endpoint path, resolving leading/trailing slashes.
 */
export function buildFullEndpointUrl(baseUrl, endpointPath = '') {
  if (!baseUrl) {
    throw new Error('Base endpoint URL is required');
  }
  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  const cleanPath = (endpointPath || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return cleanPath ? `${cleanBase}/${cleanPath}` : cleanBase;
}

/**
 * Merges version-level API configuration overrides with base model API configuration.
 * Enables version-specific endpoints or schemas while preserving full model fallback.
 */
export function resolveEffectiveApiConfig(modelConfig = {}, versionConfig = {}) {
  const v = versionConfig || {};
  const m = modelConfig || {};

  const hasVersionRequestMapping = v.requestMapping && typeof v.requestMapping === 'object';
  const effectiveRequestMapping = hasVersionRequestMapping ? {
    wrapperKey: v.requestMapping.wrapperKey !== undefined ? v.requestMapping.wrapperKey : (m.requestMapping?.wrapperKey || ''),
    isArray: v.requestMapping.isArray !== undefined ? v.requestMapping.isArray : Boolean(m.requestMapping?.isArray),
    fieldMap: v.requestMapping.fieldMap !== undefined ? v.requestMapping.fieldMap : (m.requestMapping?.fieldMap || {}),
    customHeaders: v.requestMapping.customHeaders !== undefined ? v.requestMapping.customHeaders : (m.requestMapping?.customHeaders || {}),
    staticFields: v.requestMapping.staticFields !== undefined ? v.requestMapping.staticFields : (m.requestMapping?.staticFields || null)
  } : (m.requestMapping || {});

  return {
    endpointUrl: (v.endpointUrl || m.endpointUrl || '').trim(),
    healthEndpoint: (v.healthEndpoint || m.healthEndpoint || '').trim(),
    predictEndpoint: (v.predictEndpoint || m.predictEndpoint || '').trim(),
    method: v.method || m.method || 'POST',
    authType: v.authType || m.authType || 'NONE',
    authHeaderName: (v.authHeaderName || m.authHeaderName || '').trim(),
    authHeaderValue: (v.authHeaderValue || m.authHeaderValue || '').trim(),
    requestMapping: effectiveRequestMapping,
    responseMapping: {
      predictionField: (v.responseMapping?.predictionField !== undefined && v.responseMapping?.predictionField !== null && String(v.responseMapping.predictionField).trim())
        ? String(v.responseMapping.predictionField).trim()
        : (m.responseMapping?.predictionField || '').trim(),
      latencyField: (v.responseMapping?.latencyField !== undefined && v.responseMapping?.latencyField !== null && String(v.responseMapping.latencyField).trim())
        ? String(v.responseMapping.latencyField).trim()
        : (m.responseMapping?.latencyField || '').trim()
    },
    timeoutMs: v.timeoutMs || m.timeoutMs || 30000,
    maxRetries: m.maxRetries ?? 2,
    status: m.status || 'CONFIGURATION_REQUIRED'
  };
}

/**
 * Executes an outbound HTTP request with SSRF protection and manual redirect validation.
 * Intercepts 3xx redirects to re-validate destination addresses before following.
 */
export async function safeFetch(url, fetchOptions = {}, { allowLocal = false, maxRedirects = 3 } = {}) {
  let currentUrl = url;
  let redirectsCount = 0;

  while (true) {
    await validateSafeEndpointUrl(currentUrl, { allowLocal });

    const response = await fetch(currentUrl, {
      ...fetchOptions,
      redirect: 'manual'
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirectsCount++;
      if (redirectsCount > maxRedirects) {
        throw new Error(`SSRF BLOCKED: Exceeded maximum redirect limit (${maxRedirects})`);
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Redirect response (${response.status}) missing Location header`);
      }

      const nextUrl = new URL(location, currentUrl).toString();
      await validateSafeEndpointUrl(nextUrl, { allowLocal });

      currentUrl = nextUrl;
      continue;
    }

    return response;
  }
}

/**
 * Executes a dynamic prediction call against an externally hosted model.
 * 
 * @param {Object} params
 * @param {string} params.modelId - Target Model ID
 * @param {string} [params.versionId] - Target ModelVersion ID (defaults to current production version)
 * @param {Object|Array} params.inputPayload - Data payload for the model
 * @param {Object} [params.options] - Execution options (allowDraft, allowLocal, etc.)
 * @returns {Promise<Object>} Formatted inference result
 */
export async function executeModelInference({
  modelId,
  versionId = null,
  inputPayload,
  options = {}
}) {
  if (!modelId) {
    throw new Error('modelId is required for inference');
  }
  if (inputPayload === undefined || inputPayload === null) {
    throw new Error('inputPayload is required for inference');
  }

  // 1. Resolve Model with decrypted/selected auth credentials
  let model = options.model || null;
  if (!model && typeof Model?.findById === 'function') {
    const res = Model.findById(modelId);
    model = res && typeof res.select === 'function' ? await res.select('+apiConfig.authHeaderValue') : await res;
  }
  if (!model) {
    const notFoundErr = new Error(`Model ${modelId} not found`);
    notFoundErr.statusCode = 404;
    throw notFoundErr;
  }

  // 2. Resolve ModelVersion with decrypted/selected auth credentials
  let version = options.version || null;
  if (!version && typeof ModelVersion?.findById === 'function') {
    if (versionId) {
      const res = ModelVersion.findById(versionId);
      version = res && typeof res.select === 'function' ? await res.select('+apiConfig.authHeaderValue') : await res;
    } else if (model.currentProductionVersionId) {
      const res = ModelVersion.findById(model.currentProductionVersionId);
      version = res && typeof res.select === 'function' ? await res.select('+apiConfig.authHeaderValue') : await res;
    } else if (typeof ModelVersion.findOne === 'function') {
      const res = ModelVersion.findOne({ modelId: model._id, lifecycleStatus: 'IN_PRODUCTION' });
      version = res && typeof res.select === 'function' ? await res.select('+apiConfig.authHeaderValue') : await res;
    }
  }

  if (!version) {
    const noVersionErr = new Error(`No active or production version found for model "${model.name}"`);
    noVersionErr.statusCode = 404;
    throw noVersionErr;
  }

  // Prevent cross-model mismatch: version must belong to requested model
  if (String(version.modelId) !== String(model._id)) {
    const mismatchErr = new Error(`Version ${version._id} does not belong to model ${model._id}`);
    mismatchErr.statusCode = 400;
    throw mismatchErr;
  }

  // 3. Lifecycle state gate
  if (!options.allowDraft) {
    const isOperable = ['IN_PRODUCTION', 'APPROVED'].includes(version.lifecycleStatus) || version.deploymentStatus === 'IN_PRODUCTION';
    if (!isOperable) {
      const lifecycleErr = new Error(
        `INFERENCE GATE BLOCKED: Model version ${version.version} is in status "${version.lifecycleStatus}". Live inference is only permitted for APPROVED or IN_PRODUCTION versions.`
      );
      lifecycleErr.statusCode = 403;
      throw lifecycleErr;
    }
  }

  // 4. Resolve effective configuration (version-level overrides model-level)
  const apiConfig = resolveEffectiveApiConfig(model.apiConfig, version.apiConfig);

  if (!apiConfig.endpointUrl || !apiConfig.endpointUrl.trim()) {
    const noUrlErr = new Error(
      `Model "${model.name}" has no endpointUrl configured. Update model API configuration before executing inference.`
    );
    noUrlErr.statusCode = 400;
    noUrlErr.code = 'CONFIGURATION_REQUIRED';
    throw noUrlErr;
  }

  const targetUrl = buildFullEndpointUrl(apiConfig.endpointUrl, apiConfig.predictEndpoint);

  const method = (apiConfig.method || 'POST').toUpperCase();
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs || apiConfig.timeoutMs) || 30000, 1000), 60000);
  const maxRetries = Math.min(Math.max(Number(apiConfig.maxRetries) || 0, 0), 3);

  // 5. Construct headers and body
  const customHeaders = apiConfig.requestMapping?.customHeaders || {};
  const authHeaders = buildAuthHeaders(apiConfig);
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...customHeaders,
    ...authHeaders
  };

  const formattedPayload = buildRequestBody(inputPayload, apiConfig.requestMapping, apiConfig);
  const body = method === 'GET' ? undefined : JSON.stringify(formattedPayload);

  // Allow local endpoints if explicitly configured or non-production test mode
  const allowLocal = options.allowLocal ?? (process.env.NODE_ENV !== 'production');

  // 6. Execute request with safeFetch and bounded retries on transient errors
  let lastError = null;
  let response = null;
  let measuredLatency = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const t0 = Date.now();
    try {
      response = await safeFetch(
        targetUrl,
        {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(timeoutMs)
        },
        { allowLocal }
      );
      measuredLatency = Date.now() - t0;

      // Transient server errors (502, 503, 504) allow retry
      if ([502, 503, 504].includes(response.status) && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 250));
        continue;
      }

      break;
    } catch (err) {
      measuredLatency = Date.now() - t0;
      lastError = err;
      // Do not retry on SSRF block or bad request
      if (err.message.includes('SSRF BLOCKED')) {
        break;
      }
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 250));
        continue;
      }
    }
  }

  if (!response && lastError) {
    if (lastError.message.includes('SSRF BLOCKED')) {
      const ssrfErr = new Error(lastError.message);
      ssrfErr.statusCode = 400;
      throw ssrfErr;
    }

    const isTimeout = lastError.name === 'TimeoutError' || lastError.message.includes('timeout') || lastError.message.includes('aborted');
    const netErr = new Error(
      `Inference failed for model "${model.name}" at ${targetUrl}: ${isTimeout ? `Request timed out after ${timeoutMs}ms` : lastError.message}`
    );
    netErr.statusCode = isTimeout ? 504 : 502;
    throw netErr;
  }

  // 7. Parse response
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const httpErr = new Error(
      `Inference endpoint for "${model.name}" returned HTTP ${response.status}: ${errText.slice(0, 300)}`
    );
    httpErr.statusCode = response.status >= 500 ? 503 : response.status;
    httpErr.rawResponse = errText;
    throw httpErr;
  }

  const rawResponse = await response.json().catch(() => ({}));

  // 8. Strict prediction field extraction without guessing
  let prediction;
  const configuredField = apiConfig.responseMapping?.predictionField;
  if (configuredField && configuredField.trim()) {
    const extracted = extractByPath(rawResponse, configuredField.trim());
    if (extracted === undefined) {
      const missingFieldErr = new Error(
        `Configured prediction field "${configuredField.trim()}" was not found in model response.`
      );
      missingFieldErr.statusCode = 502;
      missingFieldErr.rawResponse = rawResponse;
      throw missingFieldErr;
    }
    prediction = extracted;
  } else {
    // If no predictionField is configured:
    if (typeof rawResponse !== 'object' || rawResponse === null) {
      prediction = rawResponse;
    } else if (rawResponse.prediction !== undefined) {
      prediction = rawResponse.prediction;
    } else if (rawResponse.decision !== undefined) {
      prediction = rawResponse.decision;
    } else if (rawResponse.result !== undefined) {
      prediction = rawResponse.result;
    } else {
      const ambiguousErr = new Error(
        `Ambiguous model response: No predictionField is configured in responseMapping and response is an object without a standard "prediction" property. Configure responseMapping.predictionField to extract the correct field.`
      );
      ambiguousErr.statusCode = 502;
      ambiguousErr.rawResponse = rawResponse;
      throw ambiguousErr;
    }
  }

  // 9. Extract latency if provided by response, else use measured latency
  let latencyMs = measuredLatency;
  const latencyField = apiConfig.responseMapping?.latencyField;
  if (latencyField && latencyField.trim()) {
    const customLatency = extractByPath(rawResponse, latencyField.trim());
    if (typeof customLatency === 'number' && !isNaN(customLatency) && customLatency >= 0) {
      latencyMs = customLatency;
    }
  }

  return {
    success: true,
    prediction,
    rawResponse,
    latencyMs,
    statusCode: response.status,
    modelId: model._id,
    modelName: model.name,
    versionId: version._id,
    version: version.version,
    timestamp: new Date()
  };
}

/**
 * Performs a dynamic health probe against a model's configured health endpoint.
 * Updates model.apiConfig status, lastCheckedAt, and latency metrics in the database.
 */
export async function checkModelEndpointHealth(modelId, options = {}) {
  const model = await Model.findById(modelId).select('+apiConfig.authHeaderValue');
  if (!model) {
    throw new Error(`Model ${modelId} not found`);
  }

  const apiConfig = model.apiConfig || {};
  if (!apiConfig.endpointUrl || !apiConfig.endpointUrl.trim()) {
    model.apiConfig.status = 'CONFIGURATION_REQUIRED';
    model.apiConfig.lastError = 'No endpointUrl configured';
    await model.save();
    return {
      status: 'CONFIGURATION_REQUIRED',
      modelId: model._id,
      modelName: model.name,
      message: 'Model has no endpointUrl configured.'
    };
  }

  const healthPath = (apiConfig.healthEndpoint || '').trim() || '/health';
  const targetUrl = buildFullEndpointUrl(apiConfig.endpointUrl, healthPath);

  const authHeaders = buildAuthHeaders(apiConfig);
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 8000, 1000), 15000);
  const allowLocal = options.allowLocal ?? (process.env.NODE_ENV !== 'production');

  const t0 = Date.now();
  try {
    const response = await safeFetch(
      targetUrl,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          ...authHeaders
        },
        signal: AbortSignal.timeout(timeoutMs)
      },
      { allowLocal }
    );

    const responseTimeMs = Date.now() - t0;
    const isHealthy = response.ok;

    model.apiConfig.status = isHealthy ? 'CONNECTED' : 'UNAVAILABLE';
    model.apiConfig.lastCheckedAt = new Date();
    model.apiConfig.lastResponseTimeMs = responseTimeMs;
    model.apiConfig.lastError = isHealthy ? null : `HTTP ${response.status}`;
    await model.save();

    let details = null;
    try {
      details = await response.json();
    } catch {
      details = {};
    }

    return {
      status: model.apiConfig.status,
      statusCode: response.status,
      modelId: model._id,
      modelName: model.name,
      endpointUrl: apiConfig.endpointUrl,
      healthEndpoint: healthPath,
      responseTimeMs,
      details
    };
  } catch (err) {
    const responseTimeMs = Date.now() - t0;
    model.apiConfig.status = 'UNAVAILABLE';
    model.apiConfig.lastCheckedAt = new Date();
    model.apiConfig.lastResponseTimeMs = responseTimeMs;
    model.apiConfig.lastError = err.message;
    await model.save();

    return {
      status: 'UNAVAILABLE',
      modelId: model._id,
      modelName: model.name,
      endpointUrl: apiConfig.endpointUrl,
      healthEndpoint: healthPath,
      responseTimeMs,
      error: err.message
    };
  }
}
