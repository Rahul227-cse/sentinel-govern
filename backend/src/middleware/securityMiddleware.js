import mongoose from 'mongoose';

/**
 * Security Headers Middleware:
 * Applies industry-standard HTTP security headers to protect against
 * MIME-sniffing, clickjacking, and cross-site leaks while ensuring compatibility
 * with Google Identity Services (GIS) popups.
 */
export function securityHeaders(req, res, next) {
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking via iframes
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Disable obsolete legacy XSS filter that introduces vulnerabilities
  res.setHeader('X-XSS-Protection', '0');

  // Control referrer information leakage
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permit Google Identity Services popups while restricting cross-origin openers
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // Restrict browser device features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Enforce HTTPS in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

/**
 * MongoDB ObjectId Parameter Validation Middleware:
 * Inspects specified route parameter names and rejects malformed values with HTTP 400 Bad Request
 * before database queries are initiated.
 *
 * @param {...string} paramNames - Route parameter names to validate (e.g. 'id', 'modelId', 'versionId')
 */
export function validateObjectIdParam(...paramNames) {
  return (req, res, next) => {
    for (const name of paramNames) {
      const value = req.params[name];
      if (value && !mongoose.Types.ObjectId.isValid(value)) {
        return res.status(400).json({
          success: false,
          error: `Invalid identifier format for parameter "${name}". Must be a valid 24-character hexadecimal ObjectId.`
        });
      }
    }
    next();
  };
}

/**
 * Lightweight In-Memory Sliding-Window Rate Limiter:
 * Protects security-sensitive endpoints (such as Google Authentication and login routes)
 * against brute-force and denial-of-service abuse.
 *
 * Does not require external infrastructure (e.g. Redis).
 * Automatically bypassed during automated unit/integration tests unless 'x-test-rate-limit' header is present.
 */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000, // 15-minute sliding window
  max = 50,                   // 50 requests per window
  message = 'Too many authentication attempts. Please try again later.'
} = {}) {
  const store = new Map();

  // Periodic garbage collection of expired IP buckets
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store.entries()) {
      if (entry.resetTime <= now) {
        store.delete(ip);
      }
    }
  }, Math.min(windowMs, 60000));

  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return (req, res, next) => {
    // Skip rate limiting during test executions unless explicitly exercising rate limit tests
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    const ip = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'] || '127.0.0.1';
    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || entry.resetTime <= now) {
      entry = { count: 1, resetTime: now + windowMs };
      store.set(ip, entry);
    } else {
      entry.count += 1;
    }

    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (entry.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(429).json({
        success: false,
        error: message,
        retryAfter: resetSeconds
      });
    }

    next();
  };
}
