import express from 'express';
import * as modelCtrl from '../controllers/modelController.js';
import * as evalCtrl from '../controllers/evaluationController.js';
import * as policyCtrl from '../controllers/policyController.js';
import * as approvalCtrl from '../controllers/approvalController.js';
import * as telemetryCtrl from '../controllers/telemetryController.js';
import * as incidentCtrl from '../controllers/incidentController.js';
import * as issueCtrl from '../controllers/issueController.js';
import * as auditCtrl from '../controllers/auditController.js';
import * as dashboardCtrl from '../controllers/dashboardController.js';
import * as reportCtrl from '../controllers/reportController.js';
import authRoutes from './authRoutes.js';
import adminRoutes from './adminRoutes.js';
import { 
  authenticateToken, 
  requireActiveUser, 
  requireVerifiedUser,
  requireRole, 
  requirePermission,
  requireApprovalSignoffRole,
  requireDemoAuditEnabled, 
  optionalAuth,
  authenticateIngestion
} from '../middleware/authMiddleware.js';
import { PERMISSIONS } from '../config/permissions.js';
import { handleFileUpload } from '../middleware/uploadMiddleware.js';

import { Model } from '../models/Model.js';
import { ModelVersion } from '../models/ModelVersion.js';
import { Incident } from '../models/Incident.js';
import { Approval } from '../models/Approval.js';
import { Telemetry } from '../models/Telemetry.js';
import { AuditLedger } from '../models/AuditLedger.js';

import mongoose from 'mongoose';

const router = express.Router();

// Parameter format validation for ObjectIds across all API routes
const validateParamId = (paramName) => (req, res, next, id) => {
  if (id && !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      error: `Invalid identifier format for parameter "${paramName}": "${id}". Must be a valid 24-character hexadecimal ObjectId.`
    });
  }
  next();
};

router.param('id', validateParamId('id'));
router.param('modelId', validateParamId('modelId'));
router.param('versionId', validateParamId('versionId'));

// --- Authentication (Google OAuth & Session Profile) ---
router.use('/auth', authRoutes);

// --- Administration (Platform Admin Only) ---
router.use('/admin', adminRoutes);

// --- Dashboard KPI Overview ---
router.get('/dashboard/stats', optionalAuth, dashboardCtrl.getDashboardStats);

// --- Models & Versions ---
router.get('/models', optionalAuth, modelCtrl.getModels);
router.post('/models', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole('ML_LEAD'), modelCtrl.createModel);
router.get('/models/:id', optionalAuth, modelCtrl.getModelById);
router.patch('/models/:id/risk', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole(['GOVERNANCE_OFFICER', 'ML_LEAD']), modelCtrl.updateModelRisk);
router.patch('/models/:id/policy', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole('GOVERNANCE_OFFICER'), modelCtrl.updateModelPolicy);
router.patch('/models/:id/endpoint', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole('ML_LEAD'), modelCtrl.updateModelApiConfig);
router.post('/models/:modelId/versions', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole('ML_LEAD'), modelCtrl.createModelVersion);
router.get('/models/:modelId/versions/compare', optionalAuth, modelCtrl.compareModelVersions);
router.post('/models/versions/:versionId/transition', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole('ML_LEAD'), modelCtrl.transitionLifecycle);

// --- Evaluations & Fairness ---
router.post('/evaluations/run/:versionId', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']), evalCtrl.runEvaluation);
router.post('/evaluations/upload/:versionId', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']), handleFileUpload('file'), evalCtrl.uploadEvaluation);
router.get('/evaluations/version/:versionId', optionalAuth, evalCtrl.getEvaluationsByVersion);

// --- Policies ---
router.get('/policies', optionalAuth, policyCtrl.getPolicies);
router.post('/policies', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole('GOVERNANCE_OFFICER'), policyCtrl.createPolicy);
router.get('/policies/:id', optionalAuth, policyCtrl.getPolicyById);
router.patch('/policies/:id', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole('GOVERNANCE_OFFICER'), policyCtrl.updatePolicy);
router.post('/policies/check/:versionId', authenticateToken, requireActiveUser, requireVerifiedUser, requirePermission(PERMISSIONS.POLICIES_CHECK), policyCtrl.evaluateGateCheck);

// --- Approvals ---
router.get('/approvals/pending', optionalAuth, approvalCtrl.getPendingApprovals);
router.get('/approvals/completed', optionalAuth, approvalCtrl.getCompletedApprovals);
router.get('/approvals/version/:versionId', optionalAuth, approvalCtrl.getApprovalsByVersion);
router.post('/approvals/:versionId', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER']), requireApprovalSignoffRole, approvalCtrl.submitApprovalDecision);

// --- Telemetry & Monitoring ---
router.get('/telemetry', optionalAuth, telemetryCtrl.getTelemetryHistory);
router.get('/telemetry/workloads', optionalAuth, telemetryCtrl.getWorkloadsStatus);
router.get('/telemetry/services-status', optionalAuth, telemetryCtrl.getMonitoringServicesStatus);
router.get('/telemetry/scheduler/status', optionalAuth, telemetryCtrl.getSchedulerStatus);
router.post('/telemetry/scheduler/pause', authenticateIngestion, requireActiveUser, requireVerifiedUser, requireRole(['ML_LEAD', 'PLATFORM_ADMIN']), telemetryCtrl.pauseScheduler);
router.post('/telemetry/scheduler/resume', authenticateIngestion, requireActiveUser, requireVerifiedUser, requireRole(['ML_LEAD', 'PLATFORM_ADMIN']), telemetryCtrl.resumeScheduler);
router.post('/telemetry/scheduler/mode', authenticateIngestion, requireActiveUser, requireVerifiedUser, requireRole(['ML_LEAD', 'PLATFORM_ADMIN']), telemetryCtrl.setSchedulerMode);
router.post('/telemetry/scheduler/trigger', authenticateIngestion, requireActiveUser, requireVerifiedUser, requireRole(['ML_LEAD', 'PLATFORM_ADMIN']), telemetryCtrl.triggerSchedulerBatch);
router.get('/telemetry/overview/:modelId?', optionalAuth, telemetryCtrl.getMonitoringOverview);
router.post('/telemetry/simulate', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole('ML_LEAD'), telemetryCtrl.simulateTelemetryBatch);
router.post('/telemetry/evaluate-external', authenticateIngestion, requireActiveUser, requireVerifiedUser, requireRole('ML_LEAD'), telemetryCtrl.evaluateExternalAiTelemetry);
router.post('/telemetry/ingest', authenticateIngestion, telemetryCtrl.ingestRuntimeTelemetry);

// --- Incidents & Rollback ---
router.get('/incidents', optionalAuth, incidentCtrl.getIncidents);
router.get('/incidents/:id', optionalAuth, incidentCtrl.getIncidentById);
router.patch('/incidents/:id', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole('ML_LEAD'), incidentCtrl.updateIncidentStatus);
router.post('/incidents/rollback', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole('ML_LEAD'), incidentCtrl.rollbackModel);

// --- Notifications ---
router.get('/notifications', optionalAuth, incidentCtrl.getNotifications);
router.patch('/notifications/:id/read', optionalAuth, incidentCtrl.markNotificationRead);

// --- Reports & Drift Analysis ---
router.get('/reports', optionalAuth, reportCtrl.getReports);
router.get('/reports/dossier/:modelId/:versionId?', optionalAuth, auditCtrl.exportComplianceDossier);
router.get('/reports/:id', optionalAuth, reportCtrl.getReportDetails);
router.get('/reports/:id/export', optionalAuth, reportCtrl.exportReport);

// --- Issue Reporting & Governance Review ---
router.post('/issues', authenticateToken, requireActiveUser, requireVerifiedUser, requirePermission(PERMISSIONS.ISSUES_SUBMIT), issueCtrl.createIssueReport);
router.get('/issues', authenticateToken, requireActiveUser, requirePermission(PERMISSIONS.ISSUES_VIEW), issueCtrl.getIssueReports);
router.get('/issues/:id', authenticateToken, requireActiveUser, requirePermission(PERMISSIONS.ISSUES_VIEW), issueCtrl.getIssueReportById);
router.patch('/issues/:id', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']), issueCtrl.updateIssueReport);
router.post('/issues/:id/escalate', authenticateToken, requireActiveUser, requireVerifiedUser, requireRole(['ML_LEAD', 'GOVERNANCE_OFFICER']), issueCtrl.escalateIssueToIncident);

// --- Audit Ledger & Compliance Dossier ---
router.get('/audit', optionalAuth, auditCtrl.getAuditLedger);
router.get('/audit/integrity', optionalAuth, auditCtrl.checkAuditIntegrity);
router.post('/audit/simulate-tamper', authenticateToken, requireActiveUser, requireDemoAuditEnabled, requireRole('PLATFORM_ADMIN'), auditCtrl.simulateTamper);
router.post('/audit/repair', authenticateToken, requireActiveUser, requireDemoAuditEnabled, requireRole('PLATFORM_ADMIN'), auditCtrl.repairAuditLedger);
router.get('/audit/dossier/:modelId/:versionId?', optionalAuth, auditCtrl.exportComplianceDossier);

export default router;

