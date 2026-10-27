import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getModels, getComplianceDossier, downloadComplianceDossierPdf } from '../services/api';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import LoadingSkeleton from '../components/LoadingSkeleton';
import EmptyState from '../components/EmptyState';
import { 
  formatRoleLabel, 
  formatRiskLevel, 
  formatAuditAction,
  formatLifecycleLabel,
  formatStatusLabel,
  formatDriftStatus
} from '../utils/formatters';
import { 
  Download, 
  Printer, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  Scale, 
  History,
  Database,
  GitBranch,
  Activity,
  AlertCircle,
  HelpCircle,
  FileText
} from 'lucide-react';

export default function ComplianceDossier() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryModelId = searchParams.get('modelId');
  const queryVersionId = searchParams.get('versionId');

  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        setError(null);
        const list = await getModels();
        setModels(list || []);

        const targetModelId = queryModelId || list[0]?._id;
        if (targetModelId) {
          setSelectedModelId(targetModelId);
          setSelectedVersionId(queryVersionId || '');
          const data = await getComplianceDossier(targetModelId, queryVersionId || '');
          setDossier(data);
          if (data?.versionDetails?.id) {
            setSelectedVersionId(data.versionDetails.id);
          }
        }
      } catch (err) {
        console.error('Failed to load compliance dossier:', err);
        setError(err.message || 'Failed to load compliance dossier');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [queryModelId, queryVersionId]);

  const handleModelChange = async (mId) => {
    setSelectedModelId(mId);
    setSelectedVersionId('');
    setSearchParams({ modelId: mId });
    try {
      setLoading(true);
      setError(null);
      const data = await getComplianceDossier(mId);
      setDossier(data);
      if (data?.versionDetails?.id) {
        setSelectedVersionId(data.versionDetails.id);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load compliance dossier');
    } finally {
      setLoading(false);
    }
  };

  const handleVersionChange = async (vId) => {
    setSelectedVersionId(vId);
    setSearchParams({ modelId: selectedModelId, versionId: vId });
    try {
      setLoading(true);
      setError(null);
      const data = await getComplianceDossier(selectedModelId, vId);
      setDossier(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to load compliance dossier');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!dossier || !selectedModelId) return;
    try {
      setDownloadingPdf(true);
      await downloadComplianceDossierPdf(
        selectedModelId,
        selectedVersionId,
        dossier.modelCard?.name || 'Model',
        dossier.versionDetails?.version || 'v1.0'
      );
    } catch (err) {
      console.error('PDF export error:', err);
      alert(`PDF Export Failed: ${err.message}`);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadJSON = () => {
    if (!dossier) return;
    const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI_Governance_Dossier_${(dossier.modelCard?.name || 'Model').replace(/[^a-zA-Z0-9_-]/g, '_')}_${dossier.versionDetails?.version || 'v1'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    if (!dossier) return;
    const {
      dossierMetadata,
      executiveSummary,
      modelCard,
      riskAssessment,
      versionDetails,
      governancePolicy,
      evaluations,
      approvalStatusSummary,
      approvals,
      monitoringEvidence,
      incidents,
      issueReports,
      auditLogSummary,
      disclaimers
    } = dossier;

    const md = `# ${dossierMetadata.title}
*Generated at: ${new Date(dossierMetadata.generatedAt).toUTCString()}*
*Notice: ${dossierMetadata.classificationNotice}*
*Cryptographic Chain Integrity: ${dossierMetadata.cryptographicChainIntegrity}*

---

## Executive Governance Summary
- **Overall Governance State**: ${executiveSummary?.overallGovernanceState}
- **EU AI Act Risk Tier**: ${executiveSummary?.riskLevel}
- **Policy Compliance**: ${executiveSummary?.policyStatus}
- **Approval Sign-off**: ${executiveSummary?.approvalStatus}
- **Production Monitoring Health**: ${executiveSummary?.monitoringStatus}
- **Active Incidents**: ${executiveSummary?.openIncidentsCount}
- **Active Issue Reports**: ${executiveSummary?.openIssuesCount}
- **Audit Ledger Integrity**: ${executiveSummary?.auditIntegrity}

---

## 1. System Identity & Model Card
- **Model Name**: ${modelCard.name}
- **System Description**: ${modelCard.description}
- **Intended Purpose**: ${modelCard.purpose}
- **System Owner & Team**: ${modelCard.owner} (${modelCard.team})
- **Architecture / Type**: ${modelCard.modelType}
- **Risk Level**: ${modelCard.riskLevel}
- **Model Lifecycle Status**: ${modelCard.lifecycleStatus}
- **Intended Users**: ${modelCard.intendedUsers?.join(', ') || 'Not specified'}
- **Protected Attributes**: ${modelCard.protectedAttributes?.join(', ') || 'None specified'}

---

## 2. Risk Assessment & Regulatory Alignment
- **Classification**: ${riskAssessment?.euAiActClassification || 'HIGH'}
- **Framework Alignment**: ${riskAssessment?.frameworkAlignment?.join(', ') || 'EU_AI_ACT_ANNEX_III, NIST_AI_RMF_GOVERN'}
- **Safety Impact Rating**: ${riskAssessment?.safetyImpactRating || 'Significant'}
- **Autonomy Level**: ${riskAssessment?.autonomyLevel || 'Human-in-the-loop'}
- **Assessment Notes**: ${riskAssessment?.assessmentNotes || 'None recorded'}

---

## 3. Version Lineage & Deployment Record
- **Version**: ${versionDetails.version}
- **Lifecycle Status**: ${versionDetails.lifecycleStatus}
- **Deployment Status**: ${versionDetails.deploymentStatus}
- **Active in Production**: ${versionDetails.isProduction ? 'YES (Current Production Version)' : 'NO'}
- **Changelog**: ${versionDetails.changelog || 'None recorded'}
- **Training Dataset**: ${versionDetails.dataset?.name || 'N/A'} (${versionDetails.dataset?.sampleCount?.toLocaleString() || 0} samples)
- **Data Hash**: \`${versionDetails.dataset?.dataHash || 'N/A'}\`

---

## 4. Statistical Performance & Fairness Evaluations
${evaluations && evaluations.length > 0 ? evaluations.map((e, idx) => `
### Evaluation #${idx + 1}: ${e.datasetName}
- **Data Source**: ${e.dataSource} ${e.uploadedFileMeta?.filename ? `(File: ${e.uploadedFileMeta.filename})` : ''}
- **Evaluated At**: ${new Date(e.evaluatedAt).toUTCString()}
- **Performance**:
  - Accuracy: ${(e.performanceMetrics.accuracy * 100).toFixed(1)}% | ROC-AUC: ${e.performanceMetrics.rocAuc !== null && e.performanceMetrics.rocAuc !== undefined ? e.performanceMetrics.rocAuc : 'Unavailable (no scores provided)'}
  - Precision: ${e.performanceMetrics.precision} | Recall: ${e.performanceMetrics.recall} | F1: ${e.performanceMetrics.f1}
- **Fairness (Protected Attribute: ${e.fairnessMetrics.protectedAttribute || 'NONE'})**:
  - Disparate Impact Ratio: ${e.fairnessMetrics.disparateImpactRatio}${governancePolicy?.rules?.minDisparateImpact !== undefined ? ` (Policy-defined fairness threshold: >= ${governancePolicy.rules.minDisparateImpact})` : ''}
  - Demographic Parity Diff: ${e.fairnessMetrics.demographicParityDiff}${governancePolicy?.rules?.maxDemographicParityDiff !== undefined ? ` (Policy threshold: <= ${governancePolicy.rules.maxDemographicParityDiff})` : ''}
`).join('\n') : '*No recorded evaluation available for this version.*'}

---

## 5. Governance Policy & Stage-Gate Decision
${governancePolicy ? `
- **Applicable Policy**: ${governancePolicy.name} (Risk Level: ${governancePolicy.targetRiskLevel})
- **Policy Rules**: Min DIR >= ${governancePolicy.rules?.minDisparateImpact || 0.80} | Max Parity Diff <= ${governancePolicy.rules?.maxDemographicParityDiff || 0.10} | Min ROC-AUC >= ${governancePolicy.rules?.minRocAuc || 0.85}
- **Policy Evaluation Status**: ${versionDetails.policyStatus}
- **Latest Gate Decision**: ${versionDetails.latestPolicyEvaluation?.overallDecision || 'NOT_EVALUATED'}
` : '*No governance policy configured for this risk level.*'}

---

## 6. Multi-Stakeholder Stage-Gate Sign-Off Ledger
- **Approval State**: ${versionDetails.approvalStatus}
- **Required Roles**: ${approvalStatusSummary?.requiredRoles?.join(', ') || 'None'}
- **Approved Roles**: ${approvalStatusSummary?.approvedRoles?.join(', ') || 'None'}
- **Pending Roles**: ${approvalStatusSummary?.pendingRoles?.join(', ') || 'None'}

### Recorded Sign-Offs:
${approvals && approvals.length > 0 ? approvals.map(a => `
- **${a.role.replace(/_/g, ' ')}**: ${a.decision} by ${a.approverName} on ${new Date(a.decidedAt).toUTCString()}
  *"${a.comment || 'No comment provided'}"*
`).join('\n') : '*No approval evidence recorded for this version.*'}

---

## 7. Production Runtime Monitoring & Drift Signals
${monitoringEvidence?.latestTelemetry ? `
- **Latest Batch**: ${monitoringEvidence.latestTelemetry.batchId} (${monitoringEvidence.latestTelemetry.aggregatePsi != null ? `Aggregate PSI: ${monitoringEvidence.latestTelemetry.aggregatePsi} - ` : ''}${monitoringEvidence.latestTelemetry.driftStatus})
- **Runtime Performance**: Volume ${monitoringEvidence.latestTelemetry.performanceTelemetry?.predictionVolume || 0} | Latency ${monitoringEvidence.latestTelemetry.performanceTelemetry?.avgLatencyMs || 0} ms | Error Rate ${((monitoringEvidence.latestTelemetry.performanceTelemetry?.errorRate || 0) * 100).toFixed(2)}%
` : '*No monitoring data available.*'}

---

## 8. Operational Incidents & Corrective Actions
${incidents && incidents.length > 0 ? incidents.map(inc => `
- **[${inc.incidentNumber}] ${inc.title}** (${inc.severity} Severity)
  - Type: ${inc.type} | Status: ${inc.status}
  - Action: ${inc.recommendedAction} ${inc.recommendedRollbackVersionId ? `(Target: ${inc.recommendedRollbackVersionId.version || 'Linked'})` : ''}
`).join('\n') : '*No incidents recorded for this version.*'}

---

## 9. Employee Issue Reports
${issueReports && issueReports.length > 0 ? issueReports.map(iss => `
- **[${iss.reportNumber}] ${iss.title}** (${iss.severity} Severity)
  - Type: ${iss.issueType} | Status: ${iss.status} | Submitted By: ${iss.submittedBy}
`).join('\n') : '*No issue reports submitted for this model or version.*'}

---

## 10. Immutable Cryptographic Audit Ledger (SHA-256 Digest)
- **Chain Integrity**: ${dossierMetadata.cryptographicChainIntegrity}
- **Audit Records**: ${auditLogSummary?.length || 0}

---

## Governance Disclaimers
${disclaimers?.legalNotice || 'Classification Notice: AI Governance Risk Assessment aligned with selected regulatory concepts (EU AI Act & NIST AI RMF). Not an official legal certification.'}
`;

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI_Governance_Dossier_${(dossier.modelCard?.name || 'Model').replace(/[^a-zA-Z0-9_-]/g, '_')}_${dossier.versionDetails?.version || 'v1'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="page-container">
      <PageHeader
        breadcrumbs={[
          { label: 'Governance', to: '/app' },
          { label: 'Compliance Dossier' }
        ]}
        title="Compliance & Governance Technical Dossier"
        subtitle="Authoritative, evidence-based technical documentation and governance dossier aligned with EU AI Act and NIST AI RMF frameworks."
      >
        <div className="no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            id="download-dossier-pdf-btn"
            onClick={handleDownloadPDF} 
            className="btn btn-primary btn-sm" 
            disabled={!dossier || downloadingPdf}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
            title="Download official A4 compliance dossier PDF with selectable text"
          >
            <FileText size={14} /> {downloadingPdf ? 'Generating PDF...' : 'Download PDF'}
          </button>
          <button 
            onClick={handleDownloadMarkdown} 
            className="btn btn-secondary btn-sm" 
            disabled={!dossier}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={13} /> Export Markdown
          </button>
          <button 
            onClick={handleDownloadJSON} 
            className="btn btn-secondary btn-sm" 
            disabled={!dossier}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={13} /> Export JSON
          </button>
          <button 
            onClick={handlePrint} 
            className="btn btn-secondary btn-sm" 
            disabled={!dossier}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Printer size={13} /> Print View
          </button>
        </div>
      </PageHeader>

      {/* Model & Version Selectors */}
      {models.length > 0 && (
        <div className="card no-print" style={{ padding: '14px 18px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)' }}>Target Model:</span>
              <select
                className="input-field"
                value={selectedModelId}
                onChange={(e) => handleModelChange(e.target.value)}
                style={{ width: '280px', padding: '6px 10px', fontSize: '12px' }}
              >
              {models.map(m => (
                <option key={m._id} value={m._id}>{m.name} ({formatRiskLevel(m.riskLevel)} Risk)</option>
              ))}
            </select>
          </div>

          {dossier?.availableVersions && dossier.availableVersions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)' }}>Version:</span>
              <select
                className="input-field"
                value={selectedVersionId}
                onChange={(e) => handleVersionChange(e.target.value)}
                style={{ width: '240px', padding: '6px 10px', fontSize: '12px' }}
              >
                {dossier.availableVersions.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.version} — {v.lifecycleStatus} {v.isProduction ? '★ (PROD)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {dossier?.versionDetails?.isProduction && (
              <span className="status-badge status-success">
                ★ Active Production Version
              </span>
            )}
            <button 
              id="model-toolbar-download-pdf-btn"
              onClick={handleDownloadPDF} 
              className="btn btn-primary btn-sm" 
              disabled={!dossier || downloadingPdf}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              title="Download official A4 compliance dossier PDF with selectable text"
            >
              <FileText size={14} /> {downloadingPdf ? 'Generating PDF...' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>
      )}

      {error && (
        <div style={{
          marginBottom: '20px',
          padding: '14px 18px',
          backgroundColor: 'var(--danger-bg)',
          border: '1px solid var(--danger-border)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <AlertTriangle size={18} color="var(--danger)" />
          <div style={{ fontSize: '13px', color: 'var(--danger)', fontWeight: 600 }}>
            Failed to compile dossier: {error}
          </div>
        </div>
      )}

      {loading && !dossier ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <LoadingSkeleton height="160px" />
          <LoadingSkeleton height="200px" />
          <LoadingSkeleton height="200px" />
        </div>
      ) : dossier ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Executive Governance Summary Card */}
          <div className="card" style={{ padding: '24px', borderLeft: '4px solid var(--accent-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em' }}>
                  Confidential AI Governance Evidence &amp; Technical Dossier
                </span>
                <h2 style={{ fontSize: '20px', fontWeight: 800, marginTop: '4px', color: 'var(--text-primary)', margin: 0 }}>
                  {dossier.dossierMetadata.title}
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Generated on {new Date(dossier.dossierMetadata.generatedAt).toLocaleString()}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <StatusBadge status={dossier.modelCard?.riskLevel || 'MINIMAL'} />
                <div style={{ 
                  fontSize: '11.5px', 
                  color: dossier.dossierMetadata?.cryptographicChainIntegrity === 'VALID' ? 'var(--success)' : 'var(--danger)', 
                  marginTop: '6px', 
                  fontWeight: 600, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px', 
                  justifyContent: 'flex-end' 
                }}>
                  <ShieldCheck size={14} />
                  Audit Chain: {dossier.dossierMetadata?.cryptographicChainIntegrity}
                </div>
              </div>
            </div>

            {/* Executive KPIs Banner */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                  Lifecycle State
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {formatLifecycleLabel(dossier.executiveSummary?.overallGovernanceState)}
                </div>
              </div>

              <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                  Policy Gate
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: dossier.executiveSummary?.policyStatus === 'PASSED' ? 'var(--success)' : dossier.executiveSummary?.policyStatus === 'FAILED' ? 'var(--danger)' : 'var(--warning)', marginTop: '4px' }}>
                  {formatStatusLabel(dossier.executiveSummary?.policyStatus)}
                </div>
              </div>

              <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                  Sign-off Status
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: dossier.executiveSummary?.approvalStatus === 'APPROVED' ? 'var(--success)' : dossier.executiveSummary?.approvalStatus === 'REJECTED' ? 'var(--danger)' : 'var(--warning)', marginTop: '4px' }}>
                  {formatStatusLabel(dossier.executiveSummary?.approvalStatus)}
                </div>
              </div>

              <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                  Monitoring Health
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: dossier.executiveSummary?.monitoringStatus === 'HEALTHY' ? 'var(--success)' : dossier.executiveSummary?.monitoringStatus === 'DRIFT_DETECTED' ? 'var(--danger)' : 'var(--text-muted)', marginTop: '4px' }}>
                  {formatDriftStatus(dossier.executiveSummary?.monitoringStatus)}
                </div>
              </div>
            </div>

            <div style={{ 
              padding: '10px 14px', 
              backgroundColor: 'var(--bg-secondary)', 
              borderRadius: 'var(--radius-sm)', 
              border: '1px solid var(--border-color)',
              fontSize: '11.5px',
              color: 'var(--text-secondary)',
              lineHeight: '1.4'
            }}>
              {dossier.dossierMetadata.classificationNotice}
            </div>
          </div>

          {/* Section 1: Model Card & Purpose */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <Database size={16} color="var(--accent-primary)" /> 1. System Description &amp; Model Identity
              </div>
              <span className="status-badge status-neutral">Registered Model</span>
            </div>
            
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.6' }}>
              {dossier.modelCard.description}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', padding: '14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Operational Purpose</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px', fontWeight: 500 }}>{dossier.modelCard.purpose}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>System Owner &amp; Team</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px', fontWeight: 500 }}>{dossier.modelCard.owner} ({dossier.modelCard.team})</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Architecture / Type</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px', fontWeight: 500 }}>{dossier.modelCard.modelType}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Intended Users</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px', fontWeight: 500 }}>
                  {dossier.modelCard.intendedUsers?.length > 0 ? dossier.modelCard.intendedUsers.join(', ') : 'Not specified'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Protected Attributes</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px', fontWeight: 500 }}>
                  {dossier.modelCard.protectedAttributes?.length > 0 ? dossier.modelCard.protectedAttributes.join(', ') : 'None specified'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Registered By</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px', fontWeight: 500 }}>
                  {dossier.modelCard.createdBy?.name || 'Authorized Lead'} ({dossier.modelCard.createdBy?.email || 'N/A'})
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Risk Assessment & Regulatory Alignment */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <ShieldCheck size={16} color="var(--accent-primary)" /> 2. Risk Assessment &amp; Regulatory Alignment
              </div>
              <span className="status-badge status-warning">EU AI Act &amp; NIST AI RMF</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>EU AI Act Classification</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {dossier.riskAssessment?.euAiActClassification || 'HIGH'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Safety Impact Rating</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {dossier.riskAssessment?.safetyImpactRating || 'Significant'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Autonomy Level</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {dossier.riskAssessment?.autonomyLevel || 'Human-in-the-loop'}
                </div>
              </div>
            </div>

            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              <strong>Framework Alignment:</strong> {dossier.riskAssessment?.frameworkAlignment?.join(', ') || 'EU AI Act Annex III, NIST AI RMF Govern'}
            </div>
            {dossier.riskAssessment?.assessmentNotes && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                <em>Notes: {dossier.riskAssessment.assessmentNotes}</em>
              </div>
            )}
          </div>

          {/* Section 3: Version Lineage & Deployment Record */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <GitBranch size={16} color="var(--accent-primary)" /> 3. Version Lineage &amp; Deployment Record
              </div>
              <span className="status-badge status-neutral">Target Version: {dossier.versionDetails?.version}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Lifecycle Status</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {dossier.versionDetails?.lifecycleStatus}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Deployment Status</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {dossier.versionDetails?.deploymentStatus}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Training Dataset</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                  {dossier.versionDetails?.dataset?.name || 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sample Count</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                  {dossier.versionDetails?.dataset?.sampleCount?.toLocaleString() || 0} rows
                </div>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <div><strong>Changelog / Modifications:</strong> {dossier.versionDetails?.changelog || 'None recorded'}</div>
              <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                Training Data Hash: {dossier.versionDetails?.dataset?.dataHash || 'N/A'}
              </div>
            </div>
          </div>

          {/* Section 4: Performance & Fairness Evaluations */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <Scale size={16} color="var(--accent-primary)" /> 4. Statistical Fairness &amp; Performance Verification
              </div>
              <span className="status-badge status-neutral">
                Evaluations: {dossier.evaluations?.length || 0}
              </span>
            </div>

            {dossier.evaluations && dossier.evaluations.length > 0 ? (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Benchmark Dataset</th>
                      <th>Data Source</th>
                      <th>Disparate Impact (DIR)</th>
                      <th>Demographic Parity</th>
                      <th>Accuracy</th>
                      <th>ROC-AUC</th>
                      <th>Evaluated On</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.evaluations.map((e) => (
                      <tr key={e._id}>
                        <td><strong style={{ color: 'var(--text-primary)' }}>{e.datasetName}</strong></td>
                        <td>
                          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                            {e.dataSource === 'FILE_UPLOAD' ? `Upload (${e.uploadedFileMeta?.fileType || 'file'})` : e.dataSource}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                            {e.fairnessMetrics?.disparateImpactRatio ?? 'N/A'}
                          </span>
                          {dossier.governancePolicy?.rules?.minDisparateImpact !== undefined && (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                              Policy Threshold: &ge; {dossier.governancePolicy.rules.minDisparateImpact}
                            </span>
                          )}
                        </td>

                        <td style={{ fontFamily: 'var(--font-mono)' }}>{e.fairnessMetrics?.demographicParityDiff}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{((e.performanceMetrics?.accuracy || 0) * 100).toFixed(1)}%</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          {e.performanceMetrics?.rocAuc !== null && e.performanceMetrics?.rocAuc !== undefined ? e.performanceMetrics.rocAuc : 'Unavailable'}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(e.evaluatedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <HelpCircle size={20} style={{ opacity: 0.5, marginBottom: '4px' }} />
                <div>No recorded evaluation available for this version.</div>
              </div>
            )}
          </div>

          {/* Section 5: Governance Policy Decision */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <ShieldCheck size={16} color="var(--accent-primary)" /> 5. Governance Policy &amp; Stage-Gate Decision
              </div>
              <StatusBadge status={dossier.versionDetails?.policyStatus} />
            </div>

            {dossier.governancePolicy ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Applicable Policy</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {dossier.governancePolicy.name}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Target Risk Level</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {dossier.governancePolicy.targetRiskLevel}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Failure Action</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {dossier.governancePolicy.failureAction}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text-primary)' }}>Policy Thresholds:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                    <span>Min Disparate Impact: <strong>&ge; {dossier.governancePolicy.rules?.minDisparateImpact || 0.80}</strong></span>
                    <span>Max Parity Diff: <strong>&le; {dossier.governancePolicy.rules?.maxDemographicParityDiff || 0.10}</strong></span>
                    <span>Min ROC-AUC: <strong>&ge; {dossier.governancePolicy.rules?.minRocAuc || 0.85}</strong></span>
                    <span>Min Accuracy: <strong>&ge; {((dossier.governancePolicy.rules?.minAccuracy ?? 0.80) * 100).toFixed(0)}%</strong></span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <HelpCircle size={20} style={{ opacity: 0.5, marginBottom: '4px' }} />
                <div>No governance policy evaluation recorded for this version.</div>
              </div>
            )}
          </div>

          {/* Section 6: Multi-Stakeholder Stage-Gate Sign-offs */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <CheckCircle2 size={16} color="var(--accent-primary)" /> 6. Multi-Stakeholder Stage-Gate Sign-off Ledger
              </div>
              <StatusBadge status={dossier.versionDetails?.approvalStatus} />
            </div>

            {dossier.approvalStatusSummary?.requiredRoles?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Required Approvers:</span>
                {dossier.approvalStatusSummary.requiredRoles.map(role => {
                  const isApproved = dossier.approvalStatusSummary.approvedRoles.includes(role);
                  return (
                    <span 
                      key={role} 
                      className={`status-badge ${isApproved ? 'status-success' : 'status-warning'}`}
                      style={{ fontSize: '11px' }}
                    >
                      {formatRoleLabel(role)}: {isApproved ? '✓ Signed' : 'Pending'}
                    </span>
                  );
                })}
              </div>
            )}

            {dossier.approvals && dossier.approvals.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {dossier.approvals.map((a) => (
                  <div key={a._id} style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-color)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{a.role.replace(/_/g, ' ')} — {a.approverName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                        "{a.comment || 'No comment provided'}"
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ color: a.decision === 'APPROVED' ? 'var(--success)' : a.decision === 'REJECTED' ? 'var(--danger)' : 'var(--warning)', fontWeight: 700, fontSize: '12px' }}>
                        {a.decision === 'APPROVED' ? '✓ APPROVED' : a.decision}
                      </span>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {new Date(a.decidedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <HelpCircle size={20} style={{ opacity: 0.5, marginBottom: '4px' }} />
                <div>No approval evidence recorded for this version.</div>
              </div>
            )}
          </div>

          {/* Section 7: Production Runtime Monitoring & Drift Signals */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <Activity size={16} color="var(--accent-primary)" /> 7. Production Runtime Monitoring &amp; Drift Signals
              </div>
              {dossier.monitoringEvidence?.latestTelemetry ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {dossier.monitoringEvidence.latestTelemetry.monitoringSource === 'EVIDENTLY' && (
                    <span className="status-badge" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', fontSize: '11px' }}>
                      EVIDENTLY RUNTIME
                    </span>
                  )}
                  <StatusBadge status={dossier.monitoringEvidence.latestTelemetry.driftStatus} />
                </div>
              ) : (
                <span className="status-badge status-neutral">NO TELEMETRY</span>
              )}
            </div>

            {dossier.monitoringEvidence?.latestTelemetry ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Latest Batch ID</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      {dossier.monitoringEvidence.latestTelemetry.batchId}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sample Size</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      {dossier.monitoringEvidence.latestTelemetry.sampleSize?.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Latency</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      {dossier.monitoringEvidence.latestTelemetry.performanceTelemetry?.avgLatencyMs || 0} ms
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Error Rate</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      {((dossier.monitoringEvidence.latestTelemetry.performanceTelemetry?.errorRate || 0) * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>

                {dossier.monitoringEvidence.latestTelemetry.features && dossier.monitoringEvidence.latestTelemetry.features.length > 0 && (
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                    <strong>Monitored Features:</strong>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                      {dossier.monitoringEvidence.latestTelemetry.features.map(f => (
                        <span key={f.name} className={`status-badge ${f.driftDetected ? 'status-danger' : 'status-neutral'}`}>
                          {f.name}: {f.psi != null ? `PSI ${f.psi}` : `${f.statisticalMethod || 'Evidently'} (p=${f.pValue != null ? Number(f.pValue).toExponential(2) : 'N/A'})`} {f.driftDetected ? '(DRIFT)' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <HelpCircle size={20} style={{ opacity: 0.5, marginBottom: '4px' }} />
                <div>No monitoring data available for this version.</div>
              </div>
            )}
          </div>

          {/* Section 8: Operational Incidents & Corrective Actions */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <AlertTriangle size={16} color="var(--accent-primary)" /> 8. Operational Incidents &amp; Corrective Actions
              </div>
              <span className="status-badge status-neutral">Incidents: {dossier.incidents?.length || 0}</span>
            </div>

            {dossier.incidents && dossier.incidents.length > 0 ? (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Incident #</th>
                      <th>Type</th>
                      <th>Title</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Recommended Action</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.incidents.map((inc) => (
                      <tr key={inc._id}>
                        <td><strong style={{ fontFamily: 'var(--font-mono)' }}>{inc.incidentNumber}</strong></td>
                        <td>{inc.type}</td>
                        <td>{inc.title}</td>
                        <td>
                          <span className={`status-badge ${inc.severity === 'CRITICAL' || inc.severity === 'HIGH' ? 'status-danger' : 'status-warning'}`}>
                            {inc.severity}
                          </span>
                        </td>
                        <td><StatusBadge status={inc.status} /></td>
                        <td>{inc.recommendedAction} {inc.recommendedRollbackVersionId ? `(${inc.recommendedRollbackVersionId.version || 'Version'})` : ''}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(inc.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <HelpCircle size={20} style={{ opacity: 0.5, marginBottom: '4px' }} />
                <div>No incidents recorded for this version.</div>
              </div>
            )}
          </div>

          {/* Section 9: Employee Issue Reports */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <AlertCircle size={16} color="var(--accent-primary)" /> 9. Employee Issue Reports &amp; Escalations
              </div>
              <span className="status-badge status-neutral">Reports: {dossier.issueReports?.length || 0}</span>
            </div>

            {dossier.issueReports && dossier.issueReports.length > 0 ? (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Report #</th>
                      <th>Type</th>
                      <th>Title</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Submitted By</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.issueReports.map((iss) => (
                      <tr key={iss._id}>
                        <td><strong style={{ fontFamily: 'var(--font-mono)' }}>{iss.reportNumber}</strong></td>
                        <td>{iss.issueType}</td>
                        <td>{iss.title}</td>
                        <td>
                          <span className={`status-badge ${iss.severity === 'CRITICAL' || iss.severity === 'HIGH' ? 'status-danger' : 'status-warning'}`}>
                            {iss.severity}
                          </span>
                        </td>
                        <td><StatusBadge status={iss.status} /></td>
                        <td>{iss.submittedBy}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(iss.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <HelpCircle size={20} style={{ opacity: 0.5, marginBottom: '4px' }} />
                <div>No issue reports submitted for this model or version.</div>
              </div>
            )}
          </div>

          {/* Section 10: Immutable Cryptographic Audit Ledger */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                <History size={16} color="var(--accent-primary)" /> 10. Immutable Cryptographic Audit Signatures (Excerpt)
              </div>
              <span className="status-badge status-success">SHA-256 Verifiable</span>
            </div>

            {dossier.auditLogSummary && dossier.auditLogSummary.length > 0 ? (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Seq</th>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Timestamp</th>
                      <th>Cryptographic Block Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.auditLogSummary.slice(-8).map((log) => (
                      <tr key={log.seq}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>#{log.seq}</td>
                        <td>{formatAuditAction(log.action)}</td>
                        <td>{log.actor} ({formatRoleLabel(log.role)})</td>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>
                          <span style={{ 
                            fontFamily: 'var(--font-mono)', 
                            fontSize: '11px', 
                            padding: '3px 6px', 
                            backgroundColor: 'var(--bg-secondary)', 
                            borderRadius: 'var(--radius-sm)', 
                            border: '1px solid var(--border-color)',
                            color: 'var(--accent-primary)'
                          }}>
                            {log.hash}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <HelpCircle size={20} style={{ opacity: 0.5, marginBottom: '4px' }} />
                <div>No audit ledger events recorded for this entity.</div>
              </div>
            )}
          </div>

          {/* Governance Disclaimers Footer */}
          <div style={{ 
            marginTop: '8px',
            marginBottom: '32px',
            padding: '14px 18px',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            fontSize: '11.5px',
            lineHeight: '1.6',
            color: 'var(--text-secondary)'
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>CLASSIFICATION NOTICE:</strong> {dossier.disclaimers?.legalNotice || 'AI Governance Risk Assessment aligned with selected regulatory concepts (EU AI Act Annex III & NIST AI RMF). Not an official legal certification.'}
            <div style={{ marginTop: '4px', opacity: 0.9 }}>
              {dossier.disclaimers?.provenanceNotice || 'All data points in this dossier are synthesized from server-authoritative audit ledgers, policy rule evaluations, cryptographic hashes, and recorded runtime signals.'}
            </div>
          </div>

        </div>
      ) : !loading && !dossier ? (
        <EmptyState
          icon={Scale}
          title="No Governance Models Available"
          description="Register or deploy an AI model in the Model Registry to compile and inspect automated compliance dossiers aligned with EU AI Act and NIST AI RMF."
          actionText="Register Model"
          onAction={() => navigate('/app/models')}
        />
      ) : null}
    </div>
  );
}
