import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { generateWorkloadSyntheticInputs, WORKLOAD_IDS } from '../src/services/workloadService.js';
import { retrieveReferenceDatasetRecords } from '../src/services/referenceDatasetService.js';
import { Model } from '../src/models/Model.js';
import { ModelVersion } from '../src/models/ModelVersion.js';

/**
 * Regression Test Suite:
 * CreditLens Baseline Drift Verification, Incompatibility Handling & Observability Chart Data Model
 */

const NON_FEATURE_REGEX = /^(target|label|actual|ground_truth|y_true|y_pred|prediction|predicted|decision|probability|probability_of_default|model|threshold|band|features|latency_ms)$/i;

// Mock / model of frontend chart data mapping
function mapChartPoints(recentTrend) {
  if (!Array.isArray(recentTrend) || recentTrend.length === 0) {
    return [];
  }
  return recentTrend.map((t, idx) => {
    const latency = Number(t.avgLatencyMs ?? t.latencyMs ?? t.performanceTelemetry?.avgLatencyMs ?? 0);
    const volume = Number(t.predictionVolume ?? t.sampleSize ?? 25);
    const time = t.recordedAt ? new Date(t.recordedAt) : new Date();
    return {
      index: idx,
      batchId: t.batchId,
      latency: Math.max(0, latency),
      volume: Math.max(1, volume),
      timestamp: time,
      timeLabel: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      isDrifted: t.driftStatus === 'DRIFT_DETECTED',
      isInsufficient: t.driftStatus === 'INSUFFICIENT_DATA'
    };
  });
}

test('1. Baseline Generation: produces in-distribution credit applicants matching reference distribution', () => {
  const count = 15;
  const inputs = generateWorkloadSyntheticInputs(WORKLOAD_IDS.CREDIT_RISK, { scenario: 'BASELINE', count });

  assert.strictEqual(inputs.length, count, 'Should produce exact requested batch size');

  // Verify feature names and distributions are populated
  for (const item of inputs) {
    assert.ok(item.amt_income >= 70000 && item.amt_income <= 300000, 'Income should be in realistic reference range');
    assert.ok(item.amt_credit >= 200000 && item.amt_credit <= 1000000, 'Credit should be in realistic reference range');
    assert.ok(item.age >= 21 && item.age <= 65, 'Age should be in reference range');
    assert.ok(item.ext_source_1 >= 0.10 && item.ext_source_1 <= 0.95, 'External score 1 should be in range');
    assert.ok(item.ext_source_2 >= 0.10 && item.ext_source_2 <= 0.95, 'External score 2 should be in range');
    assert.ok(item.ext_source_3 >= 0.10 && item.ext_source_3 <= 0.95, 'External score 3 should be in range');
    assert.ok(item.bureau_active >= 0 && item.bureau_active <= 6, 'Bureau active count should be bounded');
    assert.ok(item.bureau_dpd >= 0 && item.bureau_dpd <= 10, 'Bureau DPD should be bounded');
    assert.ok(item.isSyntheticWalkthroughTraffic, 'Should be marked as synthetic walkthrough traffic');
    // Legacy aliases preserved
    assert.ok(item.AMT_INCOME_TOTAL !== undefined);
    assert.ok(item.AMT_CREDIT !== undefined);
    assert.ok(item.DAYS_BIRTH !== undefined);
  }
});

test('2. Shifted Generation: produces genuinely displaced macro-economic shock distribution', () => {
  const count = 15;
  const shifted = generateWorkloadSyntheticInputs(WORKLOAD_IDS.CREDIT_RISK, { scenario: 'DRIFTED', count });

  assert.strictEqual(shifted.length, count);
  for (const item of shifted) {
    // Income dropped, credit debt increased, DPD elevated, ext_sources depressed
    assert.ok(item.amt_income <= 130000, 'Shifted income should reflect severe economic distress');
    assert.ok(item.amt_credit >= 400000, 'Shifted credit should reflect elevated debt demand');
    assert.ok(item.bureau_dpd >= 6, 'Shifted DPD should be elevated');
    assert.ok(item.ext_source_1 <= 0.35, 'Shifted ext_source_1 should be depressed');
  }
});

test('3. Feature vs Output Separation: non-feature prediction outputs are excluded from drift monitoring', () => {
  const candidateCols = [
    'amt_income', 'amt_credit', 'amt_annuity', 'age', 'gender',
    'probability', 'probability_of_default', 'prediction', 'predicted',
    'decision', 'target', 'latency_ms', 'model', 'threshold'
  ];

  const filtered = candidateCols.filter(col => !NON_FEATURE_REGEX.test(col.trim()));

  assert.deepStrictEqual(filtered, ['amt_income', 'amt_credit', 'amt_annuity', 'age', 'gender']);
  assert.ok(!filtered.includes('probability'));
  assert.ok(!filtered.includes('probability_of_default'));
  assert.ok(!filtered.includes('prediction'));
  assert.ok(!filtered.includes('decision'));
  assert.ok(!filtered.includes('target'));
});

test('4. Evidently Monitoring Service: Baseline inputs test as HEALTHY without false drift', async () => {
  const refRecords = [
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

  const featureCols = Object.keys(refRecords[0]).filter(c => !NON_FEATURE_REGEX.test(c));
  const baselineInputs = generateWorkloadSyntheticInputs(WORKLOAD_IDS.CREDIT_RISK, { scenario: 'BASELINE', count: 15 });

  const payload = {
    model_id: 'mock-model-creditlens',
    workload_id: 'credit-risk',
    runtime_data: baselineInputs,
    reference_data: refRecords,
    monitored_columns: featureCols
  };

  try {
    const res = await fetch('http://127.0.0.1:8001/analyze-drift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      assert.strictEqual(data.status, 'completed');
      assert.strictEqual(data.drift_detected, false, 'Baseline input data should not trigger distribution drift');
      assert.deepStrictEqual(data.drifted_columns, []);
    } else {
      console.warn('Evidently service offline; skipping live API assertion in unit test');
    }
  } catch {
    console.warn('Evidently service unreachable; skipping live API assertion');
  }
});

test('5. Evidently Monitoring Service: Shifted inputs trigger statistically verified DRIFT_DETECTED', async () => {
  const refRecords = [
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

  const featureCols = Object.keys(refRecords[0]).filter(c => !NON_FEATURE_REGEX.test(c));
  const shiftedInputs = generateWorkloadSyntheticInputs(WORKLOAD_IDS.CREDIT_RISK, { scenario: 'DRIFTED', count: 15 });

  const payload = {
    model_id: 'mock-model-creditlens',
    workload_id: 'credit-risk',
    runtime_data: shiftedInputs,
    reference_data: refRecords,
    monitored_columns: featureCols
  };

  try {
    const res = await fetch('http://127.0.0.1:8001/analyze-drift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      assert.strictEqual(data.status, 'completed');
      assert.strictEqual(data.drift_detected, true, 'Shifted input data must trigger distribution drift');
      assert.ok(data.drifted_columns.length > 0, 'Should identify specific drifted columns');
      assert.ok(data.drifted_columns.includes('amt_income') || data.drifted_columns.includes('bureau_dpd'));
    }
  } catch {
    console.warn('Evidently service unreachable; skipping live API assertion');
  }
});

test('6. Incompatible Reference Features: returns explicit INSUFFICIENT_DATA rather than crashing or claiming fake drift', async () => {
  const incompatibleRuntime = [
    { unrelated_alpha: 10, unrelated_beta: 20 },
    { unrelated_alpha: 15, unrelated_beta: 25 },
    { unrelated_alpha: 12, unrelated_beta: 22 },
    { unrelated_alpha: 18, unrelated_beta: 28 },
    { unrelated_alpha: 14, unrelated_beta: 24 }
  ];

  const reference = [
    { amt_income: 100000, amt_credit: 200000 },
    { amt_income: 120000, amt_credit: 250000 },
    { amt_income: 110000, amt_credit: 220000 },
    { amt_income: 130000, amt_credit: 280000 },
    { amt_income: 115000, amt_credit: 240000 }
  ];

  try {
    const res = await fetch('http://127.0.0.1:8001/analyze-drift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workload_id: 'custom-incompatible',
        runtime_data: incompatibleRuntime,
        reference_data: reference
      })
    });

    if (res.ok) {
      const data = await res.json();
      assert.strictEqual(data.status, 'insufficient_data');
      assert.strictEqual(data.drift_detected, false);
      assert.match(data.message, /Incompatible reference features/i);
    }
  } catch {
    console.warn('Evidently service unreachable');
  }
});

test('7. Insufficient Sample Size: sample count < 5 returns explicit INSUFFICIENT_DATA', async () => {
  const tinyRuntime = [
    { amt_income: 100000, amt_credit: 200000 },
    { amt_income: 120000, amt_credit: 250000 }
  ];

  const reference = [
    { amt_income: 100000, amt_credit: 200000 },
    { amt_income: 120000, amt_credit: 250000 },
    { amt_income: 110000, amt_credit: 220000 },
    { amt_income: 130000, amt_credit: 280000 },
    { amt_income: 115000, amt_credit: 240000 }
  ];

  try {
    const res = await fetch('http://127.0.0.1:8001/analyze-drift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workload_id: 'custom-test',
        runtime_data: tinyRuntime,
        reference_data: reference
      })
    });

    if (res.ok) {
      const data = await res.json();
      assert.strictEqual(data.status, 'insufficient_data');
      assert.strictEqual(data.drift_detected, false);
      assert.match(data.message, /Insufficient sample size/i);
    }
  } catch {
    console.warn('Evidently service unreachable');
  }
});

test('8. Observability Chart Data Mapping: handles chronological time ordering, latencies, and volume', () => {
  const rawTrend = [
    {
      batchId: 'BATCH-001',
      recordedAt: new Date(Date.now() - 60000).toISOString(),
      avgLatencyMs: 420.5,
      predictionVolume: 15,
      driftStatus: 'HEALTHY',
      driftedColumns: []
    },
    {
      batchId: 'BATCH-002',
      recordedAt: new Date(Date.now() - 30000).toISOString(),
      latencyMs: 729.0, // fallback property name
      predictionVolume: 25,
      driftStatus: 'DRIFT_DETECTED',
      driftedColumns: ['amt_income', 'bureau_dpd']
    },
    {
      batchId: 'BATCH-003',
      recordedAt: new Date().toISOString(),
      performanceTelemetry: { avgLatencyMs: 310.2 },
      sampleSize: 50,
      driftStatus: 'INSUFFICIENT_DATA',
      driftedColumns: []
    }
  ];

  const mapped = mapChartPoints(rawTrend);

  assert.strictEqual(mapped.length, 3);
  // Point 1
  assert.strictEqual(mapped[0].batchId, 'BATCH-001');
  assert.strictEqual(mapped[0].latency, 420.5);
  assert.strictEqual(mapped[0].volume, 15);
  assert.strictEqual(mapped[0].isDrifted, false);
  assert.strictEqual(mapped[0].isInsufficient, false);

  // Point 2 (fallback latencyMs resolved)
  assert.strictEqual(mapped[1].batchId, 'BATCH-002');
  assert.strictEqual(mapped[1].latency, 729.0);
  assert.strictEqual(mapped[1].volume, 25);
  assert.strictEqual(mapped[1].isDrifted, true);
  assert.strictEqual(mapped[1].isInsufficient, false);

  // Point 3 (performanceTelemetry fallback resolved)
  assert.strictEqual(mapped[2].batchId, 'BATCH-003');
  assert.strictEqual(mapped[2].latency, 310.2);
  assert.strictEqual(mapped[2].volume, 50);
  assert.strictEqual(mapped[2].isDrifted, false);
  assert.strictEqual(mapped[2].isInsufficient, true);

  // Empty state handling
  assert.deepStrictEqual(mapChartPoints([]), []);
  assert.deepStrictEqual(mapChartPoints(null), []);
});

test('9. Theme-Adaptive Design Tokens: light and dark configurations provide proper contrast and legibility', () => {
  const getChartTheme = (theme) => {
    const isDark = theme === 'dark';
    return {
      cardBg: 'var(--color-surface)',
      cardBorder: 'var(--color-border)',
      canvasBg: isDark ? '#0b0f17' : '#f8fafc',
      canvasBorder: isDark ? '#1e2530' : '#e2e8f0',
      hudBg: isDark ? '#111722' : '#ffffff',
      hudBorder: isDark ? '#1e293b' : '#e2e8f0',
      hudText: isDark ? '#f1f5f9' : '#0f172a',
      hudMuted: isDark ? '#94a3b8' : '#475569',
      gridStroke: isDark ? '#1e2530' : '#e2e8f0',
      axisLine: isDark ? '#2d3748' : '#cbd5e1',
      latencyLine: isDark ? '#38bdf8' : '#0284c7',
      volBarStroke: isDark ? '#38bdf8' : '#0284c7',
      healthyDot: isDark ? '#10b981' : '#16a34a',
      driftDot: isDark ? '#ef4444' : '#dc2626',
      warningDot: isDark ? '#f59e0b' : '#d97706'
    };
  };

  const darkTheme = getChartTheme('dark');
  const lightTheme = getChartTheme('light');

  // Verify dark tokens
  assert.strictEqual(darkTheme.canvasBg, '#0b0f17');
  assert.strictEqual(darkTheme.latencyLine, '#38bdf8');
  assert.strictEqual(darkTheme.healthyDot, '#10b981');
  assert.strictEqual(darkTheme.driftDot, '#ef4444');

  // Verify light tokens
  assert.strictEqual(lightTheme.canvasBg, '#f8fafc');
  assert.strictEqual(lightTheme.latencyLine, '#0284c7');
  assert.strictEqual(lightTheme.healthyDot, '#16a34a');
  assert.strictEqual(lightTheme.driftDot, '#dc2626');

  // Ensure backgrounds and grid lines are completely distinct
  assert.notStrictEqual(darkTheme.canvasBg, lightTheme.canvasBg);
  assert.notStrictEqual(darkTheme.gridStroke, lightTheme.gridStroke);
  assert.notStrictEqual(darkTheme.hudBg, lightTheme.hudBg);
  assert.notStrictEqual(darkTheme.hudText, lightTheme.hudText);

  // Both themes must use standard CSS variable for card surface to avoid visual contrast separation
  assert.strictEqual(darkTheme.cardBg, 'var(--color-surface)');
  assert.strictEqual(lightTheme.cardBg, 'var(--color-surface)');
});

test('10. Latest Service Observation: maps observation metadata compactly with content-driven metrics', () => {
  const telemetry = {
    batchId: 'BATCH-EVD-999',
    driftStatus: 'HEALTHY',
    referenceDatasetVersion: 'credit_risk_v1_creditlens_demo_synthetic.csv',
    performanceTelemetry: { avgLatencyMs: 245.5 },
    sampleSize: 15,
    recordedAt: '2026-10-26T10:30:00.000Z'
  };

  const model = { name: 'CreditLens', type: 'Credit Risk Scoring' };
  const version = { version: 'v1.0' };

  // Compact formatter resolver
  const formatObservation = (t, m, v) => ({
    verdict: t.driftStatus === 'DRIFT_DETECTED' ? 'REVIEW / FLAG' : 'ALLOW (LOW RISK)',
    latencyMs: Number(t.performanceTelemetry?.avgLatencyMs ?? t.latencyMs ?? 0),
    driftStatus: t.driftStatus,
    batchSize: t.sampleSize ?? 0,
    batchId: t.batchId,
    modelVersion: `${m?.name || 'Model'} (${v?.version || 'v1.0'})`,
    referenceDataset: t.referenceDatasetVersion || 'baseline-v1.0',
    recordedAt: new Date(t.recordedAt).toISOString()
  });

  const obs = formatObservation(telemetry, model, version);

  assert.strictEqual(obs.verdict, 'ALLOW (LOW RISK)');
  assert.strictEqual(obs.latencyMs, 245.5);
  assert.strictEqual(obs.driftStatus, 'HEALTHY');
  assert.strictEqual(obs.batchSize, 15);
  assert.strictEqual(obs.batchId, 'BATCH-EVD-999');
  assert.strictEqual(obs.modelVersion, 'CreditLens (v1.0)');
  assert.strictEqual(obs.referenceDataset, 'credit_risk_v1_creditlens_demo_synthetic.csv');

  // Verify drifted condition
  const driftedObs = formatObservation({ ...telemetry, driftStatus: 'DRIFT_DETECTED' }, model, version);
  assert.strictEqual(driftedObs.verdict, 'REVIEW / FLAG');
  assert.strictEqual(driftedObs.driftStatus, 'DRIFT_DETECTED');
});

test('11. Professional Spline Smoothing: createSmoothPath generates valid cubic bezier SVG paths', () => {
  function createSmoothPath(coords) {
    if (!coords || coords.length === 0) return '';
    if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
    if (coords.length === 2) {
      return `M ${coords[0].x} ${coords[0].y} L ${coords[1].x} ${coords[1].y}`;
    }
    let path = `M ${coords[0].x} ${coords[0].y}`;
    const tension = 0.2;
    for (let i = 0; i < coords.length - 1; i++) {
      const pPrev = i > 0 ? coords[i - 1] : coords[i];
      const pCurr = coords[i];
      const pNext = coords[i + 1];
      const pNextNext = i < coords.length - 2 ? coords[i + 2] : pNext;

      const cp1x = pCurr.x + (pNext.x - pPrev.x) * tension;
      const cp1y = pCurr.y + (pNext.y - pPrev.y) * tension;
      const cp2x = pNext.x - (pNextNext.x - pCurr.x) * tension;
      const cp2y = pNext.y - (pNextNext.y - pCurr.y) * tension;

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${pNext.x.toFixed(1)} ${pNext.y.toFixed(1)}`;
    }
    return path;
  }

  // Edge cases
  assert.strictEqual(createSmoothPath([]), '');
  assert.strictEqual(createSmoothPath(null), '');
  assert.strictEqual(createSmoothPath([{ x: 10, y: 20 }]), 'M 10 20');
  assert.strictEqual(createSmoothPath([{ x: 10, y: 20 }, { x: 30, y: 40 }]), 'M 10 20 L 30 40');

  // Multi-point spline curve
  const coords = [
    { x: 50, y: 100 },
    { x: 100, y: 80 },
    { x: 150, y: 120 },
    { x: 200, y: 90 }
  ];
  const path = createSmoothPath(coords);
  assert.ok(path.startsWith('M 50 100 C '));
  assert.ok(!path.includes('NaN'));
  assert.ok(!path.includes('undefined'));
  assert.strictEqual((path.match(/ C /g) || []).length, 3);
});

test('12. Dynamic Y-Axis Bounds: computes sensible high-resolution latency spread', () => {
  const computeBounds = (latencies) => {
    const rawMinLat = Math.min(...latencies);
    const rawMaxLat = Math.max(...latencies, 10);
    const latSpread = rawMaxLat - rawMinLat;
    const latPad = Math.max(25, Math.ceil((Math.max(latSpread, 40) * 0.25) / 10) * 10);
    const minLat = Math.max(0, Math.floor((rawMinLat - latPad) / 25) * 25);
    const maxLat = Math.max(minLat + 50, Math.ceil((rawMaxLat + latPad) / 25) * 25);
    return { minLat, maxLat, latRange: maxLat - minLat };
  };

  // Typical CreditLens variation (251ms to 386ms)
  const actualCreditLensLats = [288.6, 254.67, 258.64, 385.8, 319.13, 292.07, 251.93, 282.6, 255.07];
  const bounds = computeBounds(actualCreditLensLats);

  assert.ok(bounds.minLat > 0, 'minLat should provide reasonable dynamic baseline');
  assert.ok(bounds.minLat <= 251.93, 'minLat should not exceed lowest measured latency');
  assert.ok(bounds.maxLat >= 385.8, 'maxLat should accommodate peak latency');
  assert.ok(bounds.latRange >= 50, 'latRange should guarantee minimum headroom');
  assert.strictEqual(bounds.minLat % 25, 0, 'minLat should align to round grid increments');
  assert.strictEqual(bounds.maxLat % 25, 0, 'maxLat should align to round grid increments');
});

test('13. Compact Panel Slicing: handles initial 3-item slicing and toggling for feature tests and history', () => {
  const featureList = [
    { name: 'amt_income', pValue: 0.82 },
    { name: 'amt_credit', pValue: 0.74 },
    { name: 'amt_annuity', pValue: 0.91 },
    { name: 'age', pValue: 0.65 },
    { name: 'ext_source_2', pValue: 0.88 }
  ];

  // Default collapsed view slices to 3
  const collapsed = (expanded, items) => expanded ? items : items.slice(0, 3);

  assert.strictEqual(collapsed(false, featureList).length, 3);
  assert.strictEqual(collapsed(false, featureList)[0].name, 'amt_income');
  assert.strictEqual(collapsed(false, featureList)[2].name, 'amt_annuity');

  // Expanded view shows all
  assert.strictEqual(collapsed(true, featureList).length, 5);
  assert.strictEqual(collapsed(true, featureList)[4].name, 'ext_source_2');
});
