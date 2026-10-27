import * as xlsx from 'xlsx';
import { evaluateModelMetrics, calculateRate, calculateRocAuc } from './fairnessEngine.js';

/**
 * Standard binary label parser.
 * Maps binary synonyms to 1 (positive) or 0 (negative).
 * Returns null for missing or invalid values.
 */
export function parseBinaryLabel(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') {
    if (val === 1) return 1;
    if (val === 0) return 0;
    return null;
  }
  const str = String(val).trim().toLowerCase();
  if (['1', 'true', 'yes', 'positive', 'approved', 'pass', 'default', 'high', 'good'].includes(str)) return 1;
  if (['0', 'false', 'no', 'negative', 'rejected', 'fail', 'non-default', 'low', 'bad'].includes(str)) return 0;
  return null;
}

/**
 * Parses and validates an uploaded CSV or XLSX evaluation dataset.
 * Computes performance and fairness metrics safely in memory.
 */
export function parseAndValidateEvaluationFile({
  buffer,
  filename = 'uploaded_dataset.csv',
  datasetName = null,
  protectedAttribute = null,
  privilegedGroup = null,
  unprivilegedGroup = null
}) {
  if (!buffer || buffer.length === 0) {
    return { error: 'Uploaded file is empty.' };
  }

  const ext = (filename || '').split('.').pop().toLowerCase();
  if (ext !== 'csv' && ext !== 'xlsx') {
    return { error: `Unsupported file extension .${ext}. Only .csv and .xlsx files are supported.` };
  }

  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  } catch (err) {
    return { error: 'Failed to parse file: file is malformed or corrupted.' };
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return { error: 'Spreadsheet contains no worksheets.' };
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: null });

  if (!rawRows || rawRows.length === 0) {
    return { error: 'Uploaded file contains no data rows.' };
  }

  if (rawRows.length < 10) {
    return { error: 'Insufficient sample count. Dataset must contain at least 10 rows for statistical evaluation.' };
  }

  // Header validation & normalization
  const sampleRow = rawRows[0];
  const keys = Object.keys(sampleRow).map(k => k.trim());

  const actualKey = keys.find(k => /^(actual|ground_truth|groundtruth|label|target|y_true|ytrue|actual_label)$/i.test(k));
  const predictedKey = keys.find(k => /^(predicted|prediction|pred|y_pred|ypred|predicted_label)$/i.test(k));
  // Canonical continuous score/probability column detection
  const scoreKey = keys.find(k => /^(probability|prediction_score|predicted_probability|score|prob|pred_prob|y_score|y_prob)$/i.test(k));

  if (!actualKey) {
    return { error: 'Missing required column: "actual" (or "label", "ground_truth", "target").' };
  }
  if (!predictedKey) {
    return { error: 'Missing required column: "predicted" (or "prediction", "pred").' };
  }

  // Protected attribute column detection
  let activeProtectedKey = null;
  if (protectedAttribute && protectedAttribute.trim() !== '' && protectedAttribute.toUpperCase() !== 'NONE') {
    activeProtectedKey = keys.find(k => k.toLowerCase() === protectedAttribute.trim().toLowerCase()) || null;
    if (!activeProtectedKey) {
      return { error: `Specified protected attribute column "${protectedAttribute}" was not found in the uploaded dataset.` };
    }
  } else {
    // Auto-detect common statutory protected attributes (prioritize categorical attributes over numeric age)
    const preferredAttributes = ['gender', 'sex', 'race', 'ethnicity', 'disability', 'nationality', 'age'];
    const matchedAttr = preferredAttributes.find(p => keys.some(k => k.toLowerCase() === p));
    activeProtectedKey = matchedAttr ? keys.find(k => k.toLowerCase() === matchedAttr) : null;
  }

  // Row validation & parsing
  const invalidRowIndices = [];
  const invalidScoreIndices = [];
  const parsedRows = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const act = parseBinaryLabel(row[actualKey]);
    const pred = parseBinaryLabel(row[predictedKey]);

    let scoreVal = null;
    if (scoreKey) {
      const rawScore = row[scoreKey];
      if (rawScore === null || rawScore === undefined || rawScore === '') {
        invalidScoreIndices.push(i + 2);
      } else {
        const num = Number(rawScore);
        if (isNaN(num) || !isFinite(num) || num < 0 || num > 1) {
          invalidScoreIndices.push(i + 2);
        } else {
          scoreVal = num;
        }
      }
    }

    if (act === null || pred === null) {
      invalidRowIndices.push(i + 2); // 1-based index including header
    } else {
      parsedRows.push({
        actual: act,
        predicted: pred,
        score: scoreVal,
        protectedVal: activeProtectedKey ? String(row[activeProtectedKey] ?? '').trim() : null
      });
    }
  }

  if (invalidRowIndices.length > 0) {
    const sample = invalidRowIndices.slice(0, 5).join(', ');
    const more = invalidRowIndices.length > 5 ? '...' : '';
    return {
      error: `Invalid classification labels in ${invalidRowIndices.length} row(s) (rows: ${sample}${more}). Values for "${actualKey}" and "${predictedKey}" must be binary labels (e.g. 0/1, true/false, yes/no).`
    };
  }

  if (invalidScoreIndices.length > 0) {
    const sample = invalidScoreIndices.slice(0, 5).join(', ');
    const more = invalidScoreIndices.length > 5 ? '...' : '';
    return {
      error: `Invalid prediction score/probability in ${invalidScoreIndices.length} row(s) (rows: ${sample}${more}). Values for "${scoreKey}" must be numeric probabilities between 0.0 and 1.0.`
    };
  }

  // Calculate conventional ROC-AUC if continuous prediction scores/probabilities were provided
  let computedRocAuc = null;
  if (scoreKey) {
    const actuals = parsedRows.map(r => r.actual);
    const scores = parsedRows.map(r => r.score);
    computedRocAuc = calculateRocAuc(actuals, scores);
  }

  // Group fairness determination
  let hasFairness = false;
  let privGroup = privilegedGroup;
  let unprivGroup = unprivilegedGroup;
  let evalResult;

  if (activeProtectedKey) {
    const distinctGroups = Array.from(new Set(parsedRows.map(r => r.protectedVal).filter(Boolean)));
    if (distinctGroups.length >= 2) {
      if (privGroup) {
        const foundPriv = distinctGroups.find(g => g.toLowerCase() === privGroup.trim().toLowerCase());
        if (!foundPriv) {
          return {
            error: `Privileged group "${privGroup}" not found in column "${activeProtectedKey}". Available groups: ${distinctGroups.join(', ')}`
          };
        }
        privGroup = foundPriv;
      } else {
        privGroup = distinctGroups[0];
      }

      if (unprivGroup) {
        const foundUnpriv = distinctGroups.find(g => g.toLowerCase() === unprivGroup.trim().toLowerCase());
        if (foundUnpriv) unprivGroup = foundUnpriv;
        else unprivGroup = distinctGroups.find(g => g !== privGroup) || 'Others';
      } else {
        unprivGroup = distinctGroups.find(g => g !== privGroup) || 'Others';
      }

      const counts = {
        privileged: { total: 0, positive: 0, tp: 0, fp: 0, fn: 0, tn: 0 },
        unprivileged: { total: 0, positive: 0, tp: 0, fp: 0, fn: 0, tn: 0 }
      };

      for (const row of parsedRows) {
        const isPriv = row.protectedVal.toLowerCase() === privGroup.toLowerCase();
        const target = isPriv ? counts.privileged : counts.unprivileged;
        target.total++;
        if (row.predicted === 1) target.positive++;
        if (row.actual === 1 && row.predicted === 1) target.tp++;
        if (row.actual === 0 && row.predicted === 1) target.fp++;
        if (row.actual === 1 && row.predicted === 0) target.fn++;
        if (row.actual === 0 && row.predicted === 0) target.tn++;
      }

      if (counts.privileged.total > 0 && counts.unprivileged.total > 0) {
        hasFairness = true;
        evalResult = evaluateModelMetrics({
          datasetName: datasetName || filename,
          sampleCount: parsedRows.length,
          protectedAttribute: activeProtectedKey,
          privilegedGroup: privGroup,
          unprivilegedGroup: unprivGroup,
          rocAuc: computedRocAuc,
          counts
        });
        evalResult.fairnessMetrics.fairnessEvaluated = true;
      }
    }
  }

  // Fallback: If no protected attribute is provided or group counts insufficient
  if (!hasFairness) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let tn = 0;
    let positive = 0;
    const total = parsedRows.length;

    for (const row of parsedRows) {
      if (row.predicted === 1) positive++;
      if (row.actual === 1 && row.predicted === 1) tp++;
      if (row.actual === 0 && row.predicted === 1) fp++;
      if (row.actual === 1 && row.predicted === 0) fn++;
      if (row.actual === 0 && row.predicted === 0) tn++;
    }

    const accuracy = calculateRate(tp + tn, total);
    const precision = calculateRate(tp, tp + fp);
    const recall = calculateRate(tp, tp + fn);
    const f1 = Number(((2 * precision * recall) / (precision + recall || 1)).toFixed(4));
    const fpr = calculateRate(fp, fp + tn);
    const tpr = calculateRate(tp, tp + fn);
    const rocAuc = computedRocAuc;

    evalResult = {
      datasetName: datasetName || filename,
      sampleCount: total,
      performanceMetrics: {
        accuracy,
        precision,
        recall,
        f1,
        rocAuc
      },
      fairnessMetrics: {
        protectedAttribute: 'NONE',
        privilegedGroup: 'N/A',
        unprivilegedGroup: 'N/A',
        disparateImpactRatio: 0,
        demographicParityDiff: 0,
        fairnessEvaluated: false,
        equalizedOdds: {
          privilegedTPR: tpr,
          unprivilegedTPR: tpr,
          tprDiff: 0,
          privilegedFPR: fpr,
          unprivilegedFPR: fpr,
          fprDiff: 0
        },
        groupStats: {
          privileged: { total, positivePredictions: positive, selectionRate: calculateRate(positive, total) },
          unprivileged: { total: 0, positivePredictions: 0, selectionRate: 0 }
        }
      }
    };
  }

  return {
    success: true,
    datasetName: datasetName || filename,
    sampleCount: parsedRows.length,
    performanceMetrics: evalResult.performanceMetrics,
    fairnessMetrics: evalResult.fairnessMetrics,
    hasFairness
  };
}
