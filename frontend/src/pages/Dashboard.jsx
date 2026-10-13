import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRoleCapabilities } from '../utils/permissions';
import { getDashboardStats } from '../services/api';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import LoadingSkeleton from '../components/LoadingSkeleton';
import ErrorState from '../components/ErrorState';
import EmptyState from '../components/EmptyState';
import { 
  Layers, 
  CheckCircle, 
  AlertTriangle, 
  ShieldAlert, 
  History, 
  ArrowRight,
  Shield,
  RefreshCw,
  Plus,
  Users,
  FileText,
  Clock,
  ExternalLink,
  Check,
  XCircle,
  Activity,
  AlertCircle,
  BarChart3
} from 'lucide-react';
import { formatRoleLabel, formatAuditAction } from '../utils/formatters';

export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role || 'ML_LEAD';
  const capabilities = getRoleCapabilities(role);

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await getDashboardStats();
      const data = res?.data || res;
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load governance dashboard statistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  if (loading && !stats) {
    return (
      <div className="page-container">
        <PageHeader
          title="Sentinel Govern Control Plane"
          subtitle="Continuous organizational oversight of model risk, policy gates, approvals, and compliance."
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '24px' }}>
          {[...Array(5)].map((_, i) => (
            <LoadingSkeleton key={i} rows={1} height="90px" />
          ))}
        </div>
        <LoadingSkeleton rows={4} height="80px" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="page-container">
        <PageHeader
          title="Sentinel Govern Control Plane"
          subtitle="Continuous organizational oversight of model risk, policy gates, approvals, and compliance."
        />
        <ErrorState
          title="Failed to Load Governance Overview"
          message={error}
          onRetry={loadData}
        />
      </div>
    );
  }

  // Role subtitle mapping
  const roleSubtitles = {
    PLATFORM_ADMIN: 'Platform infrastructure, user verification, system administration, and cryptographic audit integrity.',
    ML_LEAD: 'Model lifecycle engineering, version validation, fairness evaluations, and technical promotion workflows.',
    GOVERNANCE_OFFICER: 'Algorithmic fairness audits, institutional governance policies (EU AI Act & NIST), and regulatory compliance review.',
    EXECUTIVE_APPROVER: 'Executive enterprise risk management, multi-stakeholder governance decisions, and operational fleet health.'
  };

  return (
    <div className="page-container">
      {/* Page Header with Role-Specific Primary Action */}
      <PageHeader
        title="Sentinel Govern Control Plane"
        subtitle={roleSubtitles[role] || 'Continuous organizational oversight of AI system lifecycle and compliance.'}
      >
        <button onClick={loadData} className="btn btn-secondary btn-sm" title="Refresh metrics" id="refresh-dashboard-btn">
          <RefreshCw size={14} /> Refresh
        </button>

        {role === 'ML_LEAD' && (
          <Link to="/app/registry" className="btn btn-primary btn-sm" id="btn-register-model-header">
            <Plus size={14} /> Register Model
          </Link>
        )}

        {role === 'GOVERNANCE_OFFICER' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link to="/app/policies" className="btn btn-primary btn-sm" id="btn-define-policy-header">
              <Plus size={14} /> Define Policy
            </Link>
            <Link to="/app/evaluation" className="btn btn-secondary btn-sm" id="btn-evaluation-header">
              <Activity size={14} /> Fairness Studio
            </Link>
          </div>
        )}

        {role === 'EXECUTIVE_APPROVER' && (
          <Link to="/app/approvals" className="btn btn-secondary btn-sm" id="btn-approvals-header">
            <CheckCircle size={14} /> Approval Center
          </Link>
        )}

        {role === 'PLATFORM_ADMIN' && (
          <Link to="/app/admin/users" className="btn btn-primary btn-sm" id="btn-manage-users-header">
            <Users size={14} /> Manage Users
          </Link>
        )}
      </PageHeader>

      {/* Regulatory Context Notice */}
      <div className="reg-notice" style={{ marginBottom: '20px' }}>
        <Shield size={16} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong>Enterprise Risk Governance Posture:</strong> Actively enforcing institutional governance controls aligned with EU AI Act (Annex III High-Risk requirements), NIST AI RMF 1.0 (Govern, Map, Measure, Manage), and ISO/IEC 42001. Lifecycle transitions strictly require verified policy gates and multi-role stakeholder sign-offs.
        </div>
      </div>

      {/* GLOBAL TOP-LEVEL SUMMARY (5 Key Enterprise Indicators) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '24px' }}>
        <MetricCard
          title="Active Models"
          value={stats?.productionModels ?? 0}
          subtext={stats?.productionModels === 0 ? "No models in production" : `${stats.productionModels} operating in production`}
          icon={Layers}
        />
        <MetricCard
          title="In Governance"
          value={stats?.modelsInGovernance ?? 0}
          subtext={stats?.modelsInGovernance === 0 ? "No models in pipeline" : `${stats.modelsInGovernance} in active governance`}
          icon={Activity}
        />
        <MetricCard
          title="Pending Approvals"
          value={stats?.pendingApprovals ?? 0}
          subtext={stats?.pendingApprovals === 0 ? "No approvals required" : `${stats.pendingApprovals} awaiting sign-off`}
          icon={CheckCircle}
          trend={stats?.pendingApprovals > 0 ? `${stats.pendingApprovals} pending` : 'All clear'}
          trendPositive={!(stats?.pendingApprovals > 0)}
        />
        <MetricCard
          title="Policy Violations"
          value={stats?.policyViolations ?? 0}
          subtext={stats?.policyViolations === 0 ? "No active violations" : `${stats.policyViolations} gated / blocked`}
          icon={ShieldAlert}
          trend={stats?.policyViolations > 0 ? `${stats.policyViolations} blocked` : '0 blocked'}
          trendPositive={!(stats?.policyViolations > 0)}
        />
        <MetricCard
          title="Open Incidents"
          value={stats?.openIncidents ?? 0}
          subtext={stats?.openIncidents === 0 ? "No active incidents" : `${stats.openIncidents} active incident${stats.openIncidents > 1 ? 's' : ''}`}
          icon={AlertTriangle}
          trend={stats?.openIncidents > 0 ? `${stats.openIncidents} active` : '0 active'}
          trendPositive={!(stats?.openIncidents > 0)}
        />
      </div>

      {/* ─────────────────────────────────────────────────────────────────────────────
          ROLE-SPECIFIC ENTERPRISE WORKSPACES
          ───────────────────────────────────────────────────────────────────────────── */}

      {/* 1. ML LEAD WORKSPACE */}
      {role === 'ML_LEAD' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
          {/* Actions Requiring Attention */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <AlertCircle size={16} color="var(--accent-primary)" />
                <span>Actions Requiring Attention</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {((stats?.mlLead?.attentionItems?.draftVersionsWithoutEval?.length || 0) +
                  (stats?.mlLead?.attentionItems?.gateFailedVersions?.length || 0) +
                  (stats?.mlLead?.attentionItems?.returnedVersions?.length || 0))} items pending
              </span>
            </div>

            {((stats?.mlLead?.attentionItems?.draftVersionsWithoutEval?.length || 0) === 0 &&
              (stats?.mlLead?.attentionItems?.gateFailedVersions?.length || 0) === 0 &&
              (stats?.mlLead?.attentionItems?.returnedVersions?.length || 0) === 0) ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No model lifecycle actions require attention at this time.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {stats?.mlLead?.attentionItems?.draftVersionsWithoutEval?.map((v) => (
                  <div key={v._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                        {v.modelId?.name || 'Model'} ({v.version})
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--warning-text)', marginTop: '2px' }}>
                        Evaluation dataset not uploaded. Upload test benchmark to perform fairness assessment.
                      </div>
                    </div>
                    <Link to={`/app/evaluation?modelId=${v.modelId?._id}&versionId=${v._id}`} className="btn btn-secondary btn-sm">
                      Upload Evaluation
                    </Link>
                  </div>
                ))}

                {stats?.mlLead?.attentionItems?.gateFailedVersions?.map((v) => (
                  <div key={v._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--danger-border)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--danger-text)' }}>
                        {v.modelId?.name || 'Model'} ({v.version}) — Policy Gate Blocked
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--danger-text)', marginTop: '2px' }}>
                        Failed institutional thresholds. Model version cannot proceed until remediated.
                      </div>
                    </div>
                    <Link to={`/app/models/${v.modelId?._id}`} className="btn btn-secondary btn-sm">
                      View Gate Details
                    </Link>
                  </div>
                ))}

                {stats?.mlLead?.attentionItems?.returnedVersions?.map((v) => (
                  <div key={v._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--warning-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--warning-border)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--warning-text)' }}>
                        {v.modelId?.name || 'Model'} ({v.version}) — Changes Requested by Reviewers
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--warning-text)', marginTop: '2px' }}>
                        Reviewer feedback requires technical revision prior to re-submission.
                      </div>
                    </div>
                    <Link to={`/app/approvals`} className="btn btn-secondary btn-sm">
                      Review Feedback
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* My / Relevant Models */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Layers size={16} color="var(--accent-primary)" />
                <span>My Registered AI Systems</span>
              </div>
              <Link to="/app/registry" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-primary)' }}>
                View All in Registry <ArrowRight size={13} />
              </Link>
            </div>

            {(!stats?.mlLead?.myModels || stats.mlLead.myModels.length === 0) ? (
              <EmptyState
                icon={Layers}
                title="No models registered yet."
                description="Register your first AI system in the Model Registry to begin tracking lifecycle transitions, evaluations, and governance gates."
                action={
                  <Link to="/app/registry" className="btn btn-primary btn-sm">
                    <Plus size={14} /> Register Model
                  </Link>
                }
              />
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Model Name</th>
                      <th>Risk Tier</th>
                      <th>Lifecycle Status</th>
                      <th>Assigned Policy</th>
                      <th>Owner / Team</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.mlLead.myModels.map((m) => (
                      <tr key={m._id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{m.modelType}</div>
                        </td>
                        <td>
                          <StatusBadge status={m.riskLevel?.toLowerCase()} label={m.riskLevel} />
                        </td>
                        <td>
                          <StatusBadge status={m.lifecycleStatus?.toLowerCase()} />
                        </td>
                        <td>
                          {m.policyId ? (
                            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                              {m.policyId.name || 'Assigned'}
                            </span>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--warning-text)', fontWeight: 600 }}>
                              No governance policy assigned
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {m.owner} • {m.team}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link to={`/app/models/${m._id}`} className="btn btn-secondary btn-sm">
                            Manage
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. GOVERNANCE OFFICER WORKSPACE: FAIRNESS & ETHICAL OVERSIGHT */}
      {role === 'GOVERNANCE_OFFICER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
          {/* Fairness Review Summary Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>PENDING ETHICS REVIEWS</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                {stats?.ethics?.pendingReviewsCount ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Awaiting algorithmic fairness sign-off
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>APPROVED REVIEWS</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success-text)', marginTop: '4px' }}>
                {stats?.ethics?.approvedCount ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Fairness criteria satisfied
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>CHANGES REQUESTED</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--warning-text)', marginTop: '4px' }}>
                {stats?.ethics?.returnedCount ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Bias mitigation required
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>FAIRNESS ISSUES FLAGGED</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: (stats?.ethics?.fairnessIssuesCount > 0 ? 'var(--danger-text)' : 'var(--text-primary)'), marginTop: '4px' }}>
                {stats?.ethics?.fairnessIssuesCount ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Disparate impact violations
              </div>
            </div>
          </div>

          {/* Ethics Review Queue */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <CheckCircle size={16} color="var(--accent-primary)" />
                <span>Ethics & Fairness Review Queue</span>
              </div>
              <Link to="/app/approvals" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-primary)' }}>
                Full Approval Center <ArrowRight size={13} />
              </Link>
            </div>

            {(!stats?.ethics?.reviewQueue || stats.ethics.reviewQueue.length === 0) ? (
              <EmptyState
                icon={CheckCircle}
                title="No governance reviews require your attention."
                description="There are currently no AI model versions in governance awaiting Governance Officer sign-off."
              />
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>AI Model & Version</th>
                      <th>Risk Classification</th>
                      <th>Fairness Metric (DIR)</th>
                      <th>Gate Status</th>
                      <th>Submitted Date</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.ethics.reviewQueue.map((item) => {
                      const dir = item.latestEvaluation?.fairnessMetrics?.disparateImpactRatio;
                      return (
                        <tr key={item.versionId}>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.modelName}</div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Version {item.version}</div>
                          </td>
                          <td>
                            <StatusBadge status={item.riskLevel?.toLowerCase()} label={item.riskLevel} />
                          </td>
                          <td>
                            {dir !== undefined ? (
                              <span style={{ fontWeight: 600, color: dir >= 0.80 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                                DIR = {dir.toFixed(2)} {dir >= 0.80 ? '≥ 0.80' : '< 0.80'}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>No evaluation data</span>
                            )}
                          </td>
                          <td>
                            <StatusBadge status={item.policyStatus?.toLowerCase()} />
                          </td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {new Date(item.submittedDate).toLocaleDateString()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Link to={`/app/approvals`} className="btn btn-primary btn-sm">
                              Review
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* High-Risk AI Systems Under Oversight */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <ShieldAlert size={16} color="var(--danger)" />
                <span>High-Risk AI Systems Under Ethics Oversight</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>EU AI Act Annex III Scope</span>
            </div>

            {(!stats?.ethics?.highRiskModels || stats.ethics.highRiskModels.length === 0) ? (
              <EmptyState
                icon={Shield}
                title="No high-risk AI systems registered."
                description="When high-risk AI systems are registered, they will appear here for mandatory continuous ethical oversight."
              />
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>System Name</th>
                      <th>Classification</th>
                      <th>Lifecycle State</th>
                      <th>Governance Policy</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.ethics.highRiskModels.map((m) => (
                      <tr key={m._id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{m.purpose}</div>
                        </td>
                        <td>
                          <StatusBadge status="high" label={m.riskLevel} />
                        </td>
                        <td>
                          <StatusBadge status={m.lifecycleStatus?.toLowerCase()} />
                        </td>
                        <td>
                          {m.policyId ? (
                            <span style={{ fontSize: '12px' }}>{m.policyId.name}</span>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--warning-text)', fontWeight: 600 }}>
                              No policy assigned
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link to={`/app/evaluation?modelId=${m._id}`} className="btn btn-secondary btn-sm">
                            Fairness Analysis
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. GOVERNANCE OFFICER WORKSPACE: INSTITUTIONAL POLICY & COMPLIANCE */}
      {role === 'GOVERNANCE_OFFICER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
          {/* Policy Overview KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>ACTIVE POLICIES</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success-text)', marginTop: '4px' }}>
                {stats?.compliance?.policyStats?.active ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Enforced in policy engine
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>DRAFT POLICIES</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                {stats?.compliance?.policyStats?.draft ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Under authoring review
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>COMPLIANCE SIGN-OFFS</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                {stats?.compliance?.pendingReviewsCount ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Awaiting compliance sign-off
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>UNASSIGNED MODELS</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: (stats?.modelsWithoutPolicyCount > 0 ? 'var(--warning-text)' : 'var(--text-primary)'), marginTop: '4px' }}>
                {stats?.modelsWithoutPolicyCount ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Models without governance policy
              </div>
            </div>
          </div>

          {/* Policy Management Action Bar */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Link to="/app/policies" className="btn btn-primary btn-sm">
              <Plus size={14} /> Define Policy
            </Link>
            <Link to="/app/policies" className="btn btn-secondary btn-sm">
              <FileText size={14} /> Review Policies
            </Link>
            <Link to="/app/registry" className="btn btn-secondary btn-sm">
              <Layers size={14} /> Assign Policy to Model
            </Link>
          </div>

          {/* CRITICAL CALLOUT: Models Without Governance Policy */}
          {stats?.modelsWithoutPolicy && stats.modelsWithoutPolicy.length > 0 ? (
            <div className="card" style={{ border: '1px solid var(--warning-border)', background: 'var(--warning-bg)' }}>
              <div className="card-header" style={{ borderBottom: '1px solid var(--warning-border)' }}>
                <div className="card-title">
                  <AlertTriangle size={16} color="var(--warning-text)" />
                  <span style={{ color: 'var(--warning-text)', fontWeight: 700 }}>
                    Governance Gap Alert: {stats.modelsWithoutPolicy.length} Model{stats.modelsWithoutPolicy.length > 1 ? 's' : ''} Have No Governance Policy Assigned
                  </span>
                </div>
                <Link to="/app/registry" className="btn btn-secondary btn-sm">
                  Review in Registry
                </Link>
              </div>

              <div className="table-container" style={{ background: 'transparent' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ color: 'var(--warning-text)' }}>Model Name</th>
                      <th style={{ color: 'var(--warning-text)' }}>Risk Level</th>
                      <th style={{ color: 'var(--warning-text)' }}>Owner</th>
                      <th style={{ color: 'var(--warning-text)' }}>Team</th>
                      <th style={{ textAlign: 'right', color: 'var(--warning-text)' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.modelsWithoutPolicy.map((m) => (
                      <tr key={m._id} style={{ background: 'transparent' }}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</td>
                        <td>
                          <StatusBadge status={m.riskLevel?.toLowerCase()} label={m.riskLevel} />
                        </td>
                        <td style={{ fontSize: '12px' }}>{m.owner}</td>
                        <td style={{ fontSize: '12px' }}>{m.team}</td>
                        <td style={{ textAlign: 'right' }}>
                          <Link to={`/app/models/${m._id}`} className="btn btn-primary btn-sm">
                            Assign Policy
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CheckCircle size={18} color="var(--success)" />
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                  All registered models have assigned governance policies.
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  No institutional governance gaps detected across registered systems.
                </div>
              </div>
            </div>
          )}

          {/* Compliance Review Queue */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Shield size={16} color="var(--accent-primary)" />
                <span>Compliance Review Queue</span>
              </div>
              <Link to="/app/approvals" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-primary)' }}>
                Approval Center <ArrowRight size={13} />
              </Link>
            </div>

            {(!stats?.compliance?.reviewQueue || stats.compliance.reviewQueue.length === 0) ? (
              <EmptyState
                icon={CheckCircle}
                title="No compliance reviews require your attention."
                description="All model versions have received compliance verification or none are currently pending."
              />
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Model & Version</th>
                      <th>Risk Tier</th>
                      <th>Policy Status</th>
                      <th>Submitted Date</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.compliance.reviewQueue.map((item) => (
                      <tr key={item.versionId}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.modelName}</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Version {item.version}</div>
                        </td>
                        <td>
                          <StatusBadge status={item.riskLevel?.toLowerCase()} label={item.riskLevel} />
                        </td>
                        <td>
                          <StatusBadge status={item.policyStatus?.toLowerCase()} />
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {new Date(item.submittedDate).toLocaleDateString()}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link to="/app/approvals" className="btn btn-primary btn-sm">
                            Review
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. EXECUTIVE APPROVER WORKSPACE */}
      {role === 'EXECUTIVE_APPROVER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
          {/* Executive Governance Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>PRODUCTION FLEET</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                {stats?.executive?.summary?.productionModels ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Active in production
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>HIGH-RISK SYSTEMS</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>
                {stats?.riskDistribution?.HIGH ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Annex III classified systems
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>DECISIONS REQUIRING ATTENTION</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: (stats?.executive?.summary?.pendingExecutiveDecisions > 0 ? 'var(--warning-text)' : 'var(--text-primary)'), marginTop: '4px' }}>
                {stats?.executive?.summary?.pendingExecutiveDecisions ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Awaiting executive sign-off
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>CRITICAL INCIDENTS</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: (stats?.executive?.summary?.openCriticalIncidents > 0 ? 'var(--danger-text)' : 'var(--text-primary)'), marginTop: '4px' }}>
                {stats?.executive?.summary?.openCriticalIncidents ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Critical governance escalations
              </div>
            </div>
          </div>

          {/* Decisions Requiring Executive Attention */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <CheckCircle size={16} color="var(--accent-primary)" />
                <span>Executive Decisions Requiring Sign-Off</span>
              </div>
              <Link to="/app/approvals" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-primary)' }}>
                Open Approval Center <ArrowRight size={13} />
              </Link>
            </div>

            {(!stats?.executive?.decisionsQueue || stats.executive.decisionsQueue.length === 0) ? (
              <EmptyState
                icon={CheckCircle}
                title="No executive decisions require your attention."
                description="There are currently no model versions awaiting Executive Approver sign-off."
              />
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>System & Version</th>
                      <th>Risk Classification</th>
                      <th>Prior Role Sign-Offs</th>
                      <th>Gate Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.executive.decisionsQueue.map((item) => {
                      const approvedRoles = item.approvals?.filter(a => a.decision === 'APPROVED').map(a => a.role) || [];
                      return (
                        <tr key={item.versionId}>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.modelName}</div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Version {item.version}</div>
                          </td>
                          <td>
                            <StatusBadge status={item.riskLevel?.toLowerCase()} label={item.riskLevel} />
                          </td>
                          <td>
                            <span style={{ fontSize: '12px' }}>
                              {approvedRoles.length > 0 ? approvedRoles.map(formatRoleLabel).join(', ') : 'Pending prior sign-offs'}
                            </span>
                          </td>
                          <td>
                            <StatusBadge status={item.policyStatus?.toLowerCase()} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Link to="/app/approvals" className="btn btn-primary btn-sm">
                              Review Decision
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. PLATFORM ADMIN WORKSPACE */}
      {role === 'PLATFORM_ADMIN' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
          {/* User Management & Security KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL USERS</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                {stats?.platformAdmin?.userStats?.total ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Registered accounts
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>ACTIVE USERS</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success-text)', marginTop: '4px' }}>
                {stats?.platformAdmin?.userStats?.active ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Authorized contributors
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>PENDING VERIFICATION</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: (stats?.platformAdmin?.userStats?.pending > 0 ? 'var(--warning-text)' : 'var(--text-primary)'), marginTop: '4px' }}>
                {stats?.platformAdmin?.userStats?.pending ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Requires admin review
              </div>
            </div>

            <div className="card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>SUSPENDED ACCOUNTS</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: (stats?.platformAdmin?.userStats?.suspended > 0 ? 'var(--danger-text)' : 'var(--text-primary)'), marginTop: '4px' }}>
                {stats?.platformAdmin?.userStats?.suspended ?? 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Access revoked
              </div>
            </div>
          </div>

          {/* Pending User Verification Queue */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Users size={16} color="var(--accent-primary)" />
                <span>User Verification Queue</span>
              </div>
              <Link to="/app/admin/users" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-primary)' }}>
                User Administration <ArrowRight size={13} />
              </Link>
            </div>

            {(!stats?.platformAdmin?.pendingUsers || stats.platformAdmin.pendingUsers.length === 0) ? (
              <EmptyState
                icon={CheckCircle}
                title="All user accounts are verified and active."
                description="No newly registered user accounts are currently pending administrator verification."
              />
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name & Email</th>
                      <th>Requested Role</th>
                      <th>Department</th>
                      <th>Registered At</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.platformAdmin.pendingUsers.map((u) => (
                      <tr key={u._id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{u.email}</div>
                        </td>
                        <td>
                          <StatusBadge status="warning" label={formatRoleLabel(u.role)} />
                        </td>
                        <td style={{ fontSize: '12px' }}>{u.department || 'Not set'}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link to="/app/admin/users" className="btn btn-primary btn-sm">
                            Verify Account
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}



      {/* ─────────────────────────────────────────────────────────────────────────────
          SHARED ENTERPRISE PANELS: FLEET RISK PROFILE & RECENT CRYPTOGRAPHIC AUDIT
          ───────────────────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '20px', marginBottom: '24px' }}>
        {/* Fleet Risk Classification Profile */}
        <div className="card" id="risk-distribution-panel">
          <div className="card-header" style={{ paddingBottom: '10px' }}>
            <div>
              <div className="card-title">
                <BarChart3 size={16} color="var(--accent-primary)" />
                <span>Risk Classification Profile</span>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Current distribution of governed AI systems by assigned risk tier.
              </div>
            </div>
            <span className="badge badge-neutral" style={{ fontSize: '10.5px' }}>EU AI Act / NIST</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '8px' }}>
            {[
              {
                id: 'UNACCEPTABLE',
                label: 'Unacceptable / Prohibited (Statutory Exclusion)',
                count: stats?.riskDistribution?.UNACCEPTABLE ?? 0,
                color: '#6b21a8', // Restrained deep purple/plum, reserving critical red for active incidents
                textColor: '#581c87',
                bgTrack: 'rgba(107, 33, 168, 0.08)'
              },
              {
                id: 'HIGH',
                label: 'High Risk (Annex III Governance — Not an Incident)',
                count: stats?.riskDistribution?.HIGH ?? 0,
                color: '#b45309', // Restrained warm bronze/amber, not critical red
                textColor: '#92400e',
                bgTrack: 'rgba(180, 83, 9, 0.08)'
              },
              {
                id: 'LIMITED',
                label: 'Limited Risk (Transparency Obligations)',
                count: stats?.riskDistribution?.LIMITED ?? 0,
                color: '#2563eb', // Calm slate-blue
                textColor: '#1d4ed8',
                bgTrack: 'rgba(37, 99, 235, 0.08)'
              },
              {
                id: 'MINIMAL',
                label: 'Minimal / General Purpose (Baseline Controls)',
                count: stats?.riskDistribution?.MINIMAL ?? 0,
                color: '#059669', // Muted sage/emerald
                textColor: '#047857',
                bgTrack: 'rgba(5, 150, 105, 0.08)'
              }
            ].map((tier) => {
              const total = stats?.totalModels || 0;
              const pct = total > 0 ? Math.round((tier.count / total) * 100) : 0;
              // Even with a single model (count > 0), ensure a perceptible visual bar width
              const barWidth = tier.count > 0 ? Math.max(pct, 6) : 0;

              return (
                <div key={tier.id} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tier.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tier.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="tnum" style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                        {tier.count}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '32px', textAlign: 'right' }}>
                        {total > 0 ? `${pct}%` : '0%'}
                      </span>
                    </div>
                  </div>

                  <div style={{ height: '8px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--border-color)', position: 'relative' }}>
                    <div
                      style={{
                        width: `${barWidth}%`,
                        height: '100%',
                        background: tier.color,
                        borderRadius: 'var(--radius-full)',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: '8px', padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-muted)' }}>
              ℹ️ Risk classification reflects pre-deployment regulatory intake categorization (EU AI Act & NIST) and is separate from operational incidents or runtime drift.
            </div>
          </div>
        </div>

        {/* Recent Cryptographic Audit Activity */}
        <div className="card" id="recent-audit-panel">
          <div className="card-header">
            <div>
              <div className="card-title">
                <History size={16} color="var(--accent-primary)" />
                <span>Recent Cryptographic Audit Records (Newest 2)</span>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Latest cryptographically hash-chained governance events.
              </div>
            </div>
            <Link to="/app/audit" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-primary)' }}>
              Full Ledger & Verification <ArrowRight size={13} />
            </Link>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Seq #</th>
                  <th>Timestamp</th>
                  <th>Actor & Role</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>SHA-256 Hash</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentAudit && stats.recentAudit.length > 0 ? (
                  stats.recentAudit.slice(0, 2).map((entry) => (
                    <tr key={entry._id}>
                      <td className="font-mono tnum" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                        #{entry.sequenceNumber}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{entry.actor}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatRoleLabel(entry.role)}</div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 500,
                            padding: '2px 7px',
                            borderRadius: 'var(--radius-xs)',
                            backgroundColor:
                              entry.action?.includes('PASSED') || entry.action?.includes('GRANTED')
                                ? 'var(--success-bg)'
                                : entry.action?.includes('FAILED') || entry.action?.includes('DRIFT')
                                ? 'var(--danger-bg)'
                                : 'var(--bg-subtle)',
                            color:
                              entry.action?.includes('PASSED') || entry.action?.includes('GRANTED')
                                ? 'var(--success-text)'
                                : entry.action?.includes('FAILED') || entry.action?.includes('DRIFT')
                                ? 'var(--danger-text)'
                                : 'var(--text-secondary)',
                            border: `1px solid ${
                              entry.action?.includes('PASSED') || entry.action?.includes('GRANTED')
                                ? 'var(--success-border)'
                                : entry.action?.includes('FAILED') || entry.action?.includes('DRIFT')
                                ? 'var(--danger-border)'
                                : 'var(--border-color)'
                            }`
                          }}
                        >
                          {formatAuditAction(entry.action)}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px' }}>{entry.entityType}</span>
                      </td>
                      <td>
                        <span className="hash-code font-mono">{entry.currentHash?.substring(0, 16)}...</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      No audit records recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
