import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  getModelById, 
  createModelVersion, 
  transitionLifecycle,
  getEvaluations,
  getApprovals,
  getPolicies,
  updateModelPolicy
} from '../services/api';
import { RiskBadge, StatusBadge } from '../components/RiskBadge';
import LifecycleStepper from '../components/LifecycleStepper';
import PageHeader from '../components/PageHeader';
import StatusDot from '../components/StatusDot';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import { getRoleCapabilities } from '../utils/permissions';
import { formatRoleLabel } from '../utils/formatters';
import { 
  Database, 
  GitBranch, 
  ShieldCheck, 
  FileText, 
  Plus, 
  Scale, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw,
  X,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

export default function ModelDetails() {
  const { id } = useParams();
  const { currentRole } = useRole();
  const { user } = useAuth();
  const capabilities = getRoleCapabilities(user?.role);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [evaluations, setEvaluations] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // New Version form
  const [versionForm, setVersionForm] = useState({
    version: 'v1.1',
    changelog: 'Fairness mitigation via demographic re-weighting and hyperparameter tuning',
    datasetName: 'Balanced Lending Corpus 2025',
    sampleCount: 65000,
    featureCount: 34
  });

  const [isAssignPolicyModalOpen, setIsAssignPolicyModalOpen] = useState(false);
  const [availablePolicies, setAvailablePolicies] = useState([]);
  const [selectedPolicyToAssign, setSelectedPolicyToAssign] = useState('');
  const [policySubmitting, setPolicySubmitting] = useState(false);

  const handleOpenAssignPolicyModal = async () => {
    try {
      const res = await getPolicies();
      setAvailablePolicies(res || []);
      setSelectedPolicyToAssign(data?.activePolicy?._id || res?.[0]?._id || '');
      setIsAssignPolicyModalOpen(true);
    } catch (err) {
      alert(`Failed to load governance policies: ${err.message}`);
    }
  };

  const handleSaveAssignedPolicy = async (e) => {
    e.preventDefault();
    try {
      setPolicySubmitting(true);
      await updateModelPolicy(id, selectedPolicyToAssign || null);
      setIsAssignPolicyModalOpen(false);
      await loadModelDetails(selectedVersionId);
    } catch (err) {
      alert(`Failed to update model policy: ${err.message}`);
    } finally {
      setPolicySubmitting(false);
    }
  };

  const loadModelDetails = async (preserveVersionId = null) => {
    try {
      setLoading(true);
      const res = await getModelById(id);
      setData(res);

      const targetVId = preserveVersionId || selectedVersionId;
      const validVersion = res.versions.find(v => v._id === targetVId);
      const vId = validVersion ? validVersion._id : (res.model.currentProductionVersionId?._id || res.versions[0]?._id);
      setSelectedVersionId(vId);

      if (vId) {
        const [evals, apps] = await Promise.all([
          getEvaluations(vId),
          getApprovals(vId)
        ]);
        setEvaluations(evals || []);
        setApprovals(apps || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load model details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModelDetails();
  }, [id]);

  const handleSelectVersion = async (vId) => {
    setSelectedVersionId(vId);
    setTransitionMessage(null);
    try {
      const [evals, apps] = await Promise.all([
        getEvaluations(vId),
        getApprovals(vId)
      ]);
      setEvaluations(evals || []);
      setApprovals(apps || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateVersion = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const newVer = await createModelVersion(id, {
        version: versionForm.version,
        changelog: versionForm.changelog,
        trainingDatasetInfo: {
          name: versionForm.datasetName,
          sampleCount: Number(versionForm.sampleCount),
          featureCount: Number(versionForm.featureCount),
          dateRange: '2025-01 to 2026-02',
          dataHash: `sha256-${Date.now().toString(16)}`
        },
        actor: user?.name || user?.email || currentRole.name
      });
      setIsVersionModalOpen(false);
      await loadModelDetails(newVer._id);
      setTransitionMessage({
        type: 'success',
        text: `Version ${versionForm.version} created successfully in DRAFT state.`
      });
    } catch (err) {
      alert(`Error creating version: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLifecycleTransition = async (targetStatus) => {
    if (!selectedVersionId) return;
    try {
      setActionLoading(true);
      setTransitionMessage(null);
      await transitionLifecycle(selectedVersionId, {
        targetStatus,
        actor: user?.name || user?.email || currentRole.name,
        role: user?.role || currentRole.id,
        rationale: `Manual lifecycle transition request by ${user?.name || user?.email || currentRole.title}`
      });
      await loadModelDetails(selectedVersionId);
      setTransitionMessage({
        type: 'success',
        text: `Lifecycle state successfully advanced to ${targetStatus}.`
      });
    } catch (err) {
      setTransitionMessage({
        type: 'blocked',
        text: err.data?.error || err.message
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '80px 0' }}>
        <RefreshCw className="animate-spin" size={28} color="var(--accent-primary)" style={{ margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading AI model governance details...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-container">
        <div style={{ color: 'var(--danger-text)', padding: '24px', backgroundColor: 'var(--danger-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--danger-border)' }}>
          <strong>Error loading model:</strong> {error || 'Model not found'}
          <div style={{ marginTop: '12px' }}>
            <Link to="/app/registry" className="btn btn-secondary btn-sm">
              Return to Registry
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { model, versions, activePolicy } = data;
  const currentVersion = versions.find(v => v._id === selectedVersionId) || versions[0];
  const isGateBlocked = currentVersion?.policyStatus === 'FAILED';

  return (
    <div className="page-container">
      {/* Header */}
      <PageHeader
        breadcrumbs={[
          { to: '/app/registry', label: 'Model Registry' },
          { label: model.name }
        ]}
        title={model.name}
        subtitle={model.purpose}
        badge={<RiskBadge level={model.riskLevel} />}
      >
        {capabilities.canCreateVersions ? (
          <button onClick={() => setIsVersionModalOpen(true)} className="btn btn-secondary btn-sm">
            <Plus size={14} /> New Version
          </button>
        ) : (
          <button
            disabled
            className="btn btn-secondary btn-sm"
            title="Version creation requires ML Lead role"
            style={{ opacity: 0.6 }}
          >
            <Plus size={14} /> New Version (ML Lead Only)
          </button>
        )}
        <Link 
          to={`/app/dossier?modelId=${model._id}${selectedVersionId ? `&versionId=${selectedVersionId}` : ''}`} 
          className="btn btn-primary btn-sm"
        >
          <FileText size={14} /> Compliance Dossier
        </Link>
      </PageHeader>

      {/* Transition Message or Gate Block Banner */}
      {transitionMessage && (
        <div className={`gate-banner ${transitionMessage.type === 'blocked' ? 'gate-blocked' : 'gate-passed'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {transitionMessage.type === 'blocked' ? <XCircle size={20} /> : <CheckCircle2 size={20} />}
            <div>
              <div style={{ fontWeight: 600, fontSize: '13.5px' }}>
                {transitionMessage.type === 'blocked' ? 'GOVERNANCE GATE BLOCKED' : 'LIFECYCLE ADVANCED'}
              </div>
              <div style={{ fontSize: '12.5px', marginTop: '2px' }}>{transitionMessage.text}</div>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => setTransitionMessage(null)}
            className="btn-ghost"
            style={{ padding: '4px', cursor: 'pointer', color: 'inherit' }}
            aria-label="Dismiss banner"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Model System Overview Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2.8fr 1.2fr', gap: '18px', marginBottom: '20px' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Database size={15} color="var(--accent-primary)" />
              <span>System Metadata & Risk Profile</span>
            </div>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.5 }}>
            {model.description || 'No system description provided.'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>System Owner</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>{model.owner}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{model.team}</div>
              {model.createdBy && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  Registered by: {model.createdBy.name || model.createdBy.email}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Framework Alignment</div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px', lineHeight: 1.4 }}>
                {model.riskAssessment?.frameworkAlignment?.join(', ') || 'EU AI Act, NIST AI RMF'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Protected Demographics</div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px' }}>
                {model.protectedAttributes?.join(', ') || 'gender, age'}
              </div>
            </div>
          </div>
        </div>

        {/* Current Production Status Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Active Production Version
          </div>
          <div className="font-mono tnum" style={{ fontSize: '24px', fontWeight: 700, color: model.currentProductionVersionId ? 'var(--success-text)' : 'var(--text-muted)', margin: '4px 0' }}>
            {model.currentProductionVersionId?.version || 'None'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {model.currentProductionVersionId ? (
              <span style={{ color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <StatusDot status="healthy" pulse={true} /> Deployed & Monitored
              </span>
            ) : (
              <span>Pre-deployment phase</span>
            )}
          </div>
        </div>
      </div>

      {/* Version Selector Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <GitBranch size={14} />
          Versions:
        </span>
        {versions.map((v) => (
          <button
            key={v._id}
            type="button"
            onClick={() => handleSelectVersion(v._id)}
            style={{
              padding: '5px 12px',
              borderRadius: 'var(--radius-sm)',
              border: selectedVersionId === v._id ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
              backgroundColor: selectedVersionId === v._id ? 'var(--accent-subtle)' : 'var(--bg-surface)',
              color: selectedVersionId === v._id ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>{v.version}</span>
            <StatusBadge status={v.lifecycleStatus} />
          </button>
        ))}
      </div>

      {/* Selected Version Lifecycle Card */}
      {currentVersion && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div className="card-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Version {currentVersion.version}</h3>
                <StatusBadge status={currentVersion.lifecycleStatus} />
                {currentVersion.deploymentStatus === 'IN_PRODUCTION' && (
                  <span className="badge badge-success">Production Baseline</span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                {currentVersion.changelog}
                {currentVersion.createdBy && (
                  <span style={{ marginLeft: '8px' }}>
                    • Created by: {currentVersion.createdBy.name || currentVersion.createdBy.email}
                  </span>
                )}
              </div>
            </div>

            {/* Lifecycle Stage Transition Actions */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <Link to={`/app/evaluation?versionId=${currentVersion._id}`} className="btn btn-secondary btn-sm">
                <Scale size={13} /> Fairness Studio
              </Link>

              {currentVersion.lifecycleStatus === 'DRAFT' && (
                <button
                  onClick={() => handleLifecycleTransition('UNDER_REVIEW')}
                  disabled={actionLoading || !capabilities.canTransitionLifecycle}
                  className="btn btn-secondary btn-sm"
                  title={!capabilities.canTransitionLifecycle ? "Lifecycle transitions require ML Lead role" : ""}
                  style={!capabilities.canTransitionLifecycle ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                >
                  Submit for Review →
                </button>
              )}

              {currentVersion.lifecycleStatus === 'UNDER_REVIEW' && (
                <button
                  onClick={() => handleLifecycleTransition('EVALUATION')}
                  disabled={actionLoading || !capabilities.canTransitionLifecycle}
                  className="btn btn-secondary btn-sm"
                  title={!capabilities.canTransitionLifecycle ? "Lifecycle transitions require ML Lead role" : ""}
                  style={!capabilities.canTransitionLifecycle ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                >
                  Move to Evaluation →
                </button>
              )}

              {currentVersion.lifecycleStatus === 'EVALUATION' && (
                <button
                  onClick={() => handleLifecycleTransition('PENDING_APPROVAL')}
                  disabled={actionLoading || !capabilities.canTransitionLifecycle}
                  className="btn btn-secondary btn-sm"
                  title={!capabilities.canTransitionLifecycle ? "Lifecycle transitions require ML Lead role" : ""}
                  style={!capabilities.canTransitionLifecycle ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                >
                  Submit for Approval Gate →
                </button>
              )}

              {currentVersion.lifecycleStatus === 'PENDING_APPROVAL' && (
                <>
                  <Link to="/app/approvals" className="btn btn-secondary btn-sm">
                    Open Sign-Off Matrix
                  </Link>
                  <button
                    onClick={() => handleLifecycleTransition('APPROVED')}
                    disabled={actionLoading || !capabilities.canTransitionLifecycle}
                    className="btn btn-primary btn-sm"
                    title={!capabilities.canTransitionLifecycle ? "Sealing approval gate requires ML Lead role" : ""}
                    style={!capabilities.canTransitionLifecycle ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                  >
                    Verify & Seal Gate →
                  </button>
                </>
              )}

              {currentVersion.lifecycleStatus === 'APPROVED' && (
                <button
                  onClick={() => handleLifecycleTransition('IN_PRODUCTION')}
                  disabled={actionLoading || !capabilities.canTransitionLifecycle}
                  className="btn btn-primary btn-sm"
                  title={!capabilities.canTransitionLifecycle ? "Promoting to production requires ML Lead role" : ""}
                  style={!capabilities.canTransitionLifecycle ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                >
                  Promote to Production 🚀
                </button>
              )}
            </div>
          </div>

          {/* Stepper */}
          <LifecycleStepper 
            currentStatus={currentVersion.lifecycleStatus} 
            policyStatus={currentVersion.policyStatus}
            isBlocked={isGateBlocked}
          />

          {/* Gate Status & Policy Summary */}
          {activePolicy ? (
            <div style={{
              marginTop: '16px',
              padding: '14px 16px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: currentVersion.policyStatus === 'PASSED' ? 'var(--success-bg)' : 
                               currentVersion.policyStatus === 'FAILED' ? 'var(--danger-bg)' : 'var(--bg-subtle)',
              border: `1px solid ${currentVersion.policyStatus === 'PASSED' ? 'var(--success-border)' : 
                                  currentVersion.policyStatus === 'FAILED' ? 'var(--danger-border)' : 'var(--border-color)'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: currentVersion.policyStatus === 'PASSED' ? 'var(--success-text)' : currentVersion.policyStatus === 'FAILED' ? 'var(--danger-text)' : 'var(--text-primary)' }}>
                    Applicable Governance Policy: <strong>{activePolicy.name}</strong> ({activePolicy.targetRiskLevel} Risk Tier)
                  </span>
                  <Link 
                    to="/app/policies" 
                    className="btn btn-ghost btn-sm" 
                    style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    title="View policy details in Policy Library"
                  >
                    View in Policy Library <ExternalLink size={11} />
                  </Link>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: currentVersion.policyStatus === 'PASSED' ? 'var(--success-text)' : currentVersion.policyStatus === 'FAILED' ? 'var(--danger-text)' : 'var(--text-muted)' }}>
                    Gate Decision: {currentVersion.latestPolicyEvaluation?.overallDecision || currentVersion.policyStatus}
                  </span>
                  {capabilities.canManagePolicies && (
                    <button 
                      onClick={handleOpenAssignPolicyModal} 
                      className="btn btn-secondary btn-sm" 
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                    >
                      Change Policy
                    </button>
                  )}
                </div>
              </div>

              {/* Required vs Actual Evidence Matrix */}
              {(() => {
                const latestEv = evaluations[0] || (typeof currentVersion.latestEvaluationId === 'object' ? currentVersion.latestEvaluationId : null);
                const dirVal = latestEv?.fairnessMetrics?.disparateImpactRatio;
                const accVal = latestEv?.performanceMetrics?.accuracy;
                const rocAucVal = latestEv?.performanceMetrics?.rocAuc;
                const dpdVal = latestEv?.fairnessMetrics?.demographicParityDiff;

                return (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '10px',
                    padding: '10px 12px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border-color)',
                    marginTop: '6px'
                  }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Disparate Impact (DIR)</div>
                      <div style={{ fontSize: '12px', marginTop: '2px' }}>
                        Required: <span className="font-mono">&ge; {activePolicy.rules?.minDisparateImpact ?? 0.80}</span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: dirVal !== undefined ? (dirVal >= (activePolicy.rules?.minDisparateImpact ?? 0.80) ? 'var(--success-text)' : 'var(--danger-text)') : 'var(--text-muted)' }}>
                        Actual: {dirVal !== undefined ? dirVal : 'Not evaluated'}
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Parity Diff: {dpdVal !== undefined ? dpdVal : 'N/A'} (&le; {activePolicy.rules?.maxDemographicParityDiff ?? 0.10})
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Accuracy Benchmark</div>
                      <div style={{ fontSize: '12px', marginTop: '2px' }}>
                        Required: <span className="font-mono">&ge; {((activePolicy.rules?.minAccuracy ?? 0.80) * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: accVal !== undefined ? (accVal >= (activePolicy.rules?.minAccuracy ?? 0.80) ? 'var(--success-text)' : 'var(--danger-text)') : 'var(--text-muted)' }}>
                        Actual: {accVal !== undefined ? `${(accVal * 100).toFixed(1)}%` : 'Not evaluated'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>ROC-AUC Metric</div>
                      <div style={{ fontSize: '12px', marginTop: '2px' }}>
                        Required: <span className="font-mono">&ge; {activePolicy.rules?.minRocAuc ?? 0.85}</span>
                      </div>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: (rocAucVal !== null && rocAucVal !== undefined)
                          ? (rocAucVal >= (activePolicy.rules?.minRocAuc ?? 0.85) ? 'var(--success-text)' : 'var(--danger-text)')
                          : 'var(--text-muted)'
                      }}>
                        Actual: {(rocAucVal !== null && rocAucVal !== undefined) ? rocAucVal : 'Unavailable (no scores)'}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Min Accuracy</div>
                      <div style={{ fontSize: '12px', marginTop: '2px' }}>
                        Tolerance: <span className="font-mono">&ge; {((activePolicy.rules?.minAccuracy ?? 0.80) * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Performance Gate
                      </div>
                    </div>
                  </div>
                );
              })()}

              {currentVersion.latestPolicyEvaluation?.reasons?.length > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--danger-text)', marginTop: '8px' }}>
                  <strong>Gate Block Violations:</strong>
                  <ul style={{ paddingLeft: '18px', marginTop: '2px', marginBottom: 0 }}>
                    {currentVersion.latestPolicyEvaluation.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              marginTop: '16px',
              padding: '14px 18px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={20} color="var(--warning-text)" />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                    No governance policy assigned
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    This model is not currently governed by an active policy. Stage-gate evaluations and promotions remain blocked until a Governance Officer assigns an active governance policy.
                  </div>
                </div>
              </div>

              <div>
                {capabilities.canManagePolicies ? (
                  <button 
                    onClick={handleOpenAssignPolicyModal} 
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '12px' }}
                  >
                    Assign Governance Policy
                  </button>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Requires Governance Officer to assign policy
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evaluations & Approvals Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
        
        {/* Evaluations Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Scale size={15} color="var(--accent-primary)" />
              <span>Evaluations ({evaluations.length})</span>
            </div>
            <Link to={`/app/evaluation?versionId=${selectedVersionId}`} className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-primary)' }}>
              Open Studio →
            </Link>
          </div>

          {evaluations.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
              No evaluations recorded yet for {currentVersion?.version}.
              <div style={{ marginTop: '8px' }}>
                <Link to={`/app/evaluation?versionId=${selectedVersionId}`} className="btn btn-secondary btn-sm">
                  Run Initial Evaluation
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {evaluations.map((ev) => (
                <div key={ev._id} style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--text-primary)' }}>{ev.datasetName}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(ev.evaluatedAt).toLocaleDateString()}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Disparate Impact: </span>
                      <strong style={{ color: ev.fairnessMetrics.disparateImpactRatio >= 0.80 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                        {ev.fairnessMetrics.disparateImpactRatio}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Accuracy: </span>
                      <strong className="tnum">{(ev.performanceMetrics.accuracy * 100).toFixed(1)}%</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>ROC-AUC: </span>
                      <strong className="tnum">
                        {ev.performanceMetrics?.rocAuc !== null && ev.performanceMetrics?.rocAuc !== undefined ? ev.performanceMetrics.rocAuc : 'Unavailable'}
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Approvals Sign-off Status */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <ShieldCheck size={15} color="var(--accent-primary)" />
              <span>Governance Sign-Offs ({approvals.filter(a => a.decision === 'APPROVED').length}/3)</span>
            </div>
            <Link to="/app/approvals" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-primary)' }}>
              Sign-Off Center →
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'].map((role) => {
              const app = approvals.find(a => a.role === role);
              const isApproved = app?.decision === 'APPROVED';

              return (
                <div 
                  key={role}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {formatRoleLabel(role)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {app ? `${app.approverName} • ${new Date(app.decidedAt).toLocaleDateString()}` : 'Pending review'}
                    </div>
                  </div>

                  <div>
                    {isApproved ? (
                      <span style={{ fontSize: '11.5px', fontWeight: 500, color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={13} /> Approved
                      </span>
                    ) : (
                      <span style={{ fontSize: '11.5px', color: 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} /> Pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* New Version Modal */}
      {isVersionModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitBranch size={16} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Create New Model Version</h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsVersionModalOpen(false)}
                className="btn-ghost"
                style={{ cursor: 'pointer', padding: '4px' }}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateVersion}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Version Identifier *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. v1.1"
                    className="form-input"
                    value={versionForm.version}
                    onChange={(e) => setVersionForm({ ...versionForm, version: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Changelog & Technical Modifications *</label>
                  <textarea
                    required
                    rows="3"
                    placeholder="Describe fairness mitigation techniques, feature transformations, or hyperparameter updates..."
                    className="form-textarea"
                    value={versionForm.changelog}
                    onChange={(e) => setVersionForm({ ...versionForm, changelog: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Validation Dataset Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={versionForm.datasetName}
                    onChange={(e) => setVersionForm({ ...versionForm, datasetName: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Sample Count</label>
                    <input
                      type="number"
                      className="form-input"
                      value={versionForm.sampleCount}
                      onChange={(e) => setVersionForm({ ...versionForm, sampleCount: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Feature Count</label>
                    <input
                      type="number"
                      className="form-input"
                      value={versionForm.featureCount}
                      onChange={(e) => setVersionForm({ ...versionForm, featureCount: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setIsVersionModalOpen(false)} className="btn btn-secondary btn-sm">
                  Cancel
                </button>
                <button type="submit" disabled={actionLoading} className="btn btn-primary btn-sm">
                  {actionLoading ? 'Registering...' : 'Register Version'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign / Change Governance Policy Modal */}
      {isAssignPolicyModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>
                  Assign Governance Policy to {model.name}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsAssignPolicyModalOpen(false)}
                className="btn-ghost"
                style={{ cursor: 'pointer', padding: '4px' }}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveAssignedPolicy}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>
                  Select the authoritative governance policy to apply to <strong>{model.name}</strong>. All stage-gate evaluations and promotion sign-offs will be evaluated against this policy's rules.
                </p>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Available Policies</label>
                  <select 
                    className="form-select"
                    value={selectedPolicyToAssign}
                    onChange={(e) => setSelectedPolicyToAssign(e.target.value)}
                  >
                    <option value="">-- No Policy (Unassigned) --</option>
                    {availablePolicies.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} ({p.targetRiskLevel} Risk Tier) - {p.failureAction === 'BLOCK_PROMOTION' ? 'Strict Block' : 'Warn'}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedPolicyToAssign && (() => {
                  const pol = availablePolicies.find(p => p._id === selectedPolicyToAssign);
                  if (!pol) return null;
                  return (
                    <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{pol.name}</div>
                      <div style={{ color: 'var(--text-muted)' }}>{pol.description}</div>
                      <div style={{ marginTop: '6px', display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        <span>DIR: &ge; {pol.rules?.minDisparateImpact ?? 0.80}</span>
                        <span>ROC-AUC: &ge; {pol.rules?.minRocAuc ?? 0.85}</span>
                        <span>Accuracy: &ge; {((pol.rules?.minAccuracy ?? 0.80) * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  onClick={() => setIsAssignPolicyModalOpen(false)} 
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={policySubmitting} 
                  className="btn btn-primary btn-sm"
                >
                  {policySubmitting ? 'Saving...' : 'Save Policy Binding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
