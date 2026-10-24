import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { Incident } from '../src/models/Incident.js';
import { Report } from '../src/models/Report.js';
import * as telemetryCtrl from '../src/controllers/telemetryController.js';

function createMockReqRes({ params = {}, query = {}, body = {}, user = null }) {
  const req = {
    params,
    query,
    body,
    user,
    ip: '127.0.0.1'
  };

  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    }
  };

  return { req, res };
}

// Helpers to stub Mongoose query chains
function mockQueryChain(resultData) {
  const chain = {
    populate: () => chain,
    sort: () => chain,
    limit: () => chain,
    then: (resolve) => resolve(resultData)
  };
  return chain;
}

test('Monitoring Model Selection: Prioritizes explicit params.modelId over query.workloadId', async () => {
  const creditModelId = new mongoose.Types.ObjectId();
  const fraudModelId = new mongoose.Types.ObjectId();

  const creditModel = {
    _id: creditModelId,
    name: 'Credit Risk Scoring & Default Assessment',
    purpose: 'Consumer lending creditworthiness assessment',
    riskLevel: 'HIGH',
    lifecycleStatus: 'IN_PRODUCTION',
    currentProductionVersionId: {
      _id: new mongoose.Types.ObjectId(),
      version: 'v1.0',
      lifecycleStatus: 'IN_PRODUCTION',
      deploymentStatus: 'IN_PRODUCTION'
    }
  };

  let capturedQueryFilter = null;
  const origFindById = Model.findById;
  const origTelemetryFind = Telemetry.find;
  const origIncidentFind = Incident.find;
  const origReportFind = Report.find;

  Model.findById = (id) => ({
    populate: () => Promise.resolve(String(id) === String(creditModelId) ? creditModel : null)
  });

  Telemetry.find = (filter) => {
    capturedQueryFilter = filter;
    return mockQueryChain([]);
  };
  Incident.find = () => mockQueryChain([]);
  Report.find = () => mockQueryChain([]);

  try {
    const { req, res } = createMockReqRes({
      params: { modelId: String(creditModelId) },
      query: { workloadId: 'fraud-detection' }
    });

    await telemetryCtrl.getMonitoringOverview(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.model._id.toString(), creditModelId.toString());
    assert.strictEqual(res.data.data.model.name, 'Credit Risk Scoring & Default Assessment');
    assert.strictEqual(res.data.data.workloadId, 'credit-risk');
    // Ensure queryFilter was strictly scoped to the modelId, not polluted by workloadId
    assert.deepStrictEqual(capturedQueryFilter, { modelId: creditModelId });
  } finally {
    Model.findById = origFindById;
    Telemetry.find = origTelemetryFind;
    Incident.find = origIncidentFind;
    Report.find = origReportFind;
  }
});

test('Monitoring Model Selection: Prioritizes explicit query.modelId over query.workloadId', async () => {
  const insuranceModelId = new mongoose.Types.ObjectId();

  const insuranceModel = {
    _id: insuranceModelId,
    name: 'Medical & Insurance Charges Predictor',
    purpose: 'Underwriting health insurance premium calculation',
    riskLevel: 'LIMITED',
    lifecycleStatus: 'IN_PRODUCTION',
    currentProductionVersionId: {
      _id: new mongoose.Types.ObjectId(),
      version: 'v1.0',
      lifecycleStatus: 'IN_PRODUCTION',
      deploymentStatus: 'IN_PRODUCTION'
    }
  };

  const origFindById = Model.findById;
  const origTelemetryFind = Telemetry.find;
  const origIncidentFind = Incident.find;
  const origReportFind = Report.find;

  Model.findById = (id) => ({
    populate: () => Promise.resolve(String(id) === String(insuranceModelId) ? insuranceModel : null)
  });

  Telemetry.find = () => mockQueryChain([]);
  Incident.find = () => mockQueryChain([]);
  Report.find = () => mockQueryChain([]);

  try {
    const { req, res } = createMockReqRes({
      params: {},
      query: { modelId: String(insuranceModelId), workloadId: 'fraud-detection' }
    });

    await telemetryCtrl.getMonitoringOverview(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.model._id.toString(), insuranceModelId.toString());
    assert.strictEqual(res.data.data.model.name, 'Medical & Insurance Charges Predictor');
    assert.strictEqual(res.data.data.workloadId, 'insurance-charges');
  } finally {
    Model.findById = origFindById;
    Telemetry.find = origTelemetryFind;
    Incident.find = origIncidentFind;
    Report.find = origReportFind;
  }
});

test('Monitoring Model Selection: Returns 404 when requested modelId does not exist', async () => {
  const missingModelId = new mongoose.Types.ObjectId();

  const origFindById = Model.findById;
  Model.findById = () => ({
    populate: () => Promise.resolve(null)
  });

  try {
    const { req, res } = createMockReqRes({
      params: { modelId: String(missingModelId) }
    });

    await telemetryCtrl.getMonitoringOverview(req, res);

    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.error, 'Model not found');
  } finally {
    Model.findById = origFindById;
  }
});

test('Monitoring Model Selection: Falls back to workloadId when modelId is absent', async () => {
  const creditModelId = new mongoose.Types.ObjectId();
  const creditVersion = {
    _id: new mongoose.Types.ObjectId(),
    version: 'v1.0',
    lifecycleStatus: 'IN_PRODUCTION',
    deploymentStatus: 'IN_PRODUCTION'
  };
  const creditModel = {
    _id: creditModelId,
    name: 'Credit Risk Scoring & Default Assessment',
    purpose: 'Consumer lending creditworthiness assessment',
    riskLevel: 'HIGH',
    lifecycleStatus: 'IN_PRODUCTION',
    currentProductionVersionId: creditVersion
  };

  let capturedQueryFilter = null;
  const origFindById = Model.findById;
  const origFindOne = Model.findOne;
  const origModelVersionFindById = ModelVersion.findById;
  const origModelVersionFindOne = ModelVersion.findOne;
  const origTelemetryFind = Telemetry.find;
  const origIncidentFind = Incident.find;
  const origReportFind = Report.find;

  Model.findOne = (query) => {
    // Return credit model when searched by workload definition name
    if (query.$or) {
      return Promise.resolve(creditModel);
    }
    return { populate: () => Promise.resolve(creditModel) };
  };

  Model.findById = (id) => ({
    populate: () => Promise.resolve(String(id) === String(creditModelId) ? creditModel : null)
  });

  ModelVersion.findById = () => Promise.resolve(creditVersion);
  ModelVersion.findOne = () => mockQueryChain(creditVersion);

  Telemetry.find = (filter) => {
    capturedQueryFilter = filter;
    return mockQueryChain([]);
  };
  Incident.find = () => mockQueryChain([]);
  Report.find = () => mockQueryChain([]);

  try {
    const { req, res } = createMockReqRes({
      params: {},
      query: { workloadId: 'credit-risk' }
    });

    await telemetryCtrl.getMonitoringOverview(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.model._id.toString(), creditModelId.toString());
    assert.strictEqual(res.data.data.workloadId, 'credit-risk');
    // In fallback mode without modelId, queryFilter permits matching by workloadId
    assert.deepStrictEqual(capturedQueryFilter, { $or: [{ workloadId: 'credit-risk' }, { modelId: creditModelId }] });
  } finally {
    Model.findById = origFindById;
    Model.findOne = origFindOne;
    ModelVersion.findById = origModelVersionFindById;
    ModelVersion.findOne = origModelVersionFindOne;
    Telemetry.find = origTelemetryFind;
    Incident.find = origIncidentFind;
    Report.find = origReportFind;
  }
});

test('Monitoring Model Selection: Falls back to production model when both modelId and workloadId are absent', async () => {
  const prodModelId = new mongoose.Types.ObjectId();
  const prodModel = {
    _id: prodModelId,
    name: 'Real-Time Fraud Detection & Anomaly Intelligence Platform',
    purpose: 'Fraud transaction classification',
    riskLevel: 'HIGH',
    lifecycleStatus: 'IN_PRODUCTION',
    currentProductionVersionId: {
      _id: new mongoose.Types.ObjectId(),
      version: 'v2.0',
      lifecycleStatus: 'IN_PRODUCTION',
      deploymentStatus: 'IN_PRODUCTION'
    }
  };

  const origFindById = Model.findById;
  const origFindOne = Model.findOne;
  const origTelemetryFind = Telemetry.find;
  const origIncidentFind = Incident.find;
  const origReportFind = Report.find;

  Model.findOne = (query) => {
    if (query && query.lifecycleStatus === 'IN_PRODUCTION') {
      return { populate: () => Promise.resolve(prodModel) };
    }
    return { populate: () => Promise.resolve(null), sort: () => ({ populate: () => Promise.resolve(prodModel) }) };
  };

  Telemetry.find = () => mockQueryChain([]);
  Incident.find = () => mockQueryChain([]);
  Report.find = () => mockQueryChain([]);

  try {
    const { req, res } = createMockReqRes({
      params: {},
      query: {}
    });

    await telemetryCtrl.getMonitoringOverview(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.model._id.toString(), prodModelId.toString());
    assert.strictEqual(res.data.data.workloadId, 'fraud-detection');
  } finally {
    Model.findById = origFindById;
    Model.findOne = origFindOne;
    Telemetry.find = origTelemetryFind;
    Incident.find = origIncidentFind;
    Report.find = origReportFind;
  }
});

test('Monitoring Model Selection: Returns clean NO_DATA when no models exist in database', async () => {
  const origFindById = Model.findById;
  const origFindOne = Model.findOne;

  Model.findById = () => ({ populate: () => Promise.resolve(null) });
  Model.findOne = () => ({
    populate: () => Promise.resolve(null),
    sort: () => ({ populate: () => Promise.resolve(null) })
  });

  try {
    const { req, res } = createMockReqRes({
      params: {},
      query: {}
    });

    await telemetryCtrl.getMonitoringOverview(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.model, null);
    assert.strictEqual(res.data.data.signalStatus, 'NO_DATA');
  } finally {
    Model.findById = origFindById;
    Model.findOne = origFindOne;
  }
});

test('Monitoring Model Selection: Unmonitored model returns NO_DATA without leaking other workload telemetry even if workloadId passed in query', async () => {
  const unmonitoredId = new mongoose.Types.ObjectId();
  const unmonitoredModel = {
    _id: unmonitoredId,
    name: 'Customer Churn Retention Intelligence',
    purpose: 'Customer churn prediction',
    riskLevel: 'LIMITED',
    lifecycleStatus: 'DRAFT',
    currentProductionVersionId: null
  };

  let capturedQueryFilter = null;
  const origFindById = Model.findById;
  const origFindOne = Model.findOne;
  const origModelVersionFindOne = ModelVersion.findOne;
  const origTelemetryFind = Telemetry.find;
  const origIncidentFind = Incident.find;
  const origReportFind = Report.find;

  Model.findById = (id) => ({
    populate: () => Promise.resolve(String(id) === String(unmonitoredId) ? unmonitoredModel : null)
  });
  ModelVersion.findOne = () => ({
    sort: () => Promise.resolve({ _id: new mongoose.Types.ObjectId(), version: 'v1.0' })
  });

  Telemetry.find = (filter) => {
    capturedQueryFilter = filter;
    return mockQueryChain([]);
  };
  Incident.find = () => mockQueryChain([]);
  Report.find = () => mockQueryChain([]);

  try {
    const { req, res } = createMockReqRes({
      params: { modelId: String(unmonitoredId) },
      query: { workloadId: 'fraud-detection' }
    });

    await telemetryCtrl.getMonitoringOverview(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.model._id.toString(), unmonitoredId.toString());
    assert.strictEqual(res.data.data.signalStatus, 'NO_DATA');
    assert.strictEqual(res.data.data.recentTrend.length, 0);
    assert.strictEqual(res.data.data.telemetryHistory.length, 0);
    assert.deepStrictEqual(capturedQueryFilter, { modelId: unmonitoredId });
  } finally {
    Model.findById = origFindById;
    Model.findOne = origFindOne;
    ModelVersion.findOne = origModelVersionFindOne;
    Telemetry.find = origTelemetryFind;
    Incident.find = origIncidentFind;
    Report.find = origReportFind;
  }
});
