import React, { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  getMonitoringOverview, 
  getModels, 
  getMonitoringServicesStatus, 
  getWorkloadsStatus,
  getSchedulerStatus,
  pauseScheduler,
  resumeScheduler,
  setSchedulerMode,
  triggerSchedulerBatch,
  evaluateExternalTelemetry,
  getReports,
  getReportById,
  compareModelVersions,
  triggerRollback
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import MetricCard from '../components/MetricCard';
import EmptyState from '../components/EmptyState';
import { formatLifecycleLabel, formatRiskLevel, formatStatusLabel } from '../utils/formatters';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Layers, 
  ShieldAlert, 
  Info, 
  Clock, 
  BarChart3, 
  CheckCircle,
  Server,
  Zap,
  Play,
  TrendingUp,
  Radio,
  ExternalLink,
  Pause,
  Sliders,
  FileText,
  Download,
  RotateCcw,
  Check,
  X,
  AlertCircle
} from 'lucide-react';

const WORKLOAD_CONFIGS = [
  {
    id: 'fraud-detection',
    label: 'Fraud Detection AI',
    subtext: 'Real-Time Fraud & Anomaly Intelligence',
    endpoint: 'http://127.0.0.1:8000',
    type: 'Local Fastify/Uvicorn',
    statusKey: 'fraud'
  },
  {
    id: 'credit-risk',
    label: 'Credit Risk Scoring',
    subtext: 'Default Assessment & Financial Risk',
    endpoint: 'https://credit-risk-scoring-58zh.onrender.com',
    type: 'Hosted Cloud Service',
    statusKey: 'creditRisk'
  },
  {
    id: 'insurance-charges',
    label: 'Insurance Charges Predictor',
    subtext: 'Medical & Policy Cost Regression',
    endpoint: 'https://insurance-prediction-paiv.onrender.com',
    type: 'Verified HTTPS (AWS IP unroutable)',
    statusKey: 'insurance'
  },
  {
    id: 'customer-churn',
    label: 'Customer Churn Retention',
    subtext: 'Subscriber Retention Intelligence',
    endpoint: 'https://churn-prediction-mlops.onrender.com',
    type: 'Requires CHURN_API_KEY',
    statusKey: 'churn'
  }
];

export default function Monitoring() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryModelId = searchParams.get('modelId');
  const queryWorkload = searchParams.get('workloadId') || 'fraud-detection';
  const { user } = useAuth();

  // Active selections
  const [selectedWorkloadId, setSelectedWorkloadId] = useState(queryWorkload);
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  
  // Monitoring data & subsystem statuses
  const [monitoringData, setMonitoringData] = useState(null);
  const [servicesStatus, setServicesStatus] = useState(null);
  const [workloadsStatus, setWorkloadsStatus] = useState(null);
  const [schedulerState, setSchedulerState] = useState(null);
  
  // Loading & refresh states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const autoRefreshTimerRef = useRef(null);

  // Manual Trigger & Scheduler Control
  const [actionLoading, setActionLoading] = useState(false);
  const [evalScenario, setEvalScenario] = useState('BASELINE');
  const [evalBatchSize, setEvalBatchSize] = useState(25);
  const [actionSuccessMsg, setActionSuccessMsg] = useState(null);
  const [actionErrorMsg, setActionErrorMsg] = useState(null);

  // Hover state for interactive observability chart
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Modal states: Drift Report & Version Rollback
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [versionComparisonData, setVersionComparisonData] = useState(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackRationale, setRollbackRationale] = useState('');
  const [targetRollbackVersion, setTargetRollbackVersion] = useState(null);
  const [rollbackFeedback, setRollbackFeedback] = useState(null);

  // Load telemetry, services status, workloads, and scheduler
  const loadMonitoring = async (modelId = '', workloadId = selectedWorkloadId, isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);

      const [modelList, overview, services, workloads, scheduler] = await Promise.all([
        getModels(),
        getMonitoringOverview(modelId, workloadId),
        getMonitoringServicesStatus().catch(err => ({
          fraudAi: { status: 'UNREACHABLE', error: err.message },
          evidently: { status: 'UNREACHABLE', error: err.message }
        })),
        getWorkloadsStatus().catch(() => null),
        getSchedulerStatus().catch(() => null)
      ]);

      setModels(modelList || []);
      setServicesStatus(services);
      if (workloads) setWorkloadsStatus(workloads);
      if (scheduler) setSchedulerState(scheduler);

      if (overview) {
        setMonitoringData(overview);
        if (overview.model) {
          setSelectedModelId(overview.model._id);
        }
      }
      setLastRefreshedAt(new Date());
    } catch (err) {
      console.error('Failed to load monitoring overview:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMonitoring(queryModelId || '', selectedWorkloadId);
  }, [queryModelId, selectedWorkloadId]);

  // Auto-refresh interval (every 15s for live observability)
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimerRef.current = setInterval(() => {
        loadMonitoring(selectedModelId, selectedWorkloadId, true);
      }, 15000);
    } else {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    }
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [autoRefresh, selectedModelId, selectedWorkloadId]);

  const handleSelectWorkload = (workloadId) => {
    setSelectedWorkloadId(workloadId);
    setSearchParams({ workloadId });
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    loadMonitoring('', workloadId);
  };

  const handleSelectModel = (mId) => {
    setSelectedModelId(mId);
    loadMonitoring(mId, selectedWorkloadId);
  };

  // Scheduler Controls
  const handleToggleSchedulerPause = async () => {
    try {
      setActionLoading(true);
      setActionSuccessMsg(null);
      setActionErrorMsg(null);
      if (schedulerState?.status === 'ACTIVE') {
        const res = await pauseScheduler();
        setSchedulerState(res);
        setActionSuccessMsg('Automatic monitoring scheduler paused successfully.');
      } else {
        const res = await resumeScheduler();
        setSchedulerState(res);
        setActionSuccessMsg('Automatic monitoring scheduler resumed.');
      }
      await loadMonitoring(selectedModelId, selectedWorkloadId, true);
    } catch (err) {
      setActionErrorMsg(err.message || 'Failed to toggle scheduler');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSchedulerMode = async () => {
    try {
      setActionLoading(true);
      setActionSuccessMsg(null);
      setActionErrorMsg(null);
      const nextMode = schedulerState?.mode === 'DEMO' ? 'REAL' : 'DEMO';
      const res = await setSchedulerMode(nextMode);
      setSchedulerState(res);
      setActionSuccessMsg(`Monitoring mode updated to ${nextMode}.`);
      await loadMonitoring(selectedModelId, selectedWorkloadId, true);
    } catch (err) {
      setActionErrorMsg(err.message || 'Failed to change scheduler mode');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerManualBatch = async () => {
    try {
      setActionLoading(true);
      setActionSuccessMsg(null);
      setActionErrorMsg(null);
      
      const res = await triggerSchedulerBatch({
        workloadId: selectedWorkloadId,
        scenario: evalScenario,
        count: Number(evalBatchSize)
      });

      setActionSuccessMsg(
        `Batch executed for '${selectedWorkloadId}' in '${evalScenario}' scenario. Evidently verdict: ${res.driftStatus || 'HEALTHY'}.`
      );
      await loadMonitoring(selectedModelId, selectedWorkloadId, true);
    } catch (err) {
      setActionErrorMsg(err.message || 'Failed to execute manual batch');
    } finally {
      setActionLoading(false);
    }
  };

  // Report Modal
  const handleOpenReport = async (reportIdOrNull) => {
    try {
      setReportLoading(true);
      setReportModalOpen(true);
      setSelectedReport(null);

      if (reportIdOrNull) {
        const rep = await getReportById(reportIdOrNull);
        setSelectedReport(rep);
      } else {
        // Fetch latest drift report for this model
        const list = await getReports({
          modelId: selectedModelId,
          reportType: 'DATA_DRIFT_ANALYSIS',
          limit: 1
        });
        if (list && list.length > 0) {
          const rep = await getReportById(list[0]._id);
          setSelectedReport(rep);
        } else {
          setSelectedReport(null);
        }
      }
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setReportLoading(false);
    }
  };

  // Version Comparison & Rollback Modal
  const handleOpenRollbackModal = async () => {
    try {
      setRollbackLoading(true);
      setRollbackModalOpen(true);
      setRollbackFeedback(null);
      setRollbackRationale('');
      setTargetRollbackVersion(null);

      if (selectedModelId) {
        const data = await compareModelVersions(selectedModelId);
        setVersionComparisonData(data);
      }
    } catch (err) {
      console.error('Failed to load version comparison:', err);
      setRollbackFeedback({ success: false, message: err.message });
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleExecuteRollback = async () => {
    if (!targetRollbackVersion) return;
    try {
      setRollbackLoading(true);
      setRollbackFeedback(null);
      const res = await triggerRollback({
        modelId: selectedModelId,
        targetVersionId: targetRollbackVersion._id,
        actor: user?.name || 'ML Lead',
        role: user?.role || 'ML_LEAD',
        rationale: rollbackRationale.trim() || `Production rollback to ${targetRollbackVersion.version} due to statistical drift and risk mitigation.`
      });

      setRollbackFeedback({
        success: true,
        message: `Model successfully rolled back to ${targetRollbackVersion.version}. New production version active.`
      });
      // Refresh comparison and monitoring
      const updated = await compareModelVersions(selectedModelId);
      setVersionComparisonData(updated);
      await loadMonitoring(selectedModelId, selectedWorkloadId, true);
    } catch (err) {
      setRollbackFeedback({ success: false, message: err.message });
    } finally {
      setRollbackLoading(false);
    }
  };

  const model = monitoringData?.model;
  const version = monitoringData?.version;
  const signalStatus = monitoringData?.signalStatus || 'NO_DATA';
  const latestTelemetry = monitoringData?.latestTelemetry;
  const activeIncidents = monitoringData?.activeIncidents || [];
  const telemetryHistory = monitoringData?.telemetryHistory || [];
  const recentTrend = monitoringData?.recentTrend || [];

  // Stream state computation
  const isPaused = schedulerState?.status === 'PAUSED';
  const hasRecentData = recentTrend.length > 0 && lastRefreshedAt && (Date.now() - new Date(recentTrend[recentTrend.length - 1]?.recordedAt || 0).getTime()) < 180000;
  const streamState = isPaused ? 'PAUSED' : (recentTrend.length === 0 ? 'NO_DATA' : (hasRecentData ? 'LIVE STREAMING' : 'IDLE / STALE'));

  const activeWorkloadConfig = WORKLOAD_CONFIGS.find(w => w.id === selectedWorkloadId) || WORKLOAD_CONFIGS[0];
  const activeWorkloadStatus = workloadsStatus ? workloadsStatus[activeWorkloadConfig.statusKey] : null;

  return (
    <div className="page-container" id="monitoring-page">
      {/* Top Header */}
      <PageHeader
        title="Runtime Telemetry & Observability"
        subtitle="Continuous surveillance across all 4 AI workloads, Evidently 0.7.23 hypothesis testing, automated drift reports, and governed version rollback."
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            id="toggle-autorefresh-btn"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`btn btn-sm ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Auto-refresh stream every 15 seconds"
          >
            <Radio size={14} className={autoRefresh ? 'pulse-icon' : ''} />
            {autoRefresh ? 'Live Stream Active (15s)' : 'Polling Paused'}
          </button>

          <button 
            id="refresh-stream-btn"
            onClick={() => loadMonitoring(selectedModelId, selectedWorkloadId, true)} 
            className="btn btn-secondary btn-sm" 
            disabled={refreshing}
            title="Refresh telemetry stream"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> 
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          
          <button
            id="open-rollback-modal-btn"
            onClick={handleOpenRollbackModal}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RotateCcw size={14} />
            Version Rollback & Compare
          </button>

          <Link to="/app/incidents" className="btn btn-secondary btn-sm" id="view-incidents-btn">
            Incidents Queue ({activeIncidents.length})
          </Link>
        </div>
      </PageHeader>

      {/* Governed AI Workloads Bar */}
      <div 
        id="governed-workloads-bar"
        className="card" 
        style={{ 
          marginBottom: '18px', 
          padding: '14px 18px', 
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-color)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={16} color="var(--accent-primary)" />
            <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-primary)' }}>
              Governed AI Workload Infrastructure
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={14} color={servicesStatus?.evidently?.status === 'HEALTHY' ? 'var(--success)' : 'var(--danger)'} />
              <span style={{ color: 'var(--text-muted)' }}>Evidently Service:</span>
              <span className={`badge ${servicesStatus?.evidently?.status === 'HEALTHY' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '11px' }}>
                {servicesStatus?.evidently?.status || 'CHECKING...'} (0.7.23)
              </span>
            </div>

            {lastRefreshedAt && (
              <span style={{ color: 'var(--text-muted)', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} /> Sync: {lastRefreshedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* 4 Workload Selector Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
          {WORKLOAD_CONFIGS.map((w) => {
            const isSelected = selectedWorkloadId === w.id;
            const wStatus = workloadsStatus ? workloadsStatus[w.statusKey] : null;
            const isConnected = wStatus?.status === 'CONNECTED';
            const isConfigReq = wStatus?.status === 'CONFIGURATION_REQUIRED';

            return (
              <div
                key={w.id}
                onClick={() => handleSelectWorkload(w.id)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-color)',
                  background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-subtle)',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                    {w.label}
                  </span>
                  <span 
                    className={`badge ${isConnected ? 'badge-success' : isConfigReq ? 'badge-warning' : 'badge-danger'}`}
                    style={{ fontSize: '10px', textTransform: 'uppercase' }}
                  >
                    {wStatus?.status || 'PROBING...'}
                  </span>
                </div>

                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {w.subtext}
                </div>

                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {w.endpoint}
                </div>
              </div>
            );
          })}
        </div>

        {/* Workload Specific Notes (e.g., Insurance AWS note or Churn API Key) */}
        {selectedWorkloadId === 'insurance-charges' && (
          <div style={{ marginTop: '10px', padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info size={14} color="var(--info)" />
            <span>
              <strong>Primary Verified Ingestion Endpoint:</strong> Render HTTPS service active (latency ~750ms). AWS candidate IP (<code>http://52.57.67.6/</code>) connection refused / unroutable from test environment.
            </span>
          </div>
        )}

        {selectedWorkloadId === 'customer-churn' && (
          <div style={{ marginTop: '10px', padding: '8px 12px', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-sm)', fontSize: '11.5px', color: 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={14} />
            <span>
              <strong>Configuration Notice:</strong> Churn service HTTP 200 health check verified. Inference predictions require valid <code>CHURN_API_KEY</code> header. Marked as <code>CONFIGURATION_REQUIRED</code>.
            </span>
          </div>
        )}
      </div>

      {/* Scheduler State & Execution Control Strip */}
      <div 
        id="monitoring-scheduler-card"
        className="card" 
        style={{ 
          marginBottom: '20px', 
          padding: '14px 18px', 
          borderLeft: '4px solid var(--accent-primary)',
          background: 'var(--bg-surface)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <Sliders size={16} color="var(--accent-primary)" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Autonomous Background Monitoring Engine
              </span>
              <span className={`badge ${schedulerState?.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '11px' }}>
                {schedulerState?.status === 'ACTIVE' ? 'SCHEDULER RUNNING' : 'SCHEDULER PAUSED'}
              </span>
              <span className="badge badge-info" style={{ fontSize: '11px' }}>
                MODE: {schedulerState?.mode || 'DEMO'}
              </span>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Runs independently of browser state on backend timers • 
              Controlled healthy baseline vs. shifted drift cycles • 
              Drift threshold: KS / Chi-Square p &lt; 0.05
            </div>
          </div>

          {/* Action Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              id="scheduler-toggle-pause-btn"
              onClick={handleToggleSchedulerPause}
              disabled={actionLoading}
              className={`btn btn-sm ${schedulerState?.status === 'ACTIVE' ? 'btn-secondary' : 'btn-primary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {schedulerState?.status === 'ACTIVE' ? <Pause size={13} /> : <Play size={13} />}
              {schedulerState?.status === 'ACTIVE' ? 'Pause Scheduler' : 'Resume Scheduler'}
            </button>

            <button
              id="scheduler-toggle-mode-btn"
              onClick={handleToggleSchedulerMode}
              disabled={actionLoading}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Toggle between DEMO (alternating drift) and REAL ingestion"
            >
              <Sliders size={13} />
              Set Mode: {schedulerState?.mode === 'DEMO' ? 'REAL' : 'DEMO'}
            </button>
          </div>
        </div>

        {/* Ad-Hoc Batch Trigger Bar */}
        <div style={{ 
          marginTop: '14px', 
          paddingTop: '12px', 
          borderTop: '1px solid var(--border-color)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '12px' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
              Trigger Controlled Evaluation:
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Scenario:</label>
              <select
                id="manual-scenario-select"
                value={evalScenario}
                onChange={(e) => setEvalScenario(e.target.value)}
                className="form-select"
                style={{ fontSize: '12px', padding: '4px 8px', width: '200px' }}
              >
                <option value="BASELINE">BASELINE (In-Distribution / Healthy)</option>
                <option value="DRIFTED">DRIFTED (Shifted Anomaly / Triggers Drift)</option>
                <option value="MIXED">MIXED (Moderate Shift)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Batch Size:</label>
              <select
                id="manual-batchsize-select"
                value={evalBatchSize}
                onChange={(e) => setEvalBatchSize(e.target.value)}
                className="form-select"
                style={{ fontSize: '12px', padding: '4px 8px', width: '75px' }}
              >
                <option value="15">15</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>

          <button
            id="trigger-manual-batch-btn"
            onClick={handleTriggerManualBatch}
            disabled={actionLoading || activeWorkloadStatus?.status === 'CONFIGURATION_REQUIRED'}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {actionLoading ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
            {actionLoading ? 'Scoring & Evaluating...' : `Trigger Batch on '${activeWorkloadConfig.label}'`}
          </button>
        </div>

        {/* Feedback Messages */}
        {actionSuccessMsg && (
          <div className="alert alert-success" style={{ marginTop: '12px', padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={14} />
            <span>{actionSuccessMsg}</span>
          </div>
        )}
        {actionErrorMsg && (
          <div className="alert alert-danger" style={{ marginTop: '12px', padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={14} />
            <span>{actionErrorMsg}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <RefreshCw className="animate-spin" size={24} color="var(--accent-primary)" style={{ margin: '0 auto 10px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading workload telemetry stream and Evidently metrics...</p>
        </div>
      ) : !model ? (
        <EmptyState
          icon={Layers}
          title="No Governed Model Bound for this Workload"
          description={`Workload '${activeWorkloadConfig.label}' does not currently have an active governed model registered.`}
        />
      ) : (
        <>
          {/* Signal State Banner */}
          <div 
            id="monitoring-signal-banner"
            style={{
              padding: '14px 18px',
              borderRadius: 'var(--radius-md)',
              marginBottom: '20px',
              border: '1px solid',
              background: signalStatus === 'INCIDENT_ACTIVE' ? 'var(--danger-bg)' :
                          signalStatus === 'DRIFT_DETECTED' ? 'var(--warning-bg)' :
                          signalStatus === 'HEALTHY' ? 'var(--success-bg)' : 'var(--bg-subtle)',
              borderColor: signalStatus === 'INCIDENT_ACTIVE' ? 'var(--danger-border)' :
                           signalStatus === 'DRIFT_DETECTED' ? 'var(--warning-border)' :
                           signalStatus === 'HEALTHY' ? 'var(--success-border)' : 'var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {signalStatus === 'INCIDENT_ACTIVE' ? (
                <ShieldAlert size={22} color="var(--danger)" />
              ) : signalStatus === 'DRIFT_DETECTED' ? (
                <AlertTriangle size={22} color="var(--warning)" />
              ) : signalStatus === 'HEALTHY' ? (
                <CheckCircle2 size={22} color="var(--success)" />
              ) : (
                <Info size={22} color="var(--text-muted)" />
              )}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    STATISTICAL OBSERVABILITY SIGNAL:
                  </span>
                  <StatusBadge status={signalStatus} />
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {signalStatus === 'INCIDENT_ACTIVE' ? (
                    <span>An active Governance Incident is open for this model version. Human investigation and authorized review required.</span>
                  ) : signalStatus === 'DRIFT_DETECTED' ? (
                    <span>
                      Statistical distribution shift confirmed via Evidently 0.7.23
                      {latestTelemetry?.driftedColumns?.length ? ` (Drifted Features: ${latestTelemetry.driftedColumns.join(', ')})` : ''}.
                    </span>
                  ) : signalStatus === 'HEALTHY' ? (
                    <span>All production feature distributions match baseline reference tolerance under two-sample hypothesis testing (α = 0.05).</span>
                  ) : (
                    <span>No runtime telemetry batches recorded for this version yet. Ingestion pipeline is waiting for incoming traffic.</span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                id="view-latest-report-btn"
                onClick={() => handleOpenReport(latestTelemetry?.reportId?._id || latestTelemetry?.reportId || null)}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <FileText size={13} />
                View Statistical Drift Report
              </button>
            </div>
          </div>

          {/* Model & Version Strip with KPIs */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{model.name}</h2>
                  <StatusBadge status={model.lifecycleStatus} />
                  <span className="badge badge-neutral font-mono">
                    Version: {version ? version.version : 'None Active'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  Workload: <strong>{activeWorkloadConfig.label}</strong> • Risk Tier: <strong>{formatRiskLevel(model.riskLevel)}</strong> • Deployment: <strong>{formatStatusLabel(version?.deploymentStatus || 'IN_PRODUCTION')}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  id="switch-monitored-model-select"
                  value={selectedModelId}
                  onChange={(e) => handleSelectModel(e.target.value)}
                  className="form-select"
                  style={{ width: '260px', padding: '5px 10px', fontSize: '12px' }}
                >
                  {models.map(m => (
                    <option key={m._id} value={m._id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Telemetry KPI Strip */}
            {latestTelemetry ? (
              <div className="metrics-grid" style={{ marginBottom: 0 }}>
                <MetricCard
                  title="Statistical Drift (Evidently)"
                  value={latestTelemetry.driftStatus === 'DRIFT_DETECTED' ? 'DRIFT DETECTED' : 'HEALTHY'}
                  subtext={latestTelemetry.driftedColumns?.length 
                    ? `${latestTelemetry.driftedColumns.length} drifted feature(s) (α=0.05)`
                    : 'All features statistically stable'}
                  icon={Activity}
                  trend={latestTelemetry.driftStatus === 'DRIFT_DETECTED' ? 'Drift Observed' : 'Stable'}
                  trendPositive={latestTelemetry.driftStatus !== 'DRIFT_DETECTED'}
                />
                <MetricCard
                  title="Batch Inference Volume"
                  value={(latestTelemetry.performanceTelemetry?.predictionVolume || latestTelemetry.sampleSize || 0).toLocaleString()}
                  subtext="Monitored records in batch"
                  icon={BarChart3}
                />
                <MetricCard
                  title="Average Inference Latency"
                  value={`${latestTelemetry.performanceTelemetry?.avgLatencyMs || 0} ms`}
                  subtext="End-to-end response time"
                  icon={Clock}
                />
                <MetricCard
                  title="Last Evaluated Timestamp"
                  value={new Date(latestTelemetry.recordedAt).toLocaleTimeString()}
                  subtext={new Date(latestTelemetry.recordedAt).toLocaleDateString()}
                  icon={CheckCircle}
                  trendPositive={true}
                />
              </div>
            ) : (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No telemetry batches recorded for this system yet. Trigger a batch to view metrics.
              </div>
            )}
          </div>

          {/* Genuine Observability Graph — Dark-Themed Professional Visualizer */}
          <div 
            className="card" 
            id="runtime-trend-card" 
            style={{ 
              marginBottom: '20px', 
              background: '#0B0E14', 
              borderColor: '#1E2530',
              color: '#F1F5F9'
            }}
          >
            <div className="card-header" style={{ borderBottomColor: '#1E2530' }}>
              <div className="card-title" style={{ color: '#F1F5F9' }}>
                <TrendingUp size={16} color="#3B82F6" />
                <span>Production Observability Stream & Latency Profiler</span>
              </div>

              {/* Stream Status Pill & Details */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  padding: '4px 10px', 
                  borderRadius: '20px', 
                  background: streamState === 'LIVE STREAMING' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  border: `1px solid ${streamState === 'LIVE STREAMING' ? '#10B981' : '#F59E0B'}`,
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  <span style={{ 
                    width: '7px', 
                    height: '7px', 
                    borderRadius: '50%', 
                    background: streamState === 'LIVE STREAMING' ? '#10B981' : '#F59E0B'
                  }} className={streamState === 'LIVE STREAMING' ? 'pulse-icon' : ''} />
                  <span style={{ color: streamState === 'LIVE STREAMING' ? '#34D399' : '#FBBF24' }}>
                    {streamState}
                  </span>
                </div>

                <span style={{ fontSize: '11.5px', color: '#94A3B8' }}>
                  {recentTrend.length} Chronological Batches
                </span>
              </div>
            </div>

            {recentTrend.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: '#64748B' }}>
                <TrendingUp size={32} color="#475569" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#E2E8F0' }}>
                  Waiting for telemetry stream batches...
                </div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                  Click "Trigger Batch" above or enable the autonomous scheduler to begin continuous observation.
                </div>
              </div>
            ) : (
              <div style={{ padding: '16px 12px 10px' }}>
                {/* SVG Operational Chart */}
                <div style={{ height: '220px', width: '100%', position: 'relative' }}>
                  <svg width="100%" height="100%" viewBox="0 0 700 200" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                    <defs>
                      <linearGradient id="barHealthyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.4" />
                      </linearGradient>
                      <linearGradient id="barDriftGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.95" />
                        <stop offset="100%" stopColor="#B45309" stopOpacity="0.4" />
                      </linearGradient>
                      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="glow" />
                        <feComposite in="SourceGraphic" in2="glow" operator="over" />
                      </filter>
                    </defs>

                    {/* Dark Grid Lines */}
                    <line x1="40" y1="20" x2="680" y2="20" stroke="#1E2530" strokeDasharray="3,3" strokeWidth="1" />
                    <line x1="40" y1="65" x2="680" y2="65" stroke="#1E2530" strokeDasharray="3,3" strokeWidth="1" />
                    <line x1="40" y1="110" x2="680" y2="110" stroke="#1E2530" strokeDasharray="3,3" strokeWidth="1" />
                    <line x1="40" y1="155" x2="680" y2="155" stroke="#1E2530" strokeWidth="1" />

                    {/* Y-Axis Label: Inferences Left */}
                    <text x="35" y="24" textAnchor="end" fill="#64748B" fontSize="9" fontFamily="monospace">50 vol</text>
                    <text x="35" y="114" textAnchor="end" fill="#64748B" fontSize="9" fontFamily="monospace">25 vol</text>
                    <text x="35" y="159" textAnchor="end" fill="#64748B" fontSize="9" fontFamily="monospace">0</text>

                    {/* Y-Axis Label: Latency Right */}
                    <text x="685" y="24" textAnchor="start" fill="#A855F7" fontSize="9" fontFamily="monospace">1.5s</text>
                    <text x="685" y="114" textAnchor="start" fill="#A855F7" fontSize="9" fontFamily="monospace">0.5s</text>

                    {/* Volume Bars */}
                    {recentTrend.map((point, index) => {
                      const totalPoints = recentTrend.length;
                      const x = totalPoints === 1 ? 360 : 70 + (index * (580 / Math.max(totalPoints - 1, 1)));
                      const maxVol = Math.max(...recentTrend.map(p => p.predictionVolume || 25), 50);
                      const barHeight = Math.max(((point.predictionVolume || 25) / maxVol) * 110, 16);
                      const barY = 155 - barHeight;

                      const isDrifted = point.driftStatus === 'DRIFT_DETECTED';
                      const isHovered = hoveredPoint && hoveredPoint.batchId === point.batchId;

                      return (
                        <g 
                          key={point.batchId || index}
                          onMouseEnter={() => setHoveredPoint(point)}
                          onMouseLeave={() => setHoveredPoint(null)}
                          style={{ cursor: 'pointer' }}
                        >
                          {/* Volume Bar */}
                          <rect
                            x={x - 11}
                            y={barY}
                            width="22"
                            height={barHeight}
                            rx="3"
                            fill={isDrifted ? 'url(#barDriftGrad)' : 'url(#barHealthyGrad)'}
                            stroke={isHovered ? '#FFFFFF' : (isDrifted ? '#F59E0B' : '#3B82F6')}
                            strokeWidth={isHovered ? '2' : '0.5'}
                            opacity={isHovered ? '1' : '0.85'}
                          />

                          {/* Current Batch Highlighting Ring on latest point */}
                          {index === recentTrend.length - 1 && (
                            <circle
                              cx={x}
                              cy={barY - 14}
                              r="8"
                              fill="none"
                              stroke="#60A5FA"
                              strokeWidth="1.5"
                              strokeDasharray="2,2"
                            />
                          )}

                          {/* Drift Event Warning Diamond */}
                          {isDrifted && (
                            <polygon
                              points={`${x},${barY - 20} ${x + 6},${barY - 14} ${x},${barY - 8} ${x - 6},${barY - 14}`}
                              fill="#F59E0B"
                              stroke="#0B0E14"
                              strokeWidth="1"
                              filter="url(#glow)"
                            />
                          )}

                          {/* Active Incident Red Circle */}
                          {point.hasIncident && (
                            <circle
                              cx={x}
                              cy={barY - 14}
                              r="5"
                              fill="#EF4444"
                              stroke="#0B0E14"
                              strokeWidth="1.5"
                              filter="url(#glow)"
                            />
                          )}

                          {/* Batch ID X-Axis Label */}
                          <text
                            x={x}
                            y="173"
                            textAnchor="middle"
                            fontSize="9"
                            fill={isHovered ? '#FFFFFF' : '#64748B'}
                            fontFamily="monospace"
                          >
                            {(point.batchId || '').slice(-5) || `B${index + 1}`}
                          </text>
                        </g>
                      );
                    })}

                    {/* Overlaid Latency Curve Line */}
                    {recentTrend.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#A855F7"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={recentTrend.map((point, index) => {
                          const totalPoints = recentTrend.length;
                          const x = totalPoints === 1 ? 360 : 70 + (index * (580 / Math.max(totalPoints - 1, 1)));
                          const maxLat = Math.max(...recentTrend.map(p => p.latencyMs || 200), 1500);
                          const latY = Math.max(155 - ((point.latencyMs || 100) / maxLat) * 125, 25);
                          return `${x},${latY}`;
                        }).join(' ')}
                      />
                    )}

                    {/* Latency Points */}
                    {recentTrend.map((point, index) => {
                      const totalPoints = recentTrend.length;
                      const x = totalPoints === 1 ? 360 : 70 + (index * (580 / Math.max(totalPoints - 1, 1)));
                      const maxLat = Math.max(...recentTrend.map(p => p.latencyMs || 200), 1500);
                      const latY = Math.max(155 - ((point.latencyMs || 100) / maxLat) * 125, 25);

                      return (
                        <circle
                          key={`lat-${index}`}
                          cx={x}
                          cy={latY}
                          r="3.5"
                          fill="#C084FC"
                          stroke="#0B0E14"
                          strokeWidth="1.5"
                        />
                      );
                    })}
                  </svg>
                </div>

                {/* Interactive Tooltip Card if a point is hovered */}
                {hoveredPoint ? (
                  <div style={{
                    marginTop: '10px',
                    padding: '10px 16px',
                    borderRadius: '6px',
                    background: '#131821',
                    border: '1px solid #2D3748',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    fontSize: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="font-mono" style={{ color: '#60A5FA', fontWeight: 600 }}>
                        {hoveredPoint.batchId}
                      </span>
                      <span style={{ color: '#94A3B8' }}>
                        {new Date(hoveredPoint.recordedAt).toLocaleTimeString()}
                      </span>
                      <span style={{ color: '#E2E8F0' }}>
                        Vol: <strong>{hoveredPoint.predictionVolume || 25}</strong> inferences
                      </span>
                      <span style={{ color: '#C084FC' }}>
                        Latency: <strong>{hoveredPoint.latencyMs || 0} ms</strong>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={`badge ${hoveredPoint.driftStatus === 'DRIFT_DETECTED' ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '10.5px' }}>
                        {hoveredPoint.driftStatus === 'DRIFT_DETECTED' ? 'DRIFT OBSERVED' : 'HEALTHY'}
                      </span>
                      {hoveredPoint.hasIncident && (
                        <span className="badge badge-danger" style={{ fontSize: '10.5px' }}>
                          INCIDENT LINKED
                        </span>
                      )}
                      <button
                        onClick={() => handleOpenReport(hoveredPoint.reportId || null)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '3px 8px', fontSize: '11px', background: '#1E2530', color: '#F1F5F9', border: '1px solid #3B82F6' }}
                      >
                        Inspect Report →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    marginTop: '10px',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: '#131821',
                    border: '1px solid #1E2530',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    fontSize: '11.5px',
                    color: '#94A3B8'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '10px', height: '10px', background: '#3B82F6', borderRadius: '2px', display: 'inline-block' }} />
                        Volume Inferences
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '10px', height: '10px', background: '#F59E0B', borderRadius: '2px', display: 'inline-block' }} />
                        Drifted Batch (α &le; 0.05)
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '8px', height: '8px', background: '#A855F7', borderRadius: '50%', display: 'inline-block' }} />
                        Operational Latency Line
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '8px', height: '8px', background: '#EF4444', borderRadius: '50%', display: 'inline-block' }} />
                        Active Incident
                      </span>
                    </div>

                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                      Hover over any batch column for detailed statistical metrics
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Monitored Feature Statistical Metrics from Evidently */}
          {latestTelemetry?.features && Array.isArray(latestTelemetry.features) && latestTelemetry.features.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={16} color="var(--accent-primary)" />
                <span>Feature Statistical Tests (Evidently 0.7.23 DataDriftPreset)</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '14px' }}>
                {latestTelemetry.features.map((feat, fIdx) => (
                  <div key={feat.name || fIdx} className="card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {feat.name}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Method: <strong>{feat.statisticalMethod || 'Two-sample Hypothesis Test'}</strong>
                        </div>
                      </div>
                      <StatusBadge 
                        status={feat.driftDetected ? 'danger' : 'success'}
                        label={feat.driftDetected ? 'DRIFT DETECTED' : 'STABLE'}
                      />
                    </div>

                    <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', fontSize: '12px', marginTop: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Computed p-value:</span>
                        <strong className="tnum" style={{ color: feat.driftDetected ? 'var(--danger-text)' : 'var(--success-text)' }}>
                          {typeof feat.pValue === 'number' && feat.pValue < 0.0001 ? feat.pValue.toExponential(4) : (feat.pValue ?? 'N/A')}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Significance Threshold (α):</span>
                        <span className="font-mono">{feat.threshold || 0.05}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Hypothesis Verdict:</span>
                        <strong style={{ color: feat.driftDetected ? 'var(--danger-text)' : 'var(--success-text)' }}>
                          {feat.driftDetected ? 'Reject H₀ (Shift Confirmed)' : 'Accept H₀ (Stable)'}
                        </strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Persisted Evidently Telemetry History Table */}
          <div className="card" id="telemetry-history-card">
            <div className="card-header">
              <div className="card-title">
                <Activity size={15} color="var(--accent-primary)" />
                <span>Persisted Telemetry Stream History ({telemetryHistory.length})</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Real production stream records • Audit verified
              </span>
            </div>

            {telemetryHistory.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Activity size={28} color="var(--text-muted)" style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                  No telemetry history recorded yet.
                </div>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Batch ID</th>
                      <th>Recorded At</th>
                      <th>Model Version</th>
                      <th>Inferences</th>
                      <th>Monitoring Source</th>
                      <th>Drift Status</th>
                      <th>Drifted Features</th>
                      <th>Latency</th>
                      <th>Linked Report</th>
                      <th>Incident</th>
                    </tr>
                  </thead>
                  <tbody>
                    {telemetryHistory.map((t) => (
                      <tr key={t._id}>
                        <td className="font-mono" style={{ fontSize: '12px' }}>{t.batchId}</td>
                        <td style={{ fontSize: '12px' }}>{new Date(t.recordedAt).toLocaleString()}</td>
                        <td>
                          <span className="font-mono">{t.versionId?.version || version?.version || 'v1.0'}</span>
                        </td>
                        <td className="tnum">{(t.sampleSize || t.performanceTelemetry?.predictionVolume || 0).toLocaleString()}</td>
                        <td>
                          <span className="badge badge-info font-mono" style={{ fontSize: '10px' }}>
                            {t.monitoringSource || 'EVIDENTLY'}
                          </span>
                        </td>
                        <td>
                          <StatusBadge 
                            status={t.driftStatus === 'DRIFT_DETECTED' ? 'danger' : 'success'}
                            label={t.driftStatus === 'DRIFT_DETECTED' ? 'DRIFT DETECTED' : 'HEALTHY'}
                          />
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          {t.driftedColumns && t.driftedColumns.length > 0 ? (
                            <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>
                              {t.driftedColumns.join(', ')}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>0 columns</span>
                          )}
                        </td>
                        <td className="tnum">{t.performanceTelemetry?.avgLatencyMs || 0} ms</td>
                        <td>
                          {t.reportId ? (
                            <button
                              onClick={() => handleOpenReport(t.reportId._id || t.reportId)}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <FileText size={11} />
                              {t.reportId.reportNumber || 'REP-DRIFT'}
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>None</span>
                          )}
                        </td>
                        <td>
                          {t.incidentId ? (
                            <Link to="/app/incidents" style={{ color: 'var(--danger-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                              <ShieldAlert size={13} />
                              {t.incidentId.incidentNumber || 'Incident'}
                            </Link>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>None</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ================= MODAL: STATISTICAL DRIFT REPORT ================= */}
      {reportModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {selectedReport ? selectedReport.title : 'Statistical Distribution Drift Report'}
                </h3>
              </div>
              <button
                onClick={() => setReportModalOpen(false)}
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {reportLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <RefreshCw size={24} className="animate-spin" color="var(--accent-primary)" style={{ margin: '0 auto 10px' }} />
                  <p style={{ color: 'var(--text-muted)' }}>Retrieving governance drift report...</p>
                </div>
              ) : !selectedReport ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No drift report found for this system. Run a batch to generate an authoritative report.
                </div>
              ) : (
                <div>
                  {/* Metadata Header Card */}
                  <div style={{
                    padding: '14px 18px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-subtle)',
                    marginBottom: '18px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-primary)' }}>
                        {selectedReport.reportNumber}
                      </span>
                      <StatusBadge status={selectedReport.operationalStatus} />
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <strong>Workload:</strong> {selectedReport.workloadId} • <strong>Model:</strong> {selectedReport.modelId?.name} ({selectedReport.versionId?.version})
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Generated: {new Date(selectedReport.createdAt).toUTCString()}
                    </div>
                  </div>

                  {/* Executive Summary */}
                  <div style={{ marginBottom: '18px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Executive Summary
                    </h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                      {selectedReport.executiveSummary}
                    </p>
                  </div>

                  {/* Feature Breakdown Table */}
                  {selectedReport.driftAnalysis?.features && (
                    <div style={{ marginBottom: '20px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Feature-Level Two-Sample Hypothesis Tests (α = 0.05)
                      </h4>
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>Feature</th>
                              <th>Statistical Method</th>
                              <th>Computed p-value</th>
                              <th>Threshold (α)</th>
                              <th>Verdict</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedReport.driftAnalysis.features.map((feat, idx) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 600 }}>{feat.name}</td>
                                <td>{feat.statisticalMethod}</td>
                                <td className="tnum" style={{ color: feat.driftDetected ? 'var(--danger-text)' : 'var(--success-text)', fontWeight: 600 }}>
                                  {typeof feat.pValue === 'number' && feat.pValue < 0.0001 ? feat.pValue.toExponential(4) : feat.pValue}
                                </td>
                                <td className="font-mono">{feat.threshold || 0.05}</td>
                                <td>
                                  <StatusBadge 
                                    status={feat.driftDetected ? 'danger' : 'success'} 
                                    label={feat.driftDetected ? 'REJECT H₀ (DRIFT)' : 'ACCEPT H₀ (STABLE)'}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Methodological Limitations Notice */}
                  <div style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--warning-bg)',
                    border: '1px solid var(--warning-border)',
                    marginBottom: '18px',
                    fontSize: '12px',
                    color: 'var(--warning-text)'
                  }}>
                    <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <AlertTriangle size={14} />
                      Methodological Limitations & Governance Notice:
                    </div>
                    <div>
                      Statistical distribution drift measures input divergence from baseline training data. 
                      <strong> It does not prove accuracy degradation without ground-truth label reconciliation.</strong> Automated promotion or unsupervised retraining is strictly prohibited under Sentinel stage-gates.
                    </div>
                  </div>

                  {/* Recommendations */}
                  {selectedReport.recommendations && (
                    <div>
                      <h4 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Recommended Governance & ML Lead Actions
                      </h4>
                      <ul style={{ paddingLeft: '20px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {selectedReport.recommendations.map((rec, rIdx) => (
                          <li key={rIdx}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer with Export Buttons */}
            {selectedReport && (
              <div style={{
                padding: '14px 20px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Classification: NIST AI RMF Measure 2.6 • EU AI Act Annex III
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <a
                    href={`/api/reports/${selectedReport._id}/export?format=markdown`}
                    download={`${selectedReport.reportNumber}.md`}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                  >
                    <Download size={13} />
                    Download Markdown (.md)
                  </a>

                  <a
                    href={`/api/reports/${selectedReport._id}/export?format=json`}
                    download={`${selectedReport.reportNumber}.json`}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                  >
                    <Download size={13} />
                    Download JSON
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: VERSION ROLLBACK & COMPARISON ================= */}
      {rollbackModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '920px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <RotateCcw size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Model Version Evidence Comparison & Governed Rollback
                </h3>
              </div>
              <button
                onClick={() => setRollbackModalOpen(false)}
                className="btn btn-secondary btn-sm"
                style={{ padding: '4px 8px' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {rollbackLoading && !versionComparisonData ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <RefreshCw size={24} className="animate-spin" color="var(--accent-primary)" style={{ margin: '0 auto 10px' }} />
                  <p style={{ color: 'var(--text-muted)' }}>Retrieving registered versions and audit evidence...</p>
                </div>
              ) : !versionComparisonData ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Failed to load model versions for comparison.
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Comparing registered versions of <strong>{versionComparisonData.model?.name}</strong>. 
                    Rollback activates a previously vetted and approved version, demoting the drifting version to DEPRECATED in production and creating an immutable audit ledger entry.
                  </div>

                  {rollbackFeedback && (
                    <div 
                      className={`alert ${rollbackFeedback.success ? 'alert-success' : 'alert-danger'}`}
                      style={{ marginBottom: '16px', padding: '10px 14px', fontSize: '12.5px' }}
                    >
                      {rollbackFeedback.message}
                    </div>
                  )}

                  {/* Versions Comparison Table */}
                  <div className="table-container" style={{ marginBottom: '20px' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Version</th>
                          <th>Status</th>
                          <th>Accuracy</th>
                          <th>ROC-AUC</th>
                          <th>Fairness (DIR)</th>
                          <th>Policy Gate</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {versionComparisonData.versions?.map((v) => {
                          const isCurrent = v.isCurrentProduction;
                          const isSelected = targetRollbackVersion?._id === v._id;

                          return (
                            <tr 
                              key={v._id}
                              style={{
                                background: isCurrent ? 'var(--accent-subtle)' : isSelected ? 'var(--bg-subtle)' : 'transparent'
                              }}
                            >
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <strong className="font-mono">{v.version}</strong>
                                  {isCurrent && (
                                    <span className="badge badge-primary" style={{ fontSize: '10px' }}>CURRENT PROD</span>
                                  )}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {v.changelog || 'No changelog'}
                                </div>
                              </td>
                              <td>
                                <StatusBadge status={v.deploymentStatus || v.lifecycleStatus} />
                              </td>
                              <td className="tnum">
                                {v.metrics?.accuracy ? `${(v.metrics.accuracy * 100).toFixed(1)}%` : 'N/A'}
                              </td>
                              <td className="tnum">
                                {v.metrics?.rocAuc ? v.metrics.rocAuc.toFixed(3) : 'N/A'}
                              </td>
                              <td className="tnum">
                                {v.fairness?.disparateImpactRatio ? v.fairness.disparateImpactRatio.toFixed(3) : 'N/A'}
                              </td>
                              <td>
                                <StatusBadge status={v.policyStatus || 'PASSED'} />
                              </td>
                              <td>
                                {isCurrent ? (
                                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Active</span>
                                ) : v.isRollbackEligible ? (
                                  <button
                                    onClick={() => setTargetRollbackVersion(v)}
                                    className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                                    style={{ padding: '3px 10px', fontSize: '11.5px' }}
                                  >
                                    {isSelected ? 'Selected' : 'Select for Rollback'}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ineligible</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Target Rollback Form if version selected */}
                  {targetRollbackVersion && (
                    <div style={{
                      padding: '16px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--accent-border)'
                    }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <RotateCcw size={15} color="var(--accent-primary)" />
                        Confirm Rollback to Version {targetRollbackVersion.version}
                      </div>

                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                          Governance & Safety Rationale:
                        </label>
                        <textarea
                          value={rollbackRationale}
                          onChange={(e) => setRollbackRationale(e.target.value)}
                          placeholder="Provide justification for production rollback (e.g., Mitigating statistical distribution shift observed on feature X under incident INC-001)..."
                          className="form-control"
                          rows="2"
                          style={{ width: '100%', fontSize: '12.5px' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button
                          onClick={() => setTargetRollbackVersion(null)}
                          className="btn btn-secondary btn-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleExecuteRollback}
                          disabled={rollbackLoading}
                          className="btn btn-primary btn-sm"
                          style={{ background: 'var(--danger)', borderColor: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          {rollbackLoading ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                          Confirm & Execute Rollback
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
