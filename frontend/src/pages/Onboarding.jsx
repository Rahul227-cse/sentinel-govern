import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import {
  Shield,
  Brain,
  Scale,
  FileCheck2,
  Award,
  Users,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  ArrowRight,
  UserCheck,
  AlertCircle,
  Loader2
} from 'lucide-react';

const ROLES = [
  {
    id: 'ML_LEAD',
    title: 'Machine Learning Lead',
    badge: 'ML / Data Lead',
    icon: Brain,
    description: 'Registers models, manages lifecycle states, runs evaluations, and triggers rollbacks.',
    destination: 'Model Registry & Evaluation Studio',
    responsibilities: ['Model Registry', 'Version Control', 'Fairness Benchmark Tests', 'Incident Rollback']
  },
  {
    id: 'GOVERNANCE_OFFICER',
    title: 'AI Governance Officer',
    badge: 'Governance & Compliance',
    icon: Scale,
    description: 'Audits algorithmic fairness, enforces institutional governance policies, reviews evidence, and manages sign-offs.',
    destination: 'Fairness Studio, Policy Management & Approval Center',
    responsibilities: ['Governance & Policy Review', 'Fairness & Bias Audits', 'Compliance Gates', 'Evidence Sign-Off']
  },
  {
    id: 'EXECUTIVE_APPROVER',
    title: 'Executive Approver',
    badge: 'Executive Leadership',
    icon: Award,
    description: 'Provides final enterprise risk acceptance, executive sign-off for required high-risk decisions, and rollback authority.',
    destination: 'Executive Dashboard & Approval Center',
    responsibilities: ['Final Risk Acceptance', 'Executive Approval Sign-Off', 'Production Authorization', 'Incident Rollback']
  }
];

const DEPARTMENTS = [
  { id: 'AI / ML', label: 'AI / Machine Learning', desc: 'Core ML engineering, deep learning, LLM systems' },
  { id: 'Engineering', label: 'Software Engineering', desc: 'Platform services, backend infrastructure, client applications' },
  { id: 'Data Science', label: 'Data Science & Analytics', desc: 'Statistical modeling, data pipelines, business intelligence' },
  { id: 'Product', label: 'Product & Design', desc: 'Product strategy, AI feature definitions, user experience' },
  { id: 'Security', label: 'Security & InfoSec', desc: 'Application security, adversarial robustness, access control' },
  { id: 'Compliance', label: 'Regulatory Compliance', desc: 'EU AI Act, NIST AI RMF, ISO 42001, audit readiness' },
  { id: 'Legal', label: 'Legal & Regulatory', desc: 'Data privacy, IP protection, terms of service & ethics' },
  { id: 'Risk', label: 'Enterprise Risk Management', desc: 'Model risk governance, operational thresholds, financial impact' },
  { id: 'Operations', label: 'Business Operations', desc: 'Workflow execution, operational automation, service delivery' },
  { id: 'Finance', label: 'Finance & Lending', desc: 'Credit assessment, underwriting models, quantitative risk' },
  { id: 'Human Resources', label: 'People & HR', desc: 'Talent acquisition systems, employment screening AI' },
  { id: 'Other', label: 'Other Domain', desc: 'Specialized departmental initiatives or cross-functional team' }
];

const TEAMS = [
  { id: 'AI Platform', label: 'AI Platform', desc: 'Central infrastructure, model registry, inference engines' },
  { id: 'Machine Learning', label: 'Machine Learning Engineering', desc: 'Model training, fine-tuning, automated pipelines' },
  { id: 'Data Engineering', label: 'Data Engineering', desc: 'ETL pipelines, feature stores, data validation' },
  { id: 'Product AI', label: 'Product AI & Applied ML', desc: 'Direct customer-facing predictive features' },
  { id: 'Security Engineering', label: 'Security Engineering', desc: 'AI safety, vulnerability scanning, red teaming' },
  { id: 'Compliance', label: 'Compliance & Governance', desc: 'Audit dossiers, regulatory filings, policy checks' },
  { id: 'Risk Management', label: 'Risk Analytics', desc: 'Credit underwriting, bias monitoring, drift detection' },
  { id: 'Other', label: 'General / Cross-functional', desc: 'Autonomous squad or cross-department team' }
];

export default function Onboarding() {
  const { user, isAuthenticated, loading: authLoading, submitOnboarding, logout } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState(user?.role && user.role !== 'PLATFORM_ADMIN' ? user.role : 'ML_LEAD');
  const [selectedDept, setSelectedDept] = useState(user?.department || 'AI / ML');
  const [selectedTeam, setSelectedTeam] = useState(user?.team || 'AI Platform');
  const [customTeam, setCustomTeam] = useState('');
  const [teamLead, setTeamLead] = useState(user?.teamLead || '');
  const [noTeamLead, setNoTeamLead] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // If user is already verified and completed onboarding, redirect to application
  useEffect(() => {
    if (!authLoading && isAuthenticated && user?.onboardingCompleted && !showSuccessModal) {
      navigate(user.role === 'PLATFORM_ADMIN' ? '/admin/users' : '/app', { replace: true });
    }
  }, [authLoading, isAuthenticated, user, navigate, showSuccessModal]);

  const steps = [
    { num: 1, title: 'Role', subtitle: 'Governance identity' },
    { num: 2, title: 'Department', subtitle: 'Organizational unit' },
    { num: 3, title: 'Team', subtitle: 'Working squad' },
    { num: 4, title: 'Lead / Info', subtitle: 'Reporting context' },
    { num: 5, title: 'Workspace Ready', subtitle: 'Review & enter' }
  ];

  const handleNext = () => {
    setError('');
    if (step === 1 && !selectedRole) {
      setError('Please select a governance role to continue.');
      return;
    }
    if (step === 2 && !selectedDept) {
      setError('Please select your department.');
      return;
    }
    if (step === 3 && !selectedTeam) {
      setError('Please select your team.');
      return;
    }
    setStep(s => Math.min(s + 1, 5));
  };

  const handleBack = () => {
    setError('');
    setStep(s => Math.max(s - 1, 1));
  };

  const handleFinish = async () => {
    setError('');
    setSubmitting(true);
    try {
      const effectiveTeam = customTeam.trim() || selectedTeam;
      const payload = {
        role: selectedRole,
        department: selectedDept,
        team: effectiveTeam,
        teamLead: noTeamLead ? 'None (Independent Contributor)' : (teamLead.trim() || 'Not specified')
      };

      const res = await submitOnboarding(payload);
      if (res.success) {
        // Clear session so user must explicitly authenticate via Login
        try {
          await logout();
        } catch {
          // ignore
        }
        setShowSuccessModal(true);
      } else {
        setError(res.error || 'Failed to save onboarding settings.');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while saving your workspace settings.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedRoleObj = ROLES.find(r => r.id === selectedRole) || ROLES[0];

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--color-bg)',
      color: 'var(--color-text)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top Header */}
      <header style={{
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '14px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff'
          }}>
            <Shield size={16} strokeWidth={2.4} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--color-text)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>SENTINEL GOVERN</div>
            <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)', fontWeight: 500 }}>AI Governance Workspace Onboarding</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ThemeToggle />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              backgroundColor: 'var(--color-accent-subtle)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              border: '1px solid var(--color-accent-border)'
            }}>
              {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>{user?.name || user?.email}</div>
              <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>Workspace Setup</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div style={{ flex: 1, maxWidth: 980, width: '100%', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Progress Stepper Bar */}
        <div style={{
          backgroundColor: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          padding: '16px 20px',
          marginBottom: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          overflowX: 'auto'
        }}>
          {steps.map((st, i) => {
            const isCompleted = step > st.num;
            const isCurrent = step === st.num;
            return (
              <React.Fragment key={st.num}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    backgroundColor: isCompleted ? 'var(--color-success)' : isCurrent ? 'var(--color-accent-subtle)' : 'var(--color-surface-secondary)',
                    border: `1.5px solid ${isCompleted ? 'var(--color-success)' : isCurrent ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    color: isCompleted ? '#fff' : isCurrent ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11.5,
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                    {isCompleted ? <CheckCircle2 size={15} /> : st.num}
                  </div>
                  <div>
                    <div style={{
                      fontSize: 12,
                      fontWeight: isCurrent ? 700 : 600,
                      color: isCurrent ? 'var(--color-text)' : isCompleted ? 'var(--color-primary)' : 'var(--color-text-secondary)'
                    }}>
                      {st.title}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>{st.subtitle}</div>
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div style={{
                    flex: 1,
                    height: 1,
                    backgroundColor: step > st.num ? 'var(--color-primary)' : 'var(--color-border)',
                    margin: '0 12px',
                    minWidth: 16
                  }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            backgroundColor: 'var(--color-danger-bg)',
            border: '1px solid var(--color-danger-border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-danger-text)',
            fontSize: 12.5,
            marginBottom: 20
          }}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* ─── STEP 1: ROLE SELECTION ─── */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                Select Your Governance Role
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
                Each role establishes separation of duties across model development, fairness audits, policy gating, and release approvals.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {ROLES.map((r) => {
                const isSelected = selectedRole === r.id;
                const IconComponent = r.icon;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRole(r.id)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-lg)',
                      border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      backgroundColor: isSelected ? 'var(--color-accent-subtle)' : 'var(--color-surface)',
                      padding: '18px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all var(--transition-fast)',
                      boxShadow: 'var(--shadow-xs)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{
                          width: 34,
                          height: 34,
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: isSelected ? 'var(--color-surface)' : 'var(--color-surface-secondary)',
                          border: `1px solid ${isSelected ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)'
                        }}>
                          <IconComponent size={18} />
                        </div>
                        <span style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)',
                          backgroundColor: isSelected ? 'var(--color-surface)' : 'var(--color-surface-secondary)',
                          border: '1px solid var(--color-border)',
                          padding: '2px 7px',
                          borderRadius: 'var(--radius-xs)',
                          textTransform: 'uppercase'
                        }}>
                          {r.badge}
                        </span>
                      </div>

                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
                        {r.title}
                      </div>

                      <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>
                        {r.description}
                      </p>

                      <div style={{
                        fontSize: 11,
                        color: 'var(--color-text-muted)',
                        backgroundColor: isSelected ? 'var(--color-surface)' : 'var(--color-surface-secondary)',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--color-border)',
                        marginBottom: 12
                      }}>
                        <strong>Destination:</strong> {r.destination}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 5 }}>
                        Authorized Scope:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.responsibilities.map((resp) => (
                          <span
                            key={resp}
                            style={{
                              fontSize: 10.5,
                              padding: '2px 6px',
                              borderRadius: 'var(--radius-xs)',
                              backgroundColor: isSelected ? 'var(--color-surface)' : 'var(--color-surface-secondary)',
                              border: '1px solid var(--color-border)',
                              color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)'
                            }}
                          >
                            {resp}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── STEP 2: DEPARTMENT SELECTION ─── */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                Department Organization
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
                Select your functional department for model asset ownership and regulatory reporting.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {DEPARTMENTS.map((d) => {
                const isSelected = selectedDept === d.id;
                return (
                  <div
                    key={d.id}
                    onClick={() => setSelectedDept(d.id)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-md)',
                      border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      backgroundColor: isSelected ? 'var(--color-accent-subtle)' : 'var(--color-surface)',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      transition: 'all var(--transition-fast)'
                    }}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border-strong)'}`,
                      backgroundColor: isSelected ? 'var(--color-primary)' : 'var(--color-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                      flexShrink: 0
                    }}>
                      {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#fff' }} />}
                    </div>

                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>{d.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{d.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── STEP 3: TEAM SELECTION ─── */}
        {step === 3 && (
          <div>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                Team Assignment
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
                Select your functional squad within {selectedDept}.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {TEAMS.map((t) => {
                const isSelected = selectedTeam === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTeam(t.id)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-md)',
                      border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      backgroundColor: isSelected ? 'var(--color-accent-subtle)' : 'var(--color-surface)',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      transition: 'all var(--transition-fast)'
                    }}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border-strong)'}`,
                      backgroundColor: isSelected ? 'var(--color-primary)' : 'var(--color-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                      flexShrink: 0
                    }}>
                      {isSelected && <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#fff' }} />}
                    </div>

                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>{t.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{t.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Optional Custom Squad/Team Field */}
            <div style={{ marginTop: 18, padding: '14px 16px', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <label htmlFor="custom-team-input" style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--color-text)', marginBottom: 6 }}>
                Or specify custom team / squad name (Optional):
              </label>
              <input
                id="custom-team-input"
                type="text"
                placeholder="e.g. Fraud Analytics Squad, Core Risk ML"
                value={customTeam}
                onChange={(e) => setCustomTeam(e.target.value)}
                style={{
                  width: '100%',
                  fontSize: '13px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  color: 'var(--color-text)'
                }}
              />
            </div>
          </div>
        )}

        {/* ─── STEP 4: TEAM LEAD & ORG INFO ─── */}
        {step === 4 && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                Escalation & Reporting Context
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
                Specify your team lead or reporting manager for governance notifications and incident escalations.
              </p>
            </div>

            <div style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', padding: 22, marginBottom: 18 }}>
              <label htmlFor="team-lead" className="form-label" style={{ marginBottom: 6 }}>
                Team Lead / Reporting Manager
              </label>

              <input
                id="team-lead"
                type="text"
                disabled={noTeamLead}
                value={teamLead}
                onChange={(e) => setTeamLead(e.target.value)}
                placeholder="e.g. Dr. Jane Smith or lead@enterprise.com"
                className="form-input"
                style={{
                  width: '100%',
                  backgroundColor: noTeamLead ? 'var(--color-surface-secondary)' : undefined,
                  marginBottom: 14
                }}
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={noTeamLead}
                  onChange={(e) => {
                    setNoTeamLead(e.target.checked);
                    if (e.target.checked) setTeamLead('');
                  }}
                  style={{ width: 15, height: 15, accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                  I do not have a team lead (Independent / Lead role)
                </span>
              </label>
            </div>

            <div className="reg-notice">
              <Shield size={16} color="var(--color-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                Sentinel Govern utilizes organizational hierarchy strictly for model risk escalation and compliance sign-off routing. Role assignments are verified by Platform Administrators.
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 5: FINAL REVIEW & ENTER ─── */}
        {step === 5 && (
          <div style={{ maxWidth: 640 }}>
            <div style={{ marginBottom: 22 }}>
              <span className="badge badge-info" style={{ marginBottom: 8 }}>
                Workspace Ready
              </span>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em', marginBottom: 4 }}>
                Review and finalize workspace profile.
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
                Verify your governance identity and role assignment below before entering.
              </p>
            </div>

            {/* Profile Summary Card */}
            <div style={{
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-border)',
              padding: 22,
              boxShadow: 'var(--shadow-sm)',
              marginBottom: 20
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16, borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Identity</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)' }}>{user?.name || user?.email}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{user?.email}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Governance Role</div>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-primary)', backgroundColor: 'var(--color-accent-subtle)', padding: '2px 8px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--color-accent-border)', display: 'inline-block' }}>
                    {selectedRoleObj.title}
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16, borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Department</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)' }}>{selectedDept}</div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Team</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)' }}>{customTeam.trim() || selectedTeam}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Team Lead</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)' }}>
                    {noTeamLead ? 'None (Independent)' : (teamLead.trim() || 'Not specified')}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Verification</div>
                  <span className="badge badge-warning">
                    <Clock size={11} /> Pending Review
                  </span>
                </div>
              </div>
            </div>

            {/* Read-only access notice */}
            <div style={{ backgroundColor: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24 }}>
              <UserCheck size={16} color="var(--color-primary)" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--color-text)' }}>Read-Only Exploration:</strong> You have full visibility into the model registry, evaluation results, and policy library. Governance actions (model creation, policy sign-offs) activate upon Administrator account verification.
              </div>
            </div>
          </div>
        )}

        {/* Bottom Navigation Buttons */}
        <div style={{
          marginTop: 'auto',
          paddingTop: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--color-border)'
        }}>
          {step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              disabled={submitting}
              className="btn btn-secondary"
            >
              <ChevronLeft size={15} /> Back
            </button>
          ) : <div />}

          {step < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              className="btn btn-primary"
            >
              Continue <ChevronRight size={15} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={submitting}
              className="btn btn-primary"
              style={{ padding: '10px 24px', fontSize: 14 }}
            >
              {submitting ? (
                <>
                  <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  Saving Profile…
                </>
              ) : (
                <>
                  Complete Setup <ArrowRight size={15} />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Account Created Successfully Confirmation Modal */}
      {showSuccessModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 440, textAlign: 'center', padding: '32px 28px' }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              backgroundColor: 'var(--color-success-bg)',
              color: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px',
              border: '2px solid var(--color-success-border)'
            }}>
              <CheckCircle2 size={26} />
            </div>

            <h3 style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-text)', marginBottom: 8, letterSpacing: '-0.02em' }}>
              Account profile configured
            </h3>

            <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
              Your workspace profile has been established. Please sign in to enter your assigned role control plane.
            </p>

            <button
              onClick={() => navigate('/login', { replace: true })}
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px 18px', fontSize: 14 }}
            >
              Sign In to Sentinel Govern →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
