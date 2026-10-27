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

import mongoose from 'mongoose';
import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Policy } from '../models/Policy.js';
import { executeModelInference, checkModelEndpointHealth } from './inferenceService.js';

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
  if (typeof workloadId === 'string' && mongoose.Types.ObjectId.isValid(workloadId)) {
    return await checkModelEndpointHealth(workloadId);
  }

  // If a governed model exists for this workload with an active endpointUrl, probe its endpoint dynamically
  try {
    const modelsMap = await findGovernedWorkloadModels();
    const binding = modelsMap?.[workloadId];
    if (binding?.model?.apiConfig?.endpointUrl?.trim()) {
      const probeRes = await checkModelEndpointHealth(binding.modelId);
      return {
        ...probeRes,
        workloadId,
        name: binding.model.name,
        hasReferenceData: Boolean(binding.version?.referenceDataset?.filename || binding.version?.referenceDataset?.storagePath)
      };
    }
  } catch {
    // Fall back to definition check
  }

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
 * Checks health for active workloads.
 * For the interview walkthrough, only the local fraud-detection AI service is active.
 * Other workloads (credit-risk, insurance, churn) are preserved in WORKLOAD_DEFINITIONS for future use
 * but reported as INACTIVE / DEFERRED for this walkthrough.
 */
export async function checkAllWorkloadsHealth() {
  const fraud = await checkWorkloadHealth(WORKLOAD_IDS.FRAUD);
  const creditRisk = await checkWorkloadHealth(WORKLOAD_IDS.CREDIT_RISK);
  const insurance = await checkWorkloadHealth(WORKLOAD_IDS.INSURANCE);
  const churn = await checkWorkloadHealth(WORKLOAD_IDS.CHURN);

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
    sex: individualPayload.sex,
    smoker: individualPayload.smoker,
    region: individualPayload.region,
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
export function generateWorkloadSyntheticInputs(workloadId, { scenario = 'BASELINE', count = 25, referenceRecords = null } = {}) {
  const safeCount = Math.max(5, Math.min(Number(count) || 25, 50));
  const inputs = [];

  if (Array.isArray(referenceRecords) && referenceRecords.length > 0) {
    for (let i = 0; i < safeCount; i++) {
      const base = referenceRecords[i % referenceRecords.length];
      const isAnomalous = scenario === 'DRIFTED' || (scenario === 'MIXED' && i % 3 === 0);
      const record = { ...base };
      delete record.predicted;
      delete record.probability;
      delete record.decision;
      delete record.prediction;
      delete record.predicted_charge;
      delete record.target;
      delete record._id;

      if (isAnomalous) {
        for (const [k, v] of Object.entries(record)) {
          if (typeof v === 'number') {
            if (/income/i.test(k)) record[k] = Math.round(v * 0.35);
            else if (/credit|debt/i.test(k)) record[k] = Math.round(v * 2.2);
            else if (/birth/i.test(k)) record[k] = typeof v === 'number' && v < 0 ? Math.round(v * 0.55) : -8000;
            else if (/age/i.test(k)) record[k] = typeof v === 'number' ? Math.round(v * 0.6) : 22;
            else if (/charge|amount/i.test(k)) record[k] = Number((v * 2.5).toFixed(2));
            else if (/ext_source/i.test(k)) record[k] = Number(Math.max(0.05, v * 0.3).toFixed(2));
            else record[k] = Math.round(v * 1.8);
          }
        }
      } else {
        const jitter = 1 + (Math.random() * 0.04 - 0.02);
        for (const [k, v] of Object.entries(record)) {
          if (typeof v === 'number') {
            record[k] = Number.isInteger(v) ? Math.round(v * jitter) : Number((v * jitter).toFixed(4));
          }
        }
      }
      record.isSyntheticWalkthroughTraffic = true;
      inputs.push(record);
    }
    return inputs;
  }

  if (workloadId === WORKLOAD_IDS.FRAUD) {
    const baseTime = Date.now();
    for (let i = 0; i < safeCount; i++) {
      // In DRIFTED or controlled shift: target ~40% drifted anomalous observations, ~60% healthy
      const isAnomalous = scenario === 'DRIFTED' 
        ? (i % 5 === 0 || i % 5 === 2) // ~40% rate (2 out of 5)
        : (scenario === 'MIXED' ? (i % 4 === 0) : false);

      const userId = isAnomalous
        ? `SYNTH_BURST_U${1000 + (i % 2)}` // velocity concentration on 2 users
        : `SYNTH_U${100000 + (Math.floor(Date.now() / 60000) % 50000) + i * 17}`;
      const timestamp = new Date(baseTime - (safeCount - i) * 60000).toISOString();

      if (isAnomalous) {
        // Controlled feature shift specifically on amount ($1200 - $3500) and card_not_present channel
        inputs.push({
          user_id: userId,
          amount: Number((1200 + Math.random() * 2300).toFixed(2)),
          timestamp,
          channel: 'CARD_NOT_PRESENT',
          country: ['IN', 'US', 'GB'][i % 3],
          merchant_id: `SYNTH_M${9000 + (i % 4)}`,
          device_id: `SYNTH_D${9000 + (i % 3)}`,
          isSyntheticWalkthroughTraffic: true
        });
      } else {
        // Healthy baseline observations: amounts $25-$85, standard channels POS / UPI / Mobile
        inputs.push({
          user_id: userId,
          amount: Number((25 + Math.random() * 60).toFixed(2)),
          timestamp,
          channel: ['POS_SWIPE', 'MOBILE_APP', 'UPI_WALLET'][i % 3],
          country: 'IN',
          merchant_id: `SYNTH_M${1000 + (i % 5)}`,
          device_id: `SYNTH_D${1000 + (i % 8)}`,
          isSyntheticWalkthroughTraffic: true
        });
      }
    }
  } else if (workloadId === WORKLOAD_IDS.CREDIT_RISK) {
    const CREDIT_LENS_REFERENCE_PROFILES = [
      { amt_income: 162000, amt_credit: 640000, amt_annuity: 31500, age: 36, gender: 'Female', emp_years: 3.5, region_rating: 2, cnt_children: 1, ext_source_1: 0.42, ext_source_2: 0.48, ext_source_3: 0.43, bureau_active: 2, bureau_dpd: 0, bureau_debt: 165000, prev_approval: 0.58, prev_refused: 1, prev_count: 4 },
      { amt_income: 120000, amt_credit: 420000, amt_annuity: 22000, age: 29, gender: 'Male', emp_years: 2.0, region_rating: 3, cnt_children: 0, ext_source_1: 0.61, ext_source_2: 0.57, ext_source_3: 0.52, bureau_active: 1, bureau_dpd: 1, bureau_debt: 85000, prev_approval: 0.72, prev_refused: 0, prev_count: 3 },
      { amt_income: 210000, amt_credit: 780000, amt_annuity: 39000, age: 45, gender: 'Male', emp_years: 8.0, region_rating: 1, cnt_children: 2, ext_source_1: 0.75, ext_source_2: 0.69, ext_source_3: 0.64, bureau_active: 3, bureau_dpd: 0, bureau_debt: 120000, prev_approval: 0.81, prev_refused: 0, prev_count: 5 },
      { amt_income: 90000, amt_credit: 300000, amt_annuity: 18000, age: 24, gender: 'Female', emp_years: 1.0, region_rating: 3, cnt_children: 0, ext_source_1: 0.28, ext_source_2: 0.34, ext_source_3: 0.31, bureau_active: 0, bureau_dpd: 4, bureau_debt: 45000, prev_approval: 0.35, prev_refused: 2, prev_count: 2 },
      { amt_income: 175000, amt_credit: 550000, amt_annuity: 28000, age: 38, gender: 'Female', emp_years: 6.0, region_rating: 2, cnt_children: 1, ext_source_1: 0.54, ext_source_2: 0.62, ext_source_3: 0.59, bureau_active: 2, bureau_dpd: 0, bureau_debt: 100000, prev_approval: 0.67, prev_refused: 1, prev_count: 4 },
      { amt_income: 80000, amt_credit: 260000, amt_annuity: 16000, age: 31, gender: 'Male', emp_years: 4.0, region_rating: 2, cnt_children: 2, ext_source_1: 0.19, ext_source_2: 0.27, ext_source_3: 0.22, bureau_active: 1, bureau_dpd: 5, bureau_debt: 65000, prev_approval: 0.42, prev_refused: 2, prev_count: 3 },
      { amt_income: 260000, amt_credit: 950000, amt_annuity: 48000, age: 52, gender: 'Male', emp_years: 12.0, region_rating: 1, cnt_children: 0, ext_source_1: 0.88, ext_source_2: 0.83, ext_source_3: 0.79, bureau_active: 4, bureau_dpd: 0, bureau_debt: 140000, prev_approval: 0.91, prev_refused: 0, prev_count: 6 },
      { amt_income: 135000, amt_credit: 470000, amt_annuity: 24000, age: 33, gender: 'Female', emp_years: 5.0, region_rating: 2, cnt_children: 1, ext_source_1: 0.47, ext_source_2: 0.51, ext_source_3: 0.45, bureau_active: 2, bureau_dpd: 1, bureau_debt: 90000, prev_approval: 0.60, prev_refused: 1, prev_count: 4 },
      { amt_income: 105000, amt_credit: 350000, amt_annuity: 20000, age: 27, gender: 'Male', emp_years: 2.5, region_rating: 3, cnt_children: 0, ext_source_1: 0.22, ext_source_2: 0.29, ext_source_3: 0.25, bureau_active: 0, bureau_dpd: 3, bureau_debt: 55000, prev_approval: 0.38, prev_refused: 2, prev_count: 2 },
      { amt_income: 195000, amt_credit: 690000, amt_annuity: 34000, age: 41, gender: 'Male', emp_years: 9.0, region_rating: 2, cnt_children: 2, ext_source_1: 0.69, ext_source_2: 0.73, ext_source_3: 0.67, bureau_active: 3, bureau_dpd: 0, bureau_debt: 110000, prev_approval: 0.76, prev_refused: 0, prev_count: 5 },
      { amt_income: 145000, amt_credit: 510000, amt_annuity: 26000, age: 35, gender: 'Female', emp_years: 7.0, region_rating: 1, cnt_children: 1, ext_source_1: 0.39, ext_source_2: 0.44, ext_source_3: 0.41, bureau_active: 1, bureau_dpd: 2, bureau_debt: 95000, prev_approval: 0.53, prev_refused: 1, prev_count: 3 },
      { amt_income: 115000, amt_credit: 380000, amt_annuity: 21000, age: 30, gender: 'Female', emp_years: 3.0, region_rating: 3, cnt_children: 0, ext_source_1: 0.31, ext_source_2: 0.37, ext_source_3: 0.33, bureau_active: 1, bureau_dpd: 4, bureau_debt: 70000, prev_approval: 0.46, prev_refused: 2, prev_count: 3 }
    ];

    for (let i = 0; i < safeCount; i++) {
      const base = CREDIT_LENS_REFERENCE_PROFILES[i % CREDIT_LENS_REFERENCE_PROFILES.length];
      const isAnomalous = scenario === 'DRIFTED' || (scenario === 'MIXED' && i % 3 === 0);

      if (isAnomalous) {
        // Genuinely shifted population distribution (economic shock / severe risk scenario)
        const income = Math.round(base.amt_income * 0.45);
        const credit = Math.round(base.amt_credit * 1.6);
        const annuity = Math.round(base.amt_annuity * 1.45);
        const bureauDebt = Math.round(base.bureau_debt * 1.8);
        const ext1 = Number(Math.max(0.05, base.ext_source_1 * 0.35).toFixed(2));
        const ext2 = Number(Math.max(0.05, base.ext_source_2 * 0.35).toFixed(2));
        const ext3 = Number(Math.max(0.05, base.ext_source_3 * 0.35).toFixed(2));
        const dpd = base.bureau_dpd + 6;
        const daysBirth = -Math.round(base.age * 365.25);

        inputs.push({
          amt_income: income,
          amt_credit: credit,
          amt_annuity: annuity,
          age: base.age,
          gender: base.gender,
          emp_years: Math.max(0.5, Number((base.emp_years * 0.5).toFixed(1))),
          region_rating: 3,
          cnt_children: base.cnt_children,
          ext_source_1: ext1,
          ext_source_2: ext2,
          ext_source_3: ext3,
          bureau_active: Math.max(0, base.bureau_active - 1),
          bureau_dpd: dpd,
          bureau_debt: bureauDebt,
          prev_approval: Number(Math.max(0.1, base.prev_approval * 0.35).toFixed(2)),
          prev_refused: base.prev_refused + 2,
          prev_count: base.prev_count + 1,
          // Legacy Kaggle aliases for backward compatibility
          AMT_INCOME_TOTAL: income,
          AMT_CREDIT: credit,
          DAYS_BIRTH: daysBirth,
          AMT_ANNUITY: annuity,
          DAYS_EMPLOYED: -Math.round(base.emp_years * 365.25 * 0.5),
          EXT_SOURCE_1: ext1,
          EXT_SOURCE_2: ext2,
          EXT_SOURCE_3: ext3,
          isSyntheticWalkthroughTraffic: true
        });
      } else {
        // Valid in-distribution baseline matching the reference dataset
        const jitter = 1 + (Math.random() * 0.04 - 0.02);
        const income = Math.round(base.amt_income * jitter);
        const credit = Math.round(base.amt_credit * jitter);
        const annuity = Math.round(base.amt_annuity * jitter);
        const bureauDebt = Math.round(base.bureau_debt * jitter);
        const daysBirth = -Math.round(base.age * 365.25);

        inputs.push({
          amt_income: income,
          amt_credit: credit,
          amt_annuity: annuity,
          age: base.age,
          gender: base.gender,
          emp_years: base.emp_years,
          region_rating: base.region_rating,
          cnt_children: base.cnt_children,
          ext_source_1: base.ext_source_1,
          ext_source_2: base.ext_source_2,
          ext_source_3: base.ext_source_3,
          bureau_active: base.bureau_active,
          bureau_dpd: base.bureau_dpd,
          bureau_debt: bureauDebt,
          prev_approval: base.prev_approval,
          prev_refused: base.prev_refused,
          prev_count: base.prev_count,
          // Legacy Kaggle aliases for backward compatibility
          AMT_INCOME_TOTAL: income,
          AMT_CREDIT: credit,
          DAYS_BIRTH: daysBirth,
          AMT_ANNUITY: annuity,
          DAYS_EMPLOYED: -Math.round(base.emp_years * 365.25),
          EXT_SOURCE_1: base.ext_source_1,
          EXT_SOURCE_2: base.ext_source_2,
          EXT_SOURCE_3: base.ext_source_3,
          isSyntheticWalkthroughTraffic: true
        });
      }
    }
  } else if (workloadId === WORKLOAD_IDS.INSURANCE) {
    const INSURANCE_REFERENCE_PROFILES = [
      { age: 29, bmi: 27.8, children: 1, sex: 'male', smoker: 'no', region: 'northeast', latency_ms: 335.9, predicted_charge: 5767.05 },
      { age: 40, bmi: 23.5, children: 0, sex: 'female', smoker: 'no', region: 'northwest', latency_ms: 239.4, predicted_charge: 5987.54 },
      { age: 43, bmi: 22.9, children: 1, sex: 'male', smoker: 'no', region: 'southeast', latency_ms: 367.3, predicted_charge: 9062.13 },
      { age: 28, bmi: 24.3, children: 2, sex: 'female', smoker: 'no', region: 'southwest', latency_ms: 383.3, predicted_charge: 6581.27 },
      { age: 27, bmi: 23.6, children: 2, sex: 'male', smoker: 'no', region: 'northeast', latency_ms: 338.9, predicted_charge: 6408.44 },
      { age: 41, bmi: 23.2, children: 2, sex: 'female', smoker: 'no', region: 'northwest', latency_ms: 402.6, predicted_charge: 7847.01 },
      { age: 41, bmi: 27.3, children: 0, sex: 'male', smoker: 'no', region: 'southeast', latency_ms: 253.7, predicted_charge: 5818.41 },
      { age: 36, bmi: 30.6, children: 1, sex: 'female', smoker: 'no', region: 'southwest', latency_ms: 412.2, predicted_charge: 6734.90 },
      { age: 38, bmi: 24.5, children: 1, sex: 'male', smoker: 'no', region: 'northeast', latency_ms: 283.5, predicted_charge: 6977.80 },
      { age: 45, bmi: 22.0, children: 1, sex: 'female', smoker: 'no', region: 'northwest', latency_ms: 256.0, predicted_charge: 8802.26 },
      { age: 30, bmi: 27.8, children: 2, sex: 'male', smoker: 'no', region: 'southeast', latency_ms: 308.1, predicted_charge: 6386.98 },
      { age: 27, bmi: 22.6, children: 0, sex: 'female', smoker: 'no', region: 'southwest', latency_ms: 413.6, predicted_charge: 4547.46 },
      { age: 33, bmi: 23.2, children: 2, sex: 'male', smoker: 'no', region: 'northeast', latency_ms: 319.0, predicted_charge: 7944.81 },
      { age: 29, bmi: 27.4, children: 2, sex: 'female', smoker: 'no', region: 'northwest', latency_ms: 273.4, predicted_charge: 6523.87 },
      { age: 48, bmi: 25.8, children: 1, sex: 'male', smoker: 'no', region: 'southeast', latency_ms: 255.3, predicted_charge: 10550.90 },
      { age: 41, bmi: 24.5, children: 2, sex: 'female', smoker: 'no', region: 'southwest', latency_ms: 314.7, predicted_charge: 8110.19 },
      { age: 38, bmi: 26.4, children: 1, sex: 'male', smoker: 'no', region: 'northeast', latency_ms: 220.3, predicted_charge: 6545.79 },
      { age: 45, bmi: 25.2, children: 0, sex: 'female', smoker: 'no', region: 'northwest', latency_ms: 255.0, predicted_charge: 10106.23 },
      { age: 27, bmi: 30.9, children: 1, sex: 'male', smoker: 'no', region: 'southeast', latency_ms: 397.2, predicted_charge: 5117.57 },
      { age: 25, bmi: 24.5, children: 0, sex: 'female', smoker: 'no', region: 'southwest', latency_ms: 386.2, predicted_charge: 4768.84 },
      { age: 44, bmi: 23.9, children: 1, sex: 'male', smoker: 'no', region: 'northeast', latency_ms: 313.6, predicted_charge: 9342.59 },
      { age: 45, bmi: 25.1, children: 2, sex: 'female', smoker: 'no', region: 'northwest', latency_ms: 296.7, predicted_charge: 10471.41 },
      { age: 47, bmi: 25.2, children: 2, sex: 'male', smoker: 'no', region: 'southeast', latency_ms: 322.9, predicted_charge: 11248.80 },
      { age: 25, bmi: 27.7, children: 0, sex: 'female', smoker: 'no', region: 'southwest', latency_ms: 437.4, predicted_charge: 4312.37 },
      { age: 27, bmi: 21.2, children: 0, sex: 'male', smoker: 'no', region: 'northeast', latency_ms: 340.2, predicted_charge: 4120.73 },
      { age: 42, bmi: 27.3, children: 0, sex: 'female', smoker: 'no', region: 'northwest', latency_ms: 365.5, predicted_charge: 6336.58 },
      { age: 49, bmi: 24.8, children: 1, sex: 'male', smoker: 'no', region: 'southeast', latency_ms: 309.9, predicted_charge: 11437.31 },
      { age: 34, bmi: 28.1, children: 1, sex: 'female', smoker: 'no', region: 'southwest', latency_ms: 323.0, predicted_charge: 6644.25 },
      { age: 46, bmi: 26.1, children: 0, sex: 'male', smoker: 'no', region: 'northeast', latency_ms: 352.4, predicted_charge: 9535.20 },
      { age: 50, bmi: 27.5, children: 2, sex: 'female', smoker: 'no', region: 'northwest', latency_ms: 326.3, predicted_charge: 11661.34 }
    ];

    for (let i = 0; i < safeCount; i++) {
      const base = INSURANCE_REFERENCE_PROFILES[i % INSURANCE_REFERENCE_PROFILES.length];
      const isAnomalous = scenario === 'DRIFTED' || (scenario === 'MIXED' && i % 3 === 0);

      if (isAnomalous) {
        // Genuinely shifted population distribution (older demographic, elevated BMI, active smokers)
        const shiftedAge = Math.min(64, base.age + 18);
        const shiftedBmi = Number((base.bmi * 1.4).toFixed(1));
        inputs.push({
          age: shiftedAge,
          sex: base.sex,
          bmi: shiftedBmi,
          children: base.children,
          smoker: 'yes',
          region: base.region,
          isSyntheticWalkthroughTraffic: true
        });
      } else {
        // Valid in-distribution baseline matching the reference dataset
        const jitter = 1 + (Math.random() * 0.04 - 0.02);
        inputs.push({
          age: base.age,
          sex: base.sex,
          bmi: Number((base.bmi * jitter).toFixed(1)),
          children: base.children,
          smoker: base.smoker,
          region: base.region,
          isSyntheticWalkthroughTraffic: true
        });
      }
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
 * Supports direct dynamic model inference via options.modelId or MongoDB ObjectId workloadId.
 */
export async function scoreWorkloadBatch(workloadId, inputs, options = {}) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error('Inputs batch must be a non-empty array');
  }

  // 1. Direct Dynamic Model Inference when a Model ID is provided
  const isDirectModelId = (typeof workloadId === 'string' && mongoose.Types.ObjectId.isValid(workloadId)) || options.modelId;
  const targetModelId = options.modelId || (isDirectModelId ? workloadId : null);

  if (targetModelId) {
    const scoredRecords = [];
    for (const item of inputs) {
      const res = await executeModelInference({
        modelId: targetModelId,
        versionId: options.versionId,
        inputPayload: item,
        options: {
          allowDraft: options.allowDraft ?? false,
          timeoutMs: options.timeoutMs || 25000
        }
      });
      const rawProb = res.rawResponse?.probability_of_default !== undefined 
        ? res.rawResponse.probability_of_default 
        : (res.rawResponse?.probability !== undefined ? res.rawResponse.probability : undefined);

      const applicantObj = (typeof item === 'object' && item !== null && typeof item.applicant === 'object' && item.applicant !== null)
        ? item.applicant
        : {};

      scoredRecords.push({
        ...(typeof item === 'object' && item !== null ? item : {}),
        ...applicantObj,
        ...(typeof res.rawResponse === 'object' && res.rawResponse !== null ? res.rawResponse : {}),
        ...(typeof res.rawResponse?.features === 'object' && res.rawResponse?.features !== null ? res.rawResponse.features : {}),
        ...(rawProb !== undefined ? { probability_of_default: rawProb, probability: rawProb } : {}),
        prediction: res.prediction,
        decision: res.prediction || res.rawResponse?.decision,
        latency_ms: res.latencyMs
      });
    }
    return scoredRecords;
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
        sex: scored.sex,
        smoker: scored.smoker,
        region: scored.region,
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
 * Resolves the corresponding workload identifier for a governed Model.
 */
export function resolveWorkloadForModel(model) {
  if (!model) return WORKLOAD_IDS.FRAUD;
  const name = model.name || '';
  const purpose = model.purpose || '';
  const description = model.description || '';

  if (/Credit/i.test(name) || /Credit/i.test(purpose) || /Lending/i.test(purpose) || /Credit/i.test(description)) {
    return WORKLOAD_IDS.CREDIT_RISK;
  }
  if (/Insurance/i.test(name) || /Insurance/i.test(purpose) || /Medical/i.test(purpose) || /Insurance/i.test(description)) {
    return WORKLOAD_IDS.INSURANCE;
  }
  if (/Churn/i.test(name) || /Churn/i.test(purpose) || /Retention/i.test(purpose) || /Churn/i.test(description)) {
    return WORKLOAD_IDS.CHURN;
  }
  if (/Fraud/i.test(name) || /Fraud/i.test(purpose) || /Anomaly/i.test(purpose) || /Fraud/i.test(description)) {
    return WORKLOAD_IDS.FRAUD;
  }
  return WORKLOAD_IDS.FRAUD;
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
