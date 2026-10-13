/**
 * Policy & Governance Gate Engine
 * Evaluates model versions against stored policy criteria and determines gating decisions.
 */

export function evaluatePolicyGates({ policy, evaluation, modelVersion = {}, model = {} }) {
  if (!policy) {
    throw new Error('Policy definition is required for gate evaluation');
  }
  if (!evaluation) {
    return {
      passed: false,
      overallDecision: 'BLOCKED',
      reason: 'No evaluation metrics found for this model version.',
      gates: {
        evaluationGate: { status: 'FAILED', message: 'Evaluation missing' }
      }
    };
  }

  const { rules } = policy;
  const perf = evaluation.performanceMetrics || {};
  const fairness = evaluation.fairnessMetrics || {};

  const gateResults = {};
  const failureReasons = [];

  // 1. Fairness Gate
  const dir = fairness.disparateImpactRatio ?? 0;
  const dpd = fairness.demographicParityDiff ?? 0;

  let fairnessPassed = true;
  const fairnessViolations = [];

  // Determine whether fairness metrics were evaluated:
  // - Explicit boolean flag if present (Phase 8 imports)
  // - Otherwise, check whether disparate impact ratio or protected attribute is present (pre-Phase-8 evaluations)
  const isFairnessEvaluated = fairness.fairnessEvaluated === true ||
    (fairness.fairnessEvaluated !== false &&
     ((fairness.disparateImpactRatio !== undefined && fairness.disparateImpactRatio !== null && fairness.disparateImpactRatio > 0) ||
      (Boolean(fairness.protectedAttribute) && fairness.protectedAttribute !== 'NONE' && fairness.protectedAttribute !== 'N/A')));

  if (!isFairnessEvaluated && (rules.minDisparateImpact !== undefined || rules.maxDemographicParityDiff !== undefined)) {
    fairnessPassed = false;
    fairnessViolations.push(
      'Fairness Gate Blocked: Dataset does not contain protected attributes (e.g. gender, age, race) required by policy for non-discrimination evaluation.'
    );
  } else if (isFairnessEvaluated) {
    if (rules.minDisparateImpact !== undefined && dir < rules.minDisparateImpact) {
      fairnessPassed = false;
      fairnessViolations.push(
        `Disparate Impact Ratio (${dir}) is below the required policy threshold of ${rules.minDisparateImpact} (80% rule violation)`
      );
    }

    if (rules.maxDisparateImpact !== undefined && dir > rules.maxDisparateImpact) {
      fairnessPassed = false;
      fairnessViolations.push(
        `Disparate Impact Ratio (${dir}) exceeds the upper bound threshold of ${rules.maxDisparateImpact}`
      );
    }

    if (rules.maxDemographicParityDiff !== undefined && dpd > rules.maxDemographicParityDiff) {
      fairnessPassed = false;
      fairnessViolations.push(
        `Demographic Parity Difference (${dpd}) exceeds the allowed limit of ${rules.maxDemographicParityDiff}`
      );
    }
  }

  gateResults.fairnessGate = {
    status: fairnessPassed ? 'PASSED' : 'FAILED',
    metric: `Disparate Impact: ${dir}, Demographic Parity Diff: ${dpd}`,
    violations: fairnessViolations
  };

  if (!fairnessPassed) {
    failureReasons.push(...fairnessViolations);
  }

  // 2. Performance Gate
  let performancePassed = true;
  const perfViolations = [];

  if (rules.minRocAuc !== undefined) {
    if (perf.rocAuc === null || perf.rocAuc === undefined) {
      performancePassed = false;
      perfViolations.push(
        `Performance Gate Blocked: ROC-AUC evidence is unavailable (prediction scores/probabilities were not provided in dataset), but policy requires minimum ROC-AUC of ${rules.minRocAuc}`
      );
    } else if (typeof perf.rocAuc !== 'number' || isNaN(perf.rocAuc) || perf.rocAuc < 0 || perf.rocAuc > 1) {
      performancePassed = false;
      perfViolations.push(
        `Performance Gate Blocked: Invalid ROC-AUC value (${perf.rocAuc}). ROC-AUC must be bounded between 0 and 1.`
      );
    } else if (perf.rocAuc < rules.minRocAuc) {
      performancePassed = false;
      perfViolations.push(`ROC-AUC (${perf.rocAuc}) is below minimum requirement of ${rules.minRocAuc}`);
    }
  }

  if (rules.minAccuracy !== undefined) {
    if (perf.accuracy === null || perf.accuracy === undefined) {
      performancePassed = false;
      perfViolations.push(`Accuracy evidence is unavailable, but policy requires minimum Accuracy of ${rules.minAccuracy}`);
    } else if (perf.accuracy < rules.minAccuracy) {
      performancePassed = false;
      perfViolations.push(`Accuracy (${perf.accuracy}) is below minimum requirement of ${rules.minAccuracy}`);
    }
  }

  if (rules.minPrecision !== undefined) {
    if (perf.precision === null || perf.precision === undefined) {
      performancePassed = false;
      perfViolations.push(`Precision evidence is unavailable, but policy requires minimum Precision of ${rules.minPrecision}`);
    } else if (perf.precision < rules.minPrecision) {
      performancePassed = false;
      perfViolations.push(`Precision (${perf.precision}) is below minimum requirement of ${rules.minPrecision}`);
    }
  }

  if (rules.minRecall !== undefined) {
    if (perf.recall === null || perf.recall === undefined) {
      performancePassed = false;
      perfViolations.push(`Recall evidence is unavailable, but policy requires minimum Recall of ${rules.minRecall}`);
    } else if (perf.recall < rules.minRecall) {
      performancePassed = false;
      perfViolations.push(`Recall (${perf.recall}) is below minimum requirement of ${rules.minRecall}`);
    }
  }

  const accuracyDisplay = perf.accuracy !== null && perf.accuracy !== undefined ? `${(perf.accuracy * 100).toFixed(1)}%` : 'Unavailable';
  const rocAucDisplay = perf.rocAuc !== null && perf.rocAuc !== undefined ? perf.rocAuc : 'Unavailable';

  gateResults.performanceGate = {
    status: performancePassed ? 'PASSED' : 'FAILED',
    metric: `Accuracy: ${accuracyDisplay}, ROC-AUC: ${rocAucDisplay}`,
    violations: perfViolations
  };

  if (!performancePassed) {
    failureReasons.push(...perfViolations);
  }

  // 3. Documentation & Risk Governance Gate
  let docPassed = true;
  const docViolations = [];

  if (model.riskLevel === 'UNACCEPTABLE') {
    docPassed = false;
    docViolations.push('Model is classified as UNACCEPTABLE RISK under EU AI Act Article 5 (Prohibited System)');
  }

  if (!model.purpose || model.purpose.trim().length < 5) {
    docPassed = false;
    docViolations.push('Model intended purpose documentation is incomplete');
  }

  gateResults.documentationGate = {
    status: docPassed ? 'PASSED' : 'FAILED',
    metric: `Risk Level: ${model.riskLevel || 'HIGH'}`,
    violations: docViolations
  };

  if (!docPassed) {
    failureReasons.push(...docViolations);
  }

  // Overall Decision
  const allPassed = fairnessPassed && performancePassed && docPassed;
  const overallDecision = allPassed ? 'PASSED' : 'BLOCKED';

  return {
    passed: allPassed,
    overallDecision,
    policyName: policy.name,
    requiredApprovers: policy.requiredApprovers || [],
    failureAction: policy.failureAction || 'BLOCK_PROMOTION',
    reasons: failureReasons,
    gateBreakdown: gateResults,
    evaluatedAt: new Date()
  };
}
