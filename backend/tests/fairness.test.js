import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDisparateImpactRatio,
  calculateDemographicParityDifference,
  evaluateModelMetrics,
  calculateRocAuc
} from '../src/services/fairnessEngine.js';

test('Fairness Engine: Disparate Impact Ratio calculation', () => {
  // Scenario 1: 80% rule failure (e.g. CreditRisk v1.0)
  // Privileged positive rate = 70% (3500/5000)
  // Unprivileged positive rate = 51.1% (2555/5000)
  const dirFail = calculateDisparateImpactRatio(0.511, 0.70);
  assert.equal(dirFail, 0.73);
  assert.ok(dirFail < 0.80, 'DIR 0.73 should violate the 0.80 threshold');

  // Scenario 2: Remediated model (e.g. CreditRisk v1.1)
  // Privileged = 70% (3500/5000)
  // Unprivileged = 60.2% (3010/5000)
  const dirPass = calculateDisparateImpactRatio(0.602, 0.70);
  assert.equal(dirPass, 0.86);
  assert.ok(dirPass >= 0.80, 'DIR 0.86 should pass the 0.80 threshold');
});

test('Fairness Engine: Demographic Parity Difference calculation', () => {
  const dpd = calculateDemographicParityDifference(0.511, 0.70);
  assert.equal(dpd, 0.189);
});

test('Fairness Engine: Comprehensive evaluation metrics with explicit rocAuc', () => {
  const result = evaluateModelMetrics({
    rocAuc: 0.88,
    counts: {
      privileged: { total: 5000, positive: 3500, tp: 3150, fp: 350, fn: 350, tn: 1150 },
      unprivileged: { total: 5000, positive: 2555, tp: 2200, fp: 355, fn: 600, tn: 1845 }
    }
  });

  assert.equal(result.fairnessMetrics.disparateImpactRatio, 0.73);
  assert.ok(result.performanceMetrics.accuracy > 0.80);
  assert.equal(result.performanceMetrics.rocAuc, 0.88);
  assert.ok(result.performanceMetrics.rocAuc >= 0 && result.performanceMetrics.rocAuc <= 1.0);
  assert.ok(result.fairnessMetrics.equalizedOdds.tprDiff >= 0);
});

test('Fairness Engine: Binary-only confusion counts do NOT fabricate ROC-AUC (returns null)', () => {
  const result = evaluateModelMetrics({
    counts: {
      privileged: { total: 5000, positive: 3500, tp: 3150, fp: 350, fn: 350, tn: 1150 },
      unprivileged: { total: 5000, positive: 2555, tp: 2200, fp: 355, fn: 600, tn: 1845 }
    }
  });

  assert.strictEqual(result.performanceMetrics.rocAuc, null);
});

test('Fairness Engine: Hard invariant rejects invalid ROC-AUC outside [0, 1]', () => {
  // Must reject impossible values > 1
  assert.throws(() => {
    evaluateModelMetrics({ rocAuc: 1.4063 });
  }, /between 0 and 1/);

  // Must reject impossible values < 0
  assert.throws(() => {
    evaluateModelMetrics({ rocAuc: -0.05 });
  }, /between 0 and 1/);
});

test('ROC-AUC Engine: Conventional Mann-Whitney U calculation accuracy and properties', () => {
  // 1. Perfect discrimination (ROC-AUC = 1.0)
  const perfect = calculateRocAuc([1, 1, 0, 0], [0.95, 0.85, 0.20, 0.10]);
  assert.strictEqual(perfect, 1.0);

  // 2. Completely inverted discrimination (ROC-AUC = 0.0)
  const inverted = calculateRocAuc([1, 1, 0, 0], [0.10, 0.20, 0.85, 0.95]);
  assert.strictEqual(inverted, 0.0);

  // 3. Random / Tied baseline (ROC-AUC = 0.5)
  const tied = calculateRocAuc([1, 0], [0.5, 0.5]);
  assert.strictEqual(tied, 0.5);

  // 4. Multi-sample distribution with known rank-sum
  // Positives: 0.6 (rank 3), 0.7 (rank 4), 0.9 (rank 6)
  // Negatives: 0.2 (rank 1), 0.4 (rank 2), 0.8 (rank 5)
  // Positive ranks = 3 + 4 + 6 = 13
  // U = 13 - (3 * 4) / 2 = 13 - 6 = 7
  // AUC = 7 / (3 * 3) = 7/9 = 0.7778
  const custom = calculateRocAuc([0, 0, 1, 0, 1, 1], [0.2, 0.4, 0.6, 0.8, 0.7, 0.9]);
  assert.strictEqual(custom, 0.7778);
  assert.ok(custom >= 0 && custom <= 1.0);

  // 5. Undefined when only 1 class is present
  const allPos = calculateRocAuc([1, 1, 1], [0.5, 0.6, 0.7]);
  assert.strictEqual(allPos, null);

  const allNeg = calculateRocAuc([0, 0, 0], [0.2, 0.3, 0.4]);
  assert.strictEqual(allNeg, null);
});
