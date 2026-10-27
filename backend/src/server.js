import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { connectDB, getDatabaseStatus } from './config/db.js';
import apiRouter from './routes/api.js';
import { securityHeaders } from './middleware/securityMiddleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Apply HTTP security headers
app.use(securityHeaders);

// CORS Configuration: enforce specific allowed origins, avoid wildcard with credentials
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. server-to-server, curl, tests) with no origin header
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:'))) {
      return callback(null, true);
    }
    const msg = `CORS rejected: Origin "${origin}" is not permitted by Sentinel Govern security policy.`;
    return callback(new Error(msg), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'x-sentinel-api-key']
}));

// Cookie parser (required for HttpOnly refresh token cookies)
app.use(cookieParser());

// Body parser with sane payload size limit
app.use(express.json({ limit: '2mb' }));

// Handle malformed JSON request bodies
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Malformed JSON payload in request body.'
    });
  }
  next(err);
});

// Request logging in dev
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[API] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// Health check endpoint (support both /health and /api/health)
const handleHealthCheck = (req, res) => {
  const dbStatus = getDatabaseStatus();
  const isHealthy = dbStatus.connected;

  const payload = {
    status: isHealthy ? 'HEALTHY' : 'UNHEALTHY',
    service: 'Enterprise AI Governance Platform API',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus.connected ? 'CONNECTED' : 'DISCONNECTED',
      name: dbStatus.databaseName,
      storageMode: dbStatus.storageMode,
      isMemory: dbStatus.isMemory,
      ready: dbStatus.connected
    }
  };

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json(payload);
};

app.get('/health', handleHealthCheck);
app.get('/api/health', handleHealthCheck);

// Mount consolidated REST routes
app.use('/api', apiRouter);

// 404 Handler for undefined API routes (ensures JSON response, never raw HTML)
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  // CORS rejection
  if (err.message && err.message.startsWith('CORS rejected:')) {
    return res.status(403).json({
      success: false,
      error: err.message
    });
  }

  // Mongoose CastError (invalid ObjectId or type casting error)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: `Invalid resource identifier format for "${err.path}": "${err.value}".`
    });
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: `Validation error: ${err.message}`
    });
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd && process.env.NODE_ENV !== 'test') {
    console.error('[Unhandled Error]', err);
  }

  const statusCode = err.status || err.statusCode || 500;
  const message = isProd ? 'Internal Server Error' : (err.message || 'Internal Server Error');

  res.status(statusCode).json({
    success: false,
    error: message
  });
});

import { monitoringScheduler } from './services/monitoringScheduler.js';

async function startServer() {
  try {
    await connectDB();

    const server = app.listen(PORT, async () => {
      console.log(`\n======================================================`);
      console.log(`🚀 AI Governance Control Plane API running on http://localhost:${PORT}`);
      console.log(`======================================================\n`);

      // Initialize automatic background monitoring scheduler (passive observation mode)
      try {
        await monitoringScheduler.start();
      } catch (schedErr) {
        console.warn('⚠️ [Scheduler Init Warning]:', schedErr.message);
      }
    });

    const shutdown = () => {
      console.log('\n[Server] Shutting down gracefully...');
      monitoringScheduler.stop();
      server.close(() => {
        console.log('[Server] HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
