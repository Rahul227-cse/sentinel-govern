import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  parseArgs,
  resolveModelAndVersion,
  prepareInputs,
  executeSingleBatch,
  runMonitoringRunner,
  RunnerLock
} from '../scripts/runtime_runner.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';

test('Runtime Runner: 1. parseArgs argument parsing and default configuration', () => {
  // Test defaults
  const defaultConfig = parseArgs([]);
  assert.strictEqual(defaultConfig.count, 10);
  assert.strictEqual(defaultConfig.delayMs, 100);
  assert.strictEqual(defaultConfig.scenario, 'BASELINE');
  assert.strictEqual(defaultConfig.continuous, false);
  assert.strictEqual(defaultConfig.batchDelayMs, 2000);
  assert.strictEqual(defaultConfig.maxBatches, null);
  assert.strictEqual(defaultConfig.smokeTest, false);
  assert.strictEqual(defaultConfig.dryRun, false);

  // Test custom CLI arguments
  const customConfig = parseArgs([
    '--modelId', 'fraud-detector-v1',
    '--versionId', 'v2.1',
    '--count', '25',
    '--delayMs', '50',
    '--scenario', 'SHIFTED',
    '--continuous',
    '--batchDelayMs', '1500',
    '--maxBatches', '5',
    '--dryRun',
    '--direct'
  ]);

  assert.strictEqual(customConfig.modelId, 'fraud-detector-v1');
  assert.strictEqual(customConfig.versionId, 'v2.1');
  assert.strictEqual(customConfig.count, 25);
  assert.strictEqual(customConfig.delayMs, 50);
  assert.strictEqual(customConfig.scenario, 'SHIFTED');
  assert.strictEqual(customConfig.continuous, true);
  assert.strictEqual(customConfig.batchDelayMs, 1500);
  assert.strictEqual(customConfig.maxBatches, 5);
  assert.strictEqual(customConfig.dryRun, true);
  assert.strictEqual(customConfig.direct, true);

  // Test smokeTest flag
  const smokeConfig = parseArgs(['--smokeTest']);
  assert.strictEqual(smokeConfig.smokeTest, true);
});

test('Runtime Runner: 2. prepareInputs generates proper baseline and shifted distributions', () => {
  const referenceData = [
    {
      _id: 'internal_mongo_id',
      timestamp: '2026-10-01T00:00:00Z',
      latency_ms: 120,
      AMT_INCOME: 100000,
      AMT_CREDIT: 200000,
      EXT_SOURCE_1: 0.8
    }
  ];

  // Baseline preparation
  const baselineInputs = prepareInputs({
    referenceRecords: referenceData,
    count: 3,
    scenario: 'BASELINE'
  });

  assert.strictEqual(baselineInputs.length, 3);
  for (const input of baselineInputs) {
    // Check that internal metadata columns are stripped
    assert.strictEqual(input._id, undefined);
    assert.strictEqual(input.timestamp, undefined);
    assert.strictEqual(input.latency_ms, undefined);

    // Check that features are present and near baseline
    assert.ok(typeof input.AMT_INCOME === 'number');
    assert.ok(input.AMT_INCOME >= 90000 && input.AMT_INCOME <= 110000);
    assert.ok(input.EXT_SOURCE_1 >= 0.70 && input.EXT_SOURCE_1 <= 0.90);
  }

  // Shifted preparation
  const shiftedInputs = prepareInputs({
    referenceRecords: referenceData,
    count: 2,
    scenario: 'SHIFTED'
  });

  assert.strictEqual(shiftedInputs.length, 2);
  for (const input of shiftedInputs) {
    assert.strictEqual(input._id, undefined);
    // In shifted mode, INCOME drops to ~20%
    assert.ok(input.AMT_INCOME <= 30000, `Expected shifted income <= 30000, got ${input.AMT_INCOME}`);
    // CREDIT is inflated
    assert.ok(input.AMT_CREDIT >= 600000, `Expected shifted credit >= 600000, got ${input.AMT_CREDIT}`);
    // EXT_SOURCE_1 drops heavily
    assert.ok(input.EXT_SOURCE_1 <= 0.1, `Expected shifted ext source <= 0.1, got ${input.EXT_SOURCE_1}`);
  }
});

test('Runtime Runner: 3. resolveModelAndVersion handles empty registry without inventing models', async () => {
  const origFindOne = Model.findOne;
  const origFind = Model.find;
  const origFindById = Model.findById;

  // Simulate empty registry (0 models)
  Model.findOne = () => ({
    sort: () => Promise.resolve(null),
    then: (resolve) => resolve(null)
  });
  Model.find = () => Promise.resolve([]);
  Model.findById = () => Promise.resolve(null);

  try {
    await assert.rejects(
      async () => {
        await resolveModelAndVersion({ modelId: null, versionId: null });
      },
      (err) => {
        assert.match(err.message, /No active models found in Sentinel Govern registry/i);
        return true;
      }
    );
  } finally {
    Model.findOne = origFindOne;
    Model.find = origFind;
    Model.findById = origFindById;
  }
});

test('Runtime Runner: 4. resolveModelAndVersion resolves model and version dynamically', async () => {
  const modelId = new mongoose.Types.ObjectId();
  const versionId = new mongoose.Types.ObjectId();

  const mockModel = {
    _id: modelId,
    name: 'Dynamic Loan Predictor',
    lifecycleStatus: 'IN_PRODUCTION',
    currentProductionVersionId: versionId,
    apiConfig: {
      endpointUrl: 'https://loan-api.internal.com',
      predictEndpoint: '/v1/predict',
      responseMapping: { predictionField: 'default_risk' }
    }
  };

  const mockVersion = {
    _id: versionId,
    modelId: modelId,
    version: 'v1.0',
    lifecycleStatus: 'IN_PRODUCTION',
    apiConfig: {}
  };

  const origModelFindOne = Model.findOne;
  const origModelFindById = Model.findById;
  const origVerFindOne = ModelVersion.findOne;
  const origVerFindById = ModelVersion.findById;

  Model.findById = (id) => {
    if (String(id) === String(modelId)) return Promise.resolve(mockModel);
    return Promise.resolve(null);
  };
  Model.findOne = (query) => {
    if (query && query.name && query.name.test && !query.name.test(mockModel.name)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(mockModel);
  };

  ModelVersion.findById = (id) => {
    if (String(id) === String(versionId)) return Promise.resolve(mockVersion);
    return Promise.resolve(null);
  };
  ModelVersion.findOne = (query) => {
    if (query && query._id && String(query._id) !== String(versionId)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(mockVersion);
  };

  try {
    // 1. Resolve by explicit ID
    const res1 = await resolveModelAndVersion({ modelId: String(modelId), versionId: String(versionId) });
    assert.strictEqual(String(res1.model._id), String(modelId));
    assert.strictEqual(String(res1.version._id), String(versionId));

    // 2. Resolve default (no ID provided)
    const res2 = await resolveModelAndVersion({ modelId: null, versionId: null });
    assert.strictEqual(String(res2.model._id), String(modelId));
    assert.strictEqual(String(res2.version._id), String(versionId));

    // 3. Reject when non-existent model requested
    await assert.rejects(
      async () => {
        await resolveModelAndVersion({ modelId: new mongoose.Types.ObjectId().toString() });
      },
      (err) => {
        assert.match(err.message, /Target model matching/i);
        return true;
      }
    );
  } finally {
    Model.findOne = origModelFindOne;
    Model.findById = origModelFindById;
    ModelVersion.findOne = origVerFindOne;
    ModelVersion.findById = origVerFindById;
  }
});

test('Runtime Runner: 5. executeSingleBatch executes inference and tracks latencies', async () => {
  const modelId = new mongoose.Types.ObjectId();
  const versionId = new mongoose.Types.ObjectId();

  const mockModel = { _id: modelId, name: 'Risk Scoring Model' };
  const mockVersion = { _id: versionId, version: 'v1.0' };
  const mockApiConfig = {
    endpointUrl: 'https://model.api.internal',
    responseMapping: { predictionField: 'risk_probability' }
  };

  const sampleInputs = [
    { score: 10, income: 50000 },
    { score: 20, income: 60000 }
  ];

  let callCount = 0;
  const mockExecuteInference = async ({ inputPayload }) => {
    callCount++;
    return {
      prediction: (inputPayload.score / 100),
      httpStatus: 200,
      latencyMs: 42
    };
  };

  const { scoredRecords, latencies } = await executeSingleBatch({
    model: mockModel,
    version: mockVersion,
    apiConfig: mockApiConfig,
    inputs: sampleInputs,
    config: { delayMs: 0 },
    batchIndex: 1,
    isInterrupted: () => false,
    executeInferenceFn: mockExecuteInference
  });

  assert.strictEqual(callCount, 2);
  assert.strictEqual(scoredRecords.length, 2);
  assert.strictEqual(latencies.length, 2);
  assert.strictEqual(latencies[0], 42);
  assert.strictEqual(scoredRecords[0].risk_probability, 0.1);
  assert.strictEqual(scoredRecords[1].risk_probability, 0.2);
});

test('Runtime Runner: 6. executeSingleBatch halts cleanly when isInterrupted triggers', async () => {
  const modelId = new mongoose.Types.ObjectId();
  const versionId = new mongoose.Types.ObjectId();

  const mockModel = { _id: modelId, name: 'Risk Scoring Model' };
  const mockVersion = { _id: versionId, version: 'v1.0' };
  const mockApiConfig = { responseMapping: { predictionField: 'pred' } };

  const sampleInputs = [
    { a: 1 },
    { a: 2 },
    { a: 3 },
    { a: 4 }
  ];

  let callCount = 0;
  const mockExecuteInference = async () => {
    callCount++;
    return { prediction: 0.5, latencyMs: 25 };
  };

  let stopNow = false;
  const { scoredRecords } = await executeSingleBatch({
    model: mockModel,
    version: mockVersion,
    apiConfig: mockApiConfig,
    inputs: sampleInputs,
    config: { delayMs: 0 },
    batchIndex: 1,
    isInterrupted: () => {
      if (callCount >= 2) stopNow = true;
      return stopNow;
    },
    executeInferenceFn: mockExecuteInference
  });

  // Should stop after 2 requests
  assert.strictEqual(callCount, 2);
  assert.strictEqual(scoredRecords.length, 2);
});

test('Runtime Runner: 7. Bounded continuous monitoring runs exact maxBatches limit', async () => {
  const modelId = new mongoose.Types.ObjectId();
  const versionId = new mongoose.Types.ObjectId();

  const mockModel = {
    _id: modelId,
    name: 'Bounded Continuous Model',
    lifecycleStatus: 'IN_PRODUCTION',
    currentProductionVersionId: versionId,
    apiConfig: {
      endpointUrl: 'https://test-model.api.internal',
      predictEndpoint: '/score',
      responseMapping: { predictionField: 'score' }
    }
  };

  const mockVersion = {
    _id: versionId,
    modelId: modelId,
    version: 'v1.0',
    lifecycleStatus: 'IN_PRODUCTION',
    apiConfig: {}
  };

  // Stubs
  const origModelFindOne = Model.findOne;
  const origModelFindById = Model.findById;
  const origVerFindOne = ModelVersion.findOne;
  const origVerFindById = ModelVersion.findById;

  Model.findOne = () => Promise.resolve(mockModel);
  Model.findById = () => Promise.resolve(mockModel);
  ModelVersion.findById = () => Promise.resolve(mockVersion);
  ModelVersion.findOne = () => Promise.resolve(mockVersion);

  let totalInferenceCalls = 0;
  const mockExecuteInference = async () => {
    totalInferenceCalls++;
    return { prediction: 0.77, latencyMs: 30 };
  };

  let totalIngestCalls = 0;
  const mockSubmitTelemetry = async () => {
    totalIngestCalls++;
    return {
      driftDetected: false,
      driftedColumns: [],
      recordsAnalyzed: 3,
      telemetry: { batchId: `batch-${totalIngestCalls}` }
    };
  };

  try {
    const sessionStats = await runMonitoringRunner(
      {
        modelId: String(modelId),
        versionId: String(versionId),
        count: 3,
        delayMs: 0,
        continuous: true,
        maxBatches: 2,
        batchDelayMs: 10,
        scenario: 'BASELINE',
        direct: true,
        dryRun: false
      },
      {
        connectDbFn: async () => {},
        disconnectDbFn: async () => {},
        retrieveReferenceRecordsFn: async () => [{ x: 10, y: 20 }],
        executeInferenceFn: mockExecuteInference,
        submitTelemetryBatchFn: mockSubmitTelemetry
      }
    );

    // Exactly 2 batches of 3 requests each = 6 requests
    assert.strictEqual(sessionStats.totalBatches, 2);
    assert.strictEqual(sessionStats.totalRequests, 6);
    assert.strictEqual(sessionStats.successfulRequests, 6);
    assert.strictEqual(totalInferenceCalls, 6);
    assert.strictEqual(totalIngestCalls, 2);
    assert.strictEqual(sessionStats.driftDetectedCount, 0);
    assert.strictEqual(sessionStats.incidentsTriggered, 0);
  } finally {
    Model.findOne = origModelFindOne;
    Model.findById = origModelFindById;
    ModelVersion.findById = origVerFindById;
    ModelVersion.findOne = origVerFindOne;
  }
});

test('Runtime Runner: 8. RunnerLock prevents duplicate worker execution and cleans up upon release', () => {
  const modelId = new mongoose.Types.ObjectId().toString();
  const versionId = new mongoose.Types.ObjectId().toString();

  const lock1 = new RunnerLock(modelId, versionId);
  lock1.acquire();
  assert.ok(lock1.acquired);

  const lock2 = new RunnerLock(modelId, versionId);
  assert.throws(
    () => {
      lock2.acquire();
    },
    /Another runner process .* is already actively processing/i
  );

  lock1.release();
  assert.strictEqual(lock1.acquired, false);

  // Now lock2 can acquire successfully
  lock2.acquire();
  assert.ok(lock2.acquired);
  lock2.release();
});

test('Runtime Runner: 9. executeSingleBatch bounded concurrency and synthetic tagging', async () => {
  const modelId = new mongoose.Types.ObjectId();
  const versionId = new mongoose.Types.ObjectId();

  const mockModel = { _id: modelId, name: 'Concurrency Test Model' };
  const mockVersion = { _id: versionId, version: 'v1.0' };
  const mockApiConfig = { responseMapping: { predictionField: 'score' } };

  const inputs = Array.from({ length: 12 }, (_, i) => ({ val: i }));
  let activeWorkers = 0;
  let maxObservedWorkers = 0;

  const mockExecuteInference = async ({ inputPayload }) => {
    activeWorkers++;
    if (activeWorkers > maxObservedWorkers) {
      maxObservedWorkers = activeWorkers;
    }
    await new Promise(r => setTimeout(r, 20));
    activeWorkers--;
    return { prediction: inputPayload.val * 0.1, latencyMs: 20 };
  };

  const { scoredRecords, latencies } = await executeSingleBatch({
    model: mockModel,
    version: mockVersion,
    apiConfig: mockApiConfig,
    inputs,
    config: { concurrency: 4, retries: 1, synthetic: true, delayMs: 0 },
    batchIndex: 1,
    isInterrupted: () => false,
    executeInferenceFn: mockExecuteInference
  });

  assert.strictEqual(scoredRecords.length, 12);
  assert.strictEqual(latencies.length, 12);
  assert.ok(maxObservedWorkers <= 4, `Expected max workers <= 4, observed: ${maxObservedWorkers}`);
  assert.ok(maxObservedWorkers > 1, `Expected concurrent workers > 1, observed: ${maxObservedWorkers}`);

  for (const record of scoredRecords) {
    assert.strictEqual(record.isSyntheticWalkthroughTraffic, true);
  }
});
