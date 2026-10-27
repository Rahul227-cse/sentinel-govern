import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPendingApprovals, getCompletedApprovals, submitApproval } from '../services/api';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import { RiskBadge, StatusBadge } from '../components/RiskBadge';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { formatRoleLabel, formatRiskLevel } from '../utils/formatters';
import { 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  ShieldCheck, 
  RefreshCw,
  ArrowRight,
  History,
  FileText
} from 'lucide-react';

export function getApprovalProgress(item) {
  if (!item) {
    return {
      signedCount: 0,
      totalCount: 3,
      requiredRoles: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
      isComplete: false
    };
  }

  const requiredRoles = (item.requiredRoles && Array.isArray(item.requiredRoles) && item.requiredRoles.length > 0)
    ? item.requiredRoles
    : (item.policy?.requiredApprovers && Array.isArray(item.policy.requiredApprovers) && item.policy.requiredApprovers.length > 0)
      ? item.policy.requiredApprovers
      : ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'];

  const approvedRoles = (item.approvals || [])
    .filter(a => a && a.decision === 'APPROVED' && requiredRoles.includes(a.role))
    .map(a => a.role);

  const uniqueApproved = Array.from(new Set(approvedRoles));

  return {
    signedCount: uniqueApproved.length,
    totalCount: requiredRoles.length,
    requiredRoles,
    isComplete: requiredRoles.length > 0 && uniqueApproved.length >= requiredRoles.length
  };
}

export default function ApprovalCenter() {
  const { currentRole } = useRole();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'completed'
  const [pendingItems, setPendingItems] = useState([]);
  const [completedItems, setCompletedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState(null);
  const [comment, setComment] = useState('');
  const [decision, setDecision] = useState('APPROVED');
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState(null);

  const loadData = async (preserveSelectedId = null) => {
    try {
      setLoading(true);
      const [pendingRes, completedRes] = await Promise.all([
        getPendingApprovals('pending'),
        getCompletedApprovals()
      ]);
      const pending = pendingRes || [];
      const completed = completedRes || [];
      setPendingItems(pending);
      setCompletedItems(completed);

      if (preserveSelectedId) {
        const currentList = activeTab === 'pending' ? pending : completed;
        const foundInCurrent = currentList.find(i => i.version?._id === preserveSelectedId);
        if (foundInCurrent) {
          setSelectedItem(foundInCurrent);
        } else {
          // If the item just finished all sign-offs, it transitions from pending to completed queue
          const otherList = activeTab === 'pending' ? completed : pending;
          const foundInOther = otherList.find(i => i.version?._id === preserveSelectedId);
          if (foundInOther) {
            setActiveTab(activeTab === 'pending' ? 'completed' : 'pending');
            setSelectedItem(foundInOther);
          } else {
            setSelectedItem(currentList[0] || null);
          }
        }
      } else {
        const list = activeTab === 'pending' ? pending : completed;
        setSelectedItem(list.length > 0 ? list[0] : null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const list = tab === 'pending' ? pendingItems : completedItems;
    setSelectedItem(list.length > 0 ? list[0] : null);
  };

  const handleSubmitDecision = async () => {
    if (!selectedItem) return;
    try {
      setSubmitting(true);
      const signoffRole = user?.role || currentRole.id;
      const approverName = user?.name || currentRole.name;

      await submitApproval(selectedItem.version._id, {
        role: signoffRole,
        approverName,
        decision,
        comment
      });

      setNotification({
        type: 'success',
        msg: `Decision (${decision}) successfully recorded for ${selectedItem.model.name} (${selectedItem.version.version}) as ${signoffRole}.`
      });

      setComment('');
      await loadData(selectedItem.version._id);
    } catch (err) {
      setNotification({
        type: 'error',
        msg: err.data?.error || err.message
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Workspace', to: '/app' },
          { label: 'Approval Center' }
        ]}
        title="Stage-Gate Approval Center"
        subtitle="Role-governed multi-stakeholder reviews and electronic sign-offs for production promotions."
      >
        <button onClick={() => loadData(selectedItem?.version?._id)} className="btn btn-secondary btn-sm" title="Refresh review queue">
          <RefreshCw size={14} /> Refresh Queue
        </button>
      </PageHeader>

      {/* Visual Governance Progression */}
      <div className="card" style={{ padding: '12px 18px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
          MANDATORY MULTI-STAKEHOLDER GOVERNANCE PROGRESSION
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <span style={{ padding: '3px 8px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-color)' }}>
            1. Evaluation Complete
          </span>
          <ArrowRight size={13} color="var(--text-muted)" />
          <span style={{ padding: '3px 8px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-color)' }}>
            2. Policy Gate Passed
          </span>
          <ArrowRight size={13} color="var(--text-muted)" />
          <span style={{ padding: '3px 8px', background: 'var(--accent-subtle)', color: 'var(--accent-primary)', fontWeight: 600, borderRadius: 'var(--radius-xs)', border: '1px solid var(--accent-border)' }}>
            3. ML Lead Review
          </span>
          <ArrowRight size={13} color="var(--text-muted)" />
          <span style={{ padding: '3px 8px', background: 'var(--accent-subtle)', color: 'var(--accent-primary)', fontWeight: 600, borderRadius: 'var(--radius-xs)', border: '1px solid var(--accent-border)' }}>
            4. Governance Officer Review
          </span>
          <ArrowRight size={13} color="var(--text-muted)" />
          <span style={{ padding: '3px 8px', background: 'var(--accent-subtle)', color: 'var(--accent-primary)', fontWeight: 600, borderRadius: 'var(--radius-xs)', border: '1px solid var(--accent-border)' }}>
            5. Executive Approver Sign-Off
          </span>
          <ArrowRight size={13} color="var(--text-muted)" />
          <span style={{ padding: '3px 8px', background: 'var(--success-bg)', color: 'var(--success-text)', fontWeight: 600, borderRadius: 'var(--radius-xs)', border: '1px solid var(--success-border)' }}>
            6. Production Deployment
          </span>
        </div>
      </div>

      {/* Tab Switcher: Pending vs Completed History */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <button
          type="button"
          onClick={() => handleTabChange('pending')}
          style={{
            padding: '7px 16px',
            borderRadius: 'var(--radius-sm)',
            border: activeTab === 'pending' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
            backgroundColor: activeTab === 'pending' ? 'var(--accent-subtle)' : 'var(--bg-surface)',
            color: activeTab === 'pending' ? 'var(--accent-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Clock size={14} />
          <span>Pending Review Queue</span>
          <span className="badge badge-neutral font-mono" style={{ fontSize: '11px' }}>
            {pendingItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('completed')}
          style={{
            padding: '7px 16px',
            borderRadius: 'var(--radius-sm)',
            border: activeTab === 'completed' ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
            backgroundColor: activeTab === 'completed' ? 'var(--accent-subtle)' : 'var(--bg-surface)',
            color: activeTab === 'completed' ? 'var(--accent-primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <History size={14} />
          <span>Completed / Approved History</span>
          <span className="badge badge-neutral font-mono" style={{ fontSize: '11px' }}>
            {completedItems.length}
          </span>
        </button>
      </div>

      {notification && (
        <div style={{
          backgroundColor: notification.type === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
          border: `1px solid ${notification.type === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`,
          color: notification.type === 'error' ? 'var(--danger-text)' : 'var(--success-text)',
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '18px',
          fontSize: '13px'
        }}>
          {notification.msg}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <RefreshCw className="animate-spin" size={24} color="var(--accent-primary)" style={{ margin: '0 auto 10px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading approval review queue...</p>
        </div>
      ) : (activeTab === 'pending' ? pendingItems : completedItems).length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={activeTab === 'pending' ? "No Pending Approvals in Queue" : "No Completed Approvals Found"}
          description={
            activeTab === 'pending'
              ? "All eligible model versions have completed their required governance sign-offs or are currently undergoing technical evaluation."
              : "Completed and approved model versions will be cataloged here with their complete multi-stakeholder sign-off history."
          }
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
          
          {/* Items List for Active Tab */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              {activeTab === 'pending' ? `PENDING REVIEWS (${pendingItems.length})` : `APPROVED VERSIONS (${completedItems.length})`}
            </div>

            {(activeTab === 'pending' ? pendingItems : completedItems).map((item) => (
              <div
                key={item.version._id}
                onClick={() => setSelectedItem(item)}
                className="card"
                style={{
                  cursor: 'pointer',
                  padding: '14px',
                  borderColor: selectedItem?.version._id === item.version._id ? 'var(--accent-primary)' : 'var(--border-color)',
                  backgroundColor: selectedItem?.version._id === item.version._id ? 'var(--accent-subtle)' : 'var(--bg-surface)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                    {item.model?.name}
                  </div>
                  <span className="badge badge-neutral font-mono">{item.version.version}</span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: 1.4 }}>
                  {item.model?.purpose}
                </div>

                {(() => {
                  const { signedCount, totalCount, isComplete } = getApprovalProgress(item);
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      <span>Risk: {formatRiskLevel(item.model?.riskLevel)}</span>
                      <span className="tnum font-mono" style={{ color: isComplete ? 'var(--success-text)' : 'inherit' }}>
                        {signedCount}/{totalCount} Roles Signed
                      </span>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          {/* Selected Item Review & Sign-off Card */}
          {selectedItem && (() => {
            const evalData = selectedItem.version.latestEvaluationId;
            const isCompleted = selectedItem.version.lifecycleStatus === 'APPROVED' || selectedItem.version.lifecycleStatus === 'IN_PRODUCTION';

            return (
              <div className="card">
                <div className="card-header">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {selectedItem.model?.name} ({selectedItem.version.version})
                      </h2>
                      <RiskBadge level={selectedItem.model?.riskLevel} />
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      Registered owner: {selectedItem.model?.owner} • {selectedItem.model?.team}
                    </div>
                  </div>

                  <StatusBadge status={selectedItem.version.lifecycleStatus} />
                </div>

                {/* Rich Governance Gate Evidence */}
                <div style={{ padding: '14px 16px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', marginBottom: '18px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      GOVERNANCE EVALUATION EVIDENCE
                    </div>
                    {evalData?.datasetName && (
                      <span className="badge badge-neutral font-mono" style={{ fontSize: '10.5px' }}>
                        {evalData.datasetName}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Policy Gate</span>
                      <strong style={{ color: selectedItem.version.policyStatus === 'PASSED' ? 'var(--success-text)' : 'var(--danger-text)' }}>
                        {selectedItem.version.policyStatus}
                      </strong>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Disparate Impact (DIR)</span>
                      {evalData?.fairnessMetrics?.disparateImpactRatio !== undefined ? (
                        <strong className="tnum" style={{ color: evalData.fairnessMetrics.disparateImpactRatio >= 0.80 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                          {evalData.fairnessMetrics.disparateImpactRatio}
                        </strong>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Validated</span>
                      )}
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>ROC-AUC Metric</span>
                      <strong className="tnum">
                        {evalData?.performanceMetrics?.rocAuc !== null && evalData?.performanceMetrics?.rocAuc !== undefined ? evalData.performanceMetrics.rocAuc : 'Unavailable'}
                      </strong>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px' }}>Accuracy</span>
                      <strong className="tnum">
                        {evalData?.performanceMetrics?.accuracy ? `${(evalData.performanceMetrics.accuracy * 100).toFixed(1)}%` : '—'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Stakeholder Sign-off Matrix */}
                {(() => {
                  const { signedCount, totalCount, requiredRoles, isComplete: matrixComplete } = getApprovalProgress(selectedItem);
                  return (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          MANDATORY MULTI-STAKEHOLDER SIGN-OFF GATES
                        </div>
                        <span className="tnum font-mono" style={{ fontSize: '11.5px', fontWeight: 600, color: matrixComplete ? 'var(--success-text)' : 'var(--text-muted)' }}>
                          {signedCount}/{totalCount} Roles Signed
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {requiredRoles.map((roleKey) => {
                          const app = selectedItem.approvals?.find(a => a.role === roleKey);
                          const isApproved = app?.decision === 'APPROVED';

                          return (
                            <div
                              key={roleKey}
                              style={{
                                padding: '10px 14px',
                                background: 'var(--bg-subtle)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-color)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                                  {formatRoleLabel(roleKey)}
                                </div>
                                {app?.comment ? (
                                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px', fontStyle: 'italic' }}>
                                    "{app.comment}" — <span style={{ color: 'var(--text-muted)' }}>{app.approverName}</span>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pending formal sign-off</div>
                                )}
                              </div>

                              <div>
                                {isApproved ? (
                                  <span style={{ color: 'var(--success-text)', fontWeight: 500, fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <CheckCircle2 size={14} /> Approved
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--warning-text)', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock size={14} /> Pending
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Completed View: Audit Sealed Summary */}
                {isCompleted ? (
                  <div style={{
                    padding: '16px 18px',
                    backgroundColor: 'var(--success-bg)',
                    border: '1px solid var(--success-border)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <CheckCircle2 size={20} color="var(--success)" />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--success)' }}>
                          STAGE-GATE FORMALLY SEALED
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          All {getApprovalProgress(selectedItem).totalCount} mandatory governance sign-offs are complete and cryptographically committed to the audit ledger.
                        </div>
                      </div>
                    </div>

                    <Link 
                      to={`/app/dossier?modelId=${selectedItem.model?._id}&versionId=${selectedItem.version?._id}`}
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <FileText size={14} /> View Regulatory Dossier
                    </Link>
                  </div>
                ) : (
                  /* Pending View: Stakeholder Sign-off Action Form */
                  (() => {
                    const userRole = user?.role || 'GOVERNANCE_OFFICER';
                    const isStakeholderApprover = ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'].includes(userRole);
                    const existingApp = selectedItem.approvals?.find(a => a.role === userRole);

                    if (!isStakeholderApprover) {
                      return (
                        <div style={{
                          padding: '16px',
                          background: 'var(--bg-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border-color)',
                          textAlign: 'center'
                        }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--warning-bg)',
                            color: 'var(--warning-text)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 8px'
                          }}>
                            <ShieldCheck size={18} />
                          </div>
                          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
                            Sign-Off Restricted to Governance Stakeholder Roles
                          </div>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: '1.4' }}>
                            You are authenticated as <strong>{user?.name || user?.email}</strong> with role <strong style={{ color: 'var(--accent-primary)' }}>{userRole}</strong>.
                            {userRole === 'PLATFORM_ADMIN'
                              ? ' Platform Administrators manage platform configuration but do not satisfy domain approval gates (Separation of Duties).'
                              : ' Production promotions require formal sign-off from ML Lead, Governance Officer, and Executive Approver.'}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div style={{
                        padding: '16px',
                        background: 'var(--accent-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--accent-border)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <UserCheck size={16} color="var(--accent-primary)" />
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>
                              Sign-off Role: <span style={{ color: 'var(--accent-primary)' }}>{formatRoleLabel(userRole)}</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '6px' }}>
                                ({user?.name || currentRole.name})
                              </span>
                            </div>
                          </div>

                          {existingApp && (
                            <span className="badge badge-success font-mono" style={{ fontSize: '10.5px' }}>
                              Previously Recorded: {existingApp.decision}
                            </span>
                          )}
                        </div>

                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <label className="form-label">Review Decision</label>
                          <select
                            className="form-select"
                            value={decision}
                            onChange={(e) => setDecision(e.target.value)}
                          >
                            <option value="APPROVED">Approve (Satisfies governance and safety criteria)</option>
                            <option value="REJECTED">Reject (Violates institutional policy)</option>
                            <option value="CHANGES_REQUESTED">Request Changes (Remediation required)</option>
                          </select>
                        </div>

                        <div className="form-group" style={{ marginBottom: '12px' }}>
                          <label className="form-label">Governance Rationale / Findings *</label>
                          <textarea
                            rows="2"
                            className="form-textarea"
                            placeholder="Enter metric verification, bias findings, and explicit approval rationale..."
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            onClick={handleSubmitDecision}
                            disabled={submitting || !comment.trim()}
                            className="btn btn-primary btn-sm"
                          >
                            {submitting ? 'Recording Sign-off...' : `Record Formal ${decision}`}
                          </button>
                        </div>
                      </div>
                    );
                  })()
                )}

              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
}
