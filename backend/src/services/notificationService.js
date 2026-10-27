import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { recordAuditEvent } from './auditEngine.js';

/**
 * Validates and sanitizes destination URL, ensuring only safe internal application routes are accepted.
 */
export function sanitizeTargetUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '/app';
  const trimmed = rawUrl.trim();

  // Reject external protocols, protocol-relative URLs, javascript, and data URIs
  if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.toLowerCase().startsWith('javascript:') ||
    trimmed.toLowerCase().startsWith('data:')
  ) {
    return '/app';
  }

  // Must start with an internal SPA route slash
  if (!trimmed.startsWith('/')) {
    return `/${trimmed}`;
  }

  return trimmed;
}

/**
 * Dispatches an enterprise governance notification to a specific user or an eligible role group.
 * Strictly notifies active, verified users and excludes the acting user from their own action.
 */
export async function dispatchNotification({
  recipientUserId = null,
  recipientRole = null,
  excludeUserId = null,
  title,
  message,
  type = 'SYSTEM',
  severity = 'INFO',
  targetUrl = null,
  modelId = null,
  versionId = null,
  incidentId = null,
  reportId = null,
  approvalId = null,
  issueId = null,
  idempotencyKey = null,
  metadata = {},
  actor = 'System Governance Dispatcher'
}) {
  if (!title || !message) {
    throw new Error('Notification requires title and message');
  }

  const cleanTargetUrl = targetUrl ? sanitizeTargetUrl(targetUrl) : null;
  const createdNotifications = [];

  // Helper to record audit trail safely without blocking delivery
  const auditDispatch = async (notif) => {
    try {
      await recordAuditEvent({
        actor: typeof actor === 'string' ? actor : (actor?.name || actor?.email || 'System'),
        role: 'SYSTEM',
        action: 'NOTIFICATION_SENT',
        entityType: 'Notification',
        entityId: notif._id.toString(),
        payload: {
          recipientUserId: notif.userId ? String(notif.userId) : null,
          recipientRole: notif.recipientRole,
          type: notif.type,
          severity: notif.severity,
          title: notif.title,
          targetUrl: notif.targetUrl
        }
      });
    } catch (auditErr) {
      console.warn('[NotificationService] Audit logging warning:', auditErr.message);
    }
  };

  // Case 1: Direct delivery to a specific user
  if (recipientUserId) {
    const excludeStr = excludeUserId ? String(excludeUserId) : null;
    if (excludeStr && String(recipientUserId) === excludeStr) {
      return []; // Skip notifying acting user about their own action
    }

    const recipient = await User.findById(recipientUserId);
    if (!recipient || recipient.status === 'SUSPENDED') {
      return []; // Do not deliver to inactive or suspended accounts
    }

    const directKey = idempotencyKey ? `${idempotencyKey}_${recipient._id}` : null;
    if (directKey) {
      const existing = await Notification.findOne({ idempotencyKey: directKey });
      if (existing) return [existing];
    }

    try {
      const notif = await Notification.create({
        userId: recipient._id,
        recipientRole: recipient.role,
        title,
        message,
        type,
        severity,
        targetUrl: cleanTargetUrl,
        modelId,
        versionId,
        incidentId,
        reportId,
        approvalId,
        issueId,
        idempotencyKey: directKey,
        metadata
      });

      await auditDispatch(notif);
      return [notif];
    } catch (createErr) {
      if (createErr.code === 11000) {
        // Idempotency duplicate caught
        const dup = await Notification.findOne({ idempotencyKey: directKey });
        return dup ? [dup] : [];
      }
      throw createErr;
    }
  }

  // Case 2: Role-based delivery to all eligible users in the relevant role
  if (recipientRole) {
    const roleQuery = recipientRole === 'ALL'
      ? { status: 'ACTIVE' }
      : { role: recipientRole, status: 'ACTIVE' };

    const eligibleUsers = await User.find(roleQuery);
    const excludeStr = excludeUserId ? String(excludeUserId) : null;

    for (const u of eligibleUsers) {
      if (excludeStr && String(u._id) === excludeStr) {
        continue;
      }
      // Ensure account is not pending or suspended
      if (u.status !== 'ACTIVE') {
        continue;
      }

      const userKey = idempotencyKey ? `${idempotencyKey}_${u._id}` : null;
      if (userKey) {
        const existing = await Notification.findOne({ idempotencyKey: userKey });
        if (existing) {
          createdNotifications.push(existing);
          continue;
        }
      }

      try {
        const notif = await Notification.create({
          userId: u._id,
          recipientRole: u.role,
          title,
          message,
          type,
          severity,
          targetUrl: cleanTargetUrl,
          modelId,
          versionId,
          incidentId,
          reportId,
          approvalId,
          issueId,
          idempotencyKey: userKey,
          metadata
        });

        await auditDispatch(notif);
        createdNotifications.push(notif);
      } catch (err) {
        if (err.code === 11000 && userKey) {
          const dup = await Notification.findOne({ idempotencyKey: userKey });
          if (dup) createdNotifications.push(dup);
        } else {
          console.warn(`[NotificationService] Failed to dispatch to user ${u._id}:`, err.message);
        }
      }
    }

    return createdNotifications;
  }

  return [];
}

/**
 * Returns notifications belonging to the authenticated user.
 */
export async function getUserNotifications(user, options = {}) {
  if (!user || !user._id) {
    throw new Error('Authenticated user context is required to query notifications');
  }

  const { filter = 'all', limit = 40 } = options;
  const userCondition = {
    $or: [
      { userId: user._id },
      { userId: null, recipientRole: { $in: [user.role, 'ALL'] } }
    ]
  };

  const query = { ...userCondition };
  if (filter === 'unread') {
    query.read = false;
  }

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(query).sort({ createdAt: -1 }).limit(Number(limit) || 40),
    Notification.countDocuments({ ...userCondition, read: false })
  ]);

  return {
    notifications,
    unreadCount,
    totalCount: notifications.length
  };
}

/**
 * Marks a notification as read with strict per-user ownership verification.
 */
export async function markNotificationAsRead(notificationId, user) {
  if (!user || !user._id) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }

  // Cross-user ownership protection:
  // If the notification has a specific userId, it must match the authenticated user.
  if (notification.userId && notification.userId.toString() !== user._id.toString()) {
    const err = new Error('Forbidden: You do not have permission to modify another user\'s notification.');
    err.statusCode = 403;
    throw err;
  }

  // For legacy notifications with userId = null, ensure the user has matching role
  if (!notification.userId && notification.recipientRole !== 'ALL' && notification.recipientRole !== user.role) {
    const err = new Error('Forbidden: Notification role mismatch.');
    err.statusCode = 403;
    throw err;
  }

  notification.read = true;
  notification.readAt = new Date();
  await notification.save();

  return notification;
}

/**
 * Marks all unread notifications belonging to the authenticated user as read.
 */
export async function markAllNotificationsAsRead(user) {
  if (!user || !user._id) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }

  const query = {
    $or: [
      { userId: user._id, read: false },
      { userId: null, recipientRole: { $in: [user.role, 'ALL'] }, read: false }
    ]
  };

  const result = await Notification.updateMany(query, {
    $set: { read: true, readAt: new Date() }
  });

  return {
    success: true,
    modifiedCount: result.modifiedCount
  };
}
