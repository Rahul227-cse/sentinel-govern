import React, { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  getMonitoringOverview, 
  getModels, 
  getMonitoringServicesStatus, 
  getSchedulerStatus,
  pauseScheduler,
  resumeScheduler,
  triggerSchedulerBatch,
  getReports,
  getReportById,
  compareModelVersions,
  triggerRollback,
  updateModelEndpoint
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import MetricCard from '../components/MetricCard';
import EmptyState from '../components/EmptyState';
import { formatRiskLevel, formatStatusLabel } from '../utils/formatters';
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
  Pause,
  Sliders,
  FileText,
  Download,
  RotateCcw,
  X,
  Link2,
  Check
} from 'lucide-react';

export default function Monitoring() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryModelId = searchParams.get('modelId');
  const { user } = useAuth();
  const { currentRole } = useRole();
  const effectiveRole = user?.role || currentRole?.id || 'ML_LEAD';
  const isMlLead = effectiveRole === 'ML_LEAD';

  // Models & Selected Model
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState(queryModelId || '');

  // Monitoring data & subsystem statuses
  const [monitoringData, setMonitoringData] = useState(null);
  const [servicesStatus, setServicesStatus] = useState(null);
  const [schedulerState, setSchedulerState] = useState(null);

  // Loading & refresh states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const autoRefreshTimerRef = useRef(null);

  // Endpoint configuration state (ML Lead only)
  const [endpointUrl, setEndpointUrl] = useState('http://127.0.0.1:8000');
  const [endpointSaving, setEndpointSaving] = useState(false);
  const [endpointStatus, setEndpointStatus] = useState(null); // 'CONNECTED' | 'FAILED' | null
  const [endpointMessage, setEndpointMessage] = useState(null);

  // Evaluation trigger state
  const [actionLoading, setActionLoading] = useState(false);
  const [evalScenario, setEvalScenario] = useState('BASELINE');
  const [evalBatchSize, setEvalBatchSize] = useState(25);
  const [actionSuccessMsg, setActionSuccessMsg] = useState(null);
  const [actionErrorMsg, setActionErrorMsg] = useState(null);

  // Hover state for SVG time-series line chart
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

  // Load telemetry, services status, and scheduler
  const loadMonitoring = async (modelId = selectedModelId, isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);

      const [modelList, overview, services, scheduler] = await Promise.all([
        getModels(),
        getMonitoringOverview(modelId),
        getMonitoringServicesStatus().catch((err) => ({
          fraudAi: { status: 'UNREACHABLE', error: err.message },
          evidently: { status: 'UNREACHABLE', error: err.message }
        })),
        getSchedulerStatus().catch(() => null)
      ]);

      const list = modelList || [];
      setModels(list);
      setServicesStatus(services);
      if (scheduler) setSchedulerState(scheduler);

      if (overview) {
        setMonitoringData(overview);
        if (overview.model) {
          setSelectedModelId(overview.model._id);
          if (overview.model.apiConfig?.endpointUrl) {
            setEndpointUrl(overview.model.apiConfig.endpointUrl);
          }
          if (overview.model.apiConfig?.status) {
            setEndpointStatus(overview.model.apiConfig.status);
          }
        }
      } else if (list.length > 0 && !selectedModelId) {
        setSelectedModelId(list[0]._id);
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
    loadMonitoring(queryModelId || selectedModelId);
  }, [queryModelId]);

  // Auto-refresh interval (every 15s for live observability)
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimerRef.current = setInterval(() => {
        loadMonitoring(selectedModelId, true);
      }, 15000);
    } else if (autoRefreshTimerRef.current) {
      clearInterval(autoRefreshTimerRef.current);
    }
    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
    };
  }, [autoRefresh, selectedModelId]);

  const handleSelectModel = (mId) => {
    setSelectedModelId(mId);
    setSearchParams({ modelId: mId });
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    loadMonitoring(mId);
  };

  // Endpoint connection test & update (ML Lead)
  const handleConnectEndpoint = async () => {
    if (!selectedModelId) return;
    try {
      setEndpointSaving(true);
      setEndpointMessage(null);
      const res = await updateModelEndpoint(selectedModelId, {
        endpointUrl: endpointUrl.trim(),
        healthEndpoint: '/health',
        predictEndpoint: '/score'
      });
      setEndpointStatus('CONNECTED');
      setEndpointMessage(`API Connected (${res.data?.apiConfig?.lastResponseTimeMs || 12} ms). Model verified online.`);
      await loadMonitoring(selectedModelId, true);
    } catch (err) {
      setEndpointStatus('FAILED');
      setEndpointMessage(err.message || 'Connection to API endpoint failed.');
    } finally {
      setEndpointSaving(false);
    }
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
        setActionSuccessMsg('Autonomous monitoring scheduler paused.');
      } else {
        const res = await resumeScheduler();
        setSchedulerState(res);
        setActionSuccessMsg('Autonomous monitoring scheduler resumed.');
      }
      await loadMonitoring(selectedModelId, true);
    } catch (err) {
      setActionErrorMsg(err.message || 'Failed to toggle scheduler');
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
        workloadId: 'fraud-detection',
        scenario: evalScenario,
        count: Number(evalBatchSize)
      });

      const driftText = res.driftStatus === 'DRIFT_DETECTED' 
        ? `Statistical distribution shift detected across ${res.driftedColumns?.join(', ') || 'features'}. Incident and notification generated.`
        : 'Feature distributions in-distribution and healthy under Evidently testing.';

      setActionSuccessMsg(`Batch of ${evalBatchSize} transactions scored. ${driftText}`);
      await loadMonitoring(selectedModelId, true);
    } catch (err) {
      setActionErrorMsg(err.message || 'Failed to execute evaluation batch');
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
      await triggerRollback({
        modelId: selectedModelId,
        targetVersionId: targetRollbackVersion._id,
        actor: user?.name || 'ML Lead',
        role: user?.role || 'ML_LEAD',
        rationale: rollbackRationale.trim() || `Production rollback to ${targetRollbackVersion.version} due to statistical distribution drift.`
      });

      setRollbackFeedback({
        success: true,
        message: `Successfully rolled back to version ${targetRollbackVersion.version}. Model is now active in production.`
      });
      const updated = await compareModelVersions(selectedModelId);
      setVersionComparisonData(updated);
      await loadMonitoring(selectedModelId, true);
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

  return (
    <div className="page-container" id="monitoring-page">
      {/* Top Header */}
      <PageHeader
        title="Runtime Telemetry & Observability"
        subtitle="Continuous monitoring of active Fraud AI service, Evidently hypothesis testing, automated drift reports, and governed version rollback."
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
            onClick={() => loadMonitoring(selectedModelId, true)} 
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
            Incidents ({activeIncidents.length})
          </Link>
        </div>
      </PageHeader>

      {/* Model Selection & API Endpoint Control Strip */}
      <div 
        className="card"
        style={{
          marginBottom: '18px',
          padding: '14px 18px',
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-color)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          {/* Model Selector & Active Workload Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={16} color="var(--accent-primary)" />
              <label htmlFor="model-select" style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-primary)' }}>
                Governed Model:
              </label>
            </div>

            <select
              id="model-select"
              value={selectedModelId}
              onChange={(e) => handleSelectModel(e.target.value)}
              className="form-select"
              style={{ minWidth: '220px', padding: '6px 12px', fontSize: '13px' }}
            >
              {models.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name} ({m.lifecycleStatus || 'IN_PRODUCTION'})
                </option>
              ))}
            </select>

            <span className="badge badge-primary" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Zap size={11} /> {monitoringData?.workloadConfig?.name || monitoringData?.model?.name || 'Active'}
            </span>
          </div>

          {/* Service Status Tags */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={14} color={servicesStatus?.fraudAi?.status === 'HEALTHY' ? 'var(--success)' : 'var(--danger)'} />
              <span style={{ color: 'var(--text-muted)' }}>Fraud API:</span>
              <span className={`badge ${servicesStatus?.fraudAi?.status === 'HEALTHY' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '11px' }}>
                {servicesStatus?.fraudAi?.status || 'ONLINE'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={14} color={servicesStatus?.evidently?.status === 'HEALTHY' ? 'var(--success)' : 'var(--danger)'} />
              <span style={{ color: 'var(--text-muted)' }}>Evidently:</span>
              <span className={`badge ${servicesStatus?.evidently?.status === 'HEALTHY' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '11px' }}>
                {servicesStatus?.evidently?.status || 'HEALTHY'} (0.7.23)
              </span>
            </div>

            {lastRefreshedAt && (
              <span style={{ color: 'var(--text-muted)', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} /> Sync: {lastRefreshedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* API Endpoint Configuration Row (ML Lead Configurable) */}
        <div style={{
          marginTop: '12px',
          paddingTop: '12px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '300px' }}>
            <Link2 size={15} color="var(--text-muted)" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              API Endpoint:
            </span>
            <input
              type="text"
              id="model-endpoint-input"
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              disabled={!isMlLead || endpointSaving}
              placeholder="http://127.0.0.1:8000"
              className="form-control"
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                padding: '4px 8px',
                maxWidth: '280px',
                flex: 1
              }}
            />
            {isMlLead && (
              <button
                id="connect-endpoint-btn"
                onClick={handleConnectEndpoint}
                disabled={endpointSaving}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Verify health check and store endpoint configuration"
              >
                {endpointSaving ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                {endpointSaving ? 'Testing...' : 'Test & Connect'}
              </button>
            )}
            <span
              className={`badge ${endpointStatus === 'CONNECTED' ? 'badge-success' : endpointStatus === 'FAILED' ? 'badge-danger' : 'badge-neutral'}`}
              style={{ fontSize: '11px' }}
            >
              {endpointStatus === 'CONNECTED' ? 'CONNECTED' : endpointStatus === 'FAILED' ? 'UNREACHABLE' : 'READY'}
            </span>
          </div>

          {endpointMessage && (
            <div style={{ fontSize: '12px', color: endpointStatus === 'CONNECTED' ? 'var(--success-text)' : 'var(--danger-text)' }}>
              {endpointMessage}
            </div>
          )}
        </div>
      </div>

      {/* Evaluation Execution & Scheduler Strip */}
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
                Autonomous Monitoring & Drift Evaluation
              </span>
              <span className={`badge ${schedulerState?.status === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '11px' }}>
                {schedulerState?.status === 'ACTIVE' ? 'SCHEDULER RUNNING' : 'SCHEDULER PAUSED'}
              </span>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Two-sample Kolmogorov-Smirnov test (α = 0.05) • Controlled baseline vs. shifted distribution scenarios • Persisted audit trail
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
              Walkthrough Scenario:
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                id="manual-scenario-select"
                value={evalScenario}
                onChange={(e) => setEvalScenario(e.target.value)}
                className="form-select"
                style={{ fontSize: '12px', padding: '4px 8px', width: '220px' }}
              >
                <option value="BASELINE">BASELINE (100% In-Distribution / Healthy)</option>
                <option value="DRIFTED">DRIFTED (~40% Shift on Amount & Channel)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="manual-batchsize-select" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Batch:</label>
              <select
                id="manual-batchsize-select"
                value={evalBatchSize}
                onChange={(e) => setEvalBatchSize(e.target.value)}
                className="form-select"
                style={{ fontSize: '12px', padding: '4px 8px', width: '70px' }}
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
            disabled={actionLoading}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {actionLoading ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
            {actionLoading ? 'Scoring & Evaluating...' : 'Score Batch & Evaluate Drift'}
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
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading telemetry stream and metrics...</p>
        </div>
      ) : !model ? (
        <EmptyState
          icon={Layers}
          title="No Governed Model Found"
          description="Register a model in the Registry or select another model from the dropdown."
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
                    OBSERVABILITY STATUS:
                  </span>
                  <StatusBadge status={signalStatus} />
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {signalStatus === 'INCIDENT_ACTIVE' ? (
                    <span>An active Governance Incident is open for this model version. Human investigation and authorized rollback review required.</span>
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
                View Drift Report
              </button>
            </div>
          </div>

          {/* Model & Version Strip with KPIs */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{model.name}</h2>
                  <StatusBadge status={model.lifecycleStatus} />
                  <span className="badge badge-neutral font-mono">
                    Version: {version ? version.version : 'None Active'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                  Workload: <strong>Fraud Detection AI</strong> • Risk Tier: <strong>{formatRiskLevel(model.riskLevel)}</strong> • Deployment: <strong>{formatStatusLabel(version?.deploymentStatus || 'IN_PRODUCTION')}</strong>
                </div>
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

          {/* Time-Series Line Chart (Atlas Style: Clean Line, Subtle Gridlines, Hover Tooltip) */}
          <div 
            className="card" 
            id="runtime-trend-card" 
            style={{ 
              marginBottom: '20px', 
              background: 'var(--bg-surface)', 
              borderColor: 'var(--border-color)',
              color: 'var(--text-primary)'
            }}
          >
            <div className="card-header" style={{ borderBottomColor: 'var(--border-color)' }}>
              <div className="card-title" style={{ color: 'var(--text-primary)' }}>
                <TrendingUp size={16} color="var(--accent-primary)" />
                <span>Production Observability Stream & Latency Profiler</span>
              </div>

              {/* Stream Status Pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  padding: '3px 10px', 
                  borderRadius: '20px', 
                  background: streamState === 'LIVE STREAMING' ? 'var(--success-bg)' : 'var(--warning-bg)',
                  border: `1px solid ${streamState === 'LIVE STREAMING' ? 'var(--success-border)' : 'var(--warning-border)'}`,
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  <span style={{ 
                    width: '7px', 
                    height: '7px', 
                    borderRadius: '50%', 
                    background: streamState === 'LIVE STREAMING' ? 'var(--success)' : 'var(--warning)'
                  }} className={streamState === 'LIVE STREAMING' ? 'pulse-icon' : ''} />
                  <span style={{ color: streamState === 'LIVE STREAMING' ? 'var(--success-text)' : 'var(--warning-text)' }}>
                    {streamState}
                  </span>
                </div>

                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  {recentTrend.length} Batches
                </span>
              </div>
            </div>

            {recentTrend.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <TrendingUp size={32} color="var(--text-muted)" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                  Waiting for telemetry stream batches...
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Click "Score Batch & Evaluate Drift" above to begin continuous observation.
                </div>
              </div>
            ) : (
              <div style={{ padding: '16px 14px 10px' }}>
                {/* SVG Operational Line Chart */}
                <div style={{ height: '220px', width: '100%', position: 'relative' }}>
                  <svg width="100%" height="100%" viewBox="0 0 700 200" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Subtle Grid Lines */}
                    <line x1="45" y1="20" x2="680" y2="20" stroke="var(--border-subtle)" strokeDasharray="3,3" strokeWidth="1" />
                    <line x1="45" y1="65" x2="680" y2="65" stroke="var(--border-subtle)" strokeDasharray="3,3" strokeWidth="1" />
                    <line x1="45" y1="110" x2="680" y2="110" stroke="var(--border-subtle)" strokeDasharray="3,3" strokeWidth="1" />
                    <line x1="45" y1="155" x2="680" y2="155" stroke="var(--border-color)" strokeWidth="1" />

                    {/* Left Y-Axis: Latency (ms) */}
                    <text x="40" y="24" textAnchor="end" fill="var(--text-muted)" fontSize="9" fontFamily="monospace">150ms</text>
                    <text x="40" y="69" textAnchor="end" fill="var(--text-muted)" fontSize="9" fontFamily="monospace">100ms</text>
                    <text x="40" y="114" textAnchor="end" fill="var(--text-muted)" fontSize="9" fontFamily="monospace">50ms</text>
                    <text x="40" y="159" textAnchor="end" fill="var(--text-muted)" fontSize="9" fontFamily="monospace">0ms</text>

                    {/* Right Y-Axis: Inferences */}
                    <text x="685" y="24" textAnchor="start" fill="var(--text-muted)" fontSize="9" fontFamily="monospace">50 vol</text>
                    <text x="685" y="114" textAnchor="start" fill="var(--text-muted)" fontSize="9" fontFamily="monospace">25 vol</text>

                    {/* Area under line */}
                    {recentTrend.length > 1 && (
                      <polygon
                        fill="url(#areaGradient)"
                        points={`
                          70,155
                          ${recentTrend.map((point, index) => {
                            const totalPoints = recentTrend.length;
                            const x = 70 + (index * (600 / Math.max(totalPoints - 1, 1)));
                            const maxLat = Math.max(...recentTrend.map(p => p.latencyMs || 50), 150);
                            const latY = Math.max(155 - ((point.latencyMs || 25) / maxLat) * 125, 25);
                            return `${x},${latY}`;
                          }).join(' ')}
                          ${70 + ((recentTrend.length - 1) * (600 / Math.max(recentTrend.length - 1, 1)))},155
                        `}
                      />
                    )}

                    {/* Latency Smooth Line */}
                    {recentTrend.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="var(--accent-primary)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={recentTrend.map((point, index) => {
                          const totalPoints = recentTrend.length;
                          const x = 70 + (index * (600 / Math.max(totalPoints - 1, 1)));
                          const maxLat = Math.max(...recentTrend.map(p => p.latencyMs || 50), 150);
                          const latY = Math.max(155 - ((point.latencyMs || 25) / maxLat) * 125, 25);
                          return `${x},${latY}`;
                        }).join(' ')}
                      />
                    )}

                    {/* Observation Data Points */}
                    {recentTrend.map((point, index) => {
                      const totalPoints = recentTrend.length;
                      const x = totalPoints === 1 ? 360 : 70 + (index * (600 / Math.max(totalPoints - 1, 1)));
                      const maxLat = Math.max(...recentTrend.map(p => p.latencyMs || 50), 150);
                      const latY = Math.max(155 - ((point.latencyMs || 25) / maxLat) * 125, 25);

                      const isDrifted = point.driftStatus === 'DRIFT_DETECTED';
                      const isHovered = hoveredPoint && hoveredPoint.batchId === point.batchId;

                      return (
                        <g 
                          key={point.batchId || index}
                          onMouseEnter={() => setHoveredPoint(point)}
                          onMouseLeave={() => setHoveredPoint(null)}
                          style={{ cursor: 'pointer' }}
                        >
                          {/* Point Marker: Amber/Red for Drift, Green/Blue for Healthy */}
                          <circle
                            cx={x}
                            cy={latY}
                            r={isHovered ? 7 : 5}
                            fill={isDrifted ? 'var(--warning)' : 'var(--success)'}
                            stroke="var(--bg-surface)"
                            strokeWidth={isHovered ? 3 : 2}
                          />

                          {/* Pulsing ring on latest observation point */}
                          {index === recentTrend.length - 1 && (
                            <circle
                              cx={x}
                              cy={latY}
                              r="10"
                              fill="none"
                              stroke={isDrifted ? 'var(--warning)' : 'var(--accent-primary)'}
                              strokeWidth="1.5"
                              strokeDasharray="2,2"
                            />
                          )}

                          {/* Drift Indicator Icon above point */}
                          {isDrifted && (
                            <polygon
                              points={`${x},${latY - 14} ${x + 5},${latY - 7} ${x - 5},${latY - 7}`}
                              fill="var(--warning)"
                            />
                          )}

                          {/* Batch ID X-Axis Label */}
                          <text
                            x={x}
                            y="173"
                            textAnchor="middle"
                            fontSize="9"
                            fill={isHovered ? 'var(--text-primary)' : 'var(--text-muted)'}
                            fontFamily="monospace"
                          >
                            {(point.batchId || '').slice(-5) || `B${index + 1}`}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Interactive Tooltip Card if a point is hovered */}
                {hoveredPoint ? (
                  <div style={{
                    marginTop: '10px',
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    fontSize: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="font-mono" style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                        {hoveredPoint.batchId}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {new Date(hoveredPoint.recordedAt).toLocaleTimeString()}
                      </span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        Vol: <strong>{hoveredPoint.predictionVolume || 25}</strong> inferences
                      </span>
                      <span style={{ color: 'var(--accent-primary)' }}>
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
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                      >
                        Inspect Report →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    marginTop: '10px',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    fontSize: '11.5px',
                    color: 'var(--text-muted)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '8px', height: '8px', background: 'var(--success)', borderRadius: '50%', display: 'inline-block' }} />
                        Healthy Observation
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '8px', height: '8px', background: 'var(--warning)', borderRadius: '50%', display: 'inline-block' }} />
                        Drift Detected (α &le; 0.05)
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '12px', height: '2px', background: 'var(--accent-primary)', display: 'inline-block' }} />
                        Response Latency Trend
                      </span>
                    </div>

                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Hover over any observation point for metrics
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Latest Live Observation & Feature Drift Tests (Side-by-Side) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '18px', marginBottom: '20px' }}>
            {/* Live Observation Summary Card */}
            <div className="card" style={{ padding: '16px 20px', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Zap size={16} color="var(--accent-primary)" />
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Latest Service Observation (Live Fraud AI)
                </span>
              </div>

              {latestTelemetry ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Decision Verdict</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: latestTelemetry.driftStatus === 'DRIFT_DETECTED' ? 'var(--warning-text)' : 'var(--success-text)', marginTop: '2px' }}>
                        {latestTelemetry.driftStatus === 'DRIFT_DETECTED' ? 'REVIEW / FLAG' : 'ALLOW (LOW RISK)'}
                      </div>
                    </div>

                    <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Avg Inference Latency</div>
                      <div className="tnum" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                        {latestTelemetry.performanceTelemetry?.avgLatencyMs || 18} ms
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <div><strong>Reference Dataset:</strong> {latestTelemetry.referenceDatasetVersion || 'baseline-v1.0'}</div>
                    <div style={{ marginTop: '4px' }}><strong>Batch ID:</strong> <span className="font-mono">{latestTelemetry.batchId}</span></div>
                    <div style={{ marginTop: '4px' }}><strong>Recorded:</strong> {new Date(latestTelemetry.recordedAt).toLocaleString()}</div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                  No live transactions observed yet.
                </div>
              )}
            </div>

            {/* Feature Statistical Tests from Evidently */}
            <div className="card" style={{ padding: '16px 20px', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Activity size={16} color="var(--accent-primary)" />
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Evidently Two-Sample Hypothesis Tests
                </span>
              </div>

              {latestTelemetry?.features && latestTelemetry.features.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {latestTelemetry.features.map((feat, fIdx) => (
                    <div 
                      key={feat.name || fIdx} 
                      style={{ 
                        padding: '8px 12px', 
                        background: 'var(--bg-subtle)', 
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {feat.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          p-value: <span className="tnum" style={{ color: feat.driftDetected ? 'var(--danger-text)' : 'var(--success-text)', fontWeight: 600 }}>
                            {typeof feat.pValue === 'number' && feat.pValue < 0.0001 ? feat.pValue.toExponential(3) : (feat.pValue ?? 'N/A')}
                          </span> (α = 0.05)
                        </div>
                      </div>

                      <StatusBadge 
                        status={feat.driftDetected ? 'danger' : 'success'}
                        label={feat.driftDetected ? 'DRIFT' : 'STABLE'}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                  No feature metrics available. Trigger an evaluation batch to test distributions.
                </div>
              )}
            </div>
          </div>

          {/* Incidents & Telemetry History */}
          <div className="card" id="telemetry-history-card">
            <div className="card-header">
              <div className="card-title">
                <Activity size={15} color="var(--accent-primary)" />
                <span>Persisted Telemetry Stream History ({telemetryHistory.length})</span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Authoritative Audit Trail • Tamper-Evident SHA-256 Ledger
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
            boxShadow: 'var(--shadow-lg)',
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
                      <strong>Workload:</strong> Fraud Detection AI • <strong>Model:</strong> {selectedReport.modelId?.name} ({selectedReport.versionId?.version})
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
                    Download Markdown
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
            boxShadow: 'var(--shadow-lg)',
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
                    Rollback activates a previously vetted and approved baseline version, creating an immutable SHA-256 audit ledger entry.
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
                        <label htmlFor="rollback-rationale-input" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                          Governance & Safety Rationale:
                        </label>
                        <textarea
                          id="rollback-rationale-input"
                          value={rollbackRationale}
                          onChange={(e) => setRollbackRationale(e.target.value)}
                          placeholder="Provide justification for production rollback (e.g., Mitigating statistical distribution shift observed on feature amount)..."
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
                          disabled={rollbackLoading || !isMlLead}
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
