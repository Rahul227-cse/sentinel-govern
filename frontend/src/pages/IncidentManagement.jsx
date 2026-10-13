import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getIncidents, triggerRollback } from '../services/api';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import { getRoleCapabilities } from '../utils/permissions';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { formatIncidentType, formatStatusLabel } from '../utils/formatters';
import { 
  RotateCcw, 
  CheckCircle2, 
  ShieldAlert, 
  FileText, 
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

export default function IncidentManagement() {
  const navigate = useNavigate();
  const { currentRole } = useRole();
  const { user } = useAuth();
  const capabilities = getRoleCapabilities(user?.role);

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackSuccess, setRollbackSuccess] = useState(null);

  const loadIncidents = async () => {
    try {
      setLoading(true);
      const data = await getIncidents();
      setIncidents(data);
      if (data.length > 0) {
        setSelectedIncident(data[0]);
      } else {
        setSelectedIncident(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const handleExecuteRollback = async () => {
    if (!selectedIncident) return;
    try {
      setRollbackLoading(true);
      setRollbackSuccess(null);

      const targetVersionId = selectedIncident.recommendedRollbackVersionId?._id || selectedIncident.recommendedRollbackVersionId;

      if (!targetVersionId) {
        alert('No eligible rollback version identified for this incident.');
        return;
      }

      const res = await triggerRollback({
        incidentId: selectedIncident._id,
        modelId: selectedIncident.modelId._id || selectedIncident.modelId,
        targetVersionId,
        actor: user?.name || currentRole.name,
        role: user?.role || currentRole.id,
        rationale: `Automated safety mitigation for incident ${selectedIncident.incidentNumber} due to drift (PSI = ${selectedIncident.metricsSnapshot?.psi}) by ${user?.name || currentRole.name}`
      });

      setRollbackSuccess(res);
      await loadIncidents();
    } catch (err) {
      alert(`Rollback failed: ${err.message}`);
    } finally {
      setRollbackLoading(false);
    }
  };

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'HIGH':
      case 'CRITICAL':
        return <span className="status-badge status-danger">HIGH SEVERITY</span>;
      case 'MEDIUM':
        return <span className="status-badge status-warning">MEDIUM SEVERITY</span>;
      default:
        return <span className="status-badge status-neutral">{severity} SEVERITY</span>;
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        breadcrumbs={[
          { label: 'Workspace', link: '/app' },
          { label: 'Incidents' }
        ]}
        title="Governance Incident Management & Rollback"
        subtitle="Automated safety containment, statistical drift escalation, and verified cryptographic version rollback."
        action={
          <button 
            onClick={loadIncidents} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh Queue
          </button>
        }
      />

      {rollbackSuccess && (
        <div style={{
          marginBottom: '20px',
          padding: '16px 20px',
          backgroundColor: 'var(--success-bg)',
          border: '1px solid var(--success-border)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px'
        }}>
          <CheckCircle2 size={20} color="var(--success)" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--success)' }}>
              SAFE ROLLBACK EXECUTED SUCCESSFULLY
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.5' }}>
              Active production model <strong>{rollbackSuccess.modelName}</strong> was successfully restored to stable baseline version <strong>{rollbackSuccess.activeVersion}</strong>. Drifting version has been retired and marked mitigated. All changes are cryptographically committed to the audit ledger.
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
          <LoadingSkeleton height="350px" />
          <LoadingSkeleton height="350px" />
        </div>
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Zero Active Governance Incidents"
          description="All active production systems are operating within validated statistical drift tolerances. To test containment workflows, navigate to Monitoring and simulate telemetry drift."
          actionText="Open Monitoring"
          onAction={() => navigate('/app/monitoring')}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px', alignItems: 'start' }}>
          
          {/* Incident Queue */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ 
              fontSize: '11px', 
              fontWeight: 700, 
              color: 'var(--text-muted)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em',
              paddingLeft: '4px'
            }}>
              Active Incidents ({incidents.length})
            </div>

            {incidents.map((inc) => {
              const isSelected = selectedIncident?._id === inc._id;
              return (
                <div
                  key={inc._id}
                  onClick={() => setSelectedIncident(inc)}
                  style={{
                    cursor: 'pointer',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: isSelected ? 'var(--bg-card-elevated)' : 'var(--bg-card)',
                    border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {inc.incidentNumber}
                    </span>
                    {getSeverityBadge(inc.severity)}
                  </div>

                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {inc.modelId?.name || 'Production Model'} ({inc.versionId?.version || 'v1'})
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    {formatIncidentType(inc.type)}
                    {inc.issueReportRef && (
                      <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                        • Linked Report
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                    <StatusBadge status={inc.status} />
                    <span style={{ color: 'var(--text-muted)' }}>
                      {new Date(inc.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Incident Details & Rollback Executor */}
          {selectedIncident && (
            <div className="card" style={{ padding: '24px' }}>
              
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '18px', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Incident {selectedIncident.incidentNumber}
                    </h2>
                    {getSeverityBadge(selectedIncident.severity)}
                    <StatusBadge status={selectedIncident.status} />
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                    Target System: <strong style={{ color: 'var(--text-primary)' }}>{selectedIncident.modelId?.name}</strong> • Active Version: <strong style={{ color: 'var(--text-primary)' }}>{selectedIncident.versionId?.version}</strong>
                  </div>
                </div>
              </div>

              {/* Title & Description */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {selectedIncident.title}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  {selectedIncident.description}
                </div>
              </div>

              {/* Metrics Snapshot */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                <div style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {selectedIncident.metricsSnapshot?.source === 'EVIDENTLY' ? 'Drift Evidence' : 'Trigger PSI Metric'}
                  </div>
                  <div style={{ fontSize: selectedIncident.metricsSnapshot?.source === 'EVIDENTLY' ? '18px' : '22px', fontWeight: 700, color: 'var(--danger)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                    {selectedIncident.metricsSnapshot?.source === 'EVIDENTLY'
                      ? `${selectedIncident.metricsSnapshot?.driftedCount ?? selectedIncident.metricsSnapshot?.driftedColumns?.length ?? 0} Drifted`
                      : (selectedIncident.metricsSnapshot?.psi ?? 0.31)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {selectedIncident.metricsSnapshot?.source === 'EVIDENTLY' ? 'Source: Evidently' : 'Tolerance: \u2264 0.25'}
                  </div>
                </div>

                <div style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recommended Action</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--warning)', marginTop: '6px' }}>
                    {formatStatusLabel(selectedIncident.recommendedAction || 'Rollback to Previous')}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Containment protocol</div>
                </div>

                <div style={{ padding: '14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Baseline Target</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: selectedIncident.recommendedRollbackVersionId ? 'var(--success)' : 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                    {selectedIncident.recommendedRollbackVersionId?.version || 'None Available'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {selectedIncident.recommendedRollbackVersionId ? 'Validated stable release' : 'Initial version — no prior baseline'}
                  </div>
                </div>
              </div>

              {/* Evidently Drift Evidence breakdown */}
              {selectedIncident.metricsSnapshot?.source === 'EVIDENTLY' && selectedIncident.metricsSnapshot?.driftedColumns?.length > 0 && (
                <div style={{ marginBottom: '20px', padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    Evidently Drifted Features
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedIncident.metricsSnapshot.driftedColumns.map(col => (
                      <span key={col} className="status-badge status-danger" style={{ fontSize: '11px' }}>
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Originating Issue Report Link if Escalated */}
              {selectedIncident.issueReportRef && (
                <div style={{ 
                  padding: '14px 16px', 
                  backgroundColor: 'var(--accent-light)', 
                  borderRadius: 'var(--radius-md)', 
                  marginBottom: '20px', 
                  border: '1px solid var(--border-color)' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={14} /> Originating Issue Report: {selectedIncident.issueReportRef.reportNumber || 'Linked Report'}
                    </div>
                    <span className="status-badge status-neutral" style={{ fontSize: '10.5px' }}>
                      {selectedIncident.issueReportRef.issueType || 'GOVERNANCE SIGNAL'}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {selectedIncident.issueReportRef.title}
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    {selectedIncident.issueReportRef.description}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Reported by <strong style={{ color: 'var(--text-primary)' }}>{selectedIncident.issueReportRef.submittedBy || 'Employee'}</strong> on {new Date(selectedIncident.issueReportRef.createdAt).toLocaleDateString()}
                  </div>
                </div>
              )}

              {/* Mitigation Notes */}
              <div style={{ 
                padding: '14px 16px', 
                backgroundColor: 'var(--bg-secondary)', 
                borderRadius: 'var(--radius-md)', 
                marginBottom: '24px', 
                border: '1px solid var(--border-color)' 
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                  Remediation Log & Mitigation Notes
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.5', whiteSpace: 'pre-line' }}>
                  {selectedIncident.mitigationNotes || 'No preliminary notes logged.'}
                </div>
              </div>

              {/* Rollback Execution Box */}
              {selectedIncident.status !== 'MITIGATED' && selectedIncident.status !== 'CLOSED' ? (
                selectedIncident.recommendedRollbackVersionId ? (
                  <div style={{
                    padding: '18px 20px',
                    backgroundColor: 'var(--danger-bg)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--danger-border)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <ShieldAlert size={18} color="var(--danger)" />
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger)' }}>
                        Execute Controlled Production Rollback
                      </div>
                    </div>

                    <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
                      Authorizing rollback will immediately demote drifting version <strong style={{ color: 'var(--text-primary)' }}>{selectedIncident.versionId?.version}</strong>, restore stable baseline version <strong style={{ color: 'var(--text-primary)' }}>{selectedIncident.recommendedRollbackVersionId?.version}</strong> as active in production, update incident status to MITIGATED, and append an immutable cryptographic entry to the audit ledger.
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={handleExecuteRollback}
                        disabled={rollbackLoading || !capabilities.canRollback}
                        className="btn btn-danger"
                        title={!capabilities.canRollback ? "Rollback authorization requires ML Lead role" : ""}
                        style={!capabilities.canRollback ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                      >
                        {rollbackLoading ? (
                          <span>Executing Rollback...</span>
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <RotateCcw size={15} /> Authorize Rollback to {selectedIncident.recommendedRollbackVersionId?.version}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '18px 20px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <AlertTriangle size={18} color="var(--warning)" />
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Rollback Unavailable — No Prior Baseline Exists
                      </div>
                    </div>

                    <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: '1.5' }}>
                      This model version is the initial deployment with no pre-existing approved baseline in the model registry. Automated rollback requires an earlier verified release that passed all institutional policy gates.
                    </p>

                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                      <strong>Recommended Protocol:</strong> Initiate model retraining or promote a newly calibrated candidate version through Fairness Studio and Stage-Gate Approval Center.
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        disabled
                        className="btn btn-secondary"
                        style={{ opacity: 0.6, cursor: 'not-allowed' }}
                      >
                        Rollback Unavailable (No Baseline)
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div style={{ 
                  padding: '14px 18px', 
                  backgroundColor: 'var(--success-bg)', 
                  borderRadius: 'var(--radius-md)', 
                  border: '1px solid var(--success-border)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px' 
                }}>
                  <CheckCircle2 size={18} color="var(--success)" />
                  <span style={{ fontSize: '13px', color: 'var(--success)', fontWeight: 600 }}>
                    This incident has been mitigated via verified version rollback.
                  </span>
                </div>
              )}

            </div>
          )}

        </div>
      )}
    </div>
  );
}
