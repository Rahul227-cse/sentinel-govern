/**
 * Population Stability Index (PSI) & Distribution Drift Engine
 */

const EPSILON = 0.0001; // Avoid divide by zero or ln(0)

export function calculatePSI(expectedDistribution, actualDistribution) {
  if (!expectedDistribution || !actualDistribution || expectedDistribution.length !== actualDistribution.length) {
    throw new Error('Expected and actual distributions must be provided with identical bin counts');
  }

  let totalPSI = 0;
  const binContributions = [];

  for (let i = 0; i < expectedDistribution.length; i++) {
    const exp = expectedDistribution[i];
    const act = actualDistribution[i];

    // Normalized fractions (percentages between 0 and 1)
    const expPct = Math.max(exp.percentage > 1 ? exp.percentage / 100 : exp.percentage, EPSILON);
    const actPct = Math.max(act.percentage > 1 ? act.percentage / 100 : act.percentage, EPSILON);

    const diff = actPct - expPct;
    const logRatio = Math.log(actPct / expPct);
    const binPSI = diff * logRatio;

    totalPSI += binPSI;
    binContributions.push({
      bin: exp.bin || act.bin || `Bin ${i + 1}`,
      expectedPercentage: Number((expPct * 100).toFixed(2)),
      actualPercentage: Number((actPct * 100).toFixed(2)),
      binPSI: Number(binPSI.toFixed(4))
    });
  }

  return {
    psi: Number(totalPSI.toFixed(4)),
    bins: binContributions
  };
}

export function evaluateDriftStatus(psi, warningThreshold = 0.10, significantThreshold = 0.25) {
  if (psi >= significantThreshold) {
    return 'DRIFT_DETECTED';
  } else if (psi >= warningThreshold) {
    return 'WARNING';
  }
  return 'HEALTHY';
}

/**
 * Deterministic telemetry generator for testing and demo flows
 */
export function generateTelemetryBatch({ scenario = 'STABLE', sampleSize = 2500, batchId = null }) {
  const isDrifted = scenario === 'DRIFTED';
  const id = batchId || `BATCH-${Date.now()}`;

  // Credit Score Bins
  const creditScoreExpected = [
    { bin: '< 580 (Poor)', percentage: 12 },
    { bin: '580-669 (Fair)', percentage: 22 },
    { bin: '670-739 (Good)', percentage: 38 },
    { bin: '740-799 (Very Good)', percentage: 20 },
    { bin: '800+ (Exceptional)', percentage: 8 }
  ];

  // In DRIFTED scenario, a severe macroeconomic shock shifts applicants to lower credit score tiers
  const creditScoreActual = isDrifted ? [
    { bin: '< 580 (Poor)', percentage: 28 }, // Massive surge in subprime
    { bin: '580-669 (Fair)', percentage: 32 },
    { bin: '670-739 (Good)', percentage: 24 },
    { bin: '740-799 (Very Good)', percentage: 12 },
    { bin: '800+ (Exceptional)', percentage: 4 }
  ] : [
    { bin: '< 580 (Poor)', percentage: 13 },
    { bin: '580-669 (Fair)', percentage: 21 },
    { bin: '670-739 (Good)', percentage: 37 },
    { bin: '740-799 (Very Good)', percentage: 20 },
    { bin: '800+ (Exceptional)', percentage: 9 }
  ];

  // Debt to Income Bins
  const dtiExpected = [
    { bin: '< 20%', percentage: 30 },
    { bin: '20-35%', percentage: 45 },
    { bin: '35-50%', percentage: 20 },
    { bin: '> 50%', percentage: 5 }
  ];

  const dtiActual = isDrifted ? [
    { bin: '< 20%', percentage: 14 },
    { bin: '20-35%', percentage: 32 },
    { bin: '35-50%', percentage: 38 },
    { bin: '> 50%', percentage: 16 }
  ] : [
    { bin: '< 20%', percentage: 29 },
    { bin: '20-35%', percentage: 46 },
    { bin: '35-50%', percentage: 20 },
    { bin: '> 50%', percentage: 5 }
  ];

  const creditScorePSI = calculatePSI(creditScoreExpected, creditScoreActual);
  const dtiPSI = calculatePSI(dtiExpected, dtiActual);

  const aggregatePsi = Number(((creditScorePSI.psi + dtiPSI.psi) / 2).toFixed(4));
  const driftStatus = evaluateDriftStatus(aggregatePsi);

  return {
    batchId: id,
    sampleSize,
    aggregatePsi,
    driftStatus,
    features: [
      {
        name: 'Credit Score Distribution',
        psi: creditScorePSI.psi,
        driftDetected: creditScorePSI.psi >= 0.25,
        expectedDistribution: creditScoreExpected,
        actualDistribution: creditScoreActual
      },
      {
        name: 'Debt-to-Income (DTI) Ratio',
        psi: dtiPSI.psi,
        driftDetected: dtiPSI.psi >= 0.25,
        expectedDistribution: dtiExpected,
        actualDistribution: dtiActual
      }
    ],
    performanceTelemetry: {
      predictionVolume: sampleSize,
      avgLatencyMs: isDrifted ? 48 : 32,
      errorRate: isDrifted ? 0.024 : 0.003,
      estimatedAccuracy: isDrifted ? 0.74 : 0.908
    }
  };
}
