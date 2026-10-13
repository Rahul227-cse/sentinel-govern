import express from 'express';
import * as adminCtrl from '../controllers/adminController.js';
import { authenticateToken, requireActiveUser, requireRole } from '../middleware/authMiddleware.js';

import mongoose from 'mongoose';

const router = express.Router();

// Parameter format validation for ObjectIds across admin routes
router.param('id', (req, res, next, id) => {
  if (id && !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: `Invalid user ID format: "${id}". Must be a valid 24-character hexadecimal ObjectId.`
    });
  }
  next();
});

// All administrative routes require an active PLATFORM_ADMIN
router.use(authenticateToken, requireActiveUser, requireRole('PLATFORM_ADMIN'));

router.get('/users', adminCtrl.getUsers);
router.patch('/users/:id/role', adminCtrl.updateUserRole);
router.patch('/users/:id/status', adminCtrl.updateUserStatus);
router.patch('/users/:id/verify', adminCtrl.verifyUser);
router.patch('/users/:id/block', adminCtrl.blockUser);
router.patch('/users/:id/unblock', adminCtrl.unblockUser);

export default router;
