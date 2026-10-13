/**
 * Sentinel Govern - Common Workload Architecture & Multi-Model Service Adapter
 * 
 * Manages the four AI workloads:
 * 1. Fraud Detection AI (Local port 8000)
 * 2. Credit Risk Scoring (Hosted Render: https://credit-risk-scoring-58zh.onrender.com)
 * 3. Insurance Charges Prediction (AWS candidate: http://52.57.67.6/ | Verified HTTPS: https://insurance-prediction-paiv.onrender.com)
 * 4. Customer Churn Prediction (Hosted Render: https://churn-prediction-mlops.onrender.com)
 * 
 * "The AI model does the AI work. Sentinel Govern governs the AI model."
 */

import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Policy } from '../models/Policy.js';

export const WORKLOAD_IDS = {
  FRAUD: 'fraud-detection',
  CREDIT_RISK: 'credit-risk',
  INSURANCE: 'insurance-charges',
  CHURN: 'customer-churn'
};

const TIMEOUT_MS = Number(process.env.EXTERNAL_AI_TIMEOUT_MS) || 6000;
const HOSTED_TIMEOUT_MS = Number(process.env.HOSTED_AI_TIMEOUT_MS) || 12000;

export const WORKLOAD_DEFINITIONS = {
  [WORKLOAD_IDS.FRAUD]: {
    id: WORKLOAD_IDS.FRAUD,
    name: 'Real-Time Fraud Detection & Anomaly Intelligence',
    description: 'Autonomous multi-tier transaction fraud classification and heuristic anomaly detection service.',
    modelType: 'CLASSIFICATION',
    riskLevel: 'HIGH',
    purpose: 'Real-time retail transaction fraud scoring and synthetic anomaly detection',
    primaryUrl: process.env.EXTERNAL_AI_URL || 'http://127.0.0.1:8000',
    healthEndpoint: '/health',
    predictEndpoint: '/score',
    requiresAuth: false,
    authHeader: null,
    apiKeyEnv: null,
    monitoredFeatures: [
      'fraud_risk_score',
      'ml_supervised_score',
      'ml_anomaly_score',
      'rule_heuristic_score',
      'latency_ms'
    ],
    referenceDatasetVersion: 'baseline-fraud-v1.0',
    hasReferenceData: true
  },
  [WORKLOAD_IDS.CREDIT_RISK]: {
    id: WORKLOAD_IDS.CREDIT_RISK,
    name: 'Credit Risk Scoring & Default Assessment',
    description: 'LightGBM consumer default probability assessment API evaluating retail credit applicant risk.',
    modelType: 'CLASSIFICATION',
    riskLevel: 'HIGH',
    purpose: 'Retail consumer lending creditworthiness scoring and automated decision recommendations',
    primaryUrl: process.env.CREDIT_RISK_AI_URL || 'https://credit-risk-scoring-58zh.onrender.com',
    healthEndpoint: '/health',
    predictEndpoint: '/score',
    requiresAuth: false,
    authHeader: null,
    apiKeyEnv: null,
    monitoredFeatures: [
      'probability_of_default',
      'AMT_INCOME_TOTAL',
      'AMT_CREDIT',
      'DAYS_BIRTH',
      'latency_ms'
    ],
    referenceDatasetVersion: 'baseline-credit-v1.0',
    hasReferenceData: true
  },
  [WORKLOAD_IDS.INSURANCE]: {
    id: WORKLOAD_IDS.INSURANCE,
    name: 'Medical & Insurance Charges Predictor',
    description: 'Medical and health insurance expenditure regressor predicting annual individual charges.',
    modelType: 'REGRESSION',
    riskLevel: 'LIMITED',
    purpose: 'Underwriting health insurance premium calculation and claim expenditure projections',
    primaryUrl: process.env.INSURANCE_AI_URL || 'https://insurance-prediction-paiv.onrender.com',
    awsCandidateUrl: process.env.INSURANCE_AWS_URL || 'http://52.57.67.6/',
    healthEndpoint: '/',
    predictEndpoint: '/predict',
    requiresAuth: false,
    authHeader: null,
    apiKeyEnv: null,
    monitoredFeatures: [
      'predicted_charge',
      'age',
      'bmi',
      'children',
      'latency_ms'
    ],
    referenceDatasetVersion: 'baseline-insurance-v1.0',
    hasReferenceData: true,
    awsCandidateNote: 'AWS candidate endpoint (http://52.57.67.6/) connection refused / unroutable; verified HTTPS Render endpoint active.'
  },
  [WORKLOAD_IDS.CHURN]: {
    id: WORKLOAD_IDS.CHURN,
    name: 'Customer Churn Retention Intelligence',
    description: 'Telco subscriber attrition intelligence platform with feature drift and explainability endpoints.',
    modelType: 'CLASSIFICATION',
    riskLevel: 'LIMITED',
    purpose: 'Subscriber churn probability scoring for targeted customer success and retention actions',
    primaryUrl: process.env.CHURN_AI_URL || 'https://churn-prediction-mlops.onrender.com',
    healthEndpoint: '/health',
    predictEndpoint: '/predict',
    requiresAuth: true,
    authHeader: 'X-API-Key',
    apiKeyEnv: 'CHURN_API_KEY',
    monitoredFeatures: [
      'MonthlyCharges',
      'TotalCharges',
      'Tenure',
      'latency_ms'
    ],
    referenceDatasetVersion: 'baseline-churn-v1.0',
    hasReferenceData: false
  }
};

/**
 * Checks health of a single workload.
 */
export async function checkWorkloadHealth(workloadId) {
  const config = WORKLOAD_DEFINITIONS[workloadId];
  if (!config) {
    return { status: 'UNAVAILABLE', error: `Unknown workload ID: ${workloadId}` };
  }

  // Churn auth check
  if (config.requiresAuth && !process.env[config.apiKeyEnv]) {
    // Health endpoint is public; test public health first
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HOSTED_TIMEOUT_MS);
      const res = await fetch(`${config.primaryUrl}${config.healthEndpoint}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return {
        workloadId,
        name: config.name,
        status: 'CONFIGURATION_REQUIRED',
        url: config.primaryUrl,
        healthEndpointStatus: res.status,
        message: `API endpoint accessible, but prediction scoring requires '${config.apiKeyEnv}' environment variable (${config.authHeader} header).`,
        hasReferenceData: config.hasReferenceData
      };
    } catch (err) {
      return {
        workloadId,
        name: config.name,
        status: 'CONFIGURATION_REQUIRED',
        url: config.primaryUrl,
        error: err.message,
        message: `Prediction scoring requires '${config.apiKeyEnv}'. Endpoint unreachable: ${err.message}`,
        hasReferenceData: false
      };
    }
  }

  // Normal health check
  const timeout = workloadId === WORKLOAD_IDS.FRAUD ? TIMEOUT_MS : HOSTED_TIMEOUT_MS;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${config.primaryUrl}${config.healthEndpoint}`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        workloadId,
        name: config.name,
        status: 'UNAVAILABLE',
        statusCode: response.status,
        url: config.primaryUrl,
        responseTimeMs,
        hasReferenceData: config.hasReferenceData
      };
    }

    return {
      workloadId,
      name: config.name,
      status: 'CONNECTED',
      url: config.primaryUrl,
      responseTimeMs,
      hasReferenceData: config.hasReferenceData,
      ...(workloadId === WORKLOAD_IDS.INSURANCE ? { awsCandidateNote: config.awsCandidateNote } : {})
    };
  } catch (err) {
    return {
      workloadId,
      name: config.name,
      status: 'UNAVAILABLE',
      url: config.primaryUrl,
      error: err.message,
      hasReferenceData: config.hasReferenceData
    };
  }
}

/**
 * Checks health across all 4 workloads plus Evidently monitoring.
 */
export async function checkAllWorkloadsHealth() {
  const [fraud, creditRisk, insurance, churn] = await Promise.all([
    checkWorkloadHealth(WORKLOAD_IDS.FRAUD),
    checkWorkloadHealth(WORKLOAD_IDS.CREDIT_RISK),
    checkWorkloadHealth(WORKLOAD_IDS.INSURANCE),
    checkWorkloadHealth(WORKLOAD_IDS.CHURN)
  ]);

  return {
    fraud,
    creditRisk,
    insurance,
    churn,
    workloads: [fraud, creditRisk, insurance, churn]
  };
}

/**
 * Invokes real prediction endpoint for Fraud Detection AI.
 */
export async function scoreFraudTransaction(transactionPayload) {
  const config = WORKLOAD_DEFINITIONS[WORKLOAD_IDS.FRAUD];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const t0 = Date.now();
  const response = await fetch(`${config.primaryUrl}${config.predictEndpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(transactionPayload),
    signal: controller.signal
  });

  clearTimeout(timeoutId);
  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Fraud AI /score failed with HTTP ${response.status}: ${errText}`);
    err.statusCode = response.status >= 500 ? 503 : response.status;
    throw err;
  }

  const data = await response.json();
  const latency = Date.now() - t0;
  return {
    ...data,
    latency_ms: (typeof data.latency_ms === 'number' && !isNaN(data.latency_ms)) ? data.latency_ms : latency
  };
}

/**
 * Invokes real prediction endpoint for Credit Risk Scoring.
 */
export async function scoreCreditRiskApplicant(applicantPayload) {
  const config = WORKLOAD_DEFINITIONS[WORKLOAD_IDS.CREDIT_RISK];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HOSTED_TIMEOUT_MS);

  const t0 = Date.now();
  const response = await fetch(`${config.primaryUrl}${config.predictEndpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(applicantPayload),
    signal: controller.signal
  });

  clearTimeout(timeoutId);
  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Credit Risk /score failed with HTTP ${response.status}: ${errText}`);
    err.statusCode = response.status >= 500 ? 503 : response.status;
    throw err;
  }

  const data = await response.json();
  const latency = Date.now() - t0;
  return {
    ...data,
    AMT_INCOME_TOTAL: applicantPayload.AMT_INCOME_TOTAL,
    AMT_CREDIT: applicantPayload.AMT_CREDIT,
    DAYS_BIRTH: applicantPayload.DAYS_BIRTH,
    latency_ms: latency
  };
}

/**
 * Invokes real prediction endpoint for Insurance Charges Predictor.
 */
export async function scoreInsuranceIndividual(individualPayload) {
  const config = WORKLOAD_DEFINITIONS[WORKLOAD_IDS.INSURANCE];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HOSTED_TIMEOUT_MS);

  const t0 = Date.now();
  const response = await fetch(`${config.primaryUrl}${config.predictEndpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(individualPayload),
    signal: controller.signal
  });

  clearTimeout(timeoutId);
  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Insurance /predict failed with HTTP ${response.status}: ${errText}`);
    err.statusCode = response.status >= 500 ? 503 : response.status;
    throw err;
  }

  const data = await response.json();
  const latency = Date.now() - t0;
  return {
    predicted_charge: Number(Number(data.predicted_charge).toFixed(2)),
    age: individualPayload.age,
    bmi: individualPayload.bmi,
    children: individualPayload.children,
    latency_ms: latency
  };
}

/**
 * Invokes real prediction endpoint for Customer Churn Prediction.
 */
export async function scoreChurnCustomer(customerPayload) {
  const config = WORKLOAD_DEFINITIONS[WORKLOAD_IDS.CHURN];
  const apiKey = process.env[config.apiKeyEnv];
  if (!apiKey) {
    const err = new Error(`Cannot score customer churn: Environment variable '${config.apiKeyEnv}' is not configured.`);
    err.statusCode = 400;
    err.code = 'CONFIGURATION_REQUIRED';
    throw err;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HOSTED_TIMEOUT_MS);

  const t0 = Date.now();
  const response = await fetch(`${config.primaryUrl}${config.predictEndpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      [config.authHeader]: apiKey
    },
    body: JSON.stringify(customerPayload),
    signal: controller.signal
  });

  clearTimeout(timeoutId);
  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Churn /predict failed with HTTP ${response.status}: ${errText}`);
    err.statusCode = response.status >= 500 ? 503 : response.status;
    throw err;
  }

  const data = await response.json();
  const latency = Date.now() - t0;
  return {
    ...data,
    MonthlyCharges: customerPayload.MonthlyCharges,
    TotalCharges: customerPayload.TotalCharges,
    Tenure: customerPayload.Tenure,
    latency_ms: latency
  };
}

/**
 * Generates synthetic walkthrough test inputs for a workload.
 */
export function generateWorkloadSyntheticInputs(workloadId, { scenario = 'BASELINE', count = 25 } = {}) {
  const safeCount = Math.max(5, Math.min(Number(count) || 25, 50));
  const inputs = [];

  if (workloadId === WORKLOAD_IDS.FRAUD) {
    const baseTime = Date.now();
    for (let i = 0; i < safeCount; i++) {
      const isAnomalous = scenario === 'DRIFTED' || (scenario === 'MIXED' && i % 3 === 0);
      // For anomalous drift traffic, simulate a velocity burst attack on few users;
      // For healthy baseline walkthrough traffic, distribute across distinct user accounts so internal velocity heuristics do not artificially trip.
      const userId = isAnomalous
        ? `SYNTH_BURST_U${1000 + (i % 3)}`
        : `SYNTH_U${100000 + (Math.floor(Date.now() / 60000) % 50000) + i * 13}`;
      const timestamp = new Date(baseTime - (safeCount - i) * 60000).toISOString();

      if (isAnomalous) {
        inputs.push({
          user_id: userId,
          amount: Number((1500 + Math.random() * 8500).toFixed(2)),
          timestamp,
          channel: 'CARD_NOT_PRESENT',
          country: ['NG', 'RO', 'RU', 'BR'][i % 4],
          merchant_id: `SYNTH_M${9000 + (i % 10)}`,
          device_id: `SYNTH_D${9000 + i}`,
          isSyntheticWalkthroughTraffic: true
        });
      } else {
        inputs.push({
          user_id: userId,
          amount: Number((15 + Math.random() * 45).toFixed(2)),
          timestamp,
          channel: ['POS_SWIPE', 'MOBILE_APP', 'UPI_WALLET'][i % 3],
          country: 'US',
          merchant_id: `SYNTH_M${1000 + (i % 5)}`,
          device_id: `SYNTH_D${1000 + (i % 8)}`,
          isSyntheticWalkthroughTraffic: true
        });
      }
    }
  } else if (workloadId === WORKLOAD_IDS.CREDIT_RISK) {
    for (let i = 0; i < safeCount; i++) {
      const isAnomalous = scenario === 'DRIFTED' || (scenario === 'MIXED' && i % 3 === 0);
      if (isAnomalous) {
        // Genuinely shifted population distribution for DRIFTED scenarios
        inputs.push({
          AMT_INCOME_TOTAL: Math.round(35000 + Math.random() * 45000),
          AMT_CREDIT: Math.round(650000 + Math.random() * 250000),
          DAYS_BIRTH: -Math.round(8000 + Math.random() * 2500),
          AMT_ANNUITY: Math.round(45000 + Math.random() * 15000),
          DAYS_EMPLOYED: -Math.round(200 + Math.random() * 500),
          EXT_SOURCE_1: Number((0.15 + Math.random() * 0.15).toFixed(2)),
          EXT_SOURCE_2: Number((0.15 + Math.random() * 0.15).toFixed(2)),
          EXT_SOURCE_3: Number((0.15 + Math.random() * 0.15).toFixed(2)),
          isSyntheticWalkthroughTraffic: true
        });
      } else {
        // Baseline applicant distribution aligned to reference_credit_risk.csv
        const normApprox = (Math.random() + Math.random() + Math.random() - 1.5);
        const daysBirth = Math.max(-16460, Math.min(-12080, Math.round(-13980 + normApprox * 1800)));
        const income = Math.max(205000, Math.min(285000, Math.round(242500 + normApprox * 25000)));
        const credit = Math.max(335000, Math.min(440000, Math.round(400000 + normApprox * 35000)));
        inputs.push({
          AMT_INCOME_TOTAL: income,
          AMT_CREDIT: credit,
          DAYS_BIRTH: daysBirth,
          AMT_ANNUITY: Math.round(22000 + Math.random() * 8000),
          DAYS_EMPLOYED: -Math.round(2500 + Math.random() * 3000),
          EXT_SOURCE_1: Number((0.78 + Math.random() * 0.12).toFixed(2)),
          EXT_SOURCE_2: Number((0.78 + Math.random() * 0.12).toFixed(2)),
          EXT_SOURCE_3: Number((0.78 + Math.random() * 0.12).toFixed(2)),
          isSyntheticWalkthroughTraffic: true
        });
      }
    }
  } else if (workloadId === WORKLOAD_IDS.INSURANCE) {
    const regions = ['northeast', 'northwest', 'southeast', 'southwest'];
    for (let i = 0; i < safeCount; i++) {
      inputs.push({
        age: 24 + Math.floor(Math.random() * 30),
        sex: i % 2 === 0 ? 'male' : 'female',
        bmi: Number((23.0 + Math.random() * 6.5).toFixed(1)),
        children: Math.floor(Math.random() * 3),
        smoker: 'no',
        region: regions[i % 4],
        isSyntheticWalkthroughTraffic: true
      });
    }
  } else if (workloadId === WORKLOAD_IDS.CHURN) {
    for (let i = 0; i < safeCount; i++) {
      inputs.push({
        CustomerID: `SYNTH_CHURN_${1000 + i}`,
        Gender: i % 2 === 0 ? 'Male' : 'Female',
        SeniorCitizen: 0,
        Partner: 'Yes',
        Dependents: 'No',
        Tenure: 12 + Math.floor(Math.random() * 36),
        PhoneService: 'Yes',
        MultipleLines: 'No',
        InternetService: 'DSL',
        OnlineSecurity: 'Yes',
        OnlineBackup: 'Yes',
        DeviceProtection: 'No',
        TechSupport: 'Yes',
        StreamingTV: 'No',
        StreamingMovies: 'No',
        Contract: 'One year',
        PaperlessBilling: 'No',
        PaymentMethod: 'Credit card (automatic)',
        MonthlyCharges: Number((45 + Math.random() * 35).toFixed(2)),
        TotalCharges: Number((600 + Math.random() * 1200).toFixed(2)),
        isSyntheticWalkthroughTraffic: true
      });
    }
  }

  return inputs;
}

/**
 * Scores a batch of transactions/inputs against the real prediction service of the given workload.
 */
export async function scoreWorkloadBatch(workloadId, inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('Inputs batch must be a non-empty array');
  }

  const scoredRecords = [];

  for (const item of inputs) {
    if (workloadId === WORKLOAD_IDS.FRAUD) {
      const scored = await scoreFraudTransaction(item);
      scoredRecords.push({
        transaction_id: scored.transaction_id,
        fraud_risk_score: scored.fraud_risk_score,
        decision: scored.decision,
        ml_supervised_score: scored.ml_supervised_score,
        ml_anomaly_score: scored.ml_anomaly_score,
        rule_heuristic_score: scored.rule_heuristic_score,
        latency_ms: scored.latency_ms
      });
    } else if (workloadId === WORKLOAD_IDS.CREDIT_RISK) {
      const scored = await scoreCreditRiskApplicant(item);
      scoredRecords.push({
        probability_of_default: scored.probability_of_default,
        decision: scored.decision,
        threshold: scored.threshold,
        model: scored.model,
        AMT_INCOME_TOTAL: scored.AMT_INCOME_TOTAL,
        AMT_CREDIT: scored.AMT_CREDIT,
        DAYS_BIRTH: scored.DAYS_BIRTH,
        latency_ms: scored.latency_ms
      });
    } else if (workloadId === WORKLOAD_IDS.INSURANCE) {
      const scored = await scoreInsuranceIndividual(item);
      scoredRecords.push({
        predicted_charge: scored.predicted_charge,
        age: scored.age,
        bmi: scored.bmi,
        children: scored.children,
        latency_ms: scored.latency_ms
      });
    } else if (workloadId === WORKLOAD_IDS.CHURN) {
      const scored = await scoreChurnCustomer(item);
      scoredRecords.push({
        ...scored,
        latency_ms: scored.latency_ms
      });
    } else {
      throw new Error(`Unsupported workload ID: ${workloadId}`);
    }
  }

  return scoredRecords;
}

/**
 * Finds existing governed Model and ModelVersion for each workload in Sentinel Govern.
 * Does NOT automatically seed or create demo records in the database.
 */
export async function findGovernedWorkloadModels() {
  const mappings = {};

  for (const [key, def] of Object.entries(WORKLOAD_DEFINITIONS)) {
    const model = await Model.findOne({
      $or: [
        { name: def.name },
        ...(def.id === WORKLOAD_IDS.FRAUD ? [{ name: /Fraud/i }] : []),
        ...(def.id === WORKLOAD_IDS.CREDIT_RISK ? [{ name: /Credit/i }] : []),
        ...(def.id === WORKLOAD_IDS.INSURANCE ? [{ name: /Insurance/i }] : []),
        ...(def.id === WORKLOAD_IDS.CHURN ? [{ name: /Churn/i }] : [])
      ]
    });

    if (!model) {
      mappings[def.id] = null;
      continue;
    }

    let version = null;
    if (model.currentProductionVersionId) {
      version = await ModelVersion.findById(model.currentProductionVersionId);
    }
    if (!version) {
      version = await ModelVersion.findOne({ modelId: model._id, lifecycleStatus: 'IN_PRODUCTION' });
    }
    if (!version) {
      version = await ModelVersion.findOne({ modelId: model._id }).sort({ createdAt: -1 });
    }

    if (!version) {
      mappings[def.id] = {
        modelId: model._id,
        model,
        versionId: null,
        version: null
      };
      continue;
    }

    mappings[def.id] = {
      modelId: model._id,
      model,
      versionId: version._id,
      version
    };
  }

  return mappings;
}

// Backward-compatible alias that adheres strictly to no auto-seeding
export const ensureGovernedWorkloadModels = findGovernedWorkloadModels;
