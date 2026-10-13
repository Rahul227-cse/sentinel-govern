import { Incident } from '../models/Incident.js';
import { executeRollback } from '../services/incidentService.js';
import { recordAuditEvent } from '../services/auditEngine.js';

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
      rationale = 'Governance Incident Rollback'
    } = req.body;

    const actor = req.user ? (req.user.name || req.user.email) : (req.body.actor || 'ML Lead');
    const role = req.user ? req.user.role : (req.body.role || 'ML_LEAD');

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
      rationale
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
}
