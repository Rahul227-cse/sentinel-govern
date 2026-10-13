import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getModels, createModel } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getRoleCapabilities } from '../utils/permissions';
import { RiskBadge, StatusBadge } from '../components/RiskBadge';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import ErrorState from '../components/ErrorState';
import { 
  Database, 
  Search, 
  Plus, 
  Filter, 
  ExternalLink, 
  RefreshCw,
  X
} from 'lucide-react';

export default function ModelRegistry() {
  const { user } = useAuth();
  const capabilities = getRoleCapabilities(user?.role);

  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New Model Form State with Regulatory Risk Assessment
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    purpose: '',
    owner: user?.name || user?.email || '',
    team: user?.team || 'AI Platform',
    modelType: 'CLASSIFICATION',
    riskLevel: 'HIGH',
    initialVersion: 'v1.0',
    initialChangelog: 'Initial model baseline training and validation',
    protectedAttributes: 'gender, age',
    intendedUsers: 'Risk Analysts, ML Engineers',
    prohibitedPracticesChecked: true,
    safetyImpactRating: 'High Significance (Annex III Section 5b)',
    autonomyLevel: 'Human-in-the-loop'
  });

  const loadModels = async () => {
    try {
      setLoading(true);
      const params = {};
      if (search) params.search = search;
      if (riskFilter) params.riskLevel = riskFilter;
      const data = await getModels(params);
      setModels(data || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load model registry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, [riskFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadModels();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const payload = {
        name: formData.name,
        description: formData.description,
        purpose: formData.purpose,
        owner: formData.owner,
        team: formData.team,
        modelType: formData.modelType,
        riskLevel: formData.riskLevel,
        initialVersion: formData.initialVersion,
        initialChangelog: formData.initialChangelog,
        protectedAttributes: formData.protectedAttributes.split(',').map(s => s.trim()).filter(Boolean),
        intendedUsers: formData.intendedUsers.split(',').map(s => s.trim()).filter(Boolean),
        riskAssessment: {
          prohibitedPracticesChecked: formData.prohibitedPracticesChecked,
          euAiActClassification: formData.riskLevel,
          safetyImpactRating: formData.safetyImpactRating,
          autonomyLevel: formData.autonomyLevel,
          frameworkAlignment: ['EU_AI_ACT_ANNEX_III', 'NIST_AI_RMF_GOVERN'],
          assessmentNotes: 'Initial intake questionnaire completed.'
        }
      };

      await createModel(payload);
      setIsModalOpen(false);
      loadModels();
    } catch (err) {
      alert(`Failed to register model: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      {/* Header */}
      <PageHeader
        title="Model Registry"
        subtitle="Authoritative inventory of registered AI systems, governing risk tiers, and lifecycle statuses."
      >
        <button onClick={loadModels} className="btn btn-secondary btn-sm" title="Refresh registry">
          <RefreshCw size={14} /> Refresh
        </button>
        {capabilities.canCreateModels ? (
          <button onClick={() => setIsModalOpen(true)} className="btn btn-primary btn-sm">
            <Plus size={15} /> Register New Model
          </button>
        ) : (
          <button
            disabled
            className="btn btn-secondary btn-sm"
            title="Model registration requires ML Lead role"
            style={{ opacity: 0.6 }}
          >
            <Plus size={15} /> Register Model (ML Lead Only)
          </button>
        )}
      </PageHeader>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <form onSubmit={handleSearchSubmit} style={{ flex: 1, display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                placeholder="Search models by name, purpose, or owner..."
                className="form-input"
                style={{ width: '100%', paddingLeft: '34px' }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)'
                }}
              />
            </div>
            <button type="submit" className="btn btn-secondary btn-sm">
              Search
            </button>
            {search && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setSearch('');
                  loadModels();
                }}
              >
                Clear
              </button>
            )}
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              className="form-select"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              style={{ width: '170px', padding: '6px 10px', fontSize: '12.5px' }}
            >
              <option value="">All Risk Tiers</option>
              <option value="HIGH">High Risk (Annex III)</option>
              <option value="LIMITED">Limited Risk</option>
              <option value="MINIMAL">Minimal Risk</option>
              <option value="UNACCEPTABLE">Unacceptable Risk</option>
            </select>
          </div>
        </div>
      </div>

      {/* Models Data Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none', borderRadius: '0' }}>
          <table>
            <thead>
              <tr>
                <th>Model System</th>
                <th>Risk Classification</th>
                <th>Lifecycle Status</th>
                <th>Production Version</th>
                <th>Owner & Team</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '48px' }}>
                    <RefreshCw className="animate-spin" size={20} color="var(--accent-primary)" style={{ margin: '0 auto 8px' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '12.5px' }}>Loading registered AI models...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="6" style={{ padding: '32px' }}>
                    <ErrorState
                      title="Failed to Load Model Registry"
                      message={error}
                      onRetry={loadModels}
                    />
                  </td>
                </tr>
              ) : models.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: '32px' }}>
                    <EmptyState
                      icon={Database}
                      title="No models found"
                      description={search || riskFilter ? 'Try clearing your search query or changing the risk tier filter.' : 'No AI models have been registered in the governance catalog yet.'}
                      actionText={capabilities.canCreateModels ? 'Register First Model' : undefined}
                      onAction={() => setIsModalOpen(true)}
                    />
                  </td>
                </tr>
              ) : (
                models.map((model) => (
                  <tr key={model._id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13.5px' }}>
                        {model.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {model.purpose}
                      </div>
                    </td>
                    <td>
                      <RiskBadge level={model.riskLevel} />
                    </td>
                    <td>
                      <StatusBadge status={model.lifecycleStatus} />
                    </td>
                    <td>
                      {model.currentProductionVersionId ? (
                        <span
                          className="font-mono tnum"
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 600,
                            color: 'var(--success-text)',
                            backgroundColor: 'var(--success-bg)',
                            padding: '2px 7px',
                            borderRadius: 'var(--radius-xs)',
                            border: '1px solid var(--success-border)'
                          }}
                        >
                          {model.currentProductionVersionId.version}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>None (Pre-deployment)</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>{model.owner}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{model.team}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/app/models/${model._id}`} className="btn btn-secondary btn-sm">
                        View Details <ExternalLink size={12} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Model Modal */}
      {isModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={16} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Register AI Model & Risk Intake</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="btn-ghost"
                style={{ cursor: 'pointer', padding: '4px' }}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Model Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. CreditRisk Underwriting AI"
                      className="form-input"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Model Type *</label>
                    <select
                      className="form-select"
                      value={formData.modelType}
                      onChange={(e) => setFormData({ ...formData, modelType: e.target.value })}
                    >
                      <option value="CLASSIFICATION">Classification</option>
                      <option value="REGRESSION">Regression</option>
                      <option value="LLM_GENERATIVE">LLM / Generative AI</option>
                      <option value="RECOMMENDATION">Recommendation Engine</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Business Purpose & Domain *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Automated assessment of consumer lending applications"
                    className="form-input"
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">System Description</label>
                  <textarea
                    rows={2}
                    placeholder="Architectural overview, input feature considerations, and regulatory context..."
                    className="form-textarea"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Lead Engineer / Owner</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.owner}
                      onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Department / Team</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.team}
                      onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    EU AI Act & Regulatory Risk Assessment
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Risk Classification Tier</label>
                      <select
                        className="form-select"
                        value={formData.riskLevel}
                        onChange={(e) => setFormData({ ...formData, riskLevel: e.target.value })}
                      >
                        <option value="MINIMAL">Minimal / Low Risk</option>
                        <option value="LIMITED">Limited Risk (Transparency)</option>
                        <option value="HIGH">High Risk (Annex III Controls)</option>
                        <option value="UNACCEPTABLE">Unacceptable Risk (Prohibited)</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Protected Demographics</label>
                      <input
                        type="text"
                        placeholder="e.g. gender, age, ethnicity"
                        className="form-input"
                        value={formData.protectedAttributes}
                        onChange={(e) => setFormData({ ...formData, protectedAttributes: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={submitting}
                >
                  {submitting ? 'Registering...' : 'Complete Intake & Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
