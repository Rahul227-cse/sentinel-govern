import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePSI, evaluateDriftStatus, generateTelemetryBatch } from '../src/services/driftEngine.js';

test('Drift Engine: Stable distributions yield low PSI (< 0.10)', () => {
  const expected = [
    { bin: 'Low', percentage: 25 },
    { bin: 'Medium', percentage: 50 },
    { bin: 'High', percentage: 25 }
  ];
  const actualStable = [
    { bin: 'Low', percentage: 26 },
    { bin: 'Medium', percentage: 49 },
    { bin: 'High', percentage: 25 }
  ];

  const result = calculatePSI(expected, actualStable);
  assert.ok(result.psi < 0.10, `Expected PSI < 0.10 for stable distribution, got ${result.psi}`);
  assert.equal(evaluateDriftStatus(result.psi), 'HEALTHY');
});

test('Drift Engine: Shifted distribution triggers significant drift (PSI > 0.25)', () => {
  const expected = [
    { bin: 'Low', percentage: 10 },
    { bin: 'Medium', percentage: 60 },
    { bin: 'High', percentage: 30 }
  ];
  const actualShifted = [
    { bin: 'Low', percentage: 40 }, // Major shift
    { bin: 'Medium', percentage: 40 },
    { bin: 'High', percentage: 20 }
  ];

  const result = calculatePSI(expected, actualShifted);
  assert.ok(result.psi > 0.25, `Expected PSI > 0.25 for shifted distribution, got ${result.psi}`);
  assert.equal(evaluateDriftStatus(result.psi), 'DRIFT_DETECTED');
});

test('Drift Engine: Telemetry generator scenario simulation', () => {
  const stableBatch = generateTelemetryBatch({ scenario: 'STABLE' });
  assert.equal(stableBatch.driftStatus, 'HEALTHY');
  assert.ok(stableBatch.aggregatePsi < 0.10);

  const driftedBatch = generateTelemetryBatch({ scenario: 'DRIFTED' });
  assert.equal(driftedBatch.driftStatus, 'DRIFT_DETECTED');
  assert.ok(driftedBatch.aggregatePsi >= 0.25);
  assert.ok(driftedBatch.features.some(f => f.driftDetected));
});
