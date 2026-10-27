import { Incident } from '../models/Incident.js';
import { executeRollback } from '../services/incidentService.js';
import { recordAuditEvent } from '../services/auditEngine.js';
import { 
  getUserNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead 
} from '../services/notificationService.js';

export async function getIncidents(req, res) {
  try {
    const { status, modelId, severity } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (modelId) filter.modelId = modelId;
    if (severity) filter.severity = severity;

    const incidents = await Incident.find(filter)
      .populate('modelId')
      .populate('versionId')
      .populate('recommendedRollbackVersionId')
      .populate('issueReportRef')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: incidents.length, data: incidents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getIncidentById(req, res) {
  try {
    const incident = await Incident.findById(req.params.id)
      .populate('modelId')
      .populate('versionId')
      .populate('recommendedRollbackVersionId')
      .populate('issueReportRef');

    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    res.json({ success: true, data: incident });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function updateIncidentStatus(req, res) {
  try {
    const { status, mitigationNotes } = req.body;
    const actor = req.user ? (req.user.name || req.user.email) : (req.body.actor || 'Incident Responder');
    const role = req.user ? req.user.role : (req.body.role || 'ML_LEAD');
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ success: false, error: 'Incident not found' });
    }

    if (status) incident.status = status;
    if (mitigationNotes) incident.mitigationNotes = mitigationNotes;

    if (['MITIGATED', 'CLOSED'].includes(status)) {
      incident.resolvedAt = new Date();
      incident.resolvedBy = actor;
    }

    await incident.save();

    await recordAuditEvent({
      actor,
      role,
      action: 'INCIDENT_STATUS_UPDATED',
      entityType: 'Incident',
      entityId: incident._id,
      payload: {
        modelId: String(incident.modelId),
        versionId: incident.versionId ? String(incident.versionId) : null,
        incidentId: String(incident._id),
        incidentNumber: incident.incidentNumber,
        newStatus: incident.status,
        mitigationNotes: incident.mitigationNotes
      }
    });

    if (['MITIGATED', 'CLOSED'].includes(status)) {
      try {
        const { dispatchNotification } = await import('../services/notificationService.js');
        await dispatchNotification({
          recipientRole: 'ML_LEAD',
          excludeUserId: req.user?._id,
          title: `Incident ${incident.incidentNumber} ${status.toLowerCase()}`,
          message: `Incident ${incident.incidentNumber} for "${incident.title}" has been marked as ${status} by ${actor}.`,
          type: 'SYSTEM',
          severity: 'INFO',
          targetUrl: '/app/incidents',
          incidentId: incident._id,
          idempotencyKey: `incident_mitigated_${incident._id}_${status}`,
          actor
        });
      } catch (notifErr) {
        console.warn('[Notification] Incident status update notification warning:', notifErr.message);
      }
    }


    res.json({ success: true, data: incident });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function rollbackModel(req, res) {
  try {
    const {
      incidentId,
      modelId,
      targetVersionId,
      rationale
    } = req.body;

    const actor = req.user ? (req.user.name || req.user.email) : (req.body.actor || 'ML Lead');
    const role = req.user ? req.user.role : (req.body.role || 'ML_LEAD');

    if (role !== 'ML_LEAD' && role !== 'PLATFORM_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Only ML Lead or Platform Admin can execute a model rollback.'
      });
    }

    if (!rationale || typeof rationale !== 'string' || !rationale.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Rollback rationale is required and cannot be empty.'
      });
    }

    if (!modelId || !targetVersionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: modelId, targetVersionId'
      });
    }

    const result = await executeRollback({
      incidentId,
      modelId,
      targetVersionId,
      actor,
      role,
      rationale: rationale.trim()
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}

export async function getNotifications(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const filter = req.query.filter || 'all';
    const limit = req.query.limit || 40;
    const result = await getUserNotifications(req.user, { filter, limit });
    res.json({
      success: true,
      count: result.totalCount,
      unreadCount: result.unreadCount,
      data: result.notifications
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
}

export async function markNotificationRead(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { id } = req.params;
    const notif = await markNotificationAsRead(id, req.user);
    res.json({ success: true, data: notif });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
}

export async function markAllNotificationsRead(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const result = await markAllNotificationsAsRead(req.user);
    res.json({ success: true, data: result });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
}
