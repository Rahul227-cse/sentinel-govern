import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import {
  Shield,
  CheckCircle2,
  ArrowRight,
  Menu,
  X
} from 'lucide-react';

// ─── Lifecycle Simulation Data ───────────────────────────────────────────────

const GOVERNANCE_STAGES = [
  {
    id: 'registration',
    step: '01',
    label: 'Model Registration',
    role: 'ML Lead',
    summary: 'Asset registered with ownership and risk classification',
    metric: 'High Risk (Tier 2)',
    status: 'COMPLETED',
    evidence: {
      modelName: 'Enterprise Credit Scoring v2.4.0',
      framework: 'PyTorch / XGBoost Ensemble',
      riskTier: 'HIGH',
      intendedUse: 'Consumer lending creditworthiness assessment',
      owner: 'ml-lead@sentinel.govern'
    }
  },
  {
    id: 'evaluation',
    step: '02',
    label: 'Fairness & Evaluation',
    role: 'Governance Officer',
    summary: 'Disparate impact & performance benchmark verification',
    metric: 'DI Ratio 0.88 (>= 0.80)',
    status: 'COMPLETED',
    evidence: {
      accuracy: '94.2%',
      disparateImpactRatio: '0.884',
      demographicParityDiff: '0.041',
      protectedAttributes: ['Gender', 'Age Group', 'Ethnicity'],
      evalDataset: 'holdout_eval_2026_q1.csv (120k records)'
    }
  },
  {
    id: 'policy_gate',
    step: '03',
    label: 'Policy Gate Check',
    role: 'Governance Officer',
    summary: 'Automated evaluation against EU AI Act & NIST RMF gates',
    metric: '3/3 Policies Met',
    status: 'COMPLETED',
    evidence: {
      policySet: 'EU AI Act Annex III + NIST AI RMF',
      minAccuracyRule: 'PASSED (94.2% >= 90.0%)',
      fairnessGateRule: 'PASSED (0.884 >= 0.800)',
      dataProvenanceRule: 'VERIFIED & CATALOGED'
    }
  },
  {
    id: 'approvals',
    step: '04',
    label: 'Stakeholder Approvals',
    role: 'Multi-party Sign-off',
    summary: 'Cryptographically sealed multi-stakeholder consent',
    metric: '4/4 Signatures Verified',
    status: 'COMPLETED',
    evidence: {
      mlLeadSign: 'SIGNED (ml-lead@sentinel.govern)',
      governanceOfficerSign: 'SIGNED (governance@sentinel.govern)',
      executiveSign: 'SIGNED (vp-risk@sentinel.govern)'
    }
  },
  {
    id: 'production',
    step: '05',
    label: 'Production Serving',
    role: 'Platform Ops',
    summary: 'Authorized deployment with runtime drift monitoring',
    metric: 'Active (v2.4.0)',
    status: 'ACTIVE',
    evidence: {
      trafficAllocation: '100% In-Fleet Inference',
      latencyP99: '28ms',
      baselineReference: 'reference_baseline_v2.4.json',
      driftAlertsConfigured: 'PSI threshold > 0.10'
    }
  },
  {
    id: 'monitoring',
    step: '06',
    label: 'Runtime Telemetry & Audit',
    role: 'Continuous Surveillance',
    summary: 'Live PSI calculation and immutable SHA-256 audit ledger',
    metric: 'PSI 0.042 (Stable)',
    status: 'MONITORING',
    evidence: {
      currentPsi: '0.042 (Stable)',
      incidentsActive: '0 Active Incidents',
      lastLedgerBlock: '#1,489 (SHA-256 Sealed)',
      ledgerStatus: 'Tamper-Evident Integrity Verified'
    }
  }
];

// ─── Real Sentinel Govern Product Modules for Mockup Showcase ─────────────────────────

const PRODUCT_MODULES = [
  {
    id: 'registry',
    title: 'Model Registry & Inventory',
    tag: 'Asset Governance',
    subtitle: 'Institutional catalog of all ML models, risk tiers, and lifecycle states.',
    description: 'Every AI system is cataloged with strict metadata: business initiative ownership, operational domain, framework versions, and regulatory risk tier (Minimal, Limited, High, Unacceptable). Unregistered models cannot enter production pipelines.',
    uiSnippet: {
      title: 'Credit Decisioning Engine v2.4.0',
      badge: 'High Risk',
      badgeVariant: 'warning',
      state: 'In Production',
      metrics: [
        { label: 'Risk Classification', value: 'High (EU AI Act)' },
        { label: 'Primary Owner', value: 'Quantitative Risk Squad' },
        { label: 'Active Deployment', value: 'v2.4.0 (Deployed Mar 2026)' },
        { label: 'Governance Dossier', value: 'Dossier #SNT-8821' }
      ]
    }
  },
  {
    id: 'fairness',
    title: 'Fairness Studio & Benchmarks',
    tag: 'Algorithmic Verification',
    subtitle: 'Objective measurement of demographic disparity and benchmark conformity.',
    description: 'Empower AI Governance Officers to audit models for demographic bias before promotion. Ingest benchmark evaluation results via CSV or live test suites to verify Disparate Impact Ratios and Demographic Parity across sensitive groups.',
    uiSnippet: {
      title: 'Fairness Benchmark Suite — Subgroup Audit',
      badge: 'Benchmark Passed',
      badgeVariant: 'success',
      state: 'Evaluated',
      metrics: [
        { label: 'Disparate Impact Ratio', value: '0.884 (Threshold >= 0.80)' },
        { label: 'Demographic Parity Delta', value: '0.041 (Threshold <= 0.10)' },
        { label: 'Protected Attributes Audited', value: 'Age, Gender, Geography' },
        { label: 'Benchmark Status', value: 'Conformity Validated' }
      ]
    }
  },
  {
    id: 'policies',
    title: 'Deterministic Policy Gates',
    tag: 'Pre-Deployment Gating',
    subtitle: 'Automated policy enforcement that blocks non-compliant lifecycle transitions.',
    description: 'Configure institutional policies adhering to NIST AI RMF and EU AI Act requirements. If a model fails fairness thresholds or minimum accuracy criteria, Sentinel Govern policy gates deterministically halt deployment.',
    uiSnippet: {
      title: 'Institutional Lending Governance Policy v3.1',
      badge: 'Enforcing',
      badgeVariant: 'info',
      state: 'Active Policy',
      metrics: [
        { label: 'Minimum F1-Score Rule', value: '0.920 Required (Actual: 0.942)' },
        { label: 'Disparate Impact Rule', value: 'Min 0.800 (Actual: 0.884)' },
        { label: 'Mandatory Reviewers', value: 'ML Lead, Ethics, Compliance' },
        { label: 'Bypass Override', value: 'Strictly Prohibited' }
      ]
    }
  },
  {
    id: 'approvals',
    title: 'Multi-Party Approval Center',
    tag: 'Separation of Duties',
    subtitle: 'Independent sign-offs across engineering, governance, and executive leadership.',
    description: 'Eliminate single-party deployment risks. Production release requires independent authorization from ML Leads, Governance Officers, and Executive Approvers. No stakeholder can approve on behalf of another.',
    uiSnippet: {
      title: 'Promotion Request: Model v2.4.0 -> Production',
      badge: '3/3 Approved',
      badgeVariant: 'success',
      state: 'Authorized for Release',
      metrics: [
        { label: 'ML Engineering Sign-off', value: 'ml-lead@sentinel.govern' },
        { label: 'Governance Officer Sign-off', value: 'governance@sentinel.govern' },
        { label: 'Executive Approver Consent', value: 'vp-risk@sentinel.govern' }
      ]
    }
  },
  {
    id: 'monitoring',
    title: 'Runtime Telemetry & Observability',
    tag: 'Inference Surveillance',
    subtitle: 'Continuous statistical drift tracking via Evidently 0.7.23 and automatic incident triggers.',
    description: 'Monitor production feature distributions in real time. When statistical drift is detected by Evidently 0.7.23, Sentinel Govern automatically records a governance incident and routes recommended remediations to designated stakeholders.',
    uiSnippet: {
      title: 'Evidently Statistical Drift Monitor — Fleet Stream',
      badge: 'Statistical Tolerance Met',
      badgeVariant: 'success',
      state: 'Continuous Feed',
      metrics: [
        { label: 'Drift Hypothesis Test', value: 'Passed (α = 0.05)' },
        { label: 'Avg Latency', value: '28.4ms' },
        { label: 'Monitored Inferences', value: '4.2M inferences / 24h' },
        { label: 'Statistical Engine', value: 'Evidently 0.7.23' }
      ]
    }
  },
  {
    id: 'audit',
    title: 'Cryptographic SHA-256 Audit Trail',
    tag: 'Tamper-Evident Records',
    subtitle: 'Append-only hash-chained ledger verifying every governance event.',
    description: 'Every model registration, evaluation metric, policy evaluation, and stakeholder sign-off is hashed and chained into an append-only ledger. Tampering breaks the cryptographic sequence and is immediately flagged.',
    uiSnippet: {
      title: 'Cryptographic Audit Block #1489',
      badge: 'Chain Intact',
      badgeVariant: 'info',
      state: 'Cryptographically Sealed',
      metrics: [
        { label: 'Block Hash', value: '7f9a...3c21 (SHA-256)' },
        { label: 'Parent Block Hash', value: '88de...0b44 (SHA-256)' },
        { label: 'Actor & Signature', value: 'vp-risk@sentinel.govern' },
        { label: 'Ledger Verification', value: 'Verified 1,489/1,489 Blocks' }
      ]
    }
  }
];

// ─── Main Landing Page Component ─────────────────────────────────────────────

export default function Landing() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [selectedStage, setSelectedStage] = useState(GOVERNANCE_STAGES[0]);
  const [activeModuleTab, setActiveModuleTab] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroRef = useRef(null);

  // Redirect authenticated active users straight to their workspace
  useEffect(() => {
    if (isAuthenticated && user && user.status === 'ACTIVE') {
      navigate(user.role === 'PLATFORM_ADMIN' ? '/admin/users' : '/app', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Subtle mouse move parallax effect for hero visual
  const handleMouseMove = (e) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 8; // Max 4px tilt
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 8;
    setMousePos({ x, y });
  };

  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  return (
    <div className="sentinel-landing-root" style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {/* ── 1. Enterprise Top Navigation ── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 90,
          backgroundColor: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          transition: 'background-color var(--transition-normal), border-color var(--transition-normal)'
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 28px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo / Brand */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
            <div style={{
              width: 30,
              height: 30,
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff'
            }}>
              <Shield size={17} strokeWidth={2.4} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)', lineHeight: 1.1 }}>
                SENTINEL GOVERN
              </span>
              <span style={{ fontSize: 9.5, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                AI Governance & Lifecycle Platform
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="landing-desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <a href="#architecture" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textDecoration: 'none', transition: 'color var(--transition-fast)' }}>
              Architecture
            </a>
            <a href="#lifecycle" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textDecoration: 'none', transition: 'color var(--transition-fast)' }}>
              Governance Pipeline
            </a>
            <a href="#modules" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textDecoration: 'none', transition: 'color var(--transition-fast)' }}>
              Product Modules
            </a>
            <a href="#access-matrix" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textDecoration: 'none', transition: 'color var(--transition-fast)' }}>
              Separation of Duties
            </a>
            <a href="#security" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)', textDecoration: 'none', transition: 'color var(--transition-fast)' }}>
              Security & Audit
            </a>
          </nav>

          {/* Right Actions: Theme Toggle & Auth Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ThemeToggle />

            <Link
              to="/login"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12.5 }}
            >
              Sign In
            </Link>

            <Link
              to="/signup"
              className="btn btn-primary btn-sm"
              style={{ fontSize: 12.5 }}
            >
              Get Started <ArrowRight size={13} />
            </Link>

            {/* Mobile menu trigger */}
            <button
              type="button"
              className="landing-mobile-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              style={{
                display: 'none',
                background: 'none',
                border: 'none',
                color: 'var(--color-text)',
                cursor: 'pointer',
                padding: 4
              }}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu drop */}
        {mobileMenuOpen && (
          <div style={{
            padding: '16px 28px',
            backgroundColor: 'var(--color-surface)',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <a href="#architecture" onClick={() => setMobileMenuOpen(false)} style={{ fontSize: 13.5, color: 'var(--color-text)', textDecoration: 'none' }}>Architecture</a>
            <a href="#lifecycle" onClick={() => setMobileMenuOpen(false)} style={{ fontSize: 13.5, color: 'var(--color-text)', textDecoration: 'none' }}>Governance Pipeline</a>
            <a href="#modules" onClick={() => setMobileMenuOpen(false)} style={{ fontSize: 13.5, color: 'var(--color-text)', textDecoration: 'none' }}>Product Modules</a>
            <a href="#access-matrix" onClick={() => setMobileMenuOpen(false)} style={{ fontSize: 13.5, color: 'var(--color-text)', textDecoration: 'none' }}>Separation of Duties</a>
            <a href="#security" onClick={() => setMobileMenuOpen(false)} style={{ fontSize: 13.5, color: 'var(--color-text)', textDecoration: 'none' }}>Security & Audit</a>
          </div>
        )}
      </header>

      {/* ── 2. Hero Section ── */}
      <section
        ref={heroRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          padding: '72px 28px 80px',
          maxWidth: 1280,
          margin: '0 auto',
          position: 'relative'
        }}
      >
        <div style={{ maxWidth: 840, margin: '0 auto', textAlign: 'center', marginBottom: 48 }}>
          {/* Calm Institutional Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-full)',
            padding: '4px 14px',
            marginBottom: 20,
            boxShadow: 'var(--shadow-xs)'
          }}>
            <span className="status-dot healthy pulse" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '0.02em' }}>
              Institutional AI Lifecycle Governance Plane
            </span>
          </div>

          {/* Hero Headline */}
          <h1 style={{
            fontSize: 'clamp(38px, 4.8vw, 62px)',
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.035em',
            color: 'var(--color-text)',
            marginBottom: 20
          }}>
            Govern AI from model development to production.
          </h1>

          {/* Subheading */}
          <p style={{
            fontSize: 'clamp(16px, 1.8vw, 18px)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
            maxWidth: 680,
            margin: '0 auto 32px'
          }}>
            Sentinel Govern provides enterprise organizations with a unified control layer for model evaluation, deterministic policy enforcement, multi-stakeholder approvals, runtime telemetry, and cryptographically chained auditability.
          </p>

          {/* Action CTAs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/signup" className="btn btn-primary btn-lg" style={{ minWidth: 160 }}>
              Get Started <ArrowRight size={15} />
            </Link>
            <a href="#lifecycle" className="btn btn-secondary btn-lg" style={{ minWidth: 160 }}>
              Explore Lifecycle Pipeline
            </a>
          </div>

          {/* Credibility Anchors (Principles, No Fake Numbers) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 28,
            marginTop: 36,
            flexWrap: 'wrap',
            fontSize: 12.5,
            color: 'var(--color-text-muted)'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} color="var(--color-success)" />
              Strict Separation of Duties
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} color="var(--color-success)" />
              Deterministic Policy Gating
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} color="var(--color-success)" />
              SHA-256 Tamper-Evident Ledger
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} color="var(--color-success)" />
              Zero Production Bypasses
            </span>
          </div>
        </div>

        {/* ── Hero Visual: Interactive Governance Lifecycle Simulation ── */}
        <div
          id="lifecycle"
          style={{
            transform: `perspective(1000px) rotateX(${-mousePos.y * 0.4}deg) rotateY(${mousePos.x * 0.4}deg)`,
            transition: 'transform 300ms ease-out',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg)',
            padding: '28px 24px',
            marginTop: 20
          }}
        >
          {/* Header of Visual */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 18,
            borderBottom: '1px solid var(--color-border-subtle)',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-primary)' }}>
                Interactive Control Plane Simulation
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', marginTop: 2 }}>
                Model Lifecycle: Registration to Continuous Inference
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge badge-info">
                Active Simulation
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Click any stage to inspect evidence
              </span>
            </div>
          </div>

          {/* Stepper Pipeline Stage Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 10,
            marginBottom: 24
          }}>
            {GOVERNANCE_STAGES.map((stg) => {
              const isSelected = selectedStage.id === stg.id;
              return (
                <div
                  key={stg.id}
                  onClick={() => setSelectedStage(stg)}
                  style={{
                    backgroundColor: isSelected ? 'var(--color-surface-elevated)' : 'var(--color-surface-secondary)',
                    border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 12px',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    position: 'relative',
                    boxShadow: isSelected ? '0 0 0 1px var(--color-primary), var(--shadow-sm)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)', letterSpacing: '0.04em' }}>
                      STAGE {stg.step}
                    </span>
                    <span className="status-dot healthy" />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
                    {stg.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                    {stg.role}
                  </div>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                    backgroundColor: 'var(--color-surface)',
                    padding: '3px 6px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--color-border)',
                    display: 'inline-block',
                    fontFamily: 'JetBrains Mono, monospace'
                  }}>
                    {stg.metric}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Stage Detail Evidence Panel */}
          <div style={{
            backgroundColor: 'var(--color-surface-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 22px'
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
                    Stage {selectedStage.step}: {selectedStage.label}
                  </span>
                  <span className="badge badge-success">
                    Verified Gate
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {selectedStage.summary}
                </p>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                Enforced by: {selectedStage.role}
              </div>
            </div>

            {/* Evidence Key-Value Matrix */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 12,
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '16px'
            }}>
              {Object.entries(selectedStage.evidence).map(([key, val]) => (
                <div key={key}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)', marginTop: 2, fontFamily: Array.isArray(val) || val.includes('SHA') || val.includes('%') ? 'JetBrains Mono, monospace' : 'inherit' }}>
                    {Array.isArray(val) ? val.join(', ') : val}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Editorial Section: The Executive Reality / Problem Statement ── */}
      <section
        id="architecture"
        style={{
          borderTop: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          padding: '80px 28px'
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 48,
            alignItems: 'flex-start'
          }}>
            {/* Left Column: Editorial Statement */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: 12 }}>
                The Enterprise Governance Challenge
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 3.2vw, 42px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, color: 'var(--color-text)', marginBottom: 20 }}>
                AI adoption without deterministic controls creates systemic liability.
              </h2>
              <p style={{ fontSize: 15, color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: 20 }}>
                Enterprise organizations are integrating complex machine learning models into credit decisions, hiring pipelines, fraud detection, and regulatory processes.
              </p>
              <p style={{ fontSize: 14.5, color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
                Without a dedicated governance control plane, organizations face silent production drift, non-compliant demographic bias, single-party promotion shortcuts, and fragmented audit records that cannot withstand regulatory inspection.
              </p>
            </div>

            {/* Right Column: 4 Real Failure Modes Sentinel Govern Solves */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[
                {
                  code: '01',
                  title: 'Silent Distribution Drift',
                  desc: 'Production input distributions shift away from training baselines. Without continuous PSI telemetry, degraded accuracy occurs silently.'
                },
                {
                  code: '02',
                  title: 'Demographic Bias & Regulatory Fines',
                  desc: 'EU AI Act and NIST AI RMF require quantitative verification of disparate impact before deployment. Unaudited models expose firms to substantial legal risk.'
                },
                {
                  code: '03',
                  title: 'Single-Party Promotion Shortcuts',
                  desc: 'Data scientists deploying directly from notebooks bypass ethics and compliance review. Governance requires strict separation of duties.'
                },
                {
                  code: '04',
                  title: 'Unverifiable Audit Histories',
                  desc: 'Scattered logs and informal tickets fail regulatory audits. Institutional compliance mandates append-only, cryptographically verifiable event chains.'
                }
              ].map((item) => (
                <div
                  key={item.code}
                  style={{
                    backgroundColor: 'var(--color-surface-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px 20px',
                    display: 'flex',
                    gap: 16
                  }}
                >
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: 'var(--color-primary)',
                    flexShrink: 0,
                    paddingTop: 2
                  }}>
                    {item.code}
                  </span>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
                      {item.title}
                    </h3>
                    <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Control Plane Architecture Layer ── */}
      <section style={{ padding: '80px 28px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 48px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: 10 }}>
            Unified Architectural Layer
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--color-text)', marginBottom: 14 }}>
            The governance bridge between ML engineering and executive oversight.
          </h2>
          <p style={{ fontSize: 14.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Sentinel Govern sits between your model training pipelines and production inference endpoints, enforcing institutional policy without disrupting developer velocity.
          </p>
        </div>

        {/* 3-Tier Layer Diagram */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 960, margin: '0 auto' }}>
          {/* Tier 1: Stakeholder Identities */}
          <div style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 24px'
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 12 }}>
              Layer 1: Enterprise Stakeholder Personas & Separation of Duties
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {[
                { role: 'ML Engineering Lead', focus: 'Model registration & version promotion' },
                { role: 'AI Governance Officer', focus: 'Fairness benchmarks & policy enforcement' },
                { role: 'Executive Approver', focus: 'Enterprise risk sign-off & release authorization' },
                { role: 'Platform Administrator', focus: 'User access control & audit integrity' }
              ].map((r) => (
                <div key={r.role} style={{ backgroundColor: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)' }}>{r.role}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{r.focus}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tier 2: Sentinel Govern Control Plane (The Core) */}
          <div style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            boxShadow: 'var(--shadow-md)',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={18} color="var(--color-primary)" />
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                  Sentinel Govern Institutional Control Engine
                </span>
              </div>
              <span className="badge badge-info" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5 }}>
                CORE CONTROL PLANE
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {[
                { title: 'Deterministic Policy Gates', desc: 'Pre-deployment pass/block condition engine' },
                { title: 'Fairness Benchmark Suite', desc: 'Disparate impact & parity calculations' },
                { title: 'Multi-Party Sign-Off Matrix', desc: 'Strict separation of duty signature collection' },
                { title: 'SHA-256 Chained Ledger', desc: 'Append-only cryptographic event verification' }
              ].map((f) => (
                <div key={f.title} style={{ backgroundColor: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-primary)', display: 'inline-block', flexShrink: 0 }} />
                    {f.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, lineHeight: 1.45 }}>{f.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Tier 3: Production & Telemetry */}
          <div style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: '18px 24px'
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 12 }}>
              Layer 3: Operational Production Fleet & Telemetry Ingestion
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              {[
                { sys: 'Inference Serving Fleet', desc: 'Zero unapproved container releases' },
                { sys: 'PSI Drift Surveillance', desc: 'Continuous input feature stability analysis' },
                { sys: 'Automated Incidents', desc: 'Instant stakeholder alerts upon threshold breach' },
                { sys: 'Regulatory Dossiers', desc: 'Exportable EU AI Act compliance evidence' }
              ].map((s) => (
                <div key={s.sys} style={{ backgroundColor: 'var(--color-surface-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)' }}>{s.sys}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Product Deep-Dives: Real Sentinel Govern UI Mockups ── */}
      <section
        id="modules"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          padding: '80px 28px'
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 40px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: 10 }}>
              Real Platform Modules
            </div>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--color-text)', marginBottom: 14 }}>
              Designed for real enterprise workflows.
            </h2>
            <p style={{ fontSize: 14.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              Sentinel Govern is production-grade software engineered for ML teams, governance officers, and executive approvers. Inspect each module interface below.
            </p>
          </div>

          {/* Module Selector Navigation Tabs */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 32
          }}>
            {PRODUCT_MODULES.map((mod, idx) => {
              const isActive = activeModuleTab === idx;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setActiveModuleTab(idx)}
                  className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 12.5, padding: '6px 14px' }}
                >
                  {mod.title}
                </button>
              );
            })}
          </div>

          {/* Active Module Showcase Card */}
          {(() => {
            const current = PRODUCT_MODULES[activeModuleTab];
            return (
              <div style={{
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-md)',
                overflow: 'hidden',
                maxWidth: 1080,
                margin: '0 auto'
              }}>
                {/* Mockup Frame Header */}
                <div style={{
                  height: 42,
                  backgroundColor: 'var(--color-surface-secondary)',
                  borderBottom: '1px solid var(--color-border)',
                  padding: '0 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--color-border-strong)' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--color-border-strong)' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: 'var(--color-border-strong)' }} />
                    <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginLeft: 10, fontFamily: 'JetBrains Mono, monospace' }}>
                      sentinel-govern / {current.id}
                    </span>
                  </div>
                  <span className="badge badge-info" style={{ fontSize: 11 }}>
                    {current.tag}
                  </span>
                </div>

                {/* Mockup Body Content */}
                <div style={{ padding: '32px 28px' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 36,
                    alignItems: 'flex-start'
                  }}>
                    {/* Left: Module Narrative */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-primary)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
                        {current.subtitle}
                      </div>
                      <h3 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em', marginBottom: 14 }}>
                        {current.title}
                      </h3>
                      <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: 24 }}>
                        {current.description}
                      </p>
                      <Link to="/signup" className="btn btn-secondary btn-sm">
                        Experience in Workspace <ArrowRight size={13} />
                      </Link>
                    </div>

                    {/* Right: Realistic Application Component UI */}
                    <div style={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '22px',
                      boxShadow: 'var(--shadow-sm)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text)' }}>
                            {current.uiSnippet.title}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
                            State: <strong style={{ color: 'var(--color-text)' }}>{current.uiSnippet.state}</strong>
                          </div>
                        </div>
                        <span className={`badge badge-${current.uiSnippet.badgeVariant}`}>
                          {current.uiSnippet.badge}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                        {current.uiSnippet.metrics.map((m) => (
                          <div
                            key={m.label}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 10px',
                              backgroundColor: 'var(--color-surface-secondary)',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--color-border-subtle)'
                            }}
                          >
                            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                              {m.label}
                            </span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)', fontFamily: 'JetBrains Mono, monospace' }}>
                              {m.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* ── 6. Access Control & Separation of Duties Matrix ── */}
      <section
        id="access-matrix"
        style={{
          padding: '80px 28px',
          maxWidth: 1280,
          margin: '0 auto'
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 40px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: 10 }}>
            Role-Based Authorization Architecture
          </div>
          <h2 style={{ fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--color-text)', marginBottom: 14 }}>
            Strict separation of duties. No single point of failure.
          </h2>
          <p style={{ fontSize: 14.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            In high-stakes enterprise governance, Platform Administrators cannot sign off on ethical audits, and ML Leads cannot approve their own models. Roles are enforced at the API route level.
          </p>
        </div>

        {/* Access Matrix Table */}
        <div className="table-container" style={{ maxWidth: 1080, margin: '0 auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Role Persona</th>
                <th style={{ width: '28%' }}>Primary Responsibility</th>
                <th style={{ width: '32%' }}>Authorized Governance Actions</th>
                <th style={{ width: '18%' }}>Restricted Operations</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  role: 'Platform Administrator',
                  responsibility: 'User verification, access control, audit verification & security integrity',
                  actions: 'Verify users, manage platform credentials, verify cryptographic audit chains',
                  restricted: 'Domain policy sign-offs'
                },
                {
                  role: 'Machine Learning Lead',
                  responsibility: 'Model development, version registration, evaluation submission & monitoring review',
                  actions: 'Register models, create versions, upload evaluations, trigger authorized rollbacks',
                  restricted: 'Governance / Exec sign-offs'
                },
                {
                  role: 'AI Governance Officer',
                  responsibility: 'Fairness audits, policy compliance gates & evidence review',
                  actions: 'Inspect fairness benchmarks, manage policies (EU AI Act/NIST), approve or reject',
                  restricted: 'Direct model deployment'
                },
                {
                  role: 'Executive Approver',
                  responsibility: 'Enterprise risk acceptance & executive production authorization',
                  actions: 'Review high-risk systems, grant final production release authorization',
                  restricted: 'Direct technical changes'
                }
              ].map((row) => (
                <tr key={row.role}>
                  <td>
                    <strong style={{ color: 'var(--color-text)', fontSize: 13 }}>{row.role}</strong>
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: 12.5 }}>
                    {row.responsibility}
                  </td>
                  <td style={{ color: 'var(--color-text)', fontSize: 12.5 }}>
                    {row.actions}
                  </td>
                  <td>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--color-danger-text)',
                      backgroundColor: 'var(--color-danger-bg)',
                      border: '1px solid var(--color-danger-border)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-xs)',
                      display: 'inline-block'
                    }}>
                      {row.restricted}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 7. Institutional Security & Tamper-Evident Ledger ── */}
      <section
        id="security"
        style={{
          borderTop: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          padding: '80px 28px'
        }}
      >
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 48,
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: 12 }}>
                Institutional Security
              </div>
              <h2 style={{ fontSize: 'clamp(26px, 3vw, 38px)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--color-text)', marginBottom: 16 }}>
                Security engineered into every governance primitive.
              </h2>
              <p style={{ fontSize: 14.5, color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: 24 }}>
                Sentinel Govern avoids surface-level marketing claims. Our credibility is grounded in cryptographic integrity, strict authentication boundaries, and tamper-resistant software architecture.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Short-lived JWT access tokens with rotating, revocable HttpOnly cookies',
                  'Bcrypt salt hashing (work factor 10) for native authentication credentials',
                  'Cryptographic SHA-256 audit chaining: every event references the hash of its predecessor',
                  'Role authorization verified by backend middleware on every state mutation',
                  'Automated rate limiting and helmet security headers applied across all endpoints'
                ].map((sec) => (
                  <div key={sec} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <CheckCircle2 size={16} color="var(--color-success)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{sec}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cryptographic Ledger Code / Structure Demonstration */}
            <div style={{
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              color: 'var(--color-text)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
                <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>SHA-256 LEDGER BLOCK #1489</span>
                <span className="badge badge-success" style={{ fontSize: 10.5 }}>INTEGRITY: OK</span>
              </div>
              <div style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}>// Cryptographically sealed block header</div>
              <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--color-text-muted)' }}>blockId:</span> "blk_99a4c102"</div>
              <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--color-text-muted)' }}>timestamp:</span> "2026-10-07T18:30:14.281Z"</div>
              <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--color-text-muted)' }}>eventType:</span> "POLICY_GATE_PASSED"</div>
              <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--color-text-muted)' }}>actorId:</span> "compliance_officer_01"</div>
              <div style={{ marginBottom: 4 }}><span style={{ color: 'var(--color-text-muted)' }}>parentHash:</span> "88de0b44fe9231...7a01"</div>
              <div style={{ marginBottom: 14 }}><span style={{ color: 'var(--color-text-muted)' }}>currentHash:</span> <span style={{ color: 'var(--color-primary)' }}>"7f9a3c21bd09e8...bb49"</span></div>
              <div style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                fontSize: 11,
                color: 'var(--color-text-secondary)',
                lineHeight: 1.5
              }}>
                If any historical block payload is modified, the cryptographic hash verification fails across all subsequent blocks in the chain.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. Final Call to Action ── */}
      <section style={{ padding: '96px 28px', textAlign: 'center', maxWidth: 840, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--color-text)', marginBottom: 16 }}>
          Bring governance into your AI lifecycle.
        </h2>
        <p style={{ fontSize: 16, color: 'var(--color-text-secondary)', lineHeight: 1.6, maxWidth: 580, margin: '0 auto 36px' }}>
          Protect your organization from unverified deployments, silent drift, and compliance violations with the Sentinel Govern control plane.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/signup" className="btn btn-primary btn-lg" style={{ minWidth: 160 }}>
            Get Started <ArrowRight size={15} />
          </Link>
          <Link to="/login" className="btn btn-secondary btn-lg" style={{ minWidth: 160 }}>
            Sign In to Workspace
          </Link>
        </div>
      </section>

      {/* ── 9. Institutional Enterprise Footer ── */}
      <footer style={{
        backgroundColor: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        padding: '56px 28px 36px'
      }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 40,
            marginBottom: 48
          }}>
            {/* Identity Column */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff'
                }}>
                  <Shield size={16} strokeWidth={2.4} />
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
                  SENTINEL GOVERN
                </span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: 260 }}>
                AI Governance & Lifecycle Platform.
              </p>
            </div>

            {/* Links 1 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 14 }}>
                Architecture
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <a href="#lifecycle" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Governance Pipeline</a>
                <a href="#architecture" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Control Plane Layer</a>
                <a href="#access-matrix" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Separation of Duties</a>
                <a href="#security" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Cryptographic Ledger</a>
              </div>
            </div>

            {/* Links 2 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 14 }}>
                Governance
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <a href="#modules" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Model Registry</a>
                <a href="#modules" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Fairness & Bias Studio</a>
                <a href="#modules" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Policy Gating</a>
                <a href="#modules" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Multi-Party Sign-Off</a>
              </div>
            </div>

            {/* Links 3 */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 14 }}>
                Workspace
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <Link to="/login" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Sign In</Link>
                <Link to="/signup" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Request Access</Link>
                <Link to="/forgot-password" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}>Reset Password</Link>
              </div>
            </div>
          </div>

          {/* Legal / Institutional Disclaimer */}
          <div style={{
            borderTop: '1px solid var(--color-border-subtle)',
            paddingTop: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            fontSize: 12,
            color: 'var(--color-text-muted)'
          }}>
            <div>
              © 2026 Sentinel Govern. AI Governance & Lifecycle Platform.
            </div>
            <div>
              Sentinel Govern is an operational governance platform, not legal or regulatory advice.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
