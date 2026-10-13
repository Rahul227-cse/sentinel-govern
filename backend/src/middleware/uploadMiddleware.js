import multer from 'multer';
import path from 'path';

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx'];
const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream'
];

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB limit
  },
  fileFilter: (req, file, cb) => {
    const originalName = file.originalname || '';
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error('Invalid file type. Only CSV and XLSX evaluation datasets are supported.'), false);
    }
    if (file.mimetype && !ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
      return cb(new Error(`Invalid MIME type "${file.mimetype}". Only CSV and XLSX evaluation datasets are supported.`), false);
    }
    // Sanitize against path traversal in original file name
    file.originalname = path.basename(originalName);
    cb(null, true);
  }
});

/**
 * Middleware wrapper to handle file uploads and return clean JSON errors on validation failures.
 */
export function handleFileUpload(fieldName = 'file') {
  const uploadSingle = upload.single(fieldName);

  return (req, res, next) => {
    uploadSingle(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: 'File size exceeds maximum allowed limit of 5MB.'
          });
        }
        return res.status(400).json({
          success: false,
          error: err.message || 'File upload error.'
        });
      }
      next();
    });
  };
}
