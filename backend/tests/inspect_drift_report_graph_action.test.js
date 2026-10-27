import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import { getReportById, getGovernanceReports } from '../src/services/reportService.js';
import { getReports, getReportDetails } from '../src/controllers/reportController.js';
import { getMonitoringOverview } from '../src/controllers/telemetryController.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';
import { Telemetry } from '../src/models/Telemetry.js';
import { Report } from '../src/models/Report.js';
import { Incident } from '../src/models/Incident.js';
import { verifyAuditChainIntegrity } from '../src/services/auditEngine.js';

test('Runtime Drift Graph Inspect Report Resolution & Scoping Suite', async (t) => {
  await mongoose.connect(process.env.MONGODB_URI);

  const model = await Model.findOne({ name: 'CreditLens' });
  assert.ok(model, 'CreditLens model must exist');
  const v1 = await ModelVersion.findOne({ modelId: model._id, version: 'v1.0' });
  const v2 = await ModelVersion.findOne({ modelId: model._id, version: 'v2.0' });
  assert.ok(v1, 'CreditLens v1.0 must exist');
  assert.ok(v2, 'CreditLens v2.0 must exist');

  const driftTelemetry = await Telemetry.findOne({ modelId: model._id, versionId: v2._id, driftStatus: 'DRIFT_DETECTED' });
  assert.ok(driftTelemetry, 'CreditLens v2.0 drift telemetry batch must exist');

  const healthyTelemetry = await Telemetry.findOne({ modelId: model._id, versionId: v2._id, driftStatus: 'HEALTHY' });
  assert.ok(healthyTelemetry, 'CreditLens v2.0 healthy telemetry batch must exist');

  const driftReport = await Report.findOne({ modelId: model._id, versionId: v2._id, reportNumber: 'REP-DRIFT-001' });
  assert.ok(driftReport, 'CreditLens v2.0 drift report REP-DRIFT-001 must exist');

  await t.test('1. getReportById unboxes strings, ObjectIds, and populated Mongoose objects', async () => {
    // 1a. String ObjectId
    const repByStringId = await getReportById(String(driftReport._id));
    assert.ok(repByStringId, 'Must resolve report by string ObjectId');
    assert.equal(repByStringId.reportNumber, 'REP-DRIFT-001');
    assert.equal(repByStringId.telemetryId?.batchId, driftTelemetry.batchId);

    // 1b. ReportNumber string
    const repByNumber = await getReportById('REP-DRIFT-001');
    assert.ok(repByNumber, 'Must resolve report by reportNumber');
    assert.equal(String(repByNumber._id), String(driftReport._id));

    // 1c. Populated subdocument object (what hoveredChartPoint.reportId delivers)
    const mockPopulatedReport = {
      _id: String(driftReport._id),
      reportNumber: 'REP-DRIFT-001',
      title: 'Statistical Distribution Drift Report',
      operationalStatus: 'CRITICAL'
    };
    const repByObj = await getReportById(mockPopulatedReport);
    assert.ok(repByObj, 'Must defensively resolve report when passed an object');
    assert.equal(repByObj.reportNumber, 'REP-DRIFT-001');
    assert.equal(String(repByObj.modelId?._id || repByObj.modelId), String(model._id));
    assert.equal(String(repByObj.versionId?._id || repByObj.versionId), String(v2._id));

    // 1d. Controller endpoint GET /reports/:id
    let controllerData = null;
    let controllerStatus = 200;
    const res = {
      status(code) { controllerStatus = code; return this; },
      json(d) { controllerData = d; return this; }
    };
    await getReportDetails({ params: { id: String(driftReport._id) } }, res);
    assert.equal(controllerStatus, 200);
    assert.equal(controllerData?.success, true);
    assert.equal(controllerData?.data?.reportNumber, 'REP-DRIFT-001');
  });

  await t.test('2. Feature & Statistical Results Integrity in REP-DRIFT-001', async () => {
    const rep = await getReportById(String(driftReport._id));
    assert.ok(rep.driftAnalysis, 'Must contain driftAnalysis payload');

    const { features, driftedColumns } = rep.driftAnalysis;
    assert.ok(Array.isArray(driftedColumns) && driftedColumns.length === 3, 'Must report exactly 3 drifted columns');
    assert.ok(driftedColumns.includes('AMT_INCOME_TOTAL'));
    assert.ok(driftedColumns.includes('AMT_CREDIT'));
    assert.ok(driftedColumns.includes('DAYS_BIRTH'));

    const incomeFeat = features.find(f => f.name === 'AMT_INCOME_TOTAL');
    assert.ok(incomeFeat, 'AMT_INCOME_TOTAL feature must be present in report');
    assert.equal(incomeFeat.driftDetected, true);
    assert.ok(incomeFeat.pValue < 0.05, 'p-value must reject null hypothesis');

    const genderFeat = features.find(f => f.name === 'gender');
    assert.ok(genderFeat, 'gender feature must be present');
    assert.equal(genderFeat.driftDetected, false, 'gender must be stable');
  });

  await t.test('3. Scoped Report Resolution: Drift batch resolves REP-DRIFT-001, healthy batch resolves 0 reports', async () => {
    // 3a. Querying by drift batch ID
    const driftBatchReports = await getGovernanceReports({
      modelId: model._id,
      versionId: v2._id,
      batchId: driftTelemetry.batchId
    });
    assert.equal(driftBatchReports.length, 1, 'Drift batch must resolve exactly 1 linked report');
    assert.equal(driftBatchReports[0].reportNumber, 'REP-DRIFT-001');

    // 3b. Querying by healthy batch ID must NEVER substitute the drift report
    const healthyBatchReports = await getGovernanceReports({
      modelId: model._id,
      versionId: v2._id,
      batchId: healthyTelemetry.batchId
    });
    assert.equal(healthyBatchReports.length, 0, 'Healthy batch must resolve 0 reports (no false linking)');

    // 3c. Querying by telemetryId of drift batch
    const driftTeleReports = await getGovernanceReports({
      modelId: model._id,
      telemetryId: driftTelemetry._id
    });
    assert.equal(driftTeleReports.length, 1);
    assert.equal(driftTeleReports[0].reportNumber, 'REP-DRIFT-001');

    // 3d. Querying by telemetryId of healthy batch
    const healthyTeleReports = await getGovernanceReports({
      modelId: model._id,
      telemetryId: healthyTelemetry._id
    });
    assert.equal(healthyTeleReports.length, 0, 'Healthy telemetryId must resolve 0 reports');

    // 3e. Controller GET /reports with batchId query params
    let cBatchData = null;
    const resB = {
      status() { return this; },
      json(d) { cBatchData = d; return this; }
    };
    await getReports({
      query: {
        modelId: String(model._id),
        versionId: String(v2._id),
        batchId: driftTelemetry.batchId
      }
    }, resB);
    assert.equal(cBatchData?.success, true);
    assert.equal(cBatchData?.count, 1);
    assert.equal(cBatchData?.data[0]?.reportNumber, 'REP-DRIFT-001');
  });

  await t.test('4. Telemetry Overview Chart Contract: recentTrend carries _id and reportId for graph inspect action', async () => {
    let overviewData = null;
    const resO = {
      status() { return this; },
      json(d) { overviewData = d; return this; }
    };
    await getMonitoringOverview({
      params: { modelId: String(model._id) },
      query: { versionId: String(v2._id) }
    }, resO);

    assert.ok(overviewData?.data?.recentTrend, 'recentTrend must exist in overview');
    const { recentTrend } = overviewData.data;

    // Find drift batch point in chart data
    const chartDriftPoint = recentTrend.find(p => p.batchId === driftTelemetry.batchId);
    assert.ok(chartDriftPoint, 'Chart points must include the drift batch');
    assert.equal(chartDriftPoint.driftStatus, 'DRIFT_DETECTED');
    assert.ok(chartDriftPoint.reportId, 'Drift chart point must carry reportId');
    assert.equal(
      typeof chartDriftPoint.reportId === 'object' ? chartDriftPoint.reportId.reportNumber : chartDriftPoint.reportId,
      'REP-DRIFT-001'
    );
    assert.ok(chartDriftPoint._id, 'Chart point must carry telemetry document _id');

    // Find healthy batch point in chart data
    const chartHealthyPoint = recentTrend.find(p => p.batchId === healthyTelemetry.batchId);
    assert.ok(chartHealthyPoint, 'Chart points must include the healthy batch');
    assert.equal(chartHealthyPoint.driftStatus, 'HEALTHY');
    assert.equal(chartHealthyPoint.reportId, null, 'Healthy chart point must have reportId === null');
  });

  await t.test('5. State Invariance: Preserves v2.0 drift telemetry, REP-DRIFT-001, INC-001, v1.0 batches, audit chain', async () => {
    // 5a. v2.0 records count
    const v2Telemetries = await Telemetry.find({ modelId: model._id, versionId: v2._id });
    assert.equal(v2Telemetries.length, 5, 'v2.0 must still have all 5 telemetry batches');

    const v2Reports = await Report.find({ modelId: model._id, versionId: v2._id });
    assert.equal(v2Reports.length, 1, 'v2.0 must preserve exactly 1 drift report (REP-DRIFT-001)');

    const v2Incidents = await Incident.find({ modelId: model._id, versionId: v2._id });
    assert.equal(v2Incidents.length, 1, 'v2.0 must preserve exactly 1 incident (INC-001)');

    // 5b. v1.0 records count
    const v1Telemetries = await Telemetry.find({ modelId: model._id, versionId: v1._id });
    assert.equal(v1Telemetries.length, 9, 'v1.0 must still have all 9 healthy telemetry batches');

    // 5c. Endpoints unchanged
    const reloadedModel = await Model.findById(model._id);
    assert.equal(reloadedModel.apiConfig.endpointUrl, 'https://mohamedgamal04-creditlens.hf.space');

    const reloadedV2 = await ModelVersion.findById(v2._id);
    assert.equal(reloadedV2.apiConfig.endpointUrl, 'https://credit-risk-scoring-58zh.onrender.com');
    assert.equal(reloadedV2.apiConfig.predictEndpoint, '/score');

    // 5d. Audit chain integrity
    const audit = await verifyAuditChainIntegrity();
    assert.equal(audit.valid, true, 'Audit ledger SHA-256 chain must be 100% valid');
  });

  await mongoose.disconnect();
});
