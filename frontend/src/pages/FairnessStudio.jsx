import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { getModels, getModelById, uploadEvaluationFile, getEvaluations } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getRoleCapabilities } from '../utils/permissions';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import { formatRiskLevel, formatLifecycleLabel, formatStatusLabel, formatEvaluationStatus, formatPolicyStatus } from '../utils/formatters';
import { 
  Scale, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Info, 
  RefreshCw,
  ShieldCheck, 
  TrendingUp, 
  BarChart3, 
  Upload, 
  FileSpreadsheet
} from 'lucide-react';

export default function FairnessStudio() {
  const [searchParams] = useSearchParams();
  const initialVersionId = searchParams.get('versionId');
  const queryModelId = searchParams.get('modelId');
  const { user } = useAuth();
  const capabilities = getRoleCapabilities(user?.role);

  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [versions, setVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [evaluations, setEvaluations] = useState([]);
  const [latestEval, setLatestEval] = useState(null);
  const [policyDecision, setPolicyDecision] = useState(null);
  const [loading, setLoading] = useState(false);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [customProtectedAttr, setCustomProtectedAttr] = useState('');
  const [customPrivilegedGroup, setCustomPrivilegedGroup] = useState('');
  const [customUnprivilegedGroup, setCustomUnprivilegedGroup] = useState('');
  const fileInputRef = useRef(null);

  // Load models on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const modelList = await getModels();
        setModels(modelList || []);

        if (modelList && modelList.length > 0) {
          const queryModel = queryModelId ? modelList.find(m => m._id === queryModelId) : null;
          const target = queryModel || modelList[0];
          setSelectedModelId(target._id);

          const details = await getModelById(target._id);
          setVersions(details.versions || []);

          const v = initialVersionId 
            ? details.versions?.find(ver => ver._id === initialVersionId) 
            : details.versions?.[0];

          if (v) {
            setSelectedVersionId(v._id);
            const evals = await getEvaluations(v._id);
            setEvaluations(evals || []);
            if (evals && evals.length > 0) {
              setLatestEval(evals[0]);
              setPolicyDecision(v.latestPolicyEvaluation);
            } else {
              setLatestEval(null);
              setPolicyDecision(null);
            }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [initialVersionId, queryModelId]);

  const handleModelChange = async (mId) => {
    setSelectedModelId(mId);
    try {
      const details = await getModelById(mId);
      setVersions(details.versions || []);
      if (details.versions && details.versions.length > 0) {
        const v = details.versions[0];
        setSelectedVersionId(v._id);
        const evals = await getEvaluations(v._id);
        setEvaluations(evals || []);
        if (evals && evals.length > 0) {
          setLatestEval(evals[0]);
          setPolicyDecision(v.latestPolicyEvaluation || null);
        } else {
          setLatestEval(null);
          setPolicyDecision(null);
        }
      } else {
        setSelectedVersionId('');
        setEvaluations([]);
        setLatestEval(null);
        setPolicyDecision(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleVersionChange = async (vId) => {
    setSelectedVersionId(vId);
    try {
      const evals = await getEvaluations(vId);
      setEvaluations(evals || []);
      const curV = versions.find(ver => ver._id === vId);
      if (evals && evals.length > 0) {
        setLatestEval(evals[0]);
        setPolicyDecision(curV?.latestPolicyEvaluation || null);
      } else {
        setLatestEval(null);
        setPolicyDecision(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const currentVersionObj = versions.find(v => v._id === selectedVersionId);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadSuccess(null);
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx') {
      setUploadError('Unsupported file type. Only CSV (.csv) and Excel (.xlsx) files are supported for evaluation import.');
      setSelectedFile(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File exceeds maximum allowed size of 5 MB.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a valid CSV or XLSX dataset file to import.');
      return;
    }
    if (!selectedVersionId) {
      setUploadError('Please select a target Model Version before uploading evaluation data.');
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);
      setUploadSuccess(null);

      const formData = new FormData();
      formData.append('file', selectedFile);
      if (customProtectedAttr.trim()) {
        formData.append('protectedAttribute', customProtectedAttr.trim());
      }
      if (customPrivilegedGroup.trim()) {
        formData.append('privilegedGroup', customPrivilegedGroup.trim());
      }
      if (customUnprivilegedGroup.trim()) {
        formData.append('unprivilegedGroup', customUnprivilegedGroup.trim());
      }

      const res = await uploadEvaluationFile(selectedVersionId, formData);
      setLatestEval(res.evaluation);
      setPolicyDecision(res.policyDecision);
      setEvaluations([res.evaluation, ...evaluations]);
      const policyMsg = res.policyDecision?.passed
        ? 'PASSED'
        : (res.policyDecision?.noPolicyAssigned ? 'BLOCKED (No Policy Assigned)' : 'POLICY VIOLATION');
      setUploadSuccess(
        `Evaluation imported successfully: ${res.datasetMeta?.rowCount ?? res.evaluation?.sampleCount} samples analyzed from "${res.datasetMeta?.filename || selectedFile.name}". Evaluation outcome: ${res.version?.evaluationStatus === 'EVALUATED_PASS' ? 'PASSED' : 'FAILED'}. Policy gate: ${policyMsg}.`
      );

      setVersions(prev => prev.map(v => v._id === selectedVersionId ? {
        ...v,
        evaluationStatus: res.version?.evaluationStatus || v.evaluationStatus,
        policyStatus: res.policyDecision?.passed ? 'PASSED' : 'FAILED',
        lifecycleStatus: res.version?.lifecycleStatus || 'EVALUATION',
        latestPolicyEvaluation: res.policyDecision
      } : v));

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error(err);
      setUploadError(err.message || 'Evaluation dataset processing failed.');
    } finally {
      setUploading(false);
    }
  };

  if (!loading && models.length === 0) {
    return (
      <div className="page-container">
        <PageHeader
          breadcrumbs={[
            { label: 'Workspace', to: '/app' },
            { label: 'Fairness & Eval Studio' }
          ]}
          title="Fairness & Bias Evaluation Studio"
          subtitle="Statistical validation of demographic parity, disparate impact (80% benchmark), and predictive performance for existing AI model versions."
        />
        <EmptyState
          icon={Scale}
          title="No models registered for evaluation"
          description="Register an AI model and create a version to begin benchmark fairness testing and disparate impact auditing."
          action={
            <Link to="/app/registry" className="btn btn-primary btn-sm">
              Go to Model Registry
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Workspace', to: '/app' },
          { label: 'Fairness & Eval Studio' }
        ]}
        title="Fairness & Bias Evaluation Studio"
        subtitle="Statistical validation of demographic parity, disparate impact (80% benchmark), and predictive performance for existing AI model versions."
      />

      {/* Engineering Clarification Notice */}
      <div className="reg-notice">
        <Scale size={16} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong>Model Governance & Evidence Pipeline:</strong> Sentinel Govern governs, evaluates, and audits pre-trained AI systems and versions. The platform computes statistical fairness and accuracy metrics from validation predictions to enforce institutional policy gates. It does not train models.
        </div>
      </div>

      {/* Control Selector Bar */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: '18px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', alignItems: 'flex-end' }}>
          <div>
            <label className="form-label">Select Model System</label>
            <select
              className="form-select"
              style={{ width: '100%' }}
              value={selectedModelId}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={loading}
            >
              {models.map(m => (
                <option key={m._id} value={m._id}>{m.name} ({formatRiskLevel(m.riskLevel)})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Select Target Model Version</label>
            <select
              className="form-select"
              style={{ width: '100%' }}
              value={selectedVersionId}
              onChange={(e) => handleVersionChange(e.target.value)}
              disabled={loading}
            >
              {versions.map(v => (
                <option key={v._id} value={v._id}>
                  {v.version} — {formatLifecycleLabel(v.lifecycleStatus)} ({v.evaluationStatus && v.evaluationStatus !== 'NOT_EVALUATED' ? `${formatEvaluationStatus(v.evaluationStatus)} • ` : ''}{formatPolicyStatus(v.policyStatus)})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Evaluation Dataset Import Section */}
      <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Upload size={17} color="var(--accent-primary)" />
            <div style={{ fontSize: '15px', fontWeight: 600 }}>Import Evaluation Dataset (CSV / XLSX)</div>
          </div>
          {currentVersionObj && (
            <span className="badge badge-success font-mono" style={{ fontSize: '11px' }}>
              Target: {currentVersionObj.version}
            </span>
          )}
        </div>

        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.5' }}>
          Upload actual model validation dataset predictions (.csv or .xlsx). Sentinel Govern parses ground truth and inference outputs, computes authoritative accuracy and statutory fairness metrics (DIR, Demographic Parity, Equalized Odds), and executes Policy Gate evaluation.
        </p>

        <form onSubmit={handleUploadSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Evaluation File (.csv, .xlsx) <strong style={{ color: 'var(--danger-text)' }}>*</strong></span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Max size: 5MB</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv"
              onChange={handleFileSelect}
              disabled={uploading || !capabilities.canRunEvaluations}
              className="form-input"
              style={{ width: '100%', padding: '7px 10px', fontSize: '12.5px' }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.45' }}>
              <div>• <strong>Required classification labels:</strong> <code>actual</code> (ground truth: 0/1) and <code>predicted</code> (model inference: 0/1).</div>
              <div style={{ marginTop: '2px' }}>• <strong>Required for ROC-AUC evaluation:</strong> <code>probability</code> or <code>prediction_score</code> (continuous score 0.0–1.0).</div>
              <div style={{ marginTop: '2px' }}>• <strong>Demographic fairness attributes:</strong> <code>gender</code>, <code>age</code>, <code>race</code>, etc.</div>
            </div>
          </div>

          {/* Optional Protected Attribute Overrides */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div>
              <label className="form-label" style={{ fontSize: '11px' }}>Protected Column</label>
              <input
                type="text"
                placeholder="Auto-detect (e.g. gender)"
                value={customProtectedAttr}
                onChange={(e) => setCustomProtectedAttr(e.target.value)}
                disabled={uploading || !capabilities.canRunEvaluations}
                className="form-input"
                style={{ width: '100%', fontSize: '12px', padding: '6px 8px' }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '11px' }}>Privileged Group</label>
              <input
                type="text"
                placeholder="e.g. Male"
                value={customPrivilegedGroup}
                onChange={(e) => setCustomPrivilegedGroup(e.target.value)}
                disabled={uploading || !capabilities.canRunEvaluations}
                className="form-input"
                style={{ width: '100%', fontSize: '12px', padding: '6px 8px' }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '11px' }}>Protected Group</label>
              <input
                type="text"
                placeholder="e.g. Female"
                value={customUnprivilegedGroup}
                onChange={(e) => setCustomUnprivilegedGroup(e.target.value)}
                disabled={uploading || !capabilities.canRunEvaluations}
                className="form-input"
                style={{ width: '100%', fontSize: '12px', padding: '6px 8px' }}
              />
            </div>
          </div>

          {uploadError && (
            <div style={{ 
              padding: '8px 12px', 
              backgroundColor: 'var(--danger-bg)', 
              border: '1px solid var(--danger-border)', 
              borderRadius: 'var(--radius-sm)', 
              color: 'var(--danger-text)', 
              fontSize: '12px', 
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <div>{uploadError}</div>
            </div>
          )}

          {uploadSuccess && (
            <div style={{ 
              padding: '8px 12px', 
              backgroundColor: 'var(--success-bg)', 
              border: '1px solid var(--success-border)', 
              borderRadius: 'var(--radius-sm)', 
              color: 'var(--success-text)', 
              fontSize: '12px', 
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              <div>{uploadSuccess}</div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              {!capabilities.canRunEvaluations ? 'Requires ML Lead or Governance Officer role' : (selectedFile ? `Selected: ${selectedFile.name}` : 'No file chosen')}
            </span>
            <button
              type="submit"
              disabled={uploading || !selectedFile || !capabilities.canRunEvaluations || !selectedVersionId}
              className="btn btn-primary btn-sm"
            >
              {uploading ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? 'Processing Dataset...' : 'Upload & Run Evaluation'}
            </button>
          </div>
        </form>
      </div>

      {/* Empty State when no evaluation exists for this model version */}
      {!latestEval && !loading && (
        <div className="card" style={{ padding: '36px 20px', textAlign: 'center', marginBottom: '20px' }}>
          <Scale size={32} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            No Authoritative Evaluation Dataset Uploaded
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '540px', margin: '0 auto', lineHeight: '1.5' }}>
            Model version <strong className="font-mono">{currentVersionObj?.version || 'selected'}</strong> does not have an uploaded evaluation dataset. An ML Lead or Governance Officer must upload an authoritative validation dataset (.csv or .xlsx) above to compute performance and statutory fairness metrics.
          </p>
        </div>
      )}

      {/* Policy Gate Decision Result Banner */}
      {policyDecision && (
        <div className={`gate-banner ${policyDecision.passed ? 'gate-passed' : 'gate-blocked'}`} style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            {policyDecision.passed ? (
              <CheckCircle2 size={22} style={{ flexShrink: 0, marginTop: '2px' }} />
            ) : (
              <XCircle size={22} style={{ flexShrink: 0, marginTop: '2px' }} />
            )}
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>
                {policyDecision.passed
                  ? 'GOVERNANCE POLICY PASSED'
                  : (policyDecision.noPolicyAssigned || policyDecision.reasons?.some(r => r.toLowerCase().includes('no governance policy')))
                  ? 'NO GOVERNANCE POLICY ASSIGNED — DEPLOYMENT BLOCKED'
                  : 'GOVERNANCE POLICY VIOLATION — DEPLOYMENT BLOCKED'}
              </div>
              <div style={{ fontSize: '12.5px', marginTop: '3px' }}>
                {policyDecision.passed ? (
                  <span>
                    Model version satisfies all fairness, predictive accuracy, and governance policy criteria under <strong>{policyDecision.policyName}</strong>. Ready for multi-stakeholder sign-off.
                  </span>
                ) : (
                  <div>
                    {policyDecision.reasons?.map((reason, idx) => (
                      <div key={idx} style={{ marginTop: '2px' }}>
                        • {reason}
                      </div>
                    ))}
                    <div style={{ marginTop: '5px', fontWeight: 600 }}>
                      ❌ Lifecycle Gate Action: Deployment to Production and Approval Gates are automatically BLOCKED by Policy Engine.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Evaluation Context & Source Metadata */}
      {latestEval && (
        <div className="card" style={{ padding: '12px 18px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileSpreadsheet size={18} color="var(--accent-primary)" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>Evaluation Record: {latestEval.datasetName}</span>
                <span className="badge badge-neutral font-mono" style={{ textTransform: 'uppercase', fontSize: '10.5px' }}>
                  {latestEval.dataSource || 'FILE_UPLOAD'}
                </span>
                {currentVersionObj?.evaluationStatus && (
                  <span className={`badge ${currentVersionObj.evaluationStatus === 'EVALUATED_PASS' ? 'badge-success' : currentVersionObj.evaluationStatus === 'EVALUATED_FAIL' ? 'badge-danger' : 'badge-neutral'}`} style={{ fontSize: '10.5px' }}>
                    Evaluation Outcome: {currentVersionObj.evaluationStatus === 'EVALUATED_PASS' ? 'PASSED' : currentVersionObj.evaluationStatus === 'EVALUATED_FAIL' ? 'FAILED' : 'NOT EVALUATED'}
                  </span>
                )}
                {latestEval.fairnessMetrics?.fairnessEvaluated === false && (
                  <span className="badge badge-warning" style={{ fontSize: '10.5px' }}>
                    Fairness Skipped (No Protected Group)
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Evaluated by <strong>{latestEval.evaluatedBy}</strong> on {new Date(latestEval.evaluatedAt).toLocaleString()} • Sample Count: <strong className="tnum">{latestEval.sampleCount.toLocaleString()}</strong>
                {latestEval.uploadedFileMeta?.filename && ` • File: ${latestEval.uploadedFileMeta.filename}`}
              </div>
            </div>
          </div>
          {currentVersionObj && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Model Version: <strong className="font-mono">{currentVersionObj.version}</strong>
            </div>
          )}
        </div>
      )}

      {/* Key Metric Cards */}
      {latestEval && (
        <div className="metrics-grid">
          <MetricCard
            title="Disparate Impact Ratio"
            value={latestEval.fairnessMetrics?.fairnessEvaluated === false ? 'N/A' : latestEval.fairnessMetrics?.disparateImpactRatio}
            subtext="Policy Threshold: ≥ 0.80 (80% Benchmark)"
            icon={Scale}
            trend={latestEval.fairnessMetrics?.fairnessEvaluated === false ? 'No attribute' : (latestEval.fairnessMetrics?.disparateImpactRatio >= 0.80 ? '✓ PASS' : '✗ FAIL')}
            trendPositive={latestEval.fairnessMetrics?.disparateImpactRatio >= 0.80}
          />
          <MetricCard
            title="Demographic Parity Diff"
            value={latestEval.fairnessMetrics?.fairnessEvaluated === false ? 'N/A' : latestEval.fairnessMetrics?.demographicParityDiff}
            subtext="Policy Threshold: ≤ 0.10"
            icon={BarChart3}
            trend={latestEval.fairnessMetrics?.fairnessEvaluated === false ? 'No attribute' : (latestEval.fairnessMetrics?.demographicParityDiff <= 0.10 ? '✓ PASS' : '✗ VIOLATION')}
            trendPositive={latestEval.fairnessMetrics?.demographicParityDiff <= 0.10}
          />
          <MetricCard
            title="Predictive Accuracy"
            value={`${(latestEval.performanceMetrics.accuracy * 100).toFixed(1)}%`}
            subtext={`Precision: ${(latestEval.performanceMetrics.precision * 100).toFixed(1)}% | Recall: ${(latestEval.performanceMetrics.recall * 100).toFixed(1)}%`}
            icon={TrendingUp}
          />
          <MetricCard
            title="ROC-AUC Metric"
            value={
              latestEval.performanceMetrics.rocAuc !== null && latestEval.performanceMetrics.rocAuc !== undefined
                ? latestEval.performanceMetrics.rocAuc
                : 'Unavailable'
            }
            subtext={
              latestEval.performanceMetrics.rocAuc !== null && latestEval.performanceMetrics.rocAuc !== undefined
                ? `F1 Score: ${(latestEval.performanceMetrics.f1 * 100).toFixed(1)}%`
                : 'ROC-AUC unavailable: prediction scores/probabilities were not provided.'
            }
            icon={ShieldCheck}
            trend={
              latestEval.performanceMetrics.rocAuc !== null && latestEval.performanceMetrics.rocAuc !== undefined
                ? (latestEval.performanceMetrics.rocAuc >= 0.85 ? '✓ PASS' : '✗ FAIL')
                : 'Scores missing'
            }
            trendPositive={
              latestEval.performanceMetrics.rocAuc !== null && latestEval.performanceMetrics.rocAuc !== undefined
                ? latestEval.performanceMetrics.rocAuc >= 0.85
                : false
            }
          />
        </div>
      )}

      {/* Explicit ROC-AUC Notice when unavailable */}
      {latestEval && (latestEval.performanceMetrics.rocAuc === null || latestEval.performanceMetrics.rocAuc === undefined) && (
        <div style={{
          padding: '10px 14px',
          backgroundColor: 'var(--bg-subtle)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px'
        }}>
          <Info size={15} color="var(--info)" style={{ flexShrink: 0 }} />
          <span>
            <strong>ROC-AUC unavailable:</strong> prediction scores/probabilities were not provided in the uploaded dataset. Conventional ROC-AUC requires continuous prediction scores (e.g. <code>probability</code> or <code>prediction_score</code>).
          </span>
        </div>
      )}

      {/* Demographic Breakdown & Group Statistics */}
      {latestEval && (
        latestEval.fairnessMetrics?.fairnessEvaluated === false ? (
          <div className="card" style={{ padding: '24px', textAlign: 'center', marginBottom: '20px' }}>
            <Info size={24} color="var(--info)" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>No Protected Demographic Attributes Detected</div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto', lineHeight: '1.5' }}>
              Performance metrics (Accuracy: {(latestEval.performanceMetrics.accuracy * 100).toFixed(1)}%, Precision: {(latestEval.performanceMetrics.precision * 100).toFixed(1)}%, Recall: {(latestEval.performanceMetrics.recall * 100).toFixed(1)}%, F1: {(latestEval.performanceMetrics.f1 * 100).toFixed(1)}%, ROC-AUC: {latestEval.performanceMetrics.rocAuc !== null && latestEval.performanceMetrics.rocAuc !== undefined ? latestEval.performanceMetrics.rocAuc : 'Unavailable (no prediction scores)'}) were computed from the uploaded validation data. Demographic parity and disparate impact were not evaluated because no protected attribute column (e.g. <code>gender</code>, <code>age</code>) was specified.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '18px', marginBottom: '20px' }}>
            
            {/* Group Comparison Table */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  Demographic Group Selection Rates ({latestEval.fairnessMetrics.protectedAttribute})
                </div>
                <span className="badge badge-neutral font-mono tnum">
                  Cohort: {latestEval.sampleCount.toLocaleString()}
                </span>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Protected Group</th>
                      <th>Cohort Status</th>
                      <th>Total Cohort</th>
                      <th>Favorable Predictions</th>
                      <th>Selection Rate P(Ŷ=1)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>{latestEval.fairnessMetrics.privilegedGroup}</strong>
                      </td>
                      <td>
                        <StatusBadge status="approved" label="Privileged Baseline" />
                      </td>
                      <td className="tnum">{latestEval.fairnessMetrics.groupStats?.privileged?.total?.toLocaleString()}</td>
                      <td className="tnum">{latestEval.fairnessMetrics.groupStats?.privileged?.positivePredictions?.toLocaleString()}</td>
                      <td>
                        <strong className="tnum" style={{ color: 'var(--text-primary)' }}>
                          {((latestEval.fairnessMetrics.groupStats?.privileged?.selectionRate ?? 0) * 100).toFixed(1)}%
                        </strong>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <strong>{latestEval.fairnessMetrics.unprivilegedGroup}</strong>
                      </td>
                      <td>
                        <StatusBadge status="warning" label="Protected Group" />
                      </td>
                      <td className="tnum">{latestEval.fairnessMetrics.groupStats?.unprivileged?.total?.toLocaleString()}</td>
                      <td className="tnum">{latestEval.fairnessMetrics.groupStats?.unprivileged?.positivePredictions?.toLocaleString()}</td>
                      <td>
                        <strong className="tnum" style={{ 
                          color: latestEval.fairnessMetrics.disparateImpactRatio >= 0.80 ? 'var(--success-text)' : 'var(--danger-text)' 
                        }}>
                          {((latestEval.fairnessMetrics.groupStats?.unprivileged?.selectionRate ?? 0) * 100).toFixed(1)}%
                        </strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Visual Distribution Bars */}
              <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>
                  SELECTION RATE DISPARITY
                </div>
                
                <div className="dist-bar-container">
                  <div className="dist-bar-row">
                    <div className="dist-bar-label">{latestEval.fairnessMetrics.privilegedGroup} (Privileged)</div>
                    <div className="dist-bar-track">
                      <div 
                        className="dist-bar-fill" 
                        style={{ 
                          width: `${(latestEval.fairnessMetrics.groupStats?.privileged?.selectionRate ?? 0) * 100}%`,
                          backgroundColor: 'var(--accent-primary)'
                        }}
                      />
                    </div>
                    <div className="dist-bar-val tnum">
                      {((latestEval.fairnessMetrics.groupStats?.privileged?.selectionRate ?? 0) * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="dist-bar-row">
                    <div className="dist-bar-label">{latestEval.fairnessMetrics.unprivilegedGroup} (Protected)</div>
                    <div className="dist-bar-track">
                      <div 
                        className="dist-bar-fill" 
                        style={{ 
                          width: `${(latestEval.fairnessMetrics.groupStats?.unprivileged?.selectionRate ?? 0) * 100}%`,
                          backgroundColor: latestEval.fairnessMetrics.disparateImpactRatio >= 0.80 ? 'var(--success)' : 'var(--danger)'
                        }}
                      />
                    </div>
                    <div className="dist-bar-val tnum">
                      {((latestEval.fairnessMetrics.groupStats?.unprivileged?.selectionRate ?? 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Equalized Odds & Mathematical Reference */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Equalized Odds Parity</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>True Positive Rate (TPR) Difference</div>
                  <div className="tnum" style={{ fontSize: '17px', fontWeight: 700, marginTop: '2px' }}>
                    {latestEval.fairnessMetrics.equalizedOdds?.tprDiff ?? 0}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Privileged TPR: {((latestEval.fairnessMetrics.equalizedOdds?.privilegedTPR ?? 0) * 100).toFixed(1)}% | Protected: {((latestEval.fairnessMetrics.equalizedOdds?.unprivilegedTPR ?? 0) * 100).toFixed(1)}%
                  </div>
                </div>

                <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>False Positive Rate (FPR) Difference</div>
                  <div className="tnum" style={{ fontSize: '17px', fontWeight: 700, marginTop: '2px' }}>
                    {latestEval.fairnessMetrics.equalizedOdds?.fprDiff ?? 0}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Privileged FPR: {((latestEval.fairnessMetrics.equalizedOdds?.privilegedFPR ?? 0) * 100).toFixed(1)}% | Protected: {((latestEval.fairnessMetrics.equalizedOdds?.unprivilegedFPR ?? 0) * 100).toFixed(1)}%
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  <strong>Policy Reference (Informational):</strong> Under the 4/5ths (80%) policy metric benchmark, a disparate impact ratio below 0.80 indicates adverse statistical selection.
                </div>
              </div>
            </div>

          </div>
        )
      )}

      {/* Historical Evaluations List */}
      {evaluations.length > 1 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Evaluation Run History for this Version</div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Dataset</th>
                  <th>Source</th>
                  <th>Disparate Impact</th>
                  <th>Demographic Parity</th>
                  <th>Accuracy</th>
                  <th>ROC-AUC</th>
                  <th>Evaluated By</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((ev) => (
                  <tr key={ev._id}>
                    <td style={{ fontSize: '12px' }}>{new Date(ev.evaluatedAt).toLocaleString()}</td>
                    <td>{ev.datasetName}</td>
                    <td>
                      <span className="badge badge-neutral font-mono" style={{ fontSize: '10px' }}>
                        {ev.dataSource || 'FILE_UPLOAD'}
                      </span>
                    </td>
                    <td>
                      {ev.fairnessMetrics?.fairnessEvaluated === false ? (
                        <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                      ) : (
                        <strong className="tnum" style={{ color: ev.fairnessMetrics?.disparateImpactRatio >= 0.80 ? 'var(--success-text)' : 'var(--danger-text)' }}>
                          {ev.fairnessMetrics?.disparateImpactRatio}
                        </strong>
                      )}
                    </td>
                    <td className="tnum">
                      {ev.fairnessMetrics?.fairnessEvaluated === false ? (
                        <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                      ) : (
                        ev.fairnessMetrics?.demographicParityDiff
                      )}
                    </td>
                    <td className="tnum">{(ev.performanceMetrics.accuracy * 100).toFixed(1)}%</td>
                    <td className="tnum">
                      {ev.performanceMetrics.rocAuc !== null && ev.performanceMetrics.rocAuc !== undefined ? (
                        ev.performanceMetrics.rocAuc
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }} title="Prediction scores/probabilities were not provided">Unavailable</span>
                      )}
                    </td>
                    <td>{ev.evaluatedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
