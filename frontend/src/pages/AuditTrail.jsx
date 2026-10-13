import React, { useEffect, useState } from 'react';
import { getAuditLedger, checkAuditIntegrity, simulateTamper, repairAuditLedger } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getRoleCapabilities } from '../utils/permissions';
import PageHeader from '../components/PageHeader';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import { formatRoleLabel, formatAuditAction } from '../utils/formatters';
import { 
  History, 
  ShieldCheck, 
  AlertTriangle, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Hash, 
  RotateCcw, 
  Filter 
} from 'lucide-react';

export default function AuditTrail() {
  const [ledger, setLedger] = useState([]);
  const [integrity, setIntegrity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [tampering, setTampering] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [filterAction, setFilterAction] = useState('');
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [message, setMessage] = useState(null);

  const { user } = useAuth();
  const capabilities = getRoleCapabilities(user?.role);

  const loadAuditData = async () => {
    try {
      setLoading(true);
      const [ledgerData, integrityData] = await Promise.all([
        getAuditLedger(filterAction ? { action: filterAction } : {}),
        checkAuditIntegrity()
      ]);
      setLedger(ledgerData || []);
      setIntegrity(integrityData);
      if (ledgerData && ledgerData.length > 0) {
        setSelectedBlock(ledgerData[0]);
      } else {
        setSelectedBlock(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditData();
  }, [filterAction]);

  const handleVerify = async () => {
    try {
      setVerifying(true);
      const res = await checkAuditIntegrity();
      setIntegrity(res);
      setMessage({
        type: res.valid ? 'success' : 'error',
        text: res.message
      });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setVerifying(false);
    }
  };

  const handleSimulateTamper = async () => {
    try {
      setTampering(true);
      const targetSeq = ledger[ledger.length - 1]?.sequenceNumber ?? 0;
      await simulateTamper({
        sequenceNumber: targetSeq,
        tamperedPayload: {
          tampered: true,
          unauthorizedChange: 'Malicious modification of risk level and evaluation metric',
          timestamp: new Date().toISOString()
        }
      });
      const res = await checkAuditIntegrity();
      setIntegrity(res);
      setMessage({
        type: 'error',
        text: `Tamper injected into Block #${targetSeq}! Cryptographic verification correctly detected hash mismatch.`
      });
      await loadAuditData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setTampering(false);
    }
  };

  const handleRepairLedger = async () => {
    try {
      setRepairing(true);
      const res = await repairAuditLedger();
      const check = await checkAuditIntegrity();
      setIntegrity(check);
      setMessage({
        type: 'success',
        text: res.message || 'Ledger cryptographic hash chain successfully restored & re-sealed.'
      });
      await loadAuditData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setRepairing(false);
    }
  };

  const getActionBadge = (action) => {
    const formatted = formatAuditAction(action);
    if (action.includes('PASSED') || action.includes('GRANTED') || action.includes('COMPLETED')) {
      return <span className="status-badge status-success">{formatted}</span>;
    }
    if (action.includes('FAILED') || action.includes('REJECTED') || action.includes('DRIFT') || action.includes('ROLLBACK')) {
      return <span className="status-badge status-danger">{formatted}</span>;
    }
    if (action.includes('ESCALATED') || action.includes('INCIDENT')) {
      return <span className="status-badge status-warning">{formatted}</span>;
    }
    return <span className="status-badge status-neutral">{formatted}</span>;
  };

  return (
    <div className="page-container">
      <PageHeader
        breadcrumbs={[
          { label: 'Governance', link: '/app' },
          { label: 'Audit Trail' }
        ]}
        title="Cryptographic Audit Ledger"
        subtitle="Tamper-evident SHA-256 hash-chained immutable sequence of all lifecycle transitions and compliance gates."
        action={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              onClick={handleVerify} 
              disabled={verifying} 
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={13} className={verifying ? 'animate-spin' : ''} />
              Re-verify Chain Integrity
            </button>

            {/* Demo Mode Controls: Expose tamper simulation & hash re-sealing ONLY when demo mode is active */}
            {integrity?.demoModeEnabled && (
              <>
                {integrity?.valid === false && capabilities.canRepairAudit && (
                  <button
                    onClick={handleRepairLedger}
                    disabled={repairing}
                    className="btn btn-primary btn-sm"
                    style={{ backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}
                    title="Demonstration feature only: re-seal ledger hashes"
                  >
                    <RotateCcw size={13} style={{ marginRight: '4px' }} /> Restore &amp; Re-seal
                  </button>
                )}
                {capabilities.canSimulateTamper && (
                  <button 
                    onClick={handleSimulateTamper} 
                    disabled={tampering} 
                    className="btn btn-danger btn-sm"
                    title="Demonstrate tamper detection for audit verification (Demo Mode Only)"
                  >
                    <AlertTriangle size={13} style={{ marginRight: '4px' }} /> Simulate Tamper
                  </button>
                )}
              </>
            )}
          </div>
        }
      />

      {/* Verification Message */}
      {message && (
        <div style={{
          marginBottom: '20px',
          padding: '14px 18px',
          backgroundColor: message.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
          border: `1px solid ${message.type === 'success' ? 'var(--success-border)' : 'var(--danger-border)'}`,
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {message.type === 'success' ? <CheckCircle2 size={18} color="var(--success)" /> : <XCircle size={18} color="var(--danger)" />}
            <span style={{ fontSize: '13px', fontWeight: 600, color: message.type === 'success' ? 'var(--success)' : 'var(--danger)' }}>
              {message.text}
            </span>
          </div>
          <button 
            onClick={() => setMessage(null)} 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Cryptographic Integrity Status Banner */}
      <div className="card" style={{ 
        marginBottom: '20px', 
        padding: '20px 24px',
        borderColor: integrity?.valid ? 'var(--success-border)' : 'var(--danger-border)',
        backgroundColor: integrity?.valid ? 'var(--success-bg)' : 'var(--danger-bg)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-surface-elevated)',
              border: `1px solid ${integrity?.valid ? 'var(--success-border)' : 'var(--danger-border)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: integrity?.valid ? 'var(--success)' : 'var(--danger)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              {integrity?.valid ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
            </div>

            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: integrity?.valid ? 'var(--success)' : 'var(--danger)' }}>
                AUDIT CHAIN INTEGRITY: {integrity?.valid ? 'VALID (SHA-256 Verified)' : 'BROKEN / TAMPER DETECTED'}
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {integrity?.message || 'Inspecting cryptographic state...'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '24px', fontSize: '12.5px' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Verified Blocks: </span>
              <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{integrity?.totalBlocks ?? ledger.length}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Algorithm: </span>
              <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>SHA-256</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Broken at Sequence: </span>
              <strong style={{ color: integrity?.brokenAtSequence !== null && integrity?.brokenAtSequence !== undefined ? 'var(--danger)' : 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                {integrity?.brokenAtSequence !== null && integrity?.brokenAtSequence !== undefined ? `#${integrity?.brokenAtSequence}` : 'None'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '12px 18px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Filter size={14} color="var(--text-muted)" />
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontWeight: 600 }}>Filter by Action:</span>
          <select
            className="input-field"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            style={{ width: '260px', padding: '6px 10px', fontSize: '12px' }}
          >
            <option value="">All Governance Actions</option>
            <option value="MODEL_CREATED">Model Created</option>
            <option value="VERSION_CREATED">Version Created</option>
            <option value="LIFECYCLE_TRANSITION">Lifecycle Transition</option>
            <option value="RISK_ASSESSED">Risk Assessed</option>
            <option value="EVALUATION_COMPLETED">Evaluation Completed</option>
            <option value="POLICY_CREATED">Policy Created</option>
            <option value="POLICY_UPDATED">Policy Updated</option>
            <option value="POLICY_PASSED">Policy Passed</option>
            <option value="POLICY_FAILED">Policy Failed</option>
            <option value="APPROVAL_GRANTED">Approval Granted</option>
            <option value="APPROVAL_REJECTED">Approval Rejected</option>
            <option value="DEPLOYMENT_COMPLETED">Deployment Completed</option>
            <option value="DRIFT_DETECTED">Drift Detected</option>
            <option value="ISSUE_REPORT_CREATED">Issue Report Created</option>
            <option value="ISSUE_REPORT_UPDATED">Issue Report Updated</option>
            <option value="ISSUE_ESCALATED_TO_INCIDENT">Issue Escalated to Incident</option>
            <option value="INCIDENT_CREATED">Incident Created</option>
            <option value="INCIDENT_STATUS_UPDATED">Incident Status Updated</option>
            <option value="ROLLBACK_STARTED">Rollback Started</option>
            <option value="ROLLBACK_COMPLETED">Rollback Completed</option>
            <option value="USER_CREATED">User Created</option>
            <option value="ROLE_ASSIGNED">Role Assigned</option>
            <option value="USER_STATUS_CHANGED">User Status Changed</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
          <LoadingSkeleton height="400px" />
          <LoadingSkeleton height="400px" />
        </div>
      ) : ledger.length === 0 ? (
        <EmptyState
          icon={History}
          title="No Audit Records Found"
          description={filterAction ? "No governance events matched the selected filter action." : "No cryptographic audit entries exist yet in this repository."}
          actionText={filterAction ? "Clear Filter" : undefined}
          onAction={filterAction ? () => setFilterAction('') : undefined}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px', alignItems: 'start' }}>
          
          {/* Hash Chain Blocks List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ledger.map((block) => {
              const isSelected = selectedBlock?._id === block._id;

              return (
                <div
                  key={block._id}
                  onClick={() => setSelectedBlock(block)}
                  style={{
                    cursor: 'pointer',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: isSelected ? 'var(--color-surface)' : 'var(--color-surface-subtle)',
                    border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                        #{block.sequenceNumber}
                      </span>
                      {getActionBadge(block.action)}
                    </div>

                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      {new Date(block.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{block.actor}</strong> ({formatRoleLabel(block.role)}) • Entity: <strong style={{ color: 'var(--text-primary)' }}>{block.entityType}</strong>
                  </div>

                  {(block.payload?.modelName || block.payload?.modelId || block.payload?.version) && (
                    <div style={{ fontSize: '11.5px', color: 'var(--accent-primary)', marginBottom: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {(block.payload?.modelName || block.payload?.modelId) && (
                        <span>Model: <strong>{block.payload.modelName || block.payload.modelId}</strong></span>
                      )}
                      {(block.payload?.version || block.payload?.versionId) && (
                        <span>Version: <strong>{block.payload.version || block.payload.versionId}</strong></span>
                      )}
                    </div>
                  )}

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '6px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ width: '70px', flexShrink: 0 }}>Hash:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{block.currentHash.substring(0, 28)}...</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ width: '70px', flexShrink: 0 }}>Prev Hash:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{block.previousHash.substring(0, 28)}...</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Block Payload Inspector */}
          {selectedBlock && (
            <div className="card" style={{ position: 'sticky', top: '90px', padding: '24px' }}>
              <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  <Hash size={16} color="var(--accent-primary)" />
                  Block #{selectedBlock.sequenceNumber} Payload Inspector
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Action & Actor</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {formatAuditAction(selectedBlock.action)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {selectedBlock.actor} ({formatRoleLabel(selectedBlock.role)})
                  </div>
                </div>

                {(selectedBlock.payload?.modelName || selectedBlock.payload?.modelId || selectedBlock.payload?.version) && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Model & Version Traceability</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      {selectedBlock.payload.modelName && <span>Model: <strong>{selectedBlock.payload.modelName}</strong> </span>}
                      {selectedBlock.payload.modelId && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({selectedBlock.payload.modelId}) </span>}
                      {selectedBlock.payload.version && <span>• Version: <strong>{selectedBlock.payload.version}</strong> </span>}
                      {selectedBlock.payload.versionId && <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({selectedBlock.payload.versionId})</span>}
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Timestamp</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    {new Date(selectedBlock.timestamp).toISOString()}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>SHA-256 Current Hash</div>
                  <div style={{ fontSize: '11px', wordBreak: 'break-all', display: 'block', marginTop: '4px', fontFamily: 'var(--font-mono)', padding: '6px 8px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', color: 'var(--accent-primary)' }}>
                    {selectedBlock.currentHash}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Previous Block Link Hash</div>
                  <div style={{ fontSize: '11px', wordBreak: 'break-all', display: 'block', marginTop: '4px', fontFamily: 'var(--font-mono)', padding: '6px 8px', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    {selectedBlock.previousHash}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                    Payload Snapshot Data
                  </div>
                  <pre style={{
                    padding: '12px 14px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '11.5px',
                    fontFamily: 'var(--font-mono)',
                    overflowX: 'auto',
                    border: '1px solid var(--border-color)',
                    maxHeight: '280px',
                    color: 'var(--text-primary)',
                    lineHeight: '1.4'
                  }}>
                    {JSON.stringify(selectedBlock.payload, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
