import React, { useEffect, useState } from 'react';
import { 
  getModels, 
  getIssues, 
  createIssue, 
  updateIssue, 
  escalateIssueToIncident,
  downloadIssueReportPdf,
  downloadIssueReportMarkdown,
  downloadIssueReportJson
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getRoleCapabilities } from '../utils/permissions';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { formatRoleLabel, formatIncidentType } from '../utils/formatters';
import { 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  RefreshCw, 
  PlusCircle, 
  ArrowUpRight,
  Send,
  Download,
  FileText
} from 'lucide-react';

const ISSUE_TYPES = [
  { value: 'PERFORMANCE', label: 'Performance Degradation' },
  { value: 'BIAS', label: 'Fairness / Bias Concern' },
  { value: 'DATA', label: 'Data Quality / Distribution Shift' },
  { value: 'SAFETY', label: 'Safety / Hallucination Violation' },
  { value: 'DRIFT', label: 'Runtime Drift' },
  { value: 'OTHER', label: 'Other Operational Governance Concern' }
];

const SEVERITIES = [
  { value: 'LOW', label: 'Low — Minor observation' },
  { value: 'MEDIUM', label: 'Medium — Notable discrepancy' },
  { value: 'HIGH', label: 'High — Significant governance risk' },
  { value: 'CRITICAL', label: 'Critical — Immediate safety / legal violation' }
];

export default function IssueReporting() {
  const { user } = useAuth();
  const capabilities = getRoleCapabilities(user?.role);

  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'create'
  const [issues, setIssues] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    modelId: '',
    versionId: '',
    issueType: 'BIAS',
    severity: 'MEDIUM',
    title: '',
    description: ''
  });
  const [selectedModelVersions, setSelectedModelVersions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Review & Escalation State
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!selectedIssue) return;
    try {
      setExportingPdf(true);
      await downloadIssueReportPdf(selectedIssue._id, selectedIssue.reportNumber);
    } catch (err) {
      console.error('Failed to export issue PDF:', err);
      alert(`Export Failed: ${err.message}`);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDownloadMarkdown = async () => {
    if (!selectedIssue) return;
    try {
      await downloadIssueReportMarkdown(selectedIssue._id, selectedIssue.reportNumber);
    } catch (err) {
      console.error('Failed to export issue Markdown:', err);
      alert(`Export Failed: ${err.message}`);
    }
  };

  const handleDownloadJson = async () => {
    if (!selectedIssue) return;
    try {
      await downloadIssueReportJson(selectedIssue._id, selectedIssue.reportNumber);
    } catch (err) {
      console.error('Failed to export issue JSON:', err);
      alert(`Export Failed: ${err.message}`);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [issuesRes, modelsRes] = await Promise.all([
        getIssues(),
        getModels()
      ]);
      setIssues(issuesRes || []);
      setModels(modelsRes || []);
      if (issuesRes && issuesRes.length > 0) {
        setSelectedIssue(issuesRes[0]);
      } else {
        setSelectedIssue(null);
      }
    } catch (err) {
      console.error('Failed to load issue reporting data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleModelChange = (modelId) => {
    const selected = models.find((m) => m._id === modelId);
    setFormData((prev) => ({
      ...prev,
      modelId,
      versionId: ''
    }));
    if (selected && selected.versions) {
      setSelectedModelVersions(selected.versions);
    } else {
      setSelectedModelVersions([]);
    }
  };

  const handleSubmitIssue = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErrorMessage('');
      setSubmitSuccess(null);

      const payload = {
        modelId: formData.modelId,
        versionId: formData.versionId || null,
        issueType: formData.issueType,
        severity: formData.severity,
        title: formData.title,
        description: formData.description
      };

      const res = await createIssue(payload);
      setSubmitSuccess(res);
      setFormData({
        modelId: '',
        versionId: '',
        issueType: 'BIAS',
        severity: 'MEDIUM',
        title: '',
        description: ''
      });
      setSelectedModelVersions([]);

      const updatedIssues = await getIssues();
      setIssues(updatedIssues || []);
      if (updatedIssues && updatedIssues.length > 0) {
        setSelectedIssue(updatedIssues[0]);
      }
      setActiveTab('list');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit issue report');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (status) => {
    if (!selectedIssue) return;
    try {
      setReviewLoading(true);
      const updated = await updateIssue(selectedIssue._id, {
        status,
        resolutionNotes: reviewNotes || `Status updated to ${status} by ${user?.name || user?.email}`
      });
      setSelectedIssue(updated);
      setReviewNotes('');
      const updatedIssues = await getIssues();
      setIssues(updatedIssues || []);
    } catch (err) {
      alert(`Failed to update issue: ${err.message}`);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleEscalate = async () => {
    if (!selectedIssue) return;
    if (!window.confirm(`Are you sure you want to escalate Issue ${selectedIssue.reportNumber} into a formal Governance Incident?`)) {
      return;
    }

    try {
      setEscalating(true);
      const res = await escalateIssueToIncident(selectedIssue._id, {
        title: `Governance Escalation: ${selectedIssue.title}`,
        description: `Escalated from Employee Issue Report ${selectedIssue.reportNumber} (${selectedIssue.issueType}): ${selectedIssue.description}`
      });
      setSelectedIssue(res.issue);
      alert(`Issue successfully escalated to Incident ${res.incident.incidentNumber}!`);
      const updatedIssues = await getIssues();
      setIssues(updatedIssues || []);
    } catch (err) {
      alert(`Failed to escalate issue: ${err.message}`);
    } finally {
      setEscalating(false);
    }
  };

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'CRITICAL':
      case 'HIGH':
        return <span className="status-badge status-danger">{severity}</span>;
      case 'MEDIUM':
        return <span className="status-badge status-warning">MEDIUM</span>;
      default:
        return <span className="status-badge status-neutral">{severity}</span>;
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        breadcrumbs={[
          { label: 'Governance', to: '/app' },
          { label: 'Issue Reports' }
        ]}
        title="Stakeholder Issue Reporting & Governance Review"
        subtitle="Responsible AI telemetry ingestion, frontline concern logging, and committee escalation pathways."
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setActiveTab(activeTab === 'list' ? 'create' : 'list')}
            className={`btn ${activeTab === 'create' ? 'btn-secondary' : 'btn-primary'} btn-sm`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            {activeTab === 'create' ? (
              <span>View Reports Queue</span>
            ) : (
              <>
                <PlusCircle size={14} /> Report New Issue
              </>
            )}
          </button>
          <button 
            onClick={loadData} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </PageHeader>

      {submitSuccess && (
        <div style={{
          marginBottom: '20px',
          padding: '16px 20px',
          backgroundColor: 'var(--success-bg)',
          border: '1px solid var(--success-border)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <CheckCircle2 size={20} color="var(--success)" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--success)' }}>
              ISSUE REPORT {submitSuccess.reportNumber} SUBMITTED
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.5' }}>
              Your observation has been registered in the governance queue and permanently committed to the cryptographic audit trail. Authorized review leads can inspect and act upon it.
            </div>
          </div>
        </div>
      )}

      {/* CREATE TAB */}
      {activeTab === 'create' ? (
        <div className="card" style={{ maxWidth: '780px', margin: '0 auto', padding: '24px' }}>
          <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Submit AI Governance Issue Report
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
              Log observed bias, performance degradation, distribution shift, or ethical risks across deployed systems.
            </p>
          </div>

          {errorMessage && (
            <div style={{ 
              padding: '12px 16px', 
              backgroundColor: 'var(--danger-bg)', 
              border: '1px solid var(--danger-border)', 
              borderRadius: 'var(--radius-md)', 
              color: 'var(--danger)', 
              marginBottom: '18px', 
              fontSize: '13px' 
            }}>
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmitIssue}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Target AI Model <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <select
                  value={formData.modelId}
                  onChange={(e) => handleModelChange(e.target.value)}
                  required
                  className="input-field"
                  style={{ width: '100%' }}
                >
                  <option value="">-- Select Affected Model --</option>
                  {models.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} ({m.modelType || 'Model'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Model Version (Optional)
                </label>
                <select
                  value={formData.versionId}
                  onChange={(e) => setFormData({ ...formData, versionId: e.target.value })}
                  disabled={!formData.modelId || selectedModelVersions.length === 0}
                  className="input-field"
                  style={{ width: '100%', opacity: !formData.modelId ? 0.6 : 1 }}
                >
                  <option value="">-- Model-Level / All Versions --</option>
                  {selectedModelVersions.map((v) => (
                    <option key={v._id || v} value={v._id || v}>
                      {v.version ? `Version ${v.version} (${v.lifecycleStatus})` : `Version ${v}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Issue Category <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <select
                  value={formData.issueType}
                  onChange={(e) => setFormData({ ...formData, issueType: e.target.value })}
                  required
                  className="input-field"
                  style={{ width: '100%' }}
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Severity Level
                </label>
                <select
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                  className="input-field"
                  style={{ width: '100%' }}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Summary / Title <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="e.g. Higher false rejection rate observed for demographic cohort X"
                className="input-field"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Detailed Description & Evidence <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                required
                rows={5}
                placeholder="Describe what occurred, inputs used, unexpected outputs, affected cohorts, or relevant observations..."
                className="input-field"
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Send size={14} />
                {submitting ? 'Submitting Report...' : 'Submit Issue Report'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* LIST / QUEUE TAB */
        <div>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px' }}>
              <LoadingSkeleton height="350px" />
              <LoadingSkeleton height="350px" />
            </div>
          ) : issues.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No Issue Reports Found"
              description="No governance issue reports have been submitted across registered models. If you observe bias, safety violations, or performance anomalies, submit a report here."
              actionText="Report an Issue"
              onAction={() => setActiveTab('create')}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '20px', alignItems: 'start' }}>
              
              {/* Left Column: Issues List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ 
                  fontSize: '11px', 
                  fontWeight: 700, 
                  color: 'var(--text-muted)', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em',
                  paddingLeft: '4px'
                }}>
                  Governance Issue Queue ({issues.length})
                </div>

                {issues.map((iss) => {
                  const isSelected = selectedIssue?._id === iss._id;
                  return (
                    <div
                      key={iss._id}
                      onClick={() => setSelectedIssue(iss)}
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          {iss.reportNumber}
                        </span>
                        {getSeverityBadge(iss.severity)}
                      </div>

                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        {iss.title}
                      </div>

                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        {iss.modelId?.name || 'Model'} {iss.versionId ? `(${iss.versionId.version})` : ''} • {formatIncidentType(iss.issueType)}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                        <StatusBadge status={iss.status} />
                        <span style={{ color: 'var(--text-muted)' }}>
                          {new Date(iss.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Selected Issue Details */}
              {selectedIssue && (
                <div className="card" style={{ padding: '24px' }}>
                  
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                          Issue {selectedIssue.reportNumber}
                        </h2>
                        {getSeverityBadge(selectedIssue.severity)}
                        <StatusBadge status={selectedIssue.status} />
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                        Affected Model: <strong style={{ color: 'var(--text-primary)' }}>{selectedIssue.modelId?.name || 'Unknown'}</strong>
                        {selectedIssue.versionId && <span> • Version: <strong style={{ color: 'var(--text-primary)' }}>{selectedIssue.versionId.version}</strong></span>}
                      </div>
                    </div>

                    {/* Export Actions: PDF, Markdown, JSON */}
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        id="export-issue-pdf-btn"
                        onClick={handleDownloadPdf}
                        disabled={exportingPdf}
                        className="btn btn-primary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, padding: '5px 12px' }}
                        title="Download official A4 issue report PDF with selectable text"
                      >
                        <FileText size={13} /> {exportingPdf ? 'Exporting...' : 'Export PDF'}
                      </button>
                      <button
                        id="export-issue-md-btn"
                        onClick={handleDownloadMarkdown}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '5px 12px' }}
                        title="Export Markdown report"
                      >
                        <Download size={13} /> Markdown
                      </button>
                      <button
                        id="export-issue-json-btn"
                        onClick={handleDownloadJson}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '5px 12px' }}
                        title="Export raw JSON record"
                      >
                        <Download size={13} /> JSON
                      </button>
                    </div>
                  </div>

                  {/* Metadata Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Reporter</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '3px', color: 'var(--text-primary)' }}>
                        {selectedIssue.submittedBy}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {new Date(selectedIssue.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Category</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '3px', color: 'var(--text-primary)' }}>
                        {selectedIssue.issueType}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>Governance Signal</div>
                    </div>

                    <div style={{ padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Incident Link</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '3px', color: selectedIssue.escalatedIncidentId ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {selectedIssue.escalatedIncidentId ? 'Linked Incident' : 'Not Escalated'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                        {selectedIssue.escalatedIncidentId ? 'Formally escalated' : 'Signal only'}
                      </div>
                    </div>
                  </div>

                  {/* Title & Description */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                      {selectedIssue.title}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', background: 'var(--bg-secondary)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                      {selectedIssue.description}
                    </div>
                  </div>

                  {/* Resolution Notes / Escalation Record */}
                  {selectedIssue.resolutionNotes && (
                    <div style={{ 
                      marginBottom: '20px', 
                      padding: '14px 16px', 
                      backgroundColor: 'var(--accent-light)', 
                      borderRadius: 'var(--radius-md)', 
                      border: '1px solid var(--border-color)' 
                    }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                        Governance Review & Resolution Notes
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', whiteSpace: 'pre-line', lineHeight: '1.5' }}>
                        {selectedIssue.resolutionNotes}
                      </div>
                      {selectedIssue.resolvedAt && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                          Resolved on {new Date(selectedIssue.resolvedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Governance Review Panel (Authorized roles only: ML_LEAD, GOVERNANCE_OFFICER) */}
                  {(capabilities.canReviewIssues || capabilities.canEscalateIssues) && (
                    <div style={{
                      marginTop: '20px',
                      padding: '18px 20px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-color)'
                    }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ShieldAlert size={16} color="var(--accent-primary)" />
                        Governance Review Actions ({formatRoleLabel(user?.role)})
                      </div>

                      {selectedIssue.status !== 'ESCALATED_TO_INCIDENT' ? (
                        <div>
                          <div style={{ marginBottom: '14px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                              Review / Resolution Note:
                            </label>
                            <input
                              type="text"
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              placeholder="Add assessment findings or remediation reasoning..."
                              className="input-field"
                              style={{ width: '100%', fontSize: '13px' }}
                            />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              {selectedIssue.status === 'SUBMITTED' && (
                                <button
                                  onClick={() => handleUpdateStatus('UNDER_INVESTIGATION')}
                                  disabled={reviewLoading}
                                  className="btn btn-secondary btn-sm"
                                >
                                  Mark Under Investigation
                                </button>
                              )}
                              <button
                                onClick={() => handleUpdateStatus('RESOLVED')}
                                disabled={reviewLoading}
                                className="btn btn-secondary btn-sm"
                                style={{ color: 'var(--success)' }}
                              >
                                Mark Resolved
                              </button>
                              <button
                                onClick={() => handleUpdateStatus('REJECTED')}
                                disabled={reviewLoading}
                                className="btn btn-secondary btn-sm"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                Reject Signal
                              </button>
                            </div>

                            {capabilities.canEscalateIssues && (
                              <button
                                onClick={handleEscalate}
                                disabled={escalating}
                                className="btn btn-danger btn-sm"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                              >
                                <ArrowUpRight size={14} />
                                {escalating ? 'Escalating...' : 'Escalate to Incident'}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontSize: '13px', fontWeight: 600 }}>
                          <AlertTriangle size={16} />
                          This issue has been formally escalated to an active Governance Incident.
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
