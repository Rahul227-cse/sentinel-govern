/**
 * Statistical Fairness & Performance Evaluation Engine (Node.js native)
 */

export function calculateDisparateImpactRatio(unprivilegedSelectionRate, privilegedSelectionRate) {
  if (privilegedSelectionRate === 0) {
    return unprivilegedSelectionRate === 0 ? 1.0 : 0.0;
  }
  const dir = unprivilegedSelectionRate / privilegedSelectionRate;
  return Number(dir.toFixed(4));
}

export function calculateDemographicParityDifference(unprivilegedSelectionRate, privilegedSelectionRate) {
  const diff = Math.abs(unprivilegedSelectionRate - privilegedSelectionRate);
  return Number(diff.toFixed(4));
}

export function calculateRate(numerator, denominator) {
  if (denominator === 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

/**
 * Calculates conventional ROC-AUC using the Mann-Whitney U statistic (Wilcoxon rank-sum).
 * Handles tied prediction scores via average ranks.
 * 
 * @param {Array<number>} actuals - Binary ground truth labels (0 or 1)
 * @param {Array<number>} scores - Continuous prediction scores / probabilities for positive class
 * @returns {number|null} Bounded ROC-AUC in [0, 1], or null if undefined (e.g. only one class present)
 */
export function calculateRocAuc(actuals, scores) {
  if (!Array.isArray(actuals) || !Array.isArray(scores)) {
    throw new Error('actuals and scores must be arrays');
  }
  if (actuals.length !== scores.length) {
    throw new Error(`actuals and scores length mismatch: ${actuals.length} vs ${scores.length}`);
  }
  if (actuals.length === 0) return null;

  let nPos = 0;
  let nNeg = 0;
  const items = new Array(actuals.length);

  for (let i = 0; i < actuals.length; i++) {
    const act = actuals[i];
    const sc = scores[i];

    if (act !== 0 && act !== 1) {
      throw new Error(`Invalid actual label at index ${i}: label must be binary 0 or 1, got ${act}`);
    }
    if (sc === null || sc === undefined || typeof sc !== 'number' || isNaN(sc) || !isFinite(sc)) {
      throw new Error(`Invalid prediction score at index ${i}: score must be a finite number, got ${sc}`);
    }

    if (act === 1) nPos++;
    else nNeg++;

    items[i] = { actual: act, score: sc };
  }

  // ROC-AUC requires at least one positive and one negative sample
  if (nPos === 0 || nNeg === 0) {
    return null;
  }

  // Sort ascending by score
  items.sort((a, b) => a.score - b.score);

  // Assign ranks with average ranking for ties
  let sumRanksPos = 0;
  let i = 0;
  const n = items.length;

  while (i < n) {
    let j = i;
    while (j < n - 1 && items[j + 1].score === items[j].score) {
      j++;
    }

    // 1-based ranks from (i + 1) to (j + 1)
    const avgRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) {
      if (items[k].actual === 1) {
        sumRanksPos += avgRank;
      }
    }
    i = j + 1;
  }

  // Mann-Whitney U for positive class
  const uPos = sumRanksPos - (nPos * (nPos + 1)) / 2;
  const rawAuc = uPos / (nPos * nNeg);

  // Hard invariant validation: ROC-AUC must satisfy 0 <= rocAuc <= 1
  if (rawAuc < 0 || rawAuc > 1 || isNaN(rawAuc)) {
    throw new Error(`Calculated ROC-AUC (${rawAuc}) is outside mathematically valid range [0, 1]`);
  }

  return Number(rawAuc.toFixed(4));
}

export function evaluateModelMetrics({
  datasetName = 'Benchmark Validation Dataset',
  sampleCount = 10000,
  protectedAttribute = 'gender',
  privilegedGroup = 'Male',
  unprivilegedGroup = 'Female',
  rocAuc = null,
  counts = {
    privileged: { total: 5000, positive: 3500, tp: 3150, fp: 350, fn: 350, tn: 1150 },
    unprivileged: { total: 5000, positive: 2555, tp: 2200, fp: 355, fn: 600, tn: 1845 }
  }
} = {}) {
  // Validate rocAuc if explicitly provided
  let validatedRocAuc = null;
  if (rocAuc !== null && rocAuc !== undefined) {
    if (typeof rocAuc !== 'number' || isNaN(rocAuc) || rocAuc < 0 || rocAuc > 1) {
      throw new Error(`Invalid ROC-AUC value (${rocAuc}): ROC-AUC must be a valid number between 0 and 1.`);
    }
    validatedRocAuc = Number(rocAuc.toFixed(4));
  }

  const priv = counts.privileged;
  const unpriv = counts.unprivileged;

  // Selection rates (P(Y_hat = 1 | Group))
  const privSelectionRate = calculateRate(priv.positive, priv.total);
  const unprivSelectionRate = calculateRate(unpriv.positive, unpriv.total);

  // Fairness metrics
  const disparateImpactRatio = calculateDisparateImpactRatio(unprivSelectionRate, privSelectionRate);
  const demographicParityDiff = calculateDemographicParityDifference(unprivSelectionRate, privSelectionRate);

  // Equalized Odds rates
  const privTPR = calculateRate(priv.tp, priv.tp + priv.fn);
  const unprivTPR = calculateRate(unpriv.tp, unpriv.tp + unpriv.fn);
  const tprDiff = Number(Math.abs(privTPR - unprivTPR).toFixed(4));

  const privFPR = calculateRate(priv.fp, priv.fp + priv.tn);
  const unprivFPR = calculateRate(unpriv.fp, unpriv.fp + unpriv.tn);
  const fprDiff = Number(Math.abs(privFPR - unprivFPR).toFixed(4));

  // Overall Performance metrics across entire population
  const totalSamples = priv.total + unpriv.total;
  const totalTP = priv.tp + unpriv.tp;
  const totalFP = priv.fp + unpriv.fp;
  const totalFN = priv.fn + unpriv.fn;
  const totalTN = priv.tn + unpriv.tn;

  const accuracy = calculateRate(totalTP + totalTN, totalSamples);
  const precision = calculateRate(totalTP, totalTP + totalFP);
  const recall = calculateRate(totalTP, totalTP + totalFN);
  const f1 = Number(((2 * precision * recall) / (precision + recall || 1)).toFixed(4));

  return {
    datasetName,
    sampleCount: totalSamples,
    performanceMetrics: {
      accuracy,
      precision,
      recall,
      f1,
      rocAuc: validatedRocAuc
    },
    fairnessMetrics: {
      protectedAttribute,
      privilegedGroup,
      unprivilegedGroup,
      disparateImpactRatio,
      demographicParityDiff,
      equalizedOdds: {
        privilegedTPR: privTPR,
        unprivilegedTPR: unprivTPR,
        tprDiff,
        privilegedFPR: privFPR,
        unprivilegedFPR: unprivFPR,
        fprDiff
      },
      groupStats: {
        privileged: {
          total: priv.total,
          positivePredictions: priv.positive,
          selectionRate: privSelectionRate
        },
        unprivileged: {
          total: unpriv.total,
          positivePredictions: unpriv.positive,
          selectionRate: unprivSelectionRate
        }
      }
    }
  };
}
