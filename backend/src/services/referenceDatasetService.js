import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import * as xlsx from 'xlsx';
import mongoose from 'mongoose';

const LOCAL_STORAGE_DIR = process.env.DATASET_STORAGE_DIR || path.resolve(process.cwd(), 'uploads/reference_datasets');

// Ensure local fallback storage directory exists
try {
  fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
} catch {
  // Directory already exists or read-only environment
}

/**
 * Validates and parses an uploaded reference dataset buffer.
 */
export function parseAndValidateReferenceDataset({ buffer, filename }) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded reference dataset is empty.');
  }

  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error('Uploaded file exceeds maximum reference dataset size limit of 10 MB.');
  }

  const ext = (filename || '').split('.').pop().toLowerCase();
  if (ext !== 'csv' && ext !== 'xlsx') {
    throw new Error(`Unsupported file extension ".${ext}". Only .csv and .xlsx files are supported.`);
  }

  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  } catch (err) {
    throw new Error(`Malformed file: failed to parse spreadsheet: ${err.message}`);
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Spreadsheet contains no worksheets.');
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(worksheet, { defval: null });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('Uploaded dataset contains no data rows.');
  }

  if (rawRows.length < 5) {
    throw new Error('Insufficient sample count: dataset must contain at least 5 rows for statistical distribution monitoring.');
  }

  const sampleRow = rawRows[0];
  const allColumns = Object.keys(sampleRow).map(k => k.trim());
  if (allColumns.length === 0) {
    throw new Error('No column headers found in dataset.');
  }

  // Detect optional target column
  const targetRegex = /^(target|label|actual|ground_truth|y_true|class|outcome|default|is_fraud|probability_of_default)$/i;
  const targetColumn = allColumns.find(c => targetRegex.test(c)) || null;

  // Detect protected attributes
  const protectedRegex = /^(gender|sex|race|ethnicity|age|disability|nationality|zip_code)$/i;
  const protectedAttributes = allColumns.filter(c => protectedRegex.test(c));

  // Usable feature columns (exclude target and obvious metadata/ID columns)
  const metadataRegex = /^(_id|id|uuid|guid|created_?at|updated_?at|timestamp)$/i;
  const featureColumns = allColumns.filter(c => c !== targetColumn && !metadataRegex.test(c));

  if (featureColumns.length === 0 && !targetColumn) {
    throw new Error('Dataset contains no usable feature columns.');
  }

  // Compute column statistics
  const schemaStats = {};
  for (const col of allColumns) {
    const values = rawRows.map(r => r[col]).filter(v => v !== null && v !== undefined && v !== '');
    const numericVals = values.map(v => Number(v)).filter(v => !isNaN(v));

    if (numericVals.length > values.length * 0.7 && numericVals.length > 0) {
      // Treat as numeric
      const min = Math.min(...numericVals);
      const max = Math.max(...numericVals);
      const sum = numericVals.reduce((acc, v) => acc + v, 0);
      const mean = Number((sum / numericVals.length).toFixed(4));
      schemaStats[col] = {
        type: 'NUMERIC',
        count: numericVals.length,
        min,
        max,
        mean
      };
    } else {
      // Treat as categorical
      const distinct = new Set(values.map(String)).size;
      schemaStats[col] = {
        type: 'CATEGORICAL',
        count: values.length,
        distinctCount: distinct
      };
    }
  }

  // SHA-256 Checksum
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    filename,
    rowCount: rawRows.length,
    featureColumns,
    targetColumn,
    protectedAttributes,
    dataHash: `sha256-${hash}`,
    schemaStats,
    parsedRows: rawRows
  };
}

/**
 * Stores reference dataset buffer into MongoDB GridFS and a local durable fallback path.
 */
export async function storeReferenceDatasetDurable({ modelId, versionId, filename, buffer }) {
  let gridFsId = null;
  const safeFilename = path.basename(filename || 'reference_dataset.csv');
  const sanitizedModelId = String(modelId).replace(/[^a-zA-Z0-9_-]/g, '');
  const sanitizedVersionId = String(versionId).replace(/[^a-zA-Z0-9_-]/g, '');
  const localFileName = `${sanitizedModelId}_${sanitizedVersionId}_${safeFilename}`;
  const localFilePath = path.join(LOCAL_STORAGE_DIR, localFileName);

  // 1. Write to local fallback path
  try {
    fs.writeFileSync(localFilePath, buffer);
  } catch (err) {
    console.warn(`[DATASET_STORAGE] Local disk write warning: ${err.message}`);
  }

  // 2. Write to MongoDB GridFS if MongoDB connection is open
  if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.connection.db) {
    try {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'reference_datasets'
      });

      const uploadStream = bucket.openUploadStream(localFileName, {
        metadata: {
          modelId: String(modelId),
          versionId: String(versionId),
          originalFilename: safeFilename,
          uploadedAt: new Date()
        }
      });

      await new Promise((resolve, reject) => {
        uploadStream.on('finish', resolve);
        uploadStream.on('error', reject);
        uploadStream.end(buffer);
      });

      gridFsId = uploadStream.id;
    } catch (err) {
      console.warn(`[DATASET_STORAGE] GridFS upload warning: ${err.message}. Using local disk storage.`);
    }
  }

  return {
    gridFsId,
    storagePath: localFilePath
  };
}

/**
 * Retrieves reference dataset records for a ModelVersion.
 * Checks GridFS, local persistent storage, or bundled fallback CSV files.
 */
export async function retrieveReferenceDatasetRecords(version, model = null) {
  if (!version) return null;

  // 1. Try GridFS
  if (version.referenceDataset?.gridFsId && mongoose.connection?.readyState === 1 && mongoose.connection.db) {
    try {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: 'reference_datasets'
      });

      const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(version.referenceDataset.gridFsId));
      const chunks = [];

      const buffer = await new Promise((resolve, reject) => {
        downloadStream.on('data', chunk => chunks.push(chunk));
        downloadStream.on('end', () => resolve(Buffer.concat(chunks)));
        downloadStream.on('error', reject);
      });

      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    } catch (err) {
      console.warn(`[DATASET_STORAGE] GridFS retrieval failed: ${err.message}. Falling back.`);
    }
  }

  // 2. Try local storagePath
  if (version.referenceDataset?.storagePath && fs.existsSync(version.referenceDataset.storagePath)) {
    try {
      const buffer = fs.readFileSync(version.referenceDataset.storagePath);
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    } catch (err) {
      console.warn(`[DATASET_STORAGE] Local storagePath retrieval failed: ${err.message}. Falling back.`);
    }
  }

  // 3. Fallback to bundled reference CSVs
  let candidateFilenames = [];
  if (version.referenceDataset?.filename) {
    // Strictly search for the explicit filename associated with this version
    candidateFilenames = [version.referenceDataset.filename];
  } else {
    // Only for legacy demo models without an explicit reference dataset
    candidateFilenames = [
      /Credit/i.test(model?.name || '') ? 'credit_risk_v1_creditlens_demo_synthetic.csv' : null,
      /Credit/i.test(model?.name || '') ? 'reference_credit_risk.csv' : null,
      /Insurance/i.test(model?.name || '') ? 'reference_insurance.csv' : null,
      /Churn/i.test(model?.name || '') ? 'reference_churn.csv' : null,
      /Fraud/i.test(model?.name || '') ? 'reference_data.csv' : null
    ].filter(Boolean);
  }

  const searchDirs = [
    LOCAL_STORAGE_DIR,
    path.resolve(process.cwd(), 'uploads/reference_datasets'),
    path.resolve(process.cwd(), '../uploads/reference_datasets'),
    path.resolve(process.cwd(), 'services/monitoring'),
    path.resolve(process.cwd(), '../services/monitoring'),
    path.resolve(process.cwd(), 'services/monitoring/reports'),
    path.resolve(process.cwd(), '../services/monitoring/reports'),
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), '../data')
  ];

  for (const fname of candidateFilenames) {
    const cleanName = path.basename(fname);
    for (const dir of searchDirs) {
      if (!fs.existsSync(dir)) continue;

      // Check exact basename match
      const fullPath = path.join(dir, cleanName);
      if (fs.existsSync(fullPath)) {
        try {
          const buffer = fs.readFileSync(fullPath);
          const workbook = xlsx.read(buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
        } catch {}
      }

      // Check for prefixed files (e.g., <modelId>_<versionId>_<cleanName>)
      try {
        const files = fs.readdirSync(dir);
        const match = files.find(f => f.endsWith(`_${cleanName}`) || f === cleanName);
        if (match) {
          const buffer = fs.readFileSync(path.join(dir, match));
          const workbook = xlsx.read(buffer, { type: 'buffer' });
          const sheetName = workbook.SheetNames[0];
          return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
        }
      } catch {}
    }
  }

  return null;
}
