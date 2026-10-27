import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getPolicies, getModels, createPolicy, updatePolicy, updateModelPolicy } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getRoleCapabilities } from '../utils/permissions';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';
import { RiskBadge } from '../components/RiskBadge';
import EmptyState from '../components/EmptyState';
import { formatRoleLabel, formatPolicyAction, formatRiskLevel } from '../utils/formatters';
import { 
  ShieldCheck, 
  Plus, 
  RefreshCw, 
  X, 
  Shield, 
  Cpu, 
  Filter, 
  Check, 
  AlertCircle, 
  Layers, 
  Edit3,
  ExternalLink
} from 'lucide-react';

export default function PolicyManagement() {
  const { user } = useAuth();
  const capabilities = getRoleCapabilities(user?.role);

  const [policies, setPolicies] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState('ALL');
  
  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [assigningModel, setAssigningModel] = useState(null); // when assigning a policy to a model
  const [submitting, setSubmitting] = useState(false);

  // Policy Form State
  const initialPolicyForm = {
    name: '',
    description: '',
    targetRiskLevel: 'HIGH',
    minDisparateImpact: 0.80,
    maxDisparateImpact: 1.25,
    maxDemographicParityDiff: 0.10,
    minRocAuc: 0.85,
    minAccuracy: 0.80,
    minPrecision: 0.75,
    minRecall: 0.75,
    requiredApprovers: ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
    failureAction: 'BLOCK_PROMOTION',
    applicableModelIds: []
  };
  const [policyForm, setPolicyForm] = useState(initialPolicyForm);

  const loadData = async () => {
    try {
      setLoading(true);
      const [policiesData, modelsData] = await Promise.all([
        getPolicies(),
        getModels()
      ]);
      setPolicies(policiesData || []);
      setModels(modelsData || []);
    } catch (err) {
      console.error('Failed to load governance policies or models:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Selected Model details for context banner
  const selectedModel = useMemo(() => {
    if (selectedModelId === 'ALL') return null;
    return models.find(m => m._id === selectedModelId) || null;
  }, [models, selectedModelId]);

  // Filter policies based on selected model
  const displayedPolicies = useMemo(() => {
    if (selectedModelId === 'ALL') {
      return policies;
    }
    return policies.filter(p => 
      p.applicableModels?.some(m => String(m._id) === String(selectedModelId))
    );
  }, [policies, selectedModelId]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setPolicyForm({
      ...initialPolicyForm,
      applicableModelIds: selectedModelId !== 'ALL' ? [selectedModelId] : []
    });
    setEditingPolicy(null);
    setIsCreateModalOpen(true);
  };

  // Open Edit Modal for a policy
  const handleOpenEditModal = (policy) => {
    setEditingPolicy(policy);
    setPolicyForm({
      name: policy.name,
      description: policy.description || '',
      targetRiskLevel: policy.targetRiskLevel || 'HIGH',
      minDisparateImpact: policy.rules?.minDisparateImpact ?? 0.80,
      maxDisparateImpact: policy.rules?.maxDisparateImpact ?? 1.25,
      maxDemographicParityDiff: policy.rules?.maxDemographicParityDiff ?? 0.10,
      minRocAuc: policy.rules?.minRocAuc ?? 0.85,
      minAccuracy: policy.rules?.minAccuracy ?? 0.80,
      minPrecision: policy.rules?.minPrecision ?? 0.75,
      minRecall: policy.rules?.minRecall ?? 0.75,
      requiredApprovers: policy.requiredApprovers?.filter(r => r !== 'PLATFORM_ADMIN') || ['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'],
      failureAction: policy.failureAction || 'BLOCK_PROMOTION',
      applicableModelIds: policy.applicableModels?.map(m => m._id) || policy.applicableModelIds || []
    });
    setIsCreateModalOpen(true);
  };

  const handleToggleModelAssignment = (modelId) => {
    setPolicyForm(prev => {
      const exists = prev.applicableModelIds.includes(modelId);
      return {
        ...prev,
        applicableModelIds: exists
          ? prev.applicableModelIds.filter(id => id !== modelId)
          : [...prev.applicableModelIds, modelId]
      };
    });
  };

  const handleToggleApprover = (role) => {
    setPolicyForm(prev => {
      const exists = prev.requiredApprovers.includes(role);
      return {
        ...prev,
        requiredApprovers: exists
          ? prev.requiredApprovers.filter(r => r !== role)
          : [...prev.requiredApprovers, role]
      };
    });
  };

  const handleSubmitPolicy = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const payload = {
        name: policyForm.name,
        description: policyForm.description,
        targetRiskLevel: policyForm.targetRiskLevel,
        rules: {
          minDisparateImpact: Number(policyForm.minDisparateImpact),
          maxDisparateImpact: Number(policyForm.maxDisparateImpact),
          maxDemographicParityDiff: Number(policyForm.maxDemographicParityDiff),
          minRocAuc: Number(policyForm.minRocAuc),
          minAccuracy: Number(policyForm.minAccuracy),
          minPrecision: Number(policyForm.minPrecision),
          minRecall: Number(policyForm.minRecall)
        },
        requiredApprovers: policyForm.requiredApprovers.filter(r => r !== 'PLATFORM_ADMIN'),
        failureAction: policyForm.failureAction,
        applicableModelIds: policyForm.applicableModelIds,
        isActive: true
      };

      if (editingPolicy) {
        await updatePolicy(editingPolicy._id, payload);
      } else {
        await createPolicy(payload);
      }

      setIsCreateModalOpen(false);
      setEditingPolicy(null);
      await loadData();
    } catch (err) {
      alert(`Error saving policy: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Quick assignment of a policy to a model
  const handleQuickAssignModelPolicy = async (policyId) => {
    if (!selectedModel) return;
    try {
      setSubmitting(true);
      await updateModelPolicy(selectedModel._id, policyId);
      setAssigningModel(null);
      await loadData();
    } catch (err) {
      alert(`Error assigning policy: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Workspace', to: '/app' },
          { label: 'Policy Management' }
        ]}
        title="Policy & Governance Rules Management"
        subtitle="Policy Library: statutory compliance frameworks, automated gating thresholds, and multi-model governance assignments."
      >
        <button onClick={loadData} className="btn btn-secondary btn-sm" title="Refresh policies">
          <RefreshCw size={14} /> Refresh
        </button>
        {capabilities.canManagePolicies ? (
          <button onClick={handleOpenCreateModal} className="btn btn-primary btn-sm">
            <Plus size={15} /> Define Policy
          </button>
        ) : (
          <button
            disabled
            className="btn btn-secondary btn-sm"
            title="Policy management requires Governance Officer role"
            style={{ opacity: 0.6 }}
          >
            <Plus size={15} /> Define Policy (Governance Officer Only)
          </button>
        )}
      </PageHeader>

      {/* Secondary Navigation & View By Model Filter Bar */}
      <div 
        className="card" 
        style={{ 
          padding: '12px 18px', 
          marginBottom: '18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            <Cpu size={16} color="var(--accent-primary)" />
            <span>View by Model:</span>
          </div>
          
          <select
            className="form-select"
            style={{ minWidth: '260px', padding: '6px 10px', fontSize: '13px' }}
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
          >
            <option value="ALL">All Policies (Policy Library)</option>
            {models.length === 0 ? (
              <option disabled>No models available</option>
            ) : (
              models.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name} ({formatRiskLevel(m.riskLevel)} Risk)
                </option>
              ))
            )}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <Layers size={14} />
          <span>
            {selectedModelId === 'ALL'
              ? `Showing all ${policies.length} library policies`
              : `Filtered for: ${selectedModel?.name || 'Selected Model'}`}
          </span>
          {selectedModelId !== 'ALL' && (
            <button 
              type="button" 
              onClick={() => setSelectedModelId('ALL')}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '11px', padding: '2px 8px' }}
            >
              Reset to All
            </button>
          )}
        </div>
      </div>

      {/* Selected Model Context Banner */}
      {selectedModel && (
        <div 
          className="card" 
          style={{ 
            marginBottom: '18px', 
            padding: '14px 18px', 
            background: 'var(--bg-subtle)',
            borderLeft: '4px solid var(--accent-primary)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selected Model</span>
                <Link 
                  to={`/app/models/${selectedModel._id}`}
                  style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {selectedModel.name}
                  <ExternalLink size={13} color="var(--accent-primary)" />
                </Link>
                <RiskBadge level={selectedModel.riskLevel} />
                <StatusBadge status={selectedModel.lifecycleStatus} />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Owner: <strong>{selectedModel.owner}</strong> • Team: {selectedModel.team} • Purpose: {selectedModel.purpose}
              </div>
            </div>

            <div>
              {displayedPolicies.length > 0 ? (
                <span className="badge badge-success" style={{ fontSize: '12px', padding: '4px 10px' }}>
                  <ShieldCheck size={13} /> {displayedPolicies.length} Applicable {displayedPolicies.length === 1 ? 'Policy' : 'Policies'} Bound
                </span>
              ) : (
                <span className="badge badge-warning" style={{ fontSize: '12px', padding: '4px 10px' }}>
                  <AlertCircle size={13} /> No governance policy assigned
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Policies List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loading ? (
          <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
            <RefreshCw className="animate-spin" size={24} color="var(--accent-primary)" style={{ margin: '0 auto 8px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading governance policies...</p>
          </div>
        ) : displayedPolicies.length === 0 ? (
          <div className="card" style={{ padding: '40px 24px', textAlign: 'center' }}>
            {selectedModel ? (
              <div>
                <AlertCircle size={28} color="var(--warning-text)" style={{ margin: '0 auto 10px' }} />
                <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  No governance policy assigned
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', maxWidth: '520px', margin: '0 auto 16px' }}>
                  <strong>{selectedModel.name}</strong> is not currently associated with any governance policy. Policy gate checks and promotion will remain blocked until an authorized Governance Officer assigns an active policy.
                </p>
                {capabilities.canManagePolicies ? (
                  <button 
                    onClick={() => setAssigningModel(selectedModel)} 
                    className="btn btn-primary btn-sm"
                  >
                    <Plus size={14} /> Assign Governance Policy to {selectedModel.name}
                  </button>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Contact a Governance Officer to assign a governance policy.
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={ShieldCheck}
                title="No governance policies defined"
                description="Define institutional threshold rules (fairness, accuracy, risk tiers) to enforce deterministic pre-deployment gates."
                actionText={capabilities.canManagePolicies ? "Define First Policy" : undefined}
                onAction={() => setIsCreateModalOpen(true)}
              />
            )}
          </div>
        ) : (
          displayedPolicies.map((policy) => (
            <div key={policy._id} className="card">
              <div className="card-header" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{policy.name}</h3>
                    <RiskBadge level={policy.targetRiskLevel} />
                    <StatusBadge 
                      status={policy.failureAction === 'BLOCK_PROMOTION' ? 'danger' : 'warning'} 
                      label={formatPolicyAction(policy.failureAction)} 
                    />
                    <span className="badge badge-neutral" style={{ fontSize: '11px' }}>
                      {policy.isActive ? 'Active Status' : 'Inactive'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {policy.description}
                  </div>
                </div>

                {capabilities.canManagePolicies && (
                  <button
                    onClick={() => handleOpenEditModal(policy)}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                    title="Edit policy rules and model applicability"
                  >
                    <Edit3 size={13} /> Edit / Scope Models
                  </button>
                )}
              </div>

              {/* Thresholds Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>MIN DISPARATE IMPACT (DIR)</div>
                  <div className="tnum" style={{ fontSize: '17px', fontWeight: 700, color: 'var(--accent-primary)', marginTop: '2px' }}>
                    ≥ {policy.rules?.minDisparateImpact ?? 0.80}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>80% Benchmark Rule</div>
                </div>

                <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>MAX PARITY DIFF</div>
                  <div className="tnum" style={{ fontSize: '17px', fontWeight: 700, color: 'var(--info-text)', marginTop: '2px' }}>
                    ≤ {policy.rules?.maxDemographicParityDiff ?? 0.10}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Demographic Parity</div>
                </div>

                <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>MIN ROC-AUC METRIC</div>
                  <div className="tnum" style={{ fontSize: '17px', fontWeight: 700, color: 'var(--success-text)', marginTop: '2px' }}>
                    ≥ {policy.rules?.minRocAuc ?? 0.85}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Discrimination Power</div>
                </div>

                <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>MIN ACCURACY METRIC</div>
                  <div className="tnum" style={{ fontSize: '17px', fontWeight: 700, color: 'var(--warning-text)', marginTop: '2px' }}>
                    ≥ {((policy.rules?.minAccuracy ?? 0.80) * 100).toFixed(0)}%
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Minimum Accuracy Gate</div>
                </div>
              </div>

              {/* Mandatory Sign-offs */}
              <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                  MANDATORY STAGE-GATE SIGN-OFF ROLES
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {policy.requiredApprovers?.map((role) => (
                    <span key={role} className="badge badge-neutral" style={{ fontSize: '11.5px' }}>
                      <Shield size={12} color="var(--accent-primary)" />
                      {formatRoleLabel(role)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Applicable Models Section */}
              <div style={{ padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Cpu size={13} color="var(--accent-primary)" />
                    Applicable Models ({policy.applicableModels?.length || 0})
                  </div>
                  {capabilities.canManagePolicies && (
                    <button
                      onClick={() => handleOpenEditModal(policy)}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--accent-primary)' }}
                    >
                      + Manage Model Scope
                    </button>
                  )}
                </div>

                {!policy.applicableModels || policy.applicableModels.length === 0 ? (
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
                    No models currently assigned
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {policy.applicableModels.map((m) => (
                      <Link
                        key={m._id}
                        to={`/app/models/${m._id}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-subtle)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          textDecoration: 'none',
                          fontSize: '12px',
                          fontWeight: 500,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Cpu size={12} color="var(--accent-primary)" />
                        <span>{m.name}</span>
                        <RiskBadge level={m.riskLevel} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Define / Edit Policy Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
                  {editingPolicy ? 'Edit Governance Policy & Applicable Models' : 'Define Governance Policy'}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => { setIsCreateModalOpen(false); setEditingPolicy(null); }}
                className="btn-ghost"
                style={{ cursor: 'pointer', padding: '4px' }}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitPolicy}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Policy Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EU AI Act Annex III High-Risk Compliance Gate"
                    className="form-input"
                    value={policyForm.name}
                    onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Description & Regulatory Rationale</label>
                  <textarea
                    rows="2"
                    placeholder="Document regulatory scope, applicability, and policy rationale..."
                    className="form-textarea"
                    value={policyForm.description}
                    onChange={(e) => setPolicyForm({ ...policyForm, description: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Target Risk Level</label>
                    <select
                      className="form-select"
                      value={policyForm.targetRiskLevel}
                      onChange={(e) => setPolicyForm({ ...policyForm, targetRiskLevel: e.target.value })}
                    >
                      <option value="HIGH">High Risk (EU AI Act Annex III)</option>
                      <option value="LIMITED">Limited Risk</option>
                      <option value="MINIMAL">Minimal Risk</option>
                      <option value="ALL">All Systems (Global Baseline)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Failure Action</label>
                    <select
                      className="form-select"
                      value={policyForm.failureAction}
                      onChange={(e) => setPolicyForm({ ...policyForm, failureAction: e.target.value })}
                    >
                      <option value="BLOCK_PROMOTION">Block Promotion (Strict Gate)</option>
                      <option value="WARN_ONLY">Warn Only</option>
                    </select>
                  </div>
                </div>

                {/* Quantitative Thresholds */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Min Disparate Impact (DIR)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={policyForm.minDisparateImpact}
                      onChange={(e) => setPolicyForm({ ...policyForm, minDisparateImpact: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Max Parity Diff (DPD)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={policyForm.maxDemographicParityDiff}
                      onChange={(e) => setPolicyForm({ ...policyForm, maxDemographicParityDiff: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Min ROC-AUC</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={policyForm.minRocAuc}
                      onChange={(e) => setPolicyForm({ ...policyForm, minRocAuc: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Min Accuracy</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-input"
                      value={policyForm.minAccuracy}
                      onChange={(e) => setPolicyForm({ ...policyForm, minAccuracy: e.target.value })}
                    />
                  </div>
                </div>

                {/* Required Approvers */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Mandatory Sign-Off Roles</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {['ML_LEAD', 'GOVERNANCE_OFFICER', 'EXECUTIVE_APPROVER'].map(role => {
                      const isChecked = policyForm.requiredApprovers.includes(role);
                      return (
                        <label 
                          key={role} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            padding: '6px 10px', 
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-color)',
                            backgroundColor: isChecked ? 'var(--accent-subtle)' : 'var(--bg-subtle)',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleApprover(role)}
                          />
                          <span>{formatRoleLabel(role)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Applicable Models Multi-Select Checklist */}
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <label className="form-label" style={{ margin: 0 }}>Applicable Models (Governance Scope)</label>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {policyForm.applicableModelIds.length} model(s) selected
                    </span>
                  </div>
                  <div 
                    style={{ 
                      maxHeight: '160px', 
                      overflowY: 'auto', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px',
                      background: 'var(--bg-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    {models.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>
                        No models registered in the system yet.
                      </div>
                    ) : (
                      models.map(m => {
                        const isSelected = policyForm.applicableModelIds.includes(m._id);
                        return (
                          <label 
                            key={m._id} 
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between',
                              padding: '6px 10px', 
                              borderRadius: 'var(--radius-xs)',
                              backgroundColor: isSelected ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                              border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input 
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleModelAssignment(m._id)}
                              />
                              <span style={{ fontWeight: 600 }}>{m.name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <RiskBadge level={m.riskLevel} />
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Select which models must comply with this policy during evaluation and deployment stage gates.
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button 
                  type="button" 
                  onClick={() => { setIsCreateModalOpen(false); setEditingPolicy(null); }} 
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary btn-sm">
                  {submitting ? 'Saving Policy...' : editingPolicy ? 'Save Changes' : 'Create Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Assign Model Policy Modal */}
      {assigningModel && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>
                  Assign Governance Policy to {assigningModel.name}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setAssigningModel(null)}
                className="btn-ghost"
                style={{ cursor: 'pointer', padding: '4px' }}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0 }}>
                Select an active policy from the Policy Library to govern <strong>{assigningModel.name}</strong> ({formatRiskLevel(assigningModel.riskLevel)} Risk):
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {policies.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No governance policies available. Define a policy first.
                  </div>
                ) : (
                  policies.map((p) => (
                    <div 
                      key={p._id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-subtle)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{p.name}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Risk Tier: {formatRiskLevel(p.targetRiskLevel)} • Failure Action: {formatPolicyAction(p.failureAction)}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleQuickAssignModelPolicy(p._id)}
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '11.5px', padding: '4px 10px' }}
                      >
                        Assign
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setAssigningModel(null)} className="btn btn-secondary btn-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
