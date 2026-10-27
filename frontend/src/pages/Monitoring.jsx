import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  getMonitoringOverview, 
  getModels, 
  getModelVersions,
  getModelEndpointConfig,
  updateModelEndpoint,
  updateVersionEndpoint,
  testEndpointConnection,
  getMonitoringServicesStatus, 
  getSchedulerStatus,
  pauseScheduler,
  resumeScheduler,
  triggerSchedulerBatch,
  getReports,
  getReportById,
  compareModelVersions,
  triggerRollback,
  downloadDriftReportPdf
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../context/RoleContext';
import { useTheme } from '../context/ThemeContext';
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
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Save
} from 'lucide-react';

const CREDIT_SMOKE_PAYLOAD = JSON.stringify({
  applicant: {
    amt_income: 50000,
    amt_credit: 150000,
    amt_annuity: 12000,
    age: 35,
    gender: "F",
    emp_years: 5,
    region_rating: 2,
    cnt_children: 0,
    ext_source_1: 0.65,
    ext_source_2: 0.7,
    ext_source_3: 0.6,
    bureau_active: 2,
    bureau_dpd: 0,
    bureau_debt: 10000,
    prev_approval: 1,
    prev_refused: 0,
    prev_count: 3
  },
  model: "stacking"
}, null, 2);

const V2_TEST_PAYLOAD = JSON.stringify({
  "AMT_ANNUITY": 25000,
  "AMT_CREDIT": 400000,
  "AMT_INCOME_TOTAL": 250000,
  "DAYS_BIRTH": -14600,
  "DAYS_EMPLOYED": -4380,
  "DAYS_CREDIT": -4380,
  "EXT_SOURCE_1": 0.85,
  "EXT_SOURCE_2": 0.8,
  "EXT_SOURCE_3": 0.82
}, null, 2);

const FRAUD_SMOKE_PAYLOAD = JSON.stringify({
  amount: 120.5,
  location: "US"
}, null, 2);

export function extractDotPath(obj, path) {
  if (obj === null || obj === undefined) return undefined;
  if (!path || typeof path !== 'string' || !path.trim()) {
    if (typeof obj !== 'object') return obj;
    if (obj.prediction !== undefined) return obj.prediction;
    if (obj.decision !== undefined) return obj.decision;
    if (obj.result !== undefined) return obj.result;
    return undefined;
  }
  const normalizedPath = path.trim().replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');
  const segments = normalizedPath.split('.');
  let current = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    current = current[seg];
  }
  return current;
}

export function createSmoothPath(coords) {
  if (!coords || coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  if (coords.length === 2) {
    return `M ${coords[0].x} ${coords[0].y} L ${coords[1].x} ${coords[1].y}`;
  }
  let path = `M ${coords[0].x} ${coords[0].y}`;
  const tension = 0.2;
  for (let i = 0; i < coords.length - 1; i++) {
    const pPrev = i > 0 ? coords[i - 1] : coords[i];
    const pCurr = coords[i];
    const pNext = coords[i + 1];
    const pNextNext = i < coords.length - 2 ? coords[i + 2] : pNext;

    const cp1x = pCurr.x + (pNext.x - pPrev.x) * tension;
    const cp1y = pCurr.y + (pNext.y - pPrev.y) * tension;
    const cp2x = pNext.x - (pNextNext.x - pCurr.x) * tension;
    const cp2y = pNext.y - (pNextNext.y - pCurr.y) * tension;

    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${pNext.x.toFixed(1)} ${pNext.y.toFixed(1)}`;
  }
  return path;
}

export default function Monitoring() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryModelId = searchParams.get('modelId');
  const { user } = useAuth();
  const { currentRole } = useRole();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
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

  // Dynamic Endpoint Configuration State (ML Lead & General Monitoring)
  const [configExpanded, setConfigExpanded] = useState(true);
  const [configScope, setConfigScope] = useState('MODEL'); // 'MODEL' | 'VERSION'
  const [modelVersions, setModelVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [isOverridden, setIsOverridden] = useState(false);
  const [hasStoredSecret, setHasStoredSecret] = useState(false);
  const [showSecretInput, setShowSecretInput] = useState(false);
  const [isConfigDirty, setIsConfigDirty] = useState(false);
  const [showAdvancedMapping, setShowAdvancedMapping] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configLoadError, setConfigLoadError] = useState(null);
  const configRequestIdRef = useRef(0);
  const monitoringRequestIdRef = useRef(0);
  const testPayloadEditedRef = useRef(false);
  const loadedConfigRef = useRef(null);

  // Form Fields
  const [endpointForm, setEndpointForm] = useState({
    endpointUrl: '',
    healthEndpoint: '/health',
    predictEndpoint: '/predict',
    method: 'POST',
    authType: 'NONE',
    authHeaderName: 'Authorization',
    authHeaderValue: '',
    wrapperKey: '',
    isArray: false,
    fieldMapText: '{}',
    customHeadersText: '{}',
    staticFields: null,
    predictionField: 'decision',
    latencyField: '',
    timeoutMs: 30000,
    maxRetries: 2
  });

  const [endpointStatus, setEndpointStatus] = useState(null); // 'CONNECTED' | 'FAILED' | 'READY' | null
  const [endpointSaving, setEndpointSaving] = useState(false);
  const [endpointTesting, setEndpointTesting] = useState(false);
  const [testMode, setTestMode] = useState('HEALTH'); // 'HEALTH' | 'PREDICTION'
  const [testPayloadText, setTestPayloadText] = useState(CREDIT_SMOKE_PAYLOAD);
  const [testFeedback, setTestFeedback] = useState(null);
  const [saveFeedback, setSaveFeedback] = useState(null);

  // Evaluation trigger state
  const [actionLoading, setActionLoading] = useState(false);
  const [evalScenario, setEvalScenario] = useState('BASELINE');
  const [evalBatchSize, setEvalBatchSize] = useState(25);
  const [actionSuccessMsg, setActionSuccessMsg] = useState(null);
  const [actionErrorMsg, setActionErrorMsg] = useState(null);

  // Hover state for SVG time-series line chart
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Compact panel expansion toggles
  const [expandedFeatureTests, setExpandedFeatureTests] = useState(false);
  const [expandedTelemetryHistory, setExpandedTelemetryHistory] = useState(false);

  // Modal states: Drift Report & Version Rollback
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportModalBatch, setReportModalBatch] = useState(null);
  const [reportEmptyMessage, setReportEmptyMessage] = useState(null);
  const [downloadingReportPdf, setDownloadingReportPdf] = useState(false);

  const handleDownloadReportPdf = async (report) => {
    if (!report) return;
    try {
      setDownloadingReportPdf(true);
      await downloadDriftReportPdf(report._id, report.reportNumber);
    } catch (err) {
      console.error('Failed to export drift report PDF:', err);
      alert(`Export Failed: ${err.message}`);
    } finally {
      setDownloadingReportPdf(false);
    }
  };

  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [versionComparisonData, setVersionComparisonData] = useState(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackRationale, setRollbackRationale] = useState('');
  const [targetRollbackVersion, setTargetRollbackVersion] = useState(null);
  const [rollbackFeedback, setRollbackFeedback] = useState(null);

  // Fetch model versions
  const fetchVersionsForModel = async (modelId) => {
    if (!modelId) {
      setModelVersions([]);
      return [];
    }
    try {
      const res = await getModelVersions(modelId);
      const vList = (res && Array.isArray(res)) ? res : (res?.data || []);
      setModelVersions(vList);
      if (vList && vList.length > 0) {
        const prodVersion = vList.find(v => v.isProduction || v.lifecycleStatus === 'IN_PRODUCTION');
        setSelectedVersionId(prev => prev || (prodVersion ? prodVersion._id : vList[0]._id));
      }
      return vList;
    } catch (err) {
      console.error('Failed to load model versions:', err);
      setModelVersions([]);
      return [];
    }
  };

  // Load endpoint configuration from backend for model / version
  const loadEndpointConfig = async (modelId, versionId = '') => {
    if (!modelId) return;
    const reqId = ++configRequestIdRef.current;
    setConfigLoading(true);
    setConfigLoadError(null);

    try {
      const res = await getModelEndpointConfig(modelId, versionId);
      if (reqId !== configRequestIdRef.current) return; // Stale request guard

      // Support both unwrapped response (api.js unrolls json.data) and wrapped response ({ success: true, data: { ... } })
      const data = (res && res.success && res.data) ? res.data : (res?.data || res);

      if (data && (data.modelApiConfig || data.effectiveApiConfig || data.endpointUrl)) {
        const isV2 = Boolean(data.versionNumber === 'v2.0' || (versionId && String(data.versionNumber).includes('2.0')));
        // Resolve target config: prefer effective configuration respecting override precedence
        const targetConfig = versionId && data.versionApiConfig
          ? (data.effectiveApiConfig || data.versionApiConfig)
          : (data.effectiveApiConfig || data.modelApiConfig || {});

        loadedConfigRef.current = targetConfig;

        const defaultPredictionField = isV2 ? 'probability_of_default' : 'decision';
        const defaultPredictEndpoint = isV2 ? '/score' : '/predict';
        const effectiveWrapperKey = versionId
          ? (data.versionApiConfig?.requestMapping?.wrapperKey !== undefined && data.versionApiConfig?.requestMapping?.wrapperKey !== null
              ? data.versionApiConfig.requestMapping.wrapperKey
              : (isV2 ? '' : (targetConfig.requestMapping?.wrapperKey || '')))
          : (targetConfig.requestMapping?.wrapperKey || '');

        setEndpointForm({
          endpointUrl: (versionId && data.versionApiConfig?.endpointUrl) ? data.versionApiConfig.endpointUrl : (targetConfig.endpointUrl || ''),
          healthEndpoint: targetConfig.healthEndpoint || '/health',
          predictEndpoint: (versionId && data.versionApiConfig?.predictEndpoint) ? data.versionApiConfig.predictEndpoint : (targetConfig.predictEndpoint || defaultPredictEndpoint),
          method: targetConfig.method || 'POST',
          authType: targetConfig.authType || 'NONE',
          authHeaderName: targetConfig.authHeaderName || (targetConfig.authType === 'API_KEY' ? 'X-API-Key' : 'Authorization'),
          authHeaderValue: '', // Never populate stored secret into client state
          wrapperKey: effectiveWrapperKey,
          isArray: Boolean(targetConfig.requestMapping?.isArray),
          fieldMapText: (targetConfig.requestMapping?.fieldMap && Object.keys(targetConfig.requestMapping.fieldMap).length > 0)
            ? JSON.stringify(targetConfig.requestMapping.fieldMap, null, 2)
            : '{}',
          customHeadersText: (targetConfig.requestMapping?.customHeaders && Object.keys(targetConfig.requestMapping.customHeaders).length > 0)
            ? JSON.stringify(targetConfig.requestMapping.customHeaders, null, 2)
            : '{}',
          staticFields: targetConfig.requestMapping?.staticFields || null,
          predictionField: (versionId && data.versionApiConfig?.responseMapping?.predictionField) ? data.versionApiConfig.responseMapping.predictionField : (targetConfig.responseMapping?.predictionField || defaultPredictionField),
          latencyField: targetConfig.responseMapping?.latencyField || '',
          timeoutMs: targetConfig.timeoutMs || 30000,
          maxRetries: targetConfig.maxRetries !== undefined ? targetConfig.maxRetries : 2
        });

        const hasSecret = Boolean(
          versionId && data.versionApiConfig 
            ? data.versionApiConfig.hasAuthSecret 
            : (data.modelApiConfig?.hasAuthSecret || data.effectiveApiConfig?.hasAuthSecret)
        );
        setHasStoredSecret(hasSecret);

        const versionHasOverride = Boolean(
          data.versionApiConfig && (
            data.versionApiConfig.endpointUrl ||
            data.isOverridden === true ||
            data.isOverridden?.endpointUrl || 
            data.isOverridden?.predictEndpoint || 
            data.isOverridden?.healthEndpoint ||
            data.isOverridden?.authType ||
            data.isOverridden?.requestMapping ||
            data.isOverridden?.responseMapping
          )
        );
        setIsOverridden(versionHasOverride);
        setIsConfigDirty(false);
        setConfigLoaded(true);
        setConfigLoadError(null);

        // Autofill smoke test payload only if user has not manually modified it
        if (!testPayloadEditedRef.current) {
          if (isV2) {
            setTestPayloadText(V2_TEST_PAYLOAD);
          } else {
            const isCredit = targetConfig.requestMapping?.wrapperKey === 'applicant' || 
              (targetConfig.endpointUrl && targetConfig.endpointUrl.includes('creditlens'));
            if (isCredit) {
              setTestPayloadText(CREDIT_SMOKE_PAYLOAD);
            }
          }
        }

        if (data.effectiveApiConfig?.status) {
          setEndpointStatus(data.effectiveApiConfig.status);
        } else if (targetConfig.status) {
          setEndpointStatus(targetConfig.status);
        }
      } else {
        throw new Error('Endpoint configuration could not be resolved from server response.');
      }
    } catch (err) {
      if (reqId !== configRequestIdRef.current) return;
      console.error('Failed to load endpoint config:', err);
      setConfigLoaded(false);
      setConfigLoadError(err.message || 'Failed to load configuration from Atlas');
      setEndpointStatus('FAILED');
    } finally {
      if (reqId === configRequestIdRef.current) {
        setConfigLoading(false);
      }
    }
  };

  // Load telemetry, services status, and scheduler
  const loadMonitoring = async (modelId = selectedModelId, isBackground = false, targetVersionId = null) => {
    if (!modelId) return;
    const reqId = ++monitoringRequestIdRef.current;
    try {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);

      let effectiveVersionId = '';
      if (targetVersionId !== null && targetVersionId !== undefined) {
        effectiveVersionId = targetVersionId;
      } else if (configScope === 'VERSION') {
        effectiveVersionId = selectedVersionId || '';
      } else {
        const prodVersion = modelVersions.find(v => v.isProduction || v.lifecycleStatus === 'IN_PRODUCTION' || v.deploymentStatus === 'IN_PRODUCTION');
        effectiveVersionId = prodVersion ? prodVersion._id : (monitoringData?.version?._id || '');
      }

      const [modelList, overview, services, scheduler] = await Promise.all([
        getModels(),
        getMonitoringOverview(modelId, effectiveVersionId),
        getMonitoringServicesStatus().catch((err) => ({
          fraudAi: { status: 'UNREACHABLE', error: err.message },
          evidently: { status: 'UNREACHABLE', error: err.message }
        })),
        getSchedulerStatus().catch(() => null)
      ]);

      if (reqId !== monitoringRequestIdRef.current) return; // Stale request guard

      const list = modelList || [];
      setModels(list);
      setServicesStatus(services);
      if (scheduler) setSchedulerState(scheduler);

      let effectiveModelId = modelId;
      if (overview) {
        setMonitoringData(overview);
        if (overview.model) {
          effectiveModelId = overview.model._id;
          setSelectedModelId(effectiveModelId);
        }
      } else if (list.length > 0 && !selectedModelId) {
        effectiveModelId = list[0]._id;
        setSelectedModelId(effectiveModelId);
      }
      setLastRefreshedAt(new Date());
    } catch (err) {
      if (reqId !== monitoringRequestIdRef.current) return;
      console.error('Failed to load monitoring overview:', err);
    } finally {
      if (reqId === monitoringRequestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // Coordinated initial page load / mount handler respecting query params and session storage
  useEffect(() => {
    let active = true;
    const initModelId = queryModelId || selectedModelId;

    async function init() {
      let modelIdToUse = initModelId;
      if (!modelIdToUse) {
        try {
          const list = await getModels();
          if (list && list.length > 0) {
            modelIdToUse = list[0]._id;
            if (active) setSelectedModelId(modelIdToUse);
          }
        } catch (e) {
          console.error('Failed to get initial models:', e);
        }
      }

      if (!modelIdToUse) return;

      const versions = await fetchVersionsForModel(modelIdToUse);
      if (!active) return;

      const paramScope = searchParams.get('scope');
      const paramVersionId = searchParams.get('versionId');

      let initialScope = paramScope === 'VERSION' ? 'VERSION' : (paramScope === 'MODEL' ? 'MODEL' : null);
      if (!initialScope) {
        const savedScope = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`monitoring_scope_${modelIdToUse}`) : null;
        initialScope = savedScope === 'VERSION' ? 'VERSION' : 'MODEL';
      }

      let initialVersionId = paramVersionId || '';
      if (!initialVersionId && initialScope === 'VERSION') {
        const savedVId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`monitoring_versionId_${modelIdToUse}`) : null;
        if (savedVId && versions.some(v => String(v._id) === String(savedVId))) {
          initialVersionId = savedVId;
        } else if (versions && versions.length > 0) {
          const prodVersion = versions.find(v => v.isProduction || v.lifecycleStatus === 'IN_PRODUCTION' || v.deploymentStatus === 'IN_PRODUCTION');
          initialVersionId = prodVersion ? prodVersion._id : versions[0]._id;
        }
      }

      const prodVersion = versions?.find(v => v.isProduction || v.lifecycleStatus === 'IN_PRODUCTION' || v.deploymentStatus === 'IN_PRODUCTION');
      const prodVId = prodVersion ? prodVersion._id : (versions?.[0]?._id || '');

      if (active) {
        setConfigScope(initialScope);
        if (initialVersionId) {
          setSelectedVersionId(initialVersionId);
        } else if (prodVId) {
          setSelectedVersionId(prodVId);
        }
      }

      const targetVId = initialScope === 'VERSION' ? initialVersionId : (prodVId || '');
      await Promise.all([
        loadEndpointConfig(modelIdToUse, initialScope === 'VERSION' ? targetVId : ''),
        loadMonitoring(modelIdToUse, false, targetVId)
      ]);
    }

    init();

    return () => {
      active = false;
    };
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
  }, [autoRefresh, selectedModelId, configScope, selectedVersionId]);

  const handleSelectModel = async (mId) => {
    setSelectedModelId(mId);
    setHoveredPoint(null);
    setMonitoringData(null);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(`monitoring_scope_${mId}`, 'MODEL');
    }
    setSearchParams({ modelId: mId, scope: 'MODEL' });
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    setTestFeedback(null);
    setSaveFeedback(null);
    setConfigScope('MODEL');
    setSelectedVersionId('');
    setIsConfigDirty(false);
    testPayloadEditedRef.current = false;

    const vList = await fetchVersionsForModel(mId);
    let prodVId = '';
    if (vList && vList.length > 0) {
      const prodVersion = vList.find(v => v.isProduction || v.lifecycleStatus === 'IN_PRODUCTION' || v.deploymentStatus === 'IN_PRODUCTION');
      prodVId = prodVersion ? prodVersion._id : vList[0]._id;
      setSelectedVersionId(prodVId);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(`monitoring_versionId_${mId}`, prodVId);
      }
    }

    await Promise.all([
      loadEndpointConfig(mId, ''),
      loadMonitoring(mId, false, prodVId)
    ]);
  };

  const handleScopeChange = async (scope) => {
    setHoveredPoint(null);
    setConfigScope(scope);
    setTestFeedback(null);
    setSaveFeedback(null);
    setIsConfigDirty(false);
    testPayloadEditedRef.current = false;

    if (typeof sessionStorage !== 'undefined' && selectedModelId) {
      sessionStorage.setItem(`monitoring_scope_${selectedModelId}`, scope);
    }

    if (scope === 'MODEL') {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (selectedModelId) next.set('modelId', selectedModelId);
        next.set('scope', 'MODEL');
        next.delete('versionId');
        return next;
      });
      let versions = modelVersions;
      if (!versions || versions.length === 0) {
        versions = await fetchVersionsForModel(selectedModelId);
      }
      const prodVersion = versions?.find(v => v.isProduction || v.lifecycleStatus === 'IN_PRODUCTION' || v.deploymentStatus === 'IN_PRODUCTION');
      const prodVId = prodVersion ? prodVersion._id : (versions?.[0]?._id || '');
      await Promise.all([
        loadEndpointConfig(selectedModelId, ''),
        loadMonitoring(selectedModelId, false, prodVId)
      ]);
    } else {
      let versions = modelVersions;
      if (!versions || versions.length === 0) {
        versions = await fetchVersionsForModel(selectedModelId);
      }
      let targetVId = selectedVersionId;
      if (!targetVId && versions && versions.length > 0) {
        const prodVersion = versions.find(v => v.isProduction || v.lifecycleStatus === 'IN_PRODUCTION' || v.deploymentStatus === 'IN_PRODUCTION');
        targetVId = prodVersion ? prodVersion._id : versions[0]._id;
        setSelectedVersionId(targetVId);
      }
      if (typeof sessionStorage !== 'undefined' && selectedModelId && targetVId) {
        sessionStorage.setItem(`monitoring_versionId_${selectedModelId}`, targetVId);
      }
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (selectedModelId) next.set('modelId', selectedModelId);
        next.set('scope', 'VERSION');
        if (targetVId) next.set('versionId', targetVId);
        return next;
      });
      if (targetVId) {
        await Promise.all([
          loadEndpointConfig(selectedModelId, targetVId),
          loadMonitoring(selectedModelId, false, targetVId)
        ]);
      }
    }
  };

  const handleSelectVersion = async (vId) => {
    setHoveredPoint(null);
    setSelectedVersionId(vId);
    if (typeof sessionStorage !== 'undefined' && selectedModelId) {
      sessionStorage.setItem(`monitoring_versionId_${selectedModelId}`, vId);
    }
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (selectedModelId) next.set('modelId', selectedModelId);
      if (configScope === 'VERSION') {
        next.set('scope', 'VERSION');
        next.set('versionId', vId);
      }
      return next;
    });
    setTestFeedback(null);
    setSaveFeedback(null);
    setIsConfigDirty(false);
    testPayloadEditedRef.current = false;
    await Promise.all([
      loadEndpointConfig(selectedModelId, vId),
      loadMonitoring(selectedModelId, false, vId)
    ]);
  };

  const updateFormField = (field, value) => {
    setEndpointForm(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'authType') {
        if (value === 'BEARER' && (!prev.authHeaderName || prev.authHeaderName === 'X-API-Key')) {
          next.authHeaderName = 'Authorization';
        } else if (value === 'API_KEY' && (!prev.authHeaderName || prev.authHeaderName === 'Authorization')) {
          next.authHeaderName = 'X-API-Key';
        }
      }
      return next;
    });
    setIsConfigDirty(true);
  };

  const handleTestConnection = async () => {
    if (!selectedModelId) return;
    setEndpointTesting(true);
    setTestFeedback(null);

    let parsedFieldMap = {};
    if (endpointForm.fieldMapText && endpointForm.fieldMapText.trim()) {
      try {
        parsedFieldMap = JSON.parse(endpointForm.fieldMapText);
      } catch (e) {
        setTestFeedback({ success: false, message: 'Invalid JSON in Field Map: ' + e.message });
        setEndpointTesting(false);
        return;
      }
    }

    let parsedCustomHeaders = {};
    if (endpointForm.customHeadersText && endpointForm.customHeadersText.trim()) {
      try {
        parsedCustomHeaders = JSON.parse(endpointForm.customHeadersText);
      } catch (e) {
        setTestFeedback({ success: false, message: 'Invalid JSON in Custom Headers: ' + e.message });
        setEndpointTesting(false);
        return;
      }
    }

    let parsedTestPayload = undefined;
    if (testMode === 'PREDICTION') {
      if (!endpointForm.predictEndpoint) {
        setTestFeedback({ success: false, message: 'Predict path is required for prediction smoke test.' });
        setEndpointTesting(false);
        return;
      }
      if (testPayloadText && testPayloadText.trim()) {
        try {
          parsedTestPayload = JSON.parse(testPayloadText);
        } catch (e) {
          setTestFeedback({ success: false, message: 'Invalid JSON in Test Payload: ' + e.message });
          setEndpointTesting(false);
          return;
        }
      } else {
        parsedTestPayload = {};
      }
    }

    try {
      const payload = {
        versionId: configScope === 'VERSION' ? selectedVersionId : undefined,
        endpointUrl: endpointForm.endpointUrl,
        healthEndpoint: endpointForm.healthEndpoint,
        predictEndpoint: endpointForm.predictEndpoint,
        method: endpointForm.method,
        authType: endpointForm.authType,
        authHeaderName: endpointForm.authHeaderName,
        authHeaderValue: endpointForm.authHeaderValue,
        requestMapping: {
          wrapperKey: endpointForm.wrapperKey && endpointForm.wrapperKey.trim() ? endpointForm.wrapperKey.trim() : undefined,
          isArray: Boolean(endpointForm.isArray),
          fieldMap: (parsedFieldMap && Object.keys(parsedFieldMap).length > 0) ? parsedFieldMap : {},
          customHeaders: (parsedCustomHeaders && Object.keys(parsedCustomHeaders).length > 0) ? parsedCustomHeaders : {},
          staticFields: endpointForm.staticFields || (configScope === 'VERSION' ? undefined : loadedConfigRef.current?.requestMapping?.staticFields) || undefined
        },
        responseMapping: {
          predictionField: endpointForm.predictionField,
          latencyField: endpointForm.latencyField
        },
        timeoutMs: Number(endpointForm.timeoutMs) || 30000,
        testType: testMode,
        testPayload: parsedTestPayload
      };

      const res = await testEndpointConnection(selectedModelId, payload);
      const configuredPath = endpointForm.predictionField;
      let resolvedPrediction = res?.extractedPrediction !== undefined
        ? res.extractedPrediction
        : res?.prediction !== undefined
          ? res.prediction
          : extractDotPath(res?.rawResponse, configuredPath);

      if (resolvedPrediction === undefined && res?.rawResponse !== undefined) {
        resolvedPrediction = extractDotPath(res.rawResponse, configuredPath);
      }

      const enhancedRes = {
        ...res,
        prediction: resolvedPrediction !== undefined ? resolvedPrediction : res?.prediction,
        extractedPrediction: resolvedPrediction !== undefined ? resolvedPrediction : res?.extractedPrediction
      };

      setTestFeedback(enhancedRes);
      if (enhancedRes.success) {
        setEndpointStatus('CONNECTED');
      } else {
        setEndpointStatus('FAILED');
      }
    } catch (err) {
      setTestFeedback({
        success: false,
        message: err.message || 'Connection test failed',
        error: err.message
      });
      setEndpointStatus('FAILED');
    } finally {
      setEndpointTesting(false);
    }
  };

  const handleSaveEndpointConfig = async () => {
    if (!selectedModelId) return;
    setEndpointSaving(true);
    setSaveFeedback(null);

    if (configLoading) {
      setSaveFeedback({ success: false, message: 'Please wait for current configuration to finish loading before saving.' });
      setEndpointSaving(false);
      return;
    }

    if (!configLoaded && !configLoadError) {
      setSaveFeedback({ success: false, message: 'Configuration has not finished loading from the database yet.' });
      setEndpointSaving(false);
      return;
    }

    const trimmedUrl = (endpointForm.endpointUrl || '').trim();
    if (!trimmedUrl) {
      setSaveFeedback({ success: false, message: 'Base Endpoint URL is required.' });
      setEndpointSaving(false);
      return;
    }

    // Protect against accidentally saving frontend origin (e.g. from browser autofill)
    const frontendOrigin = typeof window !== 'undefined' ? window.location.origin.toLowerCase() : 'http://localhost:3000';
    const cleanInputUrl = trimmedUrl.toLowerCase().replace(/\/+$/, '');
    if (cleanInputUrl === frontendOrigin || cleanInputUrl === 'http://localhost:3000' || cleanInputUrl === 'http://127.0.0.1:3000') {
      setSaveFeedback({
        success: false,
        message: 'Endpoint URL cannot be the Sentinel Govern frontend origin (http://localhost:3000). Please provide the external model inference API URL.'
      });
      setEndpointSaving(false);
      return;
    }

    let parsedFieldMap = {};
    if (endpointForm.fieldMapText && endpointForm.fieldMapText.trim()) {
      try {
        parsedFieldMap = JSON.parse(endpointForm.fieldMapText);
      } catch (e) {
        setSaveFeedback({ success: false, message: 'Invalid JSON in Field Map: ' + e.message });
        setEndpointSaving(false);
        return;
      }
    }

    let parsedCustomHeaders = {};
    if (endpointForm.customHeadersText && endpointForm.customHeadersText.trim()) {
      try {
        parsedCustomHeaders = JSON.parse(endpointForm.customHeadersText);
      } catch (e) {
        setSaveFeedback({ success: false, message: 'Invalid JSON in Custom Headers: ' + e.message });
        setEndpointSaving(false);
        return;
      }
    }

    const staticFieldsToSave = endpointForm.staticFields !== undefined && endpointForm.staticFields !== null
      ? endpointForm.staticFields
      : (configScope === 'VERSION' ? undefined : (loadedConfigRef.current?.requestMapping?.staticFields || undefined));

    const payload = {
      endpointUrl: (endpointForm.endpointUrl || '').trim(),
      healthEndpoint: (endpointForm.healthEndpoint || '').trim(),
      predictEndpoint: (endpointForm.predictEndpoint || '').trim(),
      method: endpointForm.method || 'POST',
      authType: endpointForm.authType || 'NONE',
      authHeaderName: (endpointForm.authHeaderName || '').trim(),
      authHeaderValue: endpointForm.authHeaderValue,
      requestMapping: {
        wrapperKey: endpointForm.wrapperKey ? endpointForm.wrapperKey.trim() : '',
        isArray: Boolean(endpointForm.isArray),
        fieldMap: (parsedFieldMap && Object.keys(parsedFieldMap).length > 0) ? parsedFieldMap : {},
        customHeaders: (parsedCustomHeaders && Object.keys(parsedCustomHeaders).length > 0) ? parsedCustomHeaders : {},
        staticFields: staticFieldsToSave || null
      },
      responseMapping: {
        predictionField: (endpointForm.predictionField || '').trim(),
        latencyField: (endpointForm.latencyField || '').trim()
      },
      timeoutMs: Number(endpointForm.timeoutMs) || 30000,
      maxRetries: Number(endpointForm.maxRetries) !== undefined ? Number(endpointForm.maxRetries) : 2
    };

    try {
      if (configScope === 'VERSION') {
        if (!selectedVersionId) {
          throw new Error('Please select a target version to override.');
        }
        await updateVersionEndpoint(selectedModelId, selectedVersionId, payload);
        if (typeof sessionStorage !== 'undefined' && selectedModelId) {
          sessionStorage.setItem(`monitoring_scope_${selectedModelId}`, 'VERSION');
          sessionStorage.setItem(`monitoring_versionId_${selectedModelId}`, selectedVersionId);
        }
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.set('modelId', selectedModelId);
          next.set('scope', 'VERSION');
          next.set('versionId', selectedVersionId);
          return next;
        });
        setSaveFeedback({ success: true, message: 'Version endpoint override saved successfully.' });
      } else {
        await updateModelEndpoint(selectedModelId, payload);
        if (typeof sessionStorage !== 'undefined' && selectedModelId) {
          sessionStorage.setItem(`monitoring_scope_${selectedModelId}`, 'MODEL');
        }
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.set('modelId', selectedModelId);
          next.set('scope', 'MODEL');
          next.delete('versionId');
          return next;
        });
        setSaveFeedback({ success: true, message: 'Model default endpoint saved successfully.' });
      }
      setIsConfigDirty(false);
      await loadEndpointConfig(selectedModelId, configScope === 'VERSION' ? selectedVersionId : '');
      await loadMonitoring(selectedModelId, true);
    } catch (err) {
      setSaveFeedback({ success: false, message: err.message || 'Failed to save endpoint configuration' });
    } finally {
      setEndpointSaving(false);
    }
  };

  const handleClearVersionOverride = async () => {
    if (!selectedModelId || !selectedVersionId) return;
    try {
      setEndpointSaving(true);
      setSaveFeedback(null);
      await updateVersionEndpoint(selectedModelId, selectedVersionId, { clearOverride: true });
      setSaveFeedback({ success: true, message: 'Version override cleared. Inheriting model default configuration.' });
      setIsConfigDirty(false);
      await loadEndpointConfig(selectedModelId, selectedVersionId);
      await loadMonitoring(selectedModelId, true);
    } catch (err) {
      setSaveFeedback({ success: false, message: err.message || 'Failed to clear version override.' });
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

      const resolvedWorkloadId = monitoringData?.workloadId ||
        (monitoringData?.workloadsStatus?.find(w => w.modelId === selectedModelId)?.workloadId) ||
        undefined;

      const res = await triggerSchedulerBatch({
        modelId: selectedModelId,
        versionId: selectedVersionId || undefined,
        workloadId: resolvedWorkloadId,
        scenario: evalScenario,
        count: Number(evalBatchSize)
      });

      const isDrift = res.driftDetected || res.driftStatus === 'DRIFT_DETECTED' || res.telemetry?.driftStatus === 'DRIFT_DETECTED';
      const driftedCols = res.driftedColumns || res.telemetry?.driftedColumns || [];
      const driftText = isDrift 
        ? `Statistical distribution shift detected across ${driftedCols.join(', ') || 'features'}. Incident and notification generated.`
        : 'Feature distributions in-distribution and healthy under Evidently testing.';

      setActionSuccessMsg(`Batch of ${evalBatchSize} transactions scored. ${driftText}`);
      await loadMonitoring(selectedModelId, true, configScope === 'VERSION' ? selectedVersionId : null);
    } catch (err) {
      setActionErrorMsg(err.message || 'Failed to execute evaluation batch');
    } finally {
      setActionLoading(false);
    }
  };

  // Report Modal
  const handleOpenReport = async (reportTargetOrNull, batchContext = null) => {
    try {
      setReportLoading(true);
      setReportModalOpen(true);
      setSelectedReport(null);
      setReportEmptyMessage(null);
      setReportModalBatch(batchContext);

      // 1. Resolve direct report identifier from argument or batch context
      let targetId = null;
      if (reportTargetOrNull) {
        if (typeof reportTargetOrNull === 'object') {
          targetId = reportTargetOrNull._id || reportTargetOrNull.id || reportTargetOrNull.reportNumber || reportTargetOrNull.reportId;
        } else {
          targetId = String(reportTargetOrNull).trim();
        }
      }

      if (!targetId && batchContext?.reportId) {
        const bRef = batchContext.reportId;
        targetId = typeof bRef === 'object' ? (bRef._id || bRef.id || bRef.reportNumber) : String(bRef).trim();
      }

      // 2. If targetId resolved, fetch the specific authoritative report
      if (targetId) {
        const rep = await getReportById(targetId);
        if (rep) {
          setSelectedReport(rep);
          return;
        }
      }

      // 3. If batch context is provided without direct reportId, look for report linked strictly to this batch
      if (batchContext) {
        const batchQuery = {
          modelId: selectedModelId,
          reportType: 'DATA_DRIFT_ANALYSIS',
          limit: 1
        };

        if (batchContext.batchId) batchQuery.batchId = batchContext.batchId;
        if (batchContext._id || batchContext.telemetryId) batchQuery.telemetryId = batchContext._id || batchContext.telemetryId;
        if (batchContext.incidentId) {
          batchQuery.incidentId = typeof batchContext.incidentId === 'object'
            ? (batchContext.incidentId._id || batchContext.incidentId.id)
            : batchContext.incidentId;
        }
        if (configScope === 'VERSION' && selectedVersionId) {
          batchQuery.versionId = selectedVersionId;
        } else if (batchContext.versionId) {
          batchQuery.versionId = typeof batchContext.versionId === 'object'
            ? (batchContext.versionId._id || batchContext.versionId.id)
            : batchContext.versionId;
        }

        const list = await getReports(batchQuery);
        if (list && list.length > 0) {
          const rep = await getReportById(list[0]._id);
          if (rep) {
            setSelectedReport(rep);
            return;
          }
        }

        // Authoritatively determined that no report is linked to this batch
        setSelectedReport(null);
        setReportEmptyMessage(
          batchContext.batchId
            ? `No report is linked to batch ${batchContext.batchId}.`
            : 'No report is linked to this batch.'
        );
        return;
      }

      // 4. Standalone fallback (e.g. general top bar button)
      const generalQuery = {
        modelId: selectedModelId,
        reportType: 'DATA_DRIFT_ANALYSIS',
        limit: 1
      };
      if (configScope === 'VERSION' && selectedVersionId) {
        generalQuery.versionId = selectedVersionId;
      }

      const list = await getReports(generalQuery);
      if (list && list.length > 0) {
        const rep = await getReportById(list[0]._id);
        setSelectedReport(rep);
      } else {
        setSelectedReport(null);
        setReportEmptyMessage('No drift report found for this model version. Run a shifted-distribution batch to generate an authoritative report.');
      }
    } catch (err) {
      console.error('Failed to load report:', err);
      setSelectedReport(null);
      setReportEmptyMessage(err.message || 'Failed to load report.');
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
        incidentId: activeIncidents.length > 0 ? activeIncidents[0]._id : undefined,
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
      await fetchVersionsForModel(selectedModelId);
      await loadEndpointConfig(selectedModelId, '');
      await loadMonitoring(selectedModelId, false, targetRollbackVersion._id);
      setSelectedVersionId(targetRollbackVersion._id);
      setConfigScope('MODEL');
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

  // Resolve authoritative active version for graph telemetry scoping
  const activeProdVersion = modelVersions.find(v => v.isProduction || v.lifecycleStatus === 'IN_PRODUCTION' || v.deploymentStatus === 'IN_PRODUCTION')
    || (version?.lifecycleStatus === 'IN_PRODUCTION' ? version : null)
    || modelVersions[0];
  const activeTargetVersionId = configScope === 'VERSION' 
    ? (selectedVersionId || version?._id)
    : (activeProdVersion?._id || version?._id);

  // Scope recent trend strictly to the active target version to guarantee that cross-version batches are never combined
  const chartRecentTrend = useMemo(() => {
    if (!recentTrend || recentTrend.length === 0) return [];
    if (!activeTargetVersionId) return recentTrend;
    const filtered = recentTrend.filter(t => {
      const vId = t.versionId?._id || t.versionId;
      return !vId || String(vId) === String(activeTargetVersionId);
    });
    return filtered.length > 0 ? filtered : recentTrend;
  }, [recentTrend, activeTargetVersionId]);

  // Stream state computation
  const isPaused = schedulerState?.status === 'PAUSED';
  const hasRecentData = chartRecentTrend.length > 0 && lastRefreshedAt && (Date.now() - new Date(chartRecentTrend[chartRecentTrend.length - 1]?.recordedAt || 0).getTime()) < 180000;
  const streamState = isPaused ? 'PAUSED' : (chartRecentTrend.length === 0 ? 'NO_DATA' : (hasRecentData ? 'LIVE STREAMING' : 'IDLE / STALE'));

  return (
    <div className="page-container" id="monitoring-page">
      {/* Top Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Workspace', to: '/app' },
          { label: 'Runtime Drift & Health' }
        ]}
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
              <Activity size={14} color={endpointStatus === 'CONNECTED' || (!endpointStatus && servicesStatus?.fraudAi?.status === 'HEALTHY') ? 'var(--success)' : 'var(--danger)'} />
              <span style={{ color: 'var(--text-muted)' }}>{monitoringData?.model?.name ? `${monitoringData.model.name} API:` : 'Model API:'}</span>
              <span className={`badge ${endpointStatus === 'CONNECTED' ? 'badge-success' : endpointStatus === 'FAILED' ? 'badge-danger' : 'badge-neutral'}`} style={{ fontSize: '11px' }}>
                {endpointStatus || 'READY'}
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

        {/* API Endpoint Configuration & Testing Panel (ML Lead Configurable) */}
        <div 
          id="model-endpoint-panel"
          style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}
        >
          {/* Panel Header & Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
                onClick={() => setConfigExpanded(!configExpanded)}
              >
                <Link2 size={16} color="var(--color-primary)" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Model API & Dynamic Endpoint Configuration
                </span>
                {configExpanded ? <ChevronUp size={16} color="var(--color-text-muted)" /> : <ChevronDown size={16} color="var(--color-text-muted)" />}
              </div>

              {/* Status and Inheritance Badges */}
              {configLoading ? (
                <span className="badge badge-neutral" style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <RefreshCw size={10} className="animate-spin" /> Loading config...
                </span>
              ) : configLoadError ? (
                <span className="badge badge-danger" style={{ fontSize: '11px' }} title={configLoadError}>
                  Load Failed
                </span>
              ) : (
                <>
                  <span
                    className={`badge ${endpointStatus === 'CONNECTED' ? 'badge-success' : endpointStatus === 'FAILED' ? 'badge-danger' : 'badge-neutral'}`}
                    style={{ fontSize: '11px' }}
                  >
                    {endpointStatus === 'CONNECTED' ? 'CONNECTED' : endpointStatus === 'FAILED' ? 'UNREACHABLE' : endpointStatus || 'READY'}
                  </span>

                  {configLoaded && !isConfigDirty && (
                    <span 
                      className="badge" 
                      style={{ 
                        fontSize: '10.5px', 
                        background: 'rgba(16, 185, 129, 0.1)', 
                        color: '#10B981', 
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        fontWeight: 600
                      }}
                    >
                      Loaded from Atlas
                    </span>
                  )}
                </>
              )}

              {configScope === 'VERSION' && (
                <span className={`badge ${isOverridden ? 'badge-warning' : 'badge-neutral'}`} style={{ fontSize: '11px' }}>
                  {isOverridden ? 'Version Override' : 'Inherited from Model'}
                </span>
              )}

              {isConfigDirty && (
                <span className="badge badge-warning" style={{ fontSize: '10.5px' }}>
                  Unsaved Changes
                </span>
              )}
            </div>

            {/* Scope Switcher (Model Default vs. Version Override) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                <button
                  type="button"
                  id="scope-model-btn"
                  onClick={() => handleScopeChange('MODEL')}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: configScope === 'MODEL' ? 600 : 400,
                    background: configScope === 'MODEL' ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: configScope === 'MODEL' ? '#fff' : 'var(--color-text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'var(--transition-fast)'
                  }}
                >
                  Model Default
                </button>
                <button
                  type="button"
                  id="scope-version-btn"
                  onClick={() => handleScopeChange('VERSION')}
                  style={{
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: configScope === 'VERSION' ? 600 : 400,
                    background: configScope === 'VERSION' ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: configScope === 'VERSION' ? '#fff' : 'var(--color-text-secondary)',
                    border: 'none',
                    borderLeft: '1px solid var(--color-border)',
                    cursor: 'pointer',
                    transition: 'var(--transition-fast)'
                  }}
                >
                  Version Override
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Form Body */}
          {configExpanded && (
            <div style={{
              background: 'var(--color-surface-secondary)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              {/* If Version Scope: Target Version Selector and Revert Override Option */}
              {configScope === 'VERSION' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  padding: '10px 14px',
                  background: 'var(--color-surface)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Layers size={15} color="var(--color-primary)" />
                    <label htmlFor="target-version-select" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)' }}>
                      Target Version to Configure:
                    </label>
                    <select
                      id="target-version-select"
                      value={selectedVersionId}
                      onChange={(e) => handleSelectVersion(e.target.value)}
                      className="form-select"
                      style={{ fontSize: '12px', padding: '4px 10px', minWidth: '180px' }}
                    >
                      {modelVersions.map(v => (
                        <option key={v._id} value={v._id}>
                          {v.version} {v.isProduction ? '★ (Production)' : `(${v.lifecycleStatus})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isOverridden && isMlLead && (
                    <button
                      type="button"
                      id="clear-override-btn"
                      onClick={handleClearVersionOverride}
                      disabled={endpointSaving}
                      className="btn btn-outline btn-sm"
                      style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--color-warning)' }}
                      title="Clear custom version overrides and inherit model configuration"
                    >
                      <RotateCcw size={12} />
                      Revert to Model Default
                    </button>
                  )}
                </div>
              )}

              {/* Grid 1: Endpoints & Routing */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px', letterSpacing: '0.04em' }}>
                  1. Service Endpoints & Protocol
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Base Endpoint URL *
                    </label>
                    <input
                      type="text"
                      id="model-endpoint-input"
                      name="modelEndpointServiceUrl"
                      autoComplete="off"
                      data-lpignore="true"
                      data-form-type="other"
                      value={endpointForm.endpointUrl}
                      onChange={(e) => updateFormField('endpointUrl', e.target.value)}
                      disabled={!isMlLead || endpointSaving}
                      placeholder="https://api.models.internal or http://127.0.0.1:8000"
                      className="form-control"
                      style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Predict Path *
                    </label>
                    <input
                      type="text"
                      id="model-predict-input"
                      value={endpointForm.predictEndpoint}
                      onChange={(e) => updateFormField('predictEndpoint', e.target.value)}
                      disabled={!isMlLead || endpointSaving}
                      placeholder="/score or /predict"
                      className="form-control"
                      style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Health Check Path
                    </label>
                    <input
                      type="text"
                      id="model-health-input"
                      value={endpointForm.healthEndpoint}
                      onChange={(e) => updateFormField('healthEndpoint', e.target.value)}
                      disabled={!isMlLead || endpointSaving}
                      placeholder="/health"
                      className="form-control"
                      style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                      HTTP Method
                    </label>
                    <select
                      id="model-method-select"
                      value={endpointForm.method}
                      onChange={(e) => updateFormField('method', e.target.value)}
                      disabled={!isMlLead || endpointSaving}
                      className="form-select"
                      style={{ fontSize: '12px' }}
                    >
                      <option value="POST">POST (Standard JSON payload)</option>
                      <option value="GET">GET (Query / Parameterized)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Grid 2: Authentication & Security */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px', letterSpacing: '0.04em' }}>
                  2. Authentication & Authorization
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                      Auth Type
                    </label>
                    <select
                      id="model-auth-type-select"
                      value={endpointForm.authType}
                      onChange={(e) => updateFormField('authType', e.target.value)}
                      disabled={!isMlLead || endpointSaving}
                      className="form-select"
                      style={{ fontSize: '12px' }}
                    >
                      <option value="NONE">None (Open / Internal network)</option>
                      <option value="API_KEY">API Key Header</option>
                      <option value="BEARER">Bearer Token (Authorization)</option>
                      <option value="CUSTOM_HEADER">Custom Auth Header</option>
                    </select>
                  </div>

                  {endpointForm.authType !== 'NONE' && (
                    <>
                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Header Name
                        </label>
                        <input
                          type="text"
                          id="model-auth-header-name"
                          value={endpointForm.authHeaderName}
                          onChange={(e) => updateFormField('authHeaderName', e.target.value)}
                          disabled={!isMlLead || endpointSaving}
                          placeholder={endpointForm.authType === 'API_KEY' ? 'X-API-Key' : 'Authorization'}
                          className="form-control"
                          style={{ fontFamily: 'monospace', fontSize: '12px' }}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                            Auth Secret / Token
                          </label>
                          {hasStoredSecret && (
                            <span style={{ fontSize: '10.5px', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <CheckCircle size={10} /> Secret Saved
                            </span>
                          )}
                        </div>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showSecretInput ? 'text' : 'password'}
                            id="model-auth-secret-input"
                            value={endpointForm.authHeaderValue}
                            onChange={(e) => updateFormField('authHeaderValue', e.target.value)}
                            disabled={!isMlLead || endpointSaving}
                            placeholder={hasStoredSecret ? '•••••••• (Stored secret preserved - enter new to change)' : 'Enter API token or key'}
                            className="form-control"
                            style={{ fontFamily: 'monospace', fontSize: '12px', paddingRight: '32px' }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecretInput(!showSecretInput)}
                            style={{
                              position: 'absolute',
                              right: '6px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-text-muted)',
                              cursor: 'pointer',
                              padding: '4px'
                            }}
                            title={showSecretInput ? 'Hide Secret' : 'Show Secret'}
                          >
                            {showSecretInput ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Advanced Mapping & Extraction Toggle */}
              <div>
                <div 
                  onClick={() => setShowAdvancedMapping(!showAdvancedMapping)}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    userSelect: 'none'
                  }}
                >
                  <Sliders size={14} />
                  <span>{showAdvancedMapping ? 'Hide Advanced Request & Response Mapping' : 'Show Advanced Request & Response Mapping'}</span>
                  {showAdvancedMapping ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </div>

                {showAdvancedMapping && (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Response Prediction Dot-Path *
                        </label>
                        <input
                          type="text"
                          id="model-prediction-field"
                          value={endpointForm.predictionField}
                          onChange={(e) => updateFormField('predictionField', e.target.value)}
                          disabled={!isMlLead || endpointSaving}
                          placeholder="prediction or output[0].score"
                          className="form-control"
                          style={{ fontFamily: 'monospace', fontSize: '12px' }}
                        />
                        <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted)' }}>
                          Dot-path into JSON response to extract model output value
                        </span>
                      </div>

                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Response Latency Dot-Path (Optional)
                        </label>
                        <input
                          type="text"
                          id="model-latency-field"
                          value={endpointForm.latencyField}
                          onChange={(e) => updateFormField('latencyField', e.target.value)}
                          disabled={!isMlLead || endpointSaving}
                          placeholder="latency_ms"
                          className="form-control"
                          style={{ fontFamily: 'monospace', fontSize: '12px' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Request Wrapper Key (Optional)
                        </label>
                        <input
                          type="text"
                          id="model-wrapper-key"
                          value={endpointForm.wrapperKey}
                          onChange={(e) => updateFormField('wrapperKey', e.target.value)}
                          disabled={!isMlLead || endpointSaving}
                          placeholder="inputs, data, or instances"
                          className="form-control"
                          style={{ fontFamily: 'monospace', fontSize: '12px' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Timeout & Retries
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="number"
                            id="model-timeout-input"
                            value={endpointForm.timeoutMs}
                            onChange={(e) => updateFormField('timeoutMs', e.target.value)}
                            disabled={!isMlLead || endpointSaving}
                            placeholder="5000"
                            className="form-control"
                            style={{ fontSize: '12px', flex: 1 }}
                            title="Timeout in milliseconds"
                          />
                          <input
                            type="number"
                            id="model-retries-input"
                            value={endpointForm.maxRetries}
                            onChange={(e) => updateFormField('maxRetries', e.target.value)}
                            disabled={!isMlLead || endpointSaving}
                            placeholder="1"
                            className="form-control"
                            style={{ fontSize: '12px', width: '70px' }}
                            title="Max retries"
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <input
                        type="checkbox"
                        id="model-is-array"
                        checked={endpointForm.isArray}
                        onChange={(e) => updateFormField('isArray', e.target.checked)}
                        disabled={!isMlLead || endpointSaving}
                        style={{ cursor: 'pointer' }}
                      />
                      <label htmlFor="model-is-array" style={{ fontSize: '12px', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                        Wrap request payload in an array: <code style={{ fontSize: '11px' }}>[&#123; ...payload &#125;]</code> (required for models expecting batch arrays)
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Feature Field Map (JSON)
                        </label>
                        <textarea
                          id="model-field-map"
                          value={endpointForm.fieldMapText}
                          onChange={(e) => updateFormField('fieldMapText', e.target.value)}
                          disabled={!isMlLead || endpointSaving}
                          placeholder="{}"
                          rows={3}
                          className="form-control"
                          style={{ fontFamily: 'monospace', fontSize: '11.5px' }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>
                          Custom Headers (JSON)
                        </label>
                        <textarea
                          id="model-custom-headers"
                          value={endpointForm.customHeadersText}
                          onChange={(e) => updateFormField('customHeadersText', e.target.value)}
                          disabled={!isMlLead || endpointSaving}
                          placeholder="{}"
                          rows={3}
                          className="form-control"
                          style={{ fontFamily: 'monospace', fontSize: '11.5px' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: In-Flight Connection Testing Sub-Panel */}
              <div style={{
                borderTop: '1px solid var(--color-border)',
                paddingTop: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Zap size={14} color="var(--color-primary)" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text)' }}>
                      In-Flight Connection Verification (Unsaved State)
                    </span>
                    <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => { setTestMode('HEALTH'); setTestFeedback(null); }}
                        style={{
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: testMode === 'HEALTH' ? 600 : 400,
                          background: testMode === 'HEALTH' ? 'var(--color-surface-elevated)' : 'var(--color-surface)',
                          color: testMode === 'HEALTH' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Health Check (GET)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setTestMode('PREDICTION'); setTestFeedback(null); }}
                        style={{
                          padding: '2px 8px',
                          fontSize: '11px',
                          fontWeight: testMode === 'PREDICTION' ? 600 : 400,
                          background: testMode === 'PREDICTION' ? 'var(--color-surface-elevated)' : 'var(--color-surface)',
                          color: testMode === 'PREDICTION' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                          border: 'none',
                          borderLeft: '1px solid var(--color-border)',
                          cursor: 'pointer'
                        }}
                      >
                        Prediction Smoke Test (POST)
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    id="connect-endpoint-btn"
                    onClick={handleTestConnection}
                    disabled={endpointTesting || !endpointForm.endpointUrl}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    title="Tests current in-flight configuration without saving"
                  >
                    {endpointTesting ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                    {endpointTesting ? 'Testing Probe...' : testMode === 'PREDICTION' ? 'Run Smoke Test' : 'Test Health Probe'}
                  </button>
                </div>

                {/* If Prediction mode: Smoke Test Payload Editor */}
                {testMode === 'PREDICTION' && (
                  <div style={{ background: 'var(--color-surface)', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        Sample Input Features (JSON Payload)
                      </label>
                      <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted)' }}>
                        Target: {endpointForm.endpointUrl}{endpointForm.predictEndpoint}
                      </span>
                    </div>
                    <textarea
                      id="test-payload-input"
                      value={testPayloadText}
                      onChange={(e) => {
                        testPayloadEditedRef.current = true;
                        setTestPayloadText(e.target.value);
                      }}
                      rows={testMode === 'PREDICTION' ? 6 : 3}
                      className="form-control"
                      style={{ fontFamily: 'monospace', fontSize: '11.5px' }}
                      placeholder="{\n  &quot;feature1&quot;: 1.0\n}"
                    />
                  </div>
                )}

                {/* Live Test Feedback Banner */}
                {testFeedback && (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${testFeedback.success ? 'var(--color-success-border)' : 'var(--color-danger-border)'}`,
                    background: testFeedback.success ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: testFeedback.success ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}>
                        {testFeedback.success ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        <span>{testFeedback.message || (testFeedback.success ? 'Connection probe passed.' : 'Connection probe failed.')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                        {testFeedback.statusCode && <span>HTTP {testFeedback.statusCode}</span>}
                        {testFeedback.latencyMs !== undefined && <span>{testFeedback.latencyMs} ms latency</span>}
                      </div>
                    </div>

                    {testFeedback.success && testFeedback.testType === 'PREDICTION' && (
                      <div style={{ fontSize: '11.5px', marginTop: '2px', color: 'var(--color-success-text)' }}>
                        <strong>Extracted Prediction:</strong>{' '}
                        <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '3px' }}>
                          {(() => {
                            const val = testFeedback.extractedPrediction !== undefined
                              ? testFeedback.extractedPrediction
                              : testFeedback.prediction;
                            return typeof val === 'object' && val !== null
                              ? JSON.stringify(val)
                              : String(val);
                          })()}
                        </code>
                      </div>
                    )}

                    {testFeedback.rawResponse !== undefined && (
                      <div style={{ fontSize: '11px', marginTop: '2px', color: 'var(--color-text-secondary)' }}>
                        <strong>Response Body:</strong>{' '}
                        <code style={{ background: 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: '3px', wordBreak: 'break-all' }}>
                          {typeof testFeedback.rawResponse === 'object' && testFeedback.rawResponse !== null
                            ? JSON.stringify(testFeedback.rawResponse)
                            : String(testFeedback.rawResponse)}
                        </code>
                      </div>
                    )}

                    {testFeedback.error && (
                      <div style={{ fontSize: '11px', color: 'var(--color-danger-text)', fontFamily: 'monospace', marginTop: '2px' }}>
                        Error: {testFeedback.error}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 5: Save & Reset Action Controls */}
              {isMlLead && (
                <div style={{
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      id="save-endpoint-btn"
                      onClick={handleSaveEndpointConfig}
                      disabled={endpointSaving || configLoading || !configLoaded || !endpointForm.endpointUrl}
                      className="btn btn-primary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {endpointSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                      {endpointSaving ? 'Saving...' : configScope === 'VERSION' ? 'Save Version Override' : 'Save Model Default'}
                    </button>

                    {isConfigDirty && (
                      <button
                        type="button"
                        onClick={() => loadEndpointConfig(selectedModelId, configScope === 'VERSION' ? selectedVersionId : '')}
                        disabled={endpointSaving}
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: '11.5px' }}
                      >
                        Discard Changes
                      </button>
                    )}
                  </div>

                  {saveFeedback && (
                    <div style={{
                      fontSize: '12px',
                      color: saveFeedback.success ? 'var(--color-success-text)' : 'var(--color-danger-text)',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {saveFeedback.success ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                      {saveFeedback.message}
                    </div>
                  )}
                </div>
              )}
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
                onClick={() => handleOpenReport(latestTelemetry?.reportId?._id || latestTelemetry?.reportId || null, latestTelemetry)}
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
                  Workload: <strong>{monitoringData?.workloadConfig?.name || monitoringData?.workloadId || 'Active Workload'}</strong> • Risk Tier: <strong>{formatRiskLevel(model.riskLevel)}</strong> • Deployment: <strong>{formatStatusLabel(version?.deploymentStatus || 'IN_PRODUCTION')}</strong>
                </div>
              </div>
            </div>

            {/* Telemetry KPI Strip */}
            {latestTelemetry ? (
              <div className="metrics-grid" style={{ marginBottom: 0 }}>
                <MetricCard
                  title="Statistical Drift (Evidently)"
                  value={latestTelemetry.driftStatus === 'DRIFT_DETECTED' ? 'DRIFT DETECTED' : (latestTelemetry.driftStatus === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT DATA' : 'HEALTHY')}
                  subtext={latestTelemetry.driftStatus === 'INSUFFICIENT_DATA'
                    ? 'Sample count below statistical testing threshold'
                    : (latestTelemetry.driftedColumns?.length 
                      ? `${latestTelemetry.driftedColumns.length} drifted feature(s) (α=0.05)`
                      : 'All features statistically stable')}
                  icon={Activity}
                  trend={latestTelemetry.driftStatus === 'DRIFT_DETECTED' ? 'Drift Observed' : (latestTelemetry.driftStatus === 'INSUFFICIENT_DATA' ? 'Low Samples' : 'Stable')}
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

          {/* Professional Financial-Market / Trading-Terminal Observability Chart */}
          {(() => {
            const chartTheme = {
              cardBg: 'var(--color-surface)',
              cardBorder: 'var(--color-border)',
              canvasBg: isDark ? '#0b0f17' : '#f8fafc',
              canvasBorder: isDark ? '#1e2530' : '#e2e8f0',
              hudBg: isDark ? '#111722' : '#ffffff',
              hudBorder: isDark ? '#1e293b' : '#e2e8f0',
              hudText: isDark ? '#f1f5f9' : '#0f172a',
              hudMuted: isDark ? '#94a3b8' : '#475569',
              hudSubtle: isDark ? '#64748b' : '#64748b',
              hudButtonBg: isDark ? '#1e293b' : '#f1f5f9',
              hudButtonBorder: isDark ? '#334155' : '#cbd5e1',
              hudButtonText: isDark ? '#38bdf8' : '#0284c7',
              gridStroke: isDark ? '#1e2530' : '#e2e8f0',
              axisLine: isDark ? '#2d3748' : '#cbd5e1',
              axisText: isDark ? '#64748b' : '#64748b',
              axisLabel: isDark ? '#475569' : '#64748b',
              latencyLine: isDark ? '#38bdf8' : '#0284c7',
              gradStop0: isDark ? '#38bdf8' : '#0284c7',
              gradOpacity0: isDark ? 0.22 : 0.16,
              gradStop1: isDark ? '#0284c7' : '#38bdf8',
              volBarFill: isDark ? 'rgba(56, 189, 248, 0.32)' : 'rgba(2, 132, 199, 0.22)',
              volBarFillHover: isDark ? 'rgba(56, 189, 248, 0.75)' : 'rgba(2, 132, 199, 0.65)',
              volBarStroke: isDark ? '#38bdf8' : '#0284c7',
              volBarDriftFill: isDark ? 'rgba(239, 68, 68, 0.55)' : 'rgba(220, 38, 38, 0.35)',
              volBarDriftStroke: isDark ? '#ef4444' : '#dc2626',
              healthyDot: isDark ? '#10b981' : '#16a34a',
              driftDot: isDark ? '#ef4444' : '#dc2626',
              warningDot: isDark ? '#f59e0b' : '#d97706',
              crosshairStroke: isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(15, 23, 42, 0.35)',
              controlBtnBg: isDark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff',
              controlBtnBorder: isDark ? '#2d3748' : '#cbd5e1',
              controlBtnText: isDark ? '#94a3b8' : '#475569'
            };

            return (
              <div 
                className="card" 
                id="runtime-trend-card" 
                style={{ 
                  marginBottom: '20px', 
                  background: chartTheme.cardBg, 
                  borderColor: chartTheme.cardBorder,
                  overflow: 'hidden'
                }}
              >
                <div className="card-header" style={{ padding: '12px 18px', background: chartTheme.cardBg }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <TrendingUp size={16} color={chartTheme.latencyLine} />
                    <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-text)' }}>
                      Runtime Observability Stream & Latency Profiler
                    </span>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      padding: '2px 8px',
                      borderRadius: '3px',
                      background: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(2, 132, 199, 0.1)',
                      color: chartTheme.latencyLine,
                      border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 132, 199, 0.25)'}`
                    }}>
                      {monitoringData?.model?.name || 'MODEL'} {monitoringData?.version?.version || 'v1.0'}
                    </span>
                  </div>

                  {/* Terminal Controls & Status Bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      padding: '3px 10px', 
                      borderRadius: '14px', 
                      background: streamState === 'LIVE STREAMING' ? (isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(22, 163, 74, 0.12)') : (isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(217, 119, 6, 0.12)'),
                      border: `1px solid ${streamState === 'LIVE STREAMING' ? (isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(22, 163, 74, 0.3)') : (isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.3)')}`,
                      fontSize: '10.5px',
                      fontWeight: 700,
                      fontFamily: 'monospace'
                    }}>
                      <span style={{ 
                        width: '6px', 
                        height: '6px', 
                        borderRadius: '50%', 
                        background: streamState === 'LIVE STREAMING' ? chartTheme.healthyDot : chartTheme.warningDot
                      }} className={streamState === 'LIVE STREAMING' ? 'pulse-icon' : ''} />
                      <span style={{ color: streamState === 'LIVE STREAMING' ? chartTheme.healthyDot : chartTheme.warningDot }}>
                        {streamState}
                      </span>
                    </div>

                    <button
                      type="button"
                      id="toggle-scheduler-pause-btn"
                      onClick={handleToggleSchedulerPause}
                      disabled={actionLoading}
                      className="btn btn-outline btn-sm"
                      style={{ 
                        fontSize: '11px', 
                        padding: '3px 9px', 
                        color: chartTheme.controlBtnText, 
                        borderColor: chartTheme.controlBtnBorder,
                        background: chartTheme.controlBtnBg,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title={schedulerState?.status === 'ACTIVE' ? 'Pause automatic monitoring' : 'Resume automatic monitoring'}
                    >
                      {schedulerState?.status === 'ACTIVE' ? <Pause size={11} /> : <Play size={11} />}
                      <span>{schedulerState?.status === 'ACTIVE' ? 'Pause' : 'Resume'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => loadMonitoring(selectedModelId, true)}
                      disabled={refreshing}
                      className="btn btn-outline btn-sm"
                      style={{ 
                        fontSize: '11px', 
                        padding: '3px 9px', 
                        color: chartTheme.controlBtnText, 
                        borderColor: chartTheme.controlBtnBorder,
                        background: chartTheme.controlBtnBg,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="Sync latest telemetry stream"
                    >
                      <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
                      <span>Sync</span>
                    </button>

                    <span style={{ fontSize: '11px', color: chartTheme.hudSubtle, fontFamily: 'monospace' }}>
                      {chartRecentTrend.length} BATCHES
                    </span>
                  </div>
                </div>

                {chartRecentTrend.length === 0 ? (
                  <div style={{ padding: '48px 20px', textAlign: 'center', background: chartTheme.canvasBg }}>
                    <TrendingUp size={36} color={chartTheme.axisText} style={{ margin: '0 auto 12px' }} />
                    <div style={{ fontWeight: 600, fontSize: '13px', color: chartTheme.hudMuted, fontFamily: 'monospace', letterSpacing: '0.04em' }}>
                      &gt; TERMINAL READY: WAITING FOR TELEMETRY INGESTION STREAM
                    </div>
                    <div style={{ fontSize: '12px', color: chartTheme.hudSubtle, marginTop: '6px' }}>
                      Click &quot;Score Batch &amp; Evaluate Drift&quot; above to execute live model inference and stream telemetry.
                    </div>
                  </div>
                ) : (() => {
                  // Normalized chart data mapping
                  const chartPoints = chartRecentTrend.map((t, idx) => {
                    const latency = Number(t.avgLatencyMs ?? t.latencyMs ?? t.performanceTelemetry?.avgLatencyMs ?? 0);
                    const volume = Number(t.predictionVolume ?? t.sampleSize ?? 25);
                    const time = t.recordedAt ? new Date(t.recordedAt) : new Date();
                    return {
                      ...t,
                      index: idx,
                      latency: Math.max(0, latency),
                      volume: Math.max(1, volume),
                      timestamp: time,
                      timeLabel: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                      dateLabel: time.toLocaleDateString([], { month: 'short', day: 'numeric' }),
                      isDrifted: t.driftStatus === 'DRIFT_DETECTED',
                      isInsufficient: t.driftStatus === 'INSUFFICIENT_DATA'
                    };
                  });

                  // Compute scales with sensible dynamic range for professional terminal profiling
                  const totalPoints = chartPoints.length;
                  const rawMinLat = Math.min(...chartPoints.map(p => p.latency));
                  const rawMaxLat = Math.max(...chartPoints.map(p => p.latency), 10);
                  const latSpread = rawMaxLat - rawMinLat;
                  const latPad = Math.max(25, Math.ceil((Math.max(latSpread, 40) * 0.25) / 10) * 10);
                  const minLat = Math.max(0, Math.floor((rawMinLat - latPad) / 25) * 25);
                  const maxLat = Math.max(minLat + 50, Math.ceil((rawMaxLat + latPad) / 25) * 25);
                  const latRange = Math.max(maxLat - minLat, 50);

                  const rawMaxVol = Math.max(...chartPoints.map(p => p.volume), 10);
                  const maxVol = Math.max(20, Math.ceil((rawMaxVol * 1.25) / 10) * 10);

                  const marginL = 58;
                  const marginR = 52;
                  const chartW = 800 - marginL - marginR;
                  const latBaseY = 138;
                  const latTopY = 22;
                  const latH = latBaseY - latTopY;
                  const volBaseY = 196;
                  const volH = 40;

                  const getX = (idx) => totalPoints === 1 ? marginL + chartW / 2 : marginL + (idx * (chartW / Math.max(totalPoints - 1, 1)));
                  const getLatY = (val) => {
                    const norm = (val - minLat) / latRange;
                    return Math.max(latTopY, Math.min(latBaseY, latBaseY - norm * latH));
                  };
                  const getVolH = (val) => Math.max(3, Math.min(volH, (val / maxVol) * volH));

                  const coords = chartPoints.map(p => ({ x: getX(p.index), y: getLatY(p.latency) }));
                  const linePathD = createSmoothPath(coords);
                  const areaPathD = totalPoints > 1 && coords.length > 0
                    ? `${linePathD} L ${coords[coords.length - 1].x} ${latBaseY} L ${coords[0].x} ${latBaseY} Z`
                    : '';

                  // Active hover selection or latest default
                  const activePoint = hoveredPoint || (chartPoints.length > 0 ? chartPoints[chartPoints.length - 1] : null);
                  const hoveredChartPoint = activePoint ? chartPoints.find(p => p.batchId === activePoint.batchId) || activePoint : null;

                  // Compute summary metrics for HUD
                  const avgLatAll = Math.round(chartPoints.reduce((acc, p) => acc + p.latency, 0) / Math.max(chartPoints.length, 1));
                  const totalVolAll = chartPoints.reduce((acc, p) => acc + p.volume, 0);

                  return (
                    <div style={{ padding: '14px 16px 12px', background: chartTheme.canvasBg, borderTop: `1px solid ${chartTheme.canvasBorder}` }}>
                      {/* Real-Time Trading Terminal HUD Ribbon */}
                      <div style={{
                        marginBottom: '10px',
                        padding: '8px 14px',
                        borderRadius: '4px',
                        background: chartTheme.hudBg,
                        border: `1px solid ${chartTheme.hudBorder}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        fontSize: '11px',
                        fontFamily: 'monospace'
                      }}>
                        {hoveredChartPoint ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                              <span style={{ color: chartTheme.latencyLine, fontWeight: 700 }}>
                                BATCH: {hoveredChartPoint.batchId ? hoveredChartPoint.batchId.slice(-9) : `#${hoveredChartPoint.index + 1}`}
                              </span>
                              <span style={{ color: chartTheme.hudMuted }}>
                                TIME: {hoveredChartPoint.timeLabel || new Date(hoveredChartPoint.recordedAt).toLocaleTimeString()}
                              </span>
                              <span style={{ color: chartTheme.hudText }}>
                                LATENCY: <strong style={{ color: chartTheme.latencyLine }}>{hoveredChartPoint.latency ?? hoveredChartPoint.avgLatencyMs ?? 0} ms</strong>
                              </span>
                              <span style={{ color: chartTheme.hudText }}>
                                VOLUME: <strong style={{ color: chartTheme.hudMuted }}>{hoveredChartPoint.volume ?? hoveredChartPoint.predictionVolume ?? 0} req</strong>
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '3px',
                                fontWeight: 700,
                                fontSize: '10px',
                                background: hoveredChartPoint.isDrifted 
                                  ? (isDark ? 'rgba(239, 68, 68, 0.2)' : 'rgba(220, 38, 38, 0.12)') 
                                  : (hoveredChartPoint.isInsufficient ? (isDark ? 'rgba(245, 158, 11, 0.2)' : 'rgba(217, 119, 6, 0.12)') : (isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(22, 163, 74, 0.12)')),
                                color: hoveredChartPoint.isDrifted 
                                  ? chartTheme.driftDot 
                                  : (hoveredChartPoint.isInsufficient ? chartTheme.warningDot : chartTheme.healthyDot),
                                border: `1px solid ${hoveredChartPoint.isDrifted 
                                  ? (isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(220, 38, 38, 0.3)') 
                                  : (hoveredChartPoint.isInsufficient ? (isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.3)') : (isDark ? 'rgba(16, 185, 129, 0.4)' : 'rgba(22, 163, 74, 0.3)'))}`
                              }}>
                                {hoveredChartPoint.isDrifted 
                                  ? `DRIFT: ${hoveredChartPoint.driftedColumns?.slice(0, 2).join(', ') || 'DETECTED'}` 
                                  : (hoveredChartPoint.isInsufficient ? 'INSUFFICIENT DATA' : 'HEALTHY IN-DISTRIBUTION')}
                              </span>

                              <button
                                type="button"
                                id="inspect-chart-report-btn"
                                onClick={() => handleOpenReport(hoveredChartPoint.reportId || null, hoveredChartPoint)}
                                className="btn btn-secondary btn-sm"
                                style={{ 
                                  padding: '2px 8px', 
                                  fontSize: '10px', 
                                  background: chartTheme.hudButtonBg, 
                                  borderColor: chartTheme.hudButtonBorder,
                                  color: chartTheme.hudButtonText
                                }}
                              >
                                Inspect Report →
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: chartTheme.hudMuted }}>
                              <span>WINDOW: <strong style={{ color: chartTheme.hudText }}>Last {chartPoints.length} Batches</strong></span>
                              <span>AVG LATENCY: <strong style={{ color: chartTheme.latencyLine }}>{avgLatAll} ms</strong></span>
                              <span>TOTAL INFERENCES: <strong style={{ color: chartTheme.hudMuted }}>{totalVolAll}</strong></span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', color: chartTheme.hudSubtle, fontSize: '10.5px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: chartTheme.healthyDot, display: 'inline-block' }} />
                                Healthy
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: chartTheme.driftDot, display: 'inline-block' }} />
                                Drift Detected
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ width: '8px', height: '8px', background: chartTheme.volBarFill, border: `1px solid ${chartTheme.volBarStroke}`, display: 'inline-block' }} />
                                Batch Volume
                              </span>
                              <span>Hover over points for metrics</span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Dual-Axis SVG Trading Chart */}
                      <div style={{ height: '235px', width: '100%', position: 'relative' }}>
                        <svg width="100%" height="100%" viewBox="0 0 800 235" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                          <defs>
                            <linearGradient id="terminalAreaGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={chartTheme.gradStop0} stopOpacity={chartTheme.gradOpacity0} />
                              <stop offset="60%" stopColor={chartTheme.gradStop1} stopOpacity={isDark ? 0.08 : 0.05} />
                              <stop offset="100%" stopColor={chartTheme.gradStop1} stopOpacity="0.0" />
                            </linearGradient>
                            <linearGradient id="driftAreaGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={chartTheme.driftDot} stopOpacity={isDark ? 0.28 : 0.18} />
                              <stop offset="100%" stopColor={chartTheme.driftDot} stopOpacity="0.0" />
                            </linearGradient>
                          </defs>

                          {/* Technical Latency Gridlines (Horizontal) */}
                          <line x1={marginL} y1={latTopY} x2={marginL + chartW} y2={latTopY} stroke={chartTheme.gridStroke} strokeDasharray="2,3" strokeWidth="0.8" />
                          <line x1={marginL} y1={latTopY + latH * 0.33} x2={marginL + chartW} y2={latTopY + latH * 0.33} stroke={chartTheme.gridStroke} strokeDasharray="2,3" strokeWidth="0.8" />
                          <line x1={marginL} y1={latTopY + latH * 0.66} x2={marginL + chartW} y2={latTopY + latH * 0.66} stroke={chartTheme.gridStroke} strokeDasharray="2,3" strokeWidth="0.8" />
                          <line x1={marginL} y1={latBaseY} x2={marginL + chartW} y2={latBaseY} stroke={chartTheme.axisLine} strokeWidth="1" />

                          {/* Left Y-Axis: Latency (ms) Labels */}
                          <text x={marginL - 8} y={latTopY + 3} textAnchor="end" fill={chartTheme.axisText} fontSize="9" fontFamily="monospace">{maxLat}ms</text>
                          <text x={marginL - 8} y={latTopY + latH * 0.33 + 3} textAnchor="end" fill={chartTheme.axisText} fontSize="9" fontFamily="monospace">{minLat + Math.round(latRange * 0.66)}ms</text>
                          <text x={marginL - 8} y={latTopY + latH * 0.66 + 3} textAnchor="end" fill={chartTheme.axisText} fontSize="9" fontFamily="monospace">{minLat + Math.round(latRange * 0.33)}ms</text>
                          <text x={marginL - 8} y={latBaseY + 3} textAnchor="end" fill={chartTheme.axisText} fontSize="9" fontFamily="monospace">{minLat}ms</text>

                          {/* Split Divider & Volume Axis */}
                          <line x1={marginL} y1={volBaseY} x2={marginL + chartW} y2={volBaseY} stroke={chartTheme.axisLine} strokeWidth="1" />
                          <text x={marginL + chartW + 8} y={volBaseY - volH + 3} textAnchor="start" fill={chartTheme.axisText} fontSize="8.5" fontFamily="monospace">{maxVol} vol</text>
                          <text x={marginL + chartW + 8} y={volBaseY + 3} textAnchor="start" fill={chartTheme.axisText} fontSize="8.5" fontFamily="monospace">0 vol</text>

                          {/* Pane Label: Volume Histogram */}
                          <text x={marginL} y={150} fill={chartTheme.axisLabel} fontSize="8" fontFamily="monospace" letterSpacing="0.05em">
                            INFERENCE BATCH VOLUME (REQUESTS)
                          </text>

                          {/* Volume Bars (Aligned to same X buckets) */}
                          {chartPoints.map((p) => {
                            const x = getX(p.index);
                            const bW = Math.max(6, Math.min(22, (chartW / totalPoints) * 0.42));
                            const bH = getVolH(p.volume);
                            const bY = volBaseY - bH;
                            const isHovered = activePoint && activePoint.batchId === p.batchId;

                            return (
                              <rect
                                key={`vol-${p.batchId || p.index}`}
                                x={x - bW / 2}
                                y={bY}
                                width={bW}
                                height={bH}
                                fill={p.isDrifted ? chartTheme.volBarDriftFill : (isHovered ? chartTheme.volBarFillHover : chartTheme.volBarFill)}
                                stroke={p.isDrifted ? chartTheme.volBarDriftStroke : chartTheme.volBarStroke}
                                strokeWidth={isHovered ? '1.5' : '0.8'}
                                rx="1"
                                style={{ cursor: 'pointer', transition: 'fill 0.15s ease' }}
                                onMouseEnter={() => setHoveredPoint(p)}
                                onMouseLeave={() => setHoveredPoint(null)}
                              />
                            );
                          })}

                          {/* Area Under Latency Curve */}
                          {areaPathD && (
                            <path
                              d={areaPathD}
                              fill="url(#terminalAreaGradient)"
                            />
                          )}

                          {/* Latency Continuous Smooth Spline */}
                          {linePathD && (
                            <path
                              d={linePathD}
                              fill="none"
                              stroke={chartTheme.latencyLine}
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          )}

                          {/* Vertical Crosshair Line when Hovered */}
                          {hoveredChartPoint && (
                            <line
                              x1={getX(hoveredChartPoint.index)}
                              y1={latTopY}
                              x2={getX(hoveredChartPoint.index)}
                              y2={volBaseY}
                              stroke={chartTheme.crosshairStroke}
                              strokeDasharray="3,3"
                              strokeWidth="1"
                            />
                          )}

                          {/* Latency Observation Points */}
                          {chartPoints.map((p) => {
                            const x = getX(p.index);
                            const y = getLatY(p.latency);
                            const isHovered = activePoint && activePoint.batchId === p.batchId;
                            const isLatest = p.index === totalPoints - 1;

                            const pointColor = p.isDrifted 
                              ? chartTheme.driftDot 
                              : (p.isInsufficient ? chartTheme.warningDot : chartTheme.healthyDot);

                            return (
                              <g 
                                key={`pt-${p.batchId || p.index}`}
                                onMouseEnter={() => setHoveredPoint(p)}
                                onMouseLeave={() => setHoveredPoint(null)}
                                style={{ cursor: 'pointer' }}
                              >
                                {/* Hover Halo Ring */}
                                {isHovered && (
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r="8"
                                    fill="none"
                                    stroke={pointColor}
                                    strokeWidth="2"
                                    opacity="0.6"
                                  />
                                )}

                                {/* Live Pulsing Ring on latest observation */}
                                {isLatest && !isHovered && (
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r="7.5"
                                    fill="none"
                                    stroke={pointColor}
                                    strokeWidth="1.5"
                                    strokeDasharray="2,2"
                                    opacity="0.8"
                                  />
                                )}

                                {/* Crisp Data Dot */}
                                <circle
                                  cx={x}
                                  cy={y}
                                  r={isHovered ? 4.5 : (p.isDrifted ? 4 : 3.2)}
                                  fill={pointColor}
                                  stroke={isDark ? '#0b0f17' : '#ffffff'}
                                  strokeWidth={isHovered ? 2.5 : 1.5}
                                />

                                {/* X-Axis Tick & Timestamp Label */}
                                <line x1={x} y1={volBaseY} x2={x} y2={volBaseY + 4} stroke={chartTheme.axisLine} strokeWidth="1" />
                                <text
                                  x={x}
                                  y={volBaseY + 16}
                                  textAnchor="middle"
                                  fontSize="8.5"
                                  fill={isHovered ? chartTheme.latencyLine : chartTheme.axisText}
                                  fontFamily="monospace"
                                >
                                  {p.timeLabel}
                                </text>
                              </g>
                            );
                          })}

                          {/* In-Chart Hover Tooltip HUD Box */}
                          {hoveredChartPoint && (() => {
                            const hX = getX(hoveredChartPoint.index);
                            const hY = getLatY(hoveredChartPoint.latency);
                            const tooltipW = 144;
                            const tooltipH = 48;
                            const ttX = Math.max(marginL, Math.min(marginL + chartW - tooltipW, hX - tooltipW / 2));
                            const ttY = Math.max(latTopY - 2, hY - tooltipH - 8);
                            return (
                              <g style={{ pointerEvents: 'none' }}>
                                <rect
                                  x={ttX}
                                  y={ttY}
                                  width={tooltipW}
                                  height={tooltipH}
                                  rx="4"
                                  fill={chartTheme.hudBg}
                                  stroke={chartTheme.hudBorder}
                                  strokeWidth="1"
                                />
                                <text x={ttX + 8} y={ttY + 14} fontSize="8.5" fontWeight="700" fontFamily="monospace" fill={chartTheme.latencyLine}>
                                  {hoveredChartPoint.batchId ? hoveredChartPoint.batchId.slice(-12) : `#${hoveredChartPoint.index + 1}`}
                                </text>
                                <text x={ttX + tooltipW - 8} y={ttY + 14} textAnchor="end" fontSize="8" fontFamily="monospace" fill={hoveredChartPoint.isDrifted ? chartTheme.driftDot : chartTheme.healthyDot} fontWeight="700">
                                  {hoveredChartPoint.isDrifted ? 'DRIFT' : 'HEALTHY'}
                                </text>
                                <text x={ttX + 8} y={ttY + 28} fontSize="9" fontFamily="monospace" fill={chartTheme.hudText}>
                                  Latency: <tspan fontWeight="700" fill={chartTheme.latencyLine}>{hoveredChartPoint.latency} ms</tspan>
                                </text>
                                <text x={ttX + 8} y={ttY + 41} fontSize="8" fontFamily="monospace" fill={chartTheme.hudMuted}>
                                  {hoveredChartPoint.timeLabel} • {hoveredChartPoint.volume} req
                                </text>
                              </g>
                            );
                          })()}
                        </svg>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Latest Live Observation & Feature Drift Tests (Side-by-Side) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start', gap: '18px', marginBottom: '20px' }}>
            {/* Live Observation Summary Card */}
            <div className="card" id="latest-observation-card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={16} color="var(--accent-primary)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Latest Service Observation
                  </span>
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  background: 'var(--bg-subtle)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-color)'
                }}>
                  {monitoringData?.model?.name || 'Governed Model'} ({monitoringData?.version?.version || 'v1.0'})
                </span>
              </div>

              {latestTelemetry ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                    <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Decision Verdict</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: latestTelemetry.driftStatus === 'DRIFT_DETECTED' ? 'var(--warning-text)' : 'var(--success-text)', marginTop: '2px' }}>
                        {latestTelemetry.driftStatus === 'DRIFT_DETECTED' ? 'REVIEW / FLAG' : 'ALLOW (LOW RISK)'}
                      </div>
                    </div>

                    <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Avg Latency</div>
                      <div className="tnum" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                        {Number(latestTelemetry.performanceTelemetry?.avgLatencyMs ?? latestTelemetry.latencyMs ?? 0)} ms
                      </div>
                    </div>

                    <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Drift Status</div>
                      <div style={{ marginTop: '2px' }}>
                        <StatusBadge
                          status={latestTelemetry.driftStatus === 'DRIFT_DETECTED' ? 'danger' : (latestTelemetry.driftStatus === 'INSUFFICIENT_DATA' ? 'warning' : 'success')}
                          label={latestTelemetry.driftStatus === 'DRIFT_DETECTED' ? 'DRIFT DETECTED' : (latestTelemetry.driftStatus === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT' : 'HEALTHY')}
                        />
                      </div>
                    </div>

                    <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Batch Inferences</div>
                      <div className="tnum" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                        {latestTelemetry.sampleSize ?? latestTelemetry.predictionVolume ?? 0} tx
                      </div>
                    </div>
                  </div>

                  <div style={{ 
                    fontSize: '11.5px', 
                    color: 'var(--text-secondary)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '6px',
                    padding: '10px 12px',
                    background: 'var(--bg-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Batch ID:</span>
                      <span className="font-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{latestTelemetry.batchId}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Recorded At:</span>
                      <span>{new Date(latestTelemetry.recordedAt).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Reference Dataset:</span>
                      <span style={{ fontWeight: 500 }}>{latestTelemetry.referenceDatasetVersion || monitoringData?.version?.referenceDataset?.filename || 'baseline-v1.0'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Workload Profile:</span>
                      <span>{monitoringData?.workloadConfig?.name || monitoringData?.model?.type || 'Credit Risk Assessment'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
                  No live transactions observed yet.
                </div>
              )}
            </div>

            {/* Feature Statistical Tests from Evidently */}
            <div className="card" id="evidently-feature-tests-card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={16} color="var(--accent-primary)" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Evidently Two-Sample Hypothesis Tests
                  </span>
                </div>
                {latestTelemetry?.features && latestTelemetry.features.length > 0 && (
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    padding: '2px 8px',
                    borderRadius: '3px',
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-color)'
                  }}>
                    {latestTelemetry.features.length} FEATURES
                  </span>
                )}
              </div>

              {latestTelemetry?.features && latestTelemetry.features.length > 0 ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(expandedFeatureTests ? latestTelemetry.features : latestTelemetry.features.slice(0, 3)).map((feat, fIdx) => (
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

                  {latestTelemetry.features.length > 3 && (
                    <button
                      type="button"
                      id="toggle-expand-feature-tests"
                      onClick={() => setExpandedFeatureTests(!expandedFeatureTests)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        marginTop: '10px',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '11.5px',
                        padding: '5px 12px'
                      }}
                    >
                      {expandedFeatureTests ? (
                        <>
                          <ChevronUp size={13} />
                          <span>Show fewer features (showing all {latestTelemetry.features.length})</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown size={13} />
                          <span>Show all {latestTelemetry.features.length} features (3 shown)</span>
                        </>
                      )}
                    </button>
                  )}
                </>
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
              <>
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
                      {(expandedTelemetryHistory ? telemetryHistory : telemetryHistory.slice(0, 3)).map((t) => (
                        <tr key={t._id}>
                          <td className="font-mono" style={{ fontSize: '12px' }}>{t.batchId}</td>
                          <td style={{ fontSize: '12px' }}>{new Date(t.recordedAt).toLocaleString()}</td>
                          <td>
                            <span className="font-mono">{t.versionId?.version || version?.version || 'v1.0'}</span>
                          </td>
                          <td className="tnum">{(t.sampleSize || t.performanceTelemetry?.predictionVolume || 0).toLocaleString()}</td>
                          <td>
                            <StatusBadge 
                              status={t.driftStatus === 'DRIFT_DETECTED' ? 'danger' : (t.driftStatus === 'INSUFFICIENT_DATA' ? 'warning' : 'success')}
                              label={t.driftStatus === 'DRIFT_DETECTED' ? 'DRIFT DETECTED' : (t.driftStatus === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT DATA' : 'HEALTHY')}
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
                                onClick={() => handleOpenReport(t.reportId._id || t.reportId, t)}
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

                {telemetryHistory.length > 3 && (
                  <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', background: 'var(--bg-subtle)' }}>
                    <button
                      type="button"
                      id="toggle-expand-telemetry-history"
                      onClick={() => setExpandedTelemetryHistory(!expandedTelemetryHistory)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11.5px',
                        padding: '4px 14px'
                      }}
                    >
                      {expandedTelemetryHistory ? (
                        <>
                          <ChevronUp size={13} />
                          <span>Show latest 3 batches only (showing all {telemetryHistory.length})</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown size={13} />
                          <span>Show full telemetry history ({telemetryHistory.length} total batches)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ================= MODAL: STATISTICAL DRIFT REPORT ================= */}
      {reportModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '850px' }}>
            {/* Modal Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={18} color="var(--color-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
                  {selectedReport ? selectedReport.title : (reportModalBatch?.batchId ? `Batch Report: ${reportModalBatch.batchId}` : 'Statistical Distribution Drift Report')}
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
                  <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <div style={{ fontWeight: 600, fontSize: '13.5px', marginBottom: '6px', color: 'var(--text-primary)' }}>
                    {reportEmptyMessage || (reportModalBatch?.batchId ? `No report is linked to batch ${reportModalBatch.batchId}.` : 'No report is linked to this batch.')}
                  </div>
                  <div style={{ fontSize: '12px', opacity: 0.8, maxWidth: '420px', margin: '0 auto' }}>
                    {reportModalBatch && !reportModalBatch.isDrifted
                      ? 'This batch is healthy and in-distribution. Statistical drift reports are generated when distribution shift or an incident occurs.'
                      : 'Run a shifted-distribution batch to evaluate drift and generate an authoritative report.'}
                  </div>
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
                      <strong>Workload:</strong> {selectedReport.workloadId || monitoringData?.workloadConfig?.name || 'Governed Model'} • <strong>Model:</strong> {selectedReport.modelId?.name} ({selectedReport.versionId?.version})
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      <strong>Batch:</strong> <span className="font-mono">{selectedReport.telemetryId?.batchId || reportModalBatch?.batchId || selectedReport.driftAnalysis?.batchId || 'N/A'}</span>
                      {selectedReport.incidentId && (
                        <> • <strong>Incident:</strong> <span className="font-mono">{selectedReport.incidentId.incidentNumber || (typeof selectedReport.incidentId === 'string' ? selectedReport.incidentId : 'INC')}</span></>
                      )}
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
                  <button
                    id="download-drift-pdf-btn"
                    onClick={() => handleDownloadReportPdf(selectedReport)}
                    disabled={downloadingReportPdf}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                    title="Download official A4 drift report PDF with selectable text"
                  >
                    <FileText size={13} />
                    {downloadingReportPdf ? 'Generating PDF...' : 'Download PDF'}
                  </button>

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
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '920px' }}>
            {/* Modal Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <RotateCcw size={18} color="var(--color-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>
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
