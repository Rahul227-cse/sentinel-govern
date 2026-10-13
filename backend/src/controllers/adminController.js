import { User } from '../models/User.js';
import { recordAuditEvent } from '../services/auditEngine.js';

/**
 * GET /api/admin/users
 * Returns list of platform users with role and status information.
 */
export async function getUsers(req, res) {
  try {
    const { role, status, search } = req.query || {};
    const filter = {};

    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('-__v')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PATCH /api/admin/users/:id/role
 * Assigns an application role to an Aegis user.
 */
export async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role, title } = req.body;

    const validRoles = [
      'PLATFORM_ADMIN',
      'ML_LEAD',
      'GOVERNANCE_OFFICER',
      'EXECUTIVE_APPROVER'
    ];

    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Safety check: Prevent removing the last active PLATFORM_ADMIN
    if (targetUser.role === 'PLATFORM_ADMIN' && role !== 'PLATFORM_ADMIN') {
      const adminCount = await User.countDocuments({ role: 'PLATFORM_ADMIN', status: 'ACTIVE' });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Cannot demote the last remaining active Platform Administrator.'
        });
      }
    }

    const previousRole = targetUser.role;
    targetUser.role = role;
    if (title) targetUser.title = title;
    await targetUser.save();

    // Record immutable audit event
    await recordAuditEvent({
      actor: req.user.email,
      role: req.user.role,
      action: 'ROLE_ASSIGNED',
      entityType: 'User',
      entityId: targetUser._id.toString(),
      payload: {
        targetEmail: targetUser.email,
        previousRole,
        assignedRole: role,
        assignedBy: req.user.email
      }
    });

    return res.json({
      success: true,
      message: `Role updated to ${role} successfully.`,
      data: targetUser
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PATCH /api/admin/users/:id/status
 * Updates user lifecycle status (ACTIVE, SUSPENDED, PENDING).
 */
export async function updateUserStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['PENDING', 'ACTIVE', 'SUSPENDED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Safety check: Prevent self-suspension
    if (targetUser._id.toString() === req.user._id.toString() && status === 'SUSPENDED') {
      return res.status(400).json({
        success: false,
        error: 'Administrators cannot suspend their own active account.'
      });
    }

    const previousStatus = targetUser.status;
    targetUser.status = status;
    await targetUser.save();

    // Record immutable audit event
    await recordAuditEvent({
      actor: req.user.email,
      role: req.user.role,
      action: 'USER_STATUS_CHANGED',
      entityType: 'User',
      entityId: targetUser._id.toString(),
      payload: {
        targetEmail: targetUser.email,
        previousStatus,
        newStatus: status,
        updatedBy: req.user.email
      }
    });

    return res.json({
      success: true,
      message: `User status changed from ${previousStatus} to ${status}.`,
      data: targetUser
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PATCH /api/admin/users/:id/verify
 * Approves and verifies a pending user account.
 * Note: Role is chosen during onboarding and is NOT changed by verification.
 */
export async function verifyUser(req, res) {
  try {
    const { id } = req.params;

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    targetUser.verificationStatus = 'VERIFIED';
    targetUser.verifiedBy = req.user.email;
    targetUser.verifiedAt = new Date();
    await targetUser.save();

    await recordAuditEvent({
      actor: req.user.email,
      role: req.user.role,
      action: 'USER_VERIFIED',
      entityType: 'User',
      entityId: targetUser._id.toString(),
      payload: {
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        verifiedBy: req.user.email
      }
    });

    return res.json({
      success: true,
      message: `User ${targetUser.email} has been verified successfully.`,
      user: targetUser,
      data: targetUser
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PATCH /api/admin/users/:id/block
 * Suspends an account and sets presence to OFFLINE.
 */
export async function blockUser(req, res) {
  try {
    const { id } = req.params;

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const currentUserId = (req.user?._id || req.user?.id)?.toString();
    if (currentUserId && targetUser._id.toString() === currentUserId) {
      return res.status(400).json({
        success: false,
        error: 'Administrators cannot block their own active account.'
      });
    }

    const previousStatus = targetUser.status;
    targetUser.status = 'SUSPENDED';
    targetUser.presence = 'OFFLINE';
    await targetUser.save();

    await recordAuditEvent({
      actor: req.user.email,
      role: req.user.role,
      action: 'USER_BLOCKED',
      entityType: 'User',
      entityId: targetUser._id.toString(),
      payload: {
        targetEmail: targetUser.email,
        previousStatus,
        newStatus: 'SUSPENDED',
        blockedBy: req.user.email
      }
    });

    return res.json({
      success: true,
      message: `User ${targetUser.email} has been suspended/blocked.`,
      user: targetUser,
      data: targetUser
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * PATCH /api/admin/users/:id/unblock
 * Restores a suspended account to ACTIVE.
 */
export async function unblockUser(req, res) {
  try {
    const { id } = req.params;

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const previousStatus = targetUser.status;
    targetUser.status = 'ACTIVE';
    await targetUser.save();

    await recordAuditEvent({
      actor: req.user.email,
      role: req.user.role,
      action: 'USER_UNBLOCKED',
      entityType: 'User',
      entityId: targetUser._id.toString(),
      payload: {
        targetEmail: targetUser.email,
        previousStatus,
        newStatus: 'ACTIVE',
        unblockedBy: req.user.email
      }
    });

    return res.json({
      success: true,
      message: `User ${targetUser.email} has been restored to active status.`,
      user: targetUser,
      data: targetUser
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
