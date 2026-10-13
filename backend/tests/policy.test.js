import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePolicyGates } from '../src/services/policyEngine.js';

test('Policy Engine: Blocks promotion when Disparate Impact ratio is below 0.80', () => {
  const policy = {
    name: 'High Risk Lending Policy',
    rules: {
      minDisparateImpact: 0.80,
      minRocAuc: 0.85
    }
  };

  const biasedEvaluation = {
    performanceMetrics: { accuracy: 0.91, rocAuc: 0.89 },
    fairnessMetrics: { disparateImpactRatio: 0.73, demographicParityDiff: 0.189 }
  };

  const decision = evaluatePolicyGates({
    policy,
    evaluation: biasedEvaluation,
    model: { riskLevel: 'HIGH', purpose: 'Credit underwriting' }
  });

  assert.equal(decision.passed, false);
  assert.equal(decision.overallDecision, 'BLOCKED');
  assert.equal(decision.gateBreakdown.fairnessGate.status, 'FAILED');
  assert.equal(decision.gateBreakdown.performanceGate.status, 'PASSED');
  assert.ok(decision.reasons.some(r => r.includes('Disparate Impact')));
});

test('Policy Engine: Passes gate when all rules and thresholds are met', () => {
  const policy = {
    name: 'High Risk Lending Policy',
    rules: {
      minDisparateImpact: 0.80,
      minRocAuc: 0.85
    }
  };

  const compliantEvaluation = {
    performanceMetrics: { accuracy: 0.908, rocAuc: 0.88 },
    fairnessMetrics: { disparateImpactRatio: 0.86, demographicParityDiff: 0.098 }
  };

  const decision = evaluatePolicyGates({
    policy,
    evaluation: compliantEvaluation,
    model: { riskLevel: 'HIGH', purpose: 'Credit underwriting' }
  });

  assert.equal(decision.passed, true);
  assert.equal(decision.overallDecision, 'PASSED');
  assert.equal(decision.gateBreakdown.fairnessGate.status, 'PASSED');
  assert.equal(decision.reasons.length, 0);
});
