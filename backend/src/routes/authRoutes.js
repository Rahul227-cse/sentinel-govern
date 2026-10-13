import express from 'express';
import * as authCtrl from '../controllers/authController.js';
import { authenticateToken, optionalAuth } from '../middleware/authMiddleware.js';
import { createRateLimiter } from '../middleware/securityMiddleware.js';

const router = express.Router();

// ─── Rate Limiters ────────────────────────────────────────────────────────────

// Standard auth rate limit: 50 attempts per 15 minutes
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many authentication attempts from this IP address. Please try again later.'
});

// Stricter limit for login/signup: 20 attempts per 15 minutes
const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts from this IP address. Please try again later.'
});

// Very strict for password reset flows: 5 per 60 minutes
const resetRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please wait before trying again.'
});

// ─── Public Routes ────────────────────────────────────────────────────────────

// Google Identity Services Sign-In
router.post('/google', authRateLimiter, authCtrl.googleAuth);

// Native Email/Password Registration
router.post('/signup', loginRateLimiter, authCtrl.nativeSignup);

// Native Email/Password Login
router.post('/login', loginRateLimiter, authCtrl.nativeLogin);

// Access Token Refresh (uses HttpOnly refresh cookie)
router.post('/refresh', authCtrl.refreshAccessToken);

// Password recovery
router.post('/forgot-password', resetRateLimiter, authCtrl.forgotPassword);
router.post('/reset-password', resetRateLimiter, authCtrl.resetPassword);

// ─── Authenticated Routes ─────────────────────────────────────────────────────

// Current user profile
router.get('/me', authenticateToken, authCtrl.getCurrentUser);

// Complete onboarding flow (role, department, team, team lead)
router.post('/onboarding', authenticateToken, authCtrl.completeOnboarding);

// Session logout (revokes refresh token cookie and marks offline)
router.post('/logout', optionalAuth, authCtrl.logout);

export default router;
