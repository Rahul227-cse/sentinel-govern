import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import './Landing.css';

// ─── 1. Governance Lifecycle Acts Data ───────────────────────────────────────

const ACTS_DATA = [
  {
    idx: '01',
    kicker: 'Act I — Registration',
    title: 'The defendant is entered.',
    body: 'Every AI asset is entered into the institutional registry with declared business ownership, training data lineage, and EU AI Act classification. Unregistered models cannot enter production pipelines.',
    tags: ['EU AI Act §5(b)', 'Annex III High-Risk', 'Lineage Hashed', 'PyTorch 2.4'],
    screenPath: 'console / registry / credit-risk-v2.1',
    screenStatus: '● RECORDING'
  },
  {
    idx: '02',
    kicker: 'Act II — Fairness Studio',
    title: 'Statistical proof, not intentions.',
    body: 'Automated statistical evaluation against legally protected attributes. Calculates Disparate Impact Ratio, Demographic Parity Delta, and Equalized Odds against the four-fifths rule.',
    tags: ['80% Legal Threshold', 'Demographic Parity', 'Equalized Odds', '184k Samples'],
    screenPath: 'console / fairness / holdout_eval_2026',
    screenStatus: '● EVALUATED'
  },
  {
    idx: '03',
    kicker: 'Act III — Policy Gate Check',
    title: 'The law is executed.',
    body: 'Configurable governance policies bind statutory thresholds directly to the deployment gate. If fairness or minimum accuracy fail, promotion is blocked deterministically on the backend.',
    tags: ['Gate 03 Pre-Deploy', 'Blocking Invariant', 'NIST AI RMF 1.0', 'Deterministic'],
    screenPath: 'console / policy-engine / gate-evaluation',
    screenStatus: '● VERIFIED'
  },
  {
    idx: '04',
    kicker: 'Act IV — Stakeholder Quorum',
    title: 'Three keys to launch.',
    body: 'Eliminates single-point deployment risk. Promotion to production strictly requires cryptographically sealed sign-offs across ML Lead, Governance Officer, and Executive Approver domains.',
    tags: ['3-Domain Quorum', 'Role Separation', 'Cryptographic Signature', 'Executive Consent'],
    screenPath: 'console / approval-center / q-quorum',
    screenStatus: '● 3/3 SIGNED'
  },
  {
    idx: '05',
    kicker: 'Act V — Runtime Telemetry',
    title: 'Surveillance without sleep.',
    body: 'Evidently AI statistical telemetry monitors real-time feature drift and Population Stability Index (PSI). Cross the threshold and production atomically rolls back to the last verified baseline.',
    tags: ['Evidently AI 0.7.23', 'PSI Invariant', 'Distribution Drift', 'Atomic Rollback'],
    screenPath: 'console / monitoring / live-telemetry',
    screenStatus: '● LIVE STREAM'
  },
  {
    idx: '06',
    kicker: 'Act VI — Cryptographic Audit',
    title: 'Sealed in cryptography.',
    body: 'Every model lifecycle mutation, policy verdict, and sign-off is hashed into an append-only SHA-256 chain. Tampering with any byte invalidates every subsequent block in the ledger.',
    tags: ['SHA-256 Linked', 'Tamper-Evident', 'Zero Breaks', 'Court-Admissible Evidence'],
    screenPath: 'console / audit-trail / sha256-ledger',
    screenStatus: '● SEALED'
  }
];

// Initial Audit Chain Blocks
const INITIAL_CHAIN_BLOCKS = [
  {
    id: 1481,
    action: 'MODEL_REGISTERED',
    actor: 'alex.chen@sentinel.govern',
    hash: '8f2a9c1e4d3b5a7098e6f12345bcdefa7890123456789abcdef0123456789abc',
    parentHash: '0000000000000000000000000000000000000000000000000000000000000000',
    data: 'Model: CreditRisk Underwriting v2.1 | Risk: HIGH_RISK'
  },
  {
    id: 1482,
    action: 'FAIRNESS_BENCHMARKED',
    actor: 'elena.rostova@sentinel.govern',
    hash: '3c7e8b9a1f203d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e',
    parentHash: '8f2a9c1e4d3b5a7098e6f12345bcdefa7890123456789abcdef0123456789abc',
    data: 'Disparate Impact: 0.884 | Demographic Parity: 0.031'
  },
  {
    id: 1483,
    action: 'POLICY_GATES_PASSED',
    actor: 'policy.daemon@sentinel.govern',
    hash: '6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b',
    parentHash: '3c7e8b9a1f203d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e',
    data: 'PolicySet: EU_AI_ACT_ANNEX_III | Verdict: PASSED'
  },
  {
    id: 1484,
    action: 'QUORUM_CONSENT_SEALED',
    actor: 'marcus.vance@sentinel.govern',
    hash: '9f2cb4e6a71e8d90f123456789abcdef0123456789abcdef0123456789abcdef',
    parentHash: '6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b',
    data: '3/3 Quorum: ML Lead, Governance Officer, Executive'
  }
];

export default function Landing() {
  const { isAuthenticated, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Navigation redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user && user.status === 'ACTIVE') {
      navigate(user.role === 'PLATFORM_ADMIN' ? '/admin/users' : '/app', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Active Lifecycle Act
  const [activeAct, setActiveAct] = useState(0);

  // Timecode State for HUD
  const [timecode, setTimecode] = useState('00:00:00:00');

  // Audit Chain Tamper State
  const [chainBlocks, setChainBlocks] = useState(INITIAL_CHAIN_BLOCKS);
  const [tamperedIndex, setTamperedIndex] = useState(null);

  // Drift Simulation State
  const [driftPsi, setDriftPsi] = useState(0.041);
  const [isDrifting, setIsDrifting] = useState(false);
  const [activeVersion, setActiveVersion] = useState('v2.1');
  const [driftLogs, setDriftLogs] = useState([
    '› monitoring 41 features',
    '› feature: income_annual (PSI 0.041)',
    '› drift threshold: 0.200 (Healthy)'
  ]);

  // Mobile menu open state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Refs for animations
  const canvasRef = useRef(null);
  const driftCanvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const driftAnimationRef = useRef(null);
  const mouseRef = useRef({ x: -1000, y: -1000, targetX: -1000, targetY: -1000 });

  // ─── 2. Running Timecode Ticker ───────────────────────────────────────────
  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame = (frame + 1) % 60;
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const f = String(frame).padStart(2, '0');
      setTimecode(`${h}:${m}:${s}:${f}`);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // ─── 3. Moving Strings & Flowing Text Canvas (#field) ──────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = (canvas.width = canvas.offsetWidth * window.devicePixelRatio);
    let height = (canvas.height = canvas.offsetHeight * window.devicePixelRatio);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      height = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    };
    window.addEventListener('resize', handleResize);

    const handlePointerMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.targetX = (e.clientX - rect.left) * window.devicePixelRatio;
      mouseRef.current.targetY = (e.clientY - rect.top) * window.devicePixelRatio;
    };
    const handlePointerLeave = () => {
      mouseRef.current.targetX = -1000;
      mouseRef.current.targetY = -1000;
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseleave', handlePointerLeave);

    // Harmonic wave string parameters
    const lineCount = 14;
    const stringLabels = [
      'SHA-256',
      'DIR ≥ 0.80',
      'PSI < 0.10',
      'ANNEX III',
      'EQUALIZED ODDS',
      '3-DOMAIN QUORUM',
      'ATOMIC ROLLBACK',
      'NIST AI RMF',
      'TAMPER-PROOF',
      'DISPARATE IMPACT',
      'NO SINGLE YES',
      'EVIDENCE VERIFIED'
    ];

    let t = 0;

    const render = () => {
      t += 0.012;
      ctx.clearRect(0, 0, width, height);

      // Smooth mouse follow
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.08;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.08;

      const isDarkTheme = theme === 'dark';

      // Wave Ribbons
      for (let i = 0; i < lineCount; i++) {
        ctx.beginPath();
        const norm = i / (lineCount - 1);
        const baseY = height * 0.22 + norm * height * 0.58;
        const amplitude = 32 + Math.sin(t * 0.6 + i) * 16;
        const freq = 0.0018 + (i % 3) * 0.0006;
        const phase = t * 1.4 + i * 0.45;

        // Theme-tuned stroke styling
        const alpha = isDarkTheme ? 0.15 + (i % 4) * 0.07 : 0.12 + (i % 4) * 0.05;
        const strokeColor =
          i % 3 === 0
            ? isDarkTheme
              ? `rgba(49, 94, 251, ${alpha * 1.5})`
              : `rgba(37, 99, 235, ${alpha * 1.4})`
            : isDarkTheme
            ? `rgba(236, 232, 224, ${alpha})`
            : `rgba(30, 30, 32, ${alpha})`;

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = i % 2 === 0 ? 1.5 * window.devicePixelRatio : 1 * window.devicePixelRatio;

        const step = 20 * window.devicePixelRatio;
        let prevX = 0;
        let prevY = baseY;

        for (let x = 0; x <= width + step; x += step) {
          // Undulating sine harmonic
          let y = baseY + Math.sin(x * freq + phase) * amplitude + Math.cos(x * freq * 0.5 + phase * 0.7) * (amplitude * 0.4);

          // Pointer interaction deflection
          const dx = x - mouseRef.current.x;
          const dy = y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const influenceRadius = 240 * window.devicePixelRatio;

          if (dist < influenceRadius) {
            const pull = (1 - dist / influenceRadius) * 55 * window.devicePixelRatio;
            y += (dy > 0 ? 1 : -1) * pull;
          }

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            const cx = (prevX + x) / 2;
            const cy = (prevY + y) / 2;
            ctx.quadraticCurveTo(prevX, prevY, cx, cy);
          }

          prevX = x;
          prevY = y;
        }

        ctx.stroke();

        // Flowing text strings along selected wave lines
        if (i % 2 === 1) {
          const labelIndex = (i + Math.floor(t * 0.2)) % stringLabels.length;
          const label = stringLabels[labelIndex];
          const textX = ((t * 80 * window.devicePixelRatio + i * 220 * window.devicePixelRatio) % (width + 300)) - 150;
          const textY = baseY + Math.sin(textX * freq + phase) * amplitude - 10 * window.devicePixelRatio;

          ctx.font = `${10 * window.devicePixelRatio}px 'Geist Mono', monospace`;
          ctx.fillStyle = isDarkTheme ? 'rgba(236, 232, 224, 0.35)' : 'rgba(20, 20, 20, 0.35)';
          ctx.fillText(label, textX, textY);
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseleave', handlePointerLeave);
    };
  }, [theme]);

  // ─── 4. Runtime Drift Canvas Simulation (#driftCv) ────────────────────────
  useEffect(() => {
    const cv = driftCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let w = (cv.width = cv.offsetWidth * window.devicePixelRatio);
    let h = (cv.height = cv.offsetHeight * window.devicePixelRatio);

    const handleResize = () => {
      if (!cv) return;
      w = cv.width = cv.offsetWidth * window.devicePixelRatio;
      h = cv.height = cv.offsetHeight * window.devicePixelRatio;
    };
    window.addEventListener('resize', handleResize);

    const history = [];
    const maxPoints = 80;
    for (let i = 0; i < maxPoints; i++) {
      history.push(0.038 + Math.random() * 0.008);
    }

    let frame = 0;

    const renderDrift = () => {
      frame++;
      if (frame % 3 === 0) {
        const target = isDrifting ? 0.284 : 0.041;
        const currentVal = history[history.length - 1];
        const nextVal = currentVal + (target - currentVal) * 0.12 + (Math.random() - 0.5) * 0.006;
        history.push(Math.max(0.02, nextVal));
        if (history.length > maxPoints) history.shift();
        setDriftPsi(parseFloat(nextVal.toFixed(3)));
      }

      ctx.clearRect(0, 0, w, h);

      // Grid Lines
      ctx.strokeStyle = theme === 'dark' ? 'rgba(236, 232, 224, 0.06)' : 'rgba(20, 20, 19, 0.06)';
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 40 * window.devicePixelRatio) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Red Rollback Threshold Line at PSI = 0.200 (scale: 0.00 to 0.35)
      const maxPsi = 0.35;
      const thrY = h - (0.2 / maxPsi) * (h - 40 * window.devicePixelRatio) - 20 * window.devicePixelRatio;

      ctx.strokeStyle = '#ef4444';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, thrY);
      ctx.lineTo(w, thrY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = `${10 * window.devicePixelRatio}px 'Geist Mono', monospace`;
      ctx.fillStyle = '#ef4444';
      ctx.fillText('ROLLBACK THRESHOLD 0.200', 14 * window.devicePixelRatio, thrY - 6);

      // Plot live points
      ctx.beginPath();
      const step = w / (maxPoints - 1);

      history.forEach((val, i) => {
        const px = i * step;
        const py = h - (val / maxPsi) * (h - 40 * window.devicePixelRatio) - 20 * window.devicePixelRatio;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });

      const currentVal = history[history.length - 1];
      const isCritical = currentVal >= 0.2;

      ctx.strokeStyle = isCritical ? '#ef4444' : '#10b981';
      ctx.lineWidth = 2.5 * window.devicePixelRatio;
      ctx.stroke();

      // Shaded area under curve
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, isCritical ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.18)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fill();

      driftAnimationRef.current = requestAnimationFrame(renderDrift);
    };

    driftAnimationRef.current = requestAnimationFrame(renderDrift);

    return () => {
      cancelAnimationFrame(driftAnimationRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [isDrifting, theme]);

  // ─── 5. Inject Drift Event Handler ────────────────────────────────────────
  const handleInjectDrift = useCallback(() => {
    if (isDrifting) return;
    setIsDrifting(true);

    setDriftLogs((prev) => [
      '› [ALERT] Distribution shift detected in batch #8421',
      '› Feature income_annual PSI spiked to 0.284 (> 0.200)',
      '› ATOMIC ROLLBACK TRIGGERED: Deprecating v2.1',
      ...prev.slice(0, 3)
    ]);

    // Flash alert and switch active version after 1.8s
    setTimeout(() => {
      setActiveVersion('v2.0');
      setDriftLogs((prev) => [
        '› Restoring verified baseline v2.0...',
        '› Rollback completed in 380ms. Baseline active.',
        '› Drift mitigated. System stabilizing.',
        ...prev.slice(0, 3)
      ]);
    }, 1800);

    // Cool down after 5s
    setTimeout(() => {
      setIsDrifting(false);
    }, 4500);
  }, [isDrifting]);

  // ─── 6. Tamper Audit Chain Handler ────────────────────────────────────────
  const handleTamperBlock = useCallback((index) => {
    setChainBlocks((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        data: 'TAMPERED: Disparate Impact manually overwritten to 0.999',
        hash: 'DEADBEEF99999999999999999999999999999999999999999999999999999999'
      };
      return copy;
    });
    setTamperedIndex(index);
  }, []);

  const handleResetChain = useCallback(() => {
    setChainBlocks(INITIAL_CHAIN_BLOCKS);
    setTamperedIndex(null);
  }, []);

  return (
    <div className="sentinel-landing">
      {/* Background Film Grain Overlay */}
      <div className="grain" aria-hidden="true" />

      {/* ─── Top Navigation ─────────────────────────────────────────────────── */}
      <nav className="nav" id="nav">
        {/* Left: Sentinel Govern Logo */}
        <div className="nav-left">
          <Link to="/" className="brand" aria-label="Sentinel Govern Home">
            <span className="brand-mark" />
            <span className="brand-text-label">SENTINEL GOVERN</span>
          </Link>
        </div>

        {/* Center: Primary Navigation Links */}
        <div className="nav-center">
          <div className="nav-links">
            <a href="#drift">Runtime</a>
            <a href="#platform">Platform</a>
            <a href="#frameworks">Compliance</a>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="nav-right nav-actions">
          {/* Functional Dark/Light Theme Toggle */}
          <button
            type="button"
            className="btn btn-ghost theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={15} color="var(--amber)" /> : <Moon size={15} color="var(--blue)" />}
            <span className="theme-toggle-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <Link to="/login" className="btn btn-ghost nav-signin-btn">
            Sign in
          </Link>

          <Link to="/signup" className="btn btn-amber nav-console-btn">
            Launch Console <span className="arr">→</span>
          </Link>

          <button
            type="button"
            className="menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? '✕' : '≡'}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="mobile-nav-drawer" role="dialog" aria-label="Mobile Navigation">
          <div className="mobile-nav-links">
            <a href="#drift" onClick={() => setMobileMenuOpen(false)}>Runtime</a>
            <a href="#platform" onClick={() => setMobileMenuOpen(false)}>Platform</a>
            <a href="#frameworks" onClick={() => setMobileMenuOpen(false)}>Compliance</a>
            <a href="#acts" onClick={() => setMobileMenuOpen(false)}>Lifecycle</a>
            <a href="#chain" onClick={() => setMobileMenuOpen(false)}>Audit Trail</a>
          </div>
          <div className="mobile-nav-actions">
            <Link to="/login" className="btn btn-ghost" onClick={() => setMobileMenuOpen(false)}>
              Sign in
            </Link>
            <Link to="/signup" className="btn btn-amber" onClick={() => setMobileMenuOpen(false)}>
              Launch Console <span className="arr">→</span>
            </Link>
          </div>
        </div>
      )}

      {/* ─── Hero Section with Canvas Strings & HUD ─────────────────────────── */}
      <header className="hero" data-screen-label="01 Hero">
        {/* Animated Moving Strings & Interactive Mouse Field Canvas */}
        <canvas id="field" ref={canvasRef} />

        {/* Letterbox Lines */}
        <div className="letterbox top" />
        <div className="letterbox bot" />

        {/* Viewfinder HUD */}
        <div className="hud">
          <i className="c tl" />
          <i className="c tr" />
          <i className="c bl" />
          <i className="c br" />

          {/* Top-Right Telemetry Readout */}
          <div className="hud-read mono">
            <div>
              <div className="k">Disparate impact</div>
              <div className="v" id="hDir">
                0.884 <small>PASS</small>
              </div>
            </div>
            <div>
              <div className="k">Population stability</div>
              <div className="v" id="hPsi">
                {driftPsi.toFixed(3)} <small>{driftPsi < 0.1 ? 'HEALTHY' : driftPsi < 0.2 ? 'WARNING' : 'DRIFT'}</small>
              </div>
            </div>
            <div>
              <div className="k">Chain head</div>
              <div className="v" id="hHash" style={{ fontSize: '14.5px' }}>
                9f2c…a71e <small>✓</small>
              </div>
            </div>
          </div>

          {/* Bottom HUD Bar */}
          <div className="hud-bot mono">
            <span className="live">● REC — GATE ENFORCEMENT LIVE</span>
            <span id="tc">{timecode}</span>
            <span>EU AI ACT · ANNEX III</span>
          </div>
        </div>

        {/* Hero Content */}
        <div className="hero-inner">
          <div className="slate mono fade-in">
            <span className="dot" />
            Every model
            <span className="sep" />
            Every decision
            <span className="sep" />
            On the record
          </div>

          <h1 className="title">
            <span className="ln">Nothing ships</span>
            <span className="ln">without a</span>
            <span className="ln">
              <span className="it">verdict.</span>
            </span>
          </h1>

          <p className="hero-sub fade-in">
            Sentinel Govern replaces ethics checklists with cryptographic stage gates, statistical fairness proofs, automatic drift
            rollback and a tamper‑evident audit chain — across the entire AI model lifecycle.
          </p>

          <div className="hero-cta fade-in">
            <Link to="/signup" className="btn btn-amber btn-lg">
              Start free trial <span className="arr">→</span>
            </Link>
            <a href="#acts" className="btn btn-line btn-lg">
              <span className="play" />
              Watch a model go to trial
            </a>
          </div>
        </div>

        {/* Scroll Cue */}
        <div className="scroll-cue mono fade-in">
          <span>Scroll</span>
          <i />
        </div>
      </header>

      {/* ─── Manifesto Section ───────────────────────────────────────────────── */}
      <section className="manifesto" data-screen-label="02 Manifesto">
        <div className="eyebrow mono">
          <b>00</b>The problem
        </div>
        <p id="manifesto">
          Most AI governance is a spreadsheet and a promise. A model gets <span className="hl">deployed</span> because someone
          said yes in a meeting. Then it drifts, discriminates, and nobody can prove who approved what. We built a system where{' '}
          <span className="hl">trust is computed,</span> not asserted.
        </p>
      </section>

      {/* ─── Lifecycle Section (Six Acts) ────────────────────────────────────── */}
      <section className="acts" id="acts" data-screen-label="03 Lifecycle">
        <div className="acts-pin">
          {/* Left Pinned Content */}
          <div className="acts-left">
            <div>
              <div className="eyebrow mono" style={{ marginBottom: 20 }}>
                <b>Lifecycle</b>A model on trial, in six acts
              </div>
              <div className="act-num" id="actNum">
                {ACTS_DATA[activeAct].idx}
                <span id="actNumFill">{ACTS_DATA[activeAct].idx}</span>
              </div>
            </div>

            <div className="act-text" id="actText">
              <div className="mono" id="actKicker">
                {ACTS_DATA[activeAct].kicker}
              </div>
              <h3 id="actTitle">{ACTS_DATA[activeAct].title}</h3>
              <p id="actBody">{ACTS_DATA[activeAct].body}</p>
              <div className="tags" id="actTags">
                {ACTS_DATA[activeAct].tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Interactive Act Reel Navigator */}
            <div className="reel mono" id="reel">
              {ACTS_DATA.map((act, i) => (
                <button
                  key={act.idx}
                  type="button"
                  className={`reel-btn ${activeAct === i ? 'active' : ''}`}
                  onClick={() => setActiveAct(i)}
                  aria-label={`Jump to Act ${act.idx}`}
                >
                  {act.idx}
                </button>
              ))}
            </div>
          </div>

          {/* Right Console Screen */}
          <div className="screen">
            <div className="screen-bar mono">
              <span className="lights">
                <i />
                <i />
                <i />
              </span>
              <span id="screenPath">{ACTS_DATA[activeAct].screenPath}</span>
              <span id="screenStat" style={{ color: 'var(--blue)' }}>
                {ACTS_DATA[activeAct].screenStatus}
              </span>
            </div>

            <div className="screen-body">
              {/* Panel 0: Model Registration */}
              <div className={`panel ${activeAct === 0 ? 'on' : ''}`} data-p="0">
                <div className="risk-stamp">
                  HIGH‑RISK
                  <br />
                  ANNEX III · 5(b)
                </div>
                <div className="json" id="jsonOut">
{`{
  "modelName": "CreditRisk Underwriting Ensemble v2.1",
  "framework": "PyTorch 2.4.0 + LightGBM",
  "intendedPurpose": "Consumer creditworthiness assessment",
  "regulatoryClassification": "EU AI Act Annex III Section 5(b)",
  "owner": "alex.chen@sentinel.govern",
  "trainingLineage": {
    "dataset": "credit_train_2025_q4.parquet",
    "records": 482109,
    "sha256": "4a71b...892e"
  },
  "protectedDemographicsAudited": [
    "age_band",
    "gender",
    "postal_region"
  ]
}`}
                </div>
              </div>

              {/* Panel 1: Fairness Studio */}
              <div className={`panel ${activeAct === 1 ? 'on' : ''}`} data-p="1">
                <div className="fair-head">
                  <div>
                    <div className="mono" style={{ color: 'var(--bone-3)' }}>
                      Disparate impact ratio
                    </div>
                    <div className="big-metric">
                      <span id="dirCount">0.884</span>
                      <small>≥ 0.80 · PASS</small>
                    </div>
                  </div>
                  <div className="mono" style={{ color: 'var(--bone-3)', textAlign: 'right' }}>
                    Protected attr.
                    <br />
                    <span style={{ color: 'var(--bone)', fontWeight: 600 }}>age_band</span>
                  </div>
                </div>

                <div className="bars" id="bars">
                  <div className="thr" style={{ bottom: '58%' }}>
                    80% LEGAL RULE
                  </div>
                  <div className="bar-col" style={{ height: '88%' }} title="Subgroup 18-35: 88.4%" />
                  <div className="bar-col" style={{ height: '94%' }} title="Subgroup 36-55: 94.2%" />
                  <div className="bar-col" style={{ height: '85%' }} title="Subgroup 56+: 85.1%" />
                </div>

                <div className="bar-labels mono" id="barLabels">
                  <span>18–35 (0.88)</span>
                  <span>36–55 (0.94)</span>
                  <span>56+ (0.85)</span>
                </div>

                <div className="fair-row mono">
                  <div>
                    <div style={{ color: 'var(--bone-3)' }}>Dem. parity Δ</div>
                    <div className="v">0.031</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--bone-3)' }}>Equalized odds Δ</div>
                    <div className="v">0.044</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--bone-3)' }}>Samples</div>
                    <div className="v">184,210</div>
                  </div>
                </div>
              </div>

              {/* Panel 2: Policy Gates */}
              <div className={`panel ${activeAct === 2 ? 'on' : ''}`} data-p="2">
                <div className="rules" id="rules">
                  <div className="rule-item">
                    <span>POL-01: Disparate Impact Ratio ≥ 0.800</span>
                    <span className="rule-status pass">0.884 ✓ PASS</span>
                  </div>
                  <div className="rule-item">
                    <span>POL-02: Minimum ROC-AUC Benchmark ≥ 0.850</span>
                    <span className="rule-status pass">0.892 ✓ PASS</span>
                  </div>
                  <div className="rule-item">
                    <span>POL-03: Lineage & Risk Assessment Cataloged</span>
                    <span className="rule-status pass">VERIFIED ✓</span>
                  </div>
                </div>

                <div className="gate-verdict" id="verdict">
                  <div>
                    <div className="mono" style={{ color: 'var(--bone-3)' }}>
                      Gate 03 / Pre‑deployment
                    </div>
                    <div className="serif" id="verdictText">
                      All Mandatory Gates Satisfied
                    </div>
                  </div>
                  <div className="mono" id="verdictCode" style={{ color: 'var(--green)', fontWeight: 700 }}>
                    PASS — AUTHORIZED
                  </div>
                </div>
              </div>

              {/* Panel 3: Quorum Sign-off */}
              <div className={`panel ${activeAct === 3 ? 'on' : ''}`} data-p="3">
                <div className="quorum" id="quorum">
                  <div className="q-signer">
                    <div className="q-signer-info">
                      <div className="q-avatar">ML</div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>Alex Chen</div>
                        <div className="mono" style={{ fontSize: '11px', color: 'var(--bone-3)' }}>
                          alex.chen@sentinel.govern
                        </div>
                      </div>
                    </div>
                    <span className="rule-status pass">SIGNED ✓</span>
                  </div>

                  <div className="q-signer">
                    <div className="q-signer-info">
                      <div className="q-avatar">GO</div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>Elena Rostova</div>
                        <div className="mono" style={{ fontSize: '11px', color: 'var(--bone-3)' }}>
                          governance@sentinel.govern
                        </div>
                      </div>
                    </div>
                    <span className="rule-status pass">SIGNED ✓</span>
                  </div>

                  <div className="q-signer">
                    <div className="q-signer-info">
                      <div className="q-avatar">EA</div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>Marcus Vance</div>
                        <div className="mono" style={{ fontSize: '11px', color: 'var(--bone-3)' }}>
                          vp-risk@sentinel.govern
                        </div>
                      </div>
                    </div>
                    <span className="rule-status pass">SIGNED ✓</span>
                  </div>
                </div>

                <div className="quorum-bar mono">
                  <span style={{ color: 'var(--bone-3)' }}>Quorum</span>
                  <div className="track">
                    <i id="qTrack" style={{ width: '100%' }} />
                  </div>
                  <span id="qCount" style={{ color: 'var(--blue)', fontWeight: 700 }}>
                    3 / 3
                  </span>
                </div>
              </div>

              {/* Panel 4: Telemetry Stream */}
              <div className={`panel ${activeAct === 4 ? 'on' : ''}`} data-p="4">
                <div className="tele-head mono">
                  <div>
                    <div style={{ color: 'var(--bone-3)' }}>PSI · income</div>
                    <div className="v" id="tPsi" style={{ color: 'var(--green)' }}>
                      0.041
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--bone-3)' }}>Requests / min</div>
                    <div className="v" id="tRpm">
                      12,408
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--bone-3)' }}>Rollback threshold</div>
                    <div className="v" style={{ color: 'var(--red)' }}>
                      0.200
                    </div>
                  </div>
                </div>

                <div className="chart">
                  <svg id="teleSvg" viewBox="0 0 400 140" preserveAspectRatio="none">
                    <path
                      d="M0,80 Q50,40 100,75 T200,60 T300,85 T400,65 L400,140 L0,140 Z"
                      fill="rgba(49, 94, 251, 0.15)"
                    />
                    <path
                      d="M0,80 Q50,40 100,75 T200,60 T300,85 T400,65"
                      fill="none"
                      stroke="var(--blue)"
                      strokeWidth="2.5"
                    />
                  </svg>
                </div>
              </div>

              {/* Panel 5: Audit Chain */}
              <div className={`panel ${activeAct === 5 ? 'on' : ''}`} data-p="5">
                <div className="chain-mini" id="chainMini">
                  <div className="chain-mini-block mono">
                    <span>#1481 MODEL_REGISTERED</span>
                    <span style={{ color: 'var(--bone-3)' }}>8f2a…a709</span>
                  </div>
                  <div className="chain-mini-block mono">
                    <span>#1482 FAIRNESS_BENCHMARKED</span>
                    <span style={{ color: 'var(--bone-3)' }}>3c7e…7d8e</span>
                  </div>
                  <div className="chain-mini-block mono">
                    <span>#1483 POLICY_GATES_PASSED</span>
                    <span style={{ color: 'var(--bone-3)' }}>6a5b…6a5b</span>
                  </div>
                  <div className="chain-mini-block mono">
                    <span>#1484 QUORUM_CONSENT_SEALED</span>
                    <span style={{ color: 'var(--bone-3)' }}>9f2c…cdef</span>
                  </div>
                </div>

                <div className="gate-verdict open" style={{ marginTop: 'auto' }}>
                  <div>
                    <div className="mono" style={{ color: 'var(--bone-3)' }}>
                      Chain integrity
                    </div>
                    <div className="serif">2,481 entries. Zero breaks.</div>
                  </div>
                  <div className="mono" style={{ color: 'var(--green)', fontWeight: 700 }}>
                    SHA‑256 ✓
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Audit Trail & Interactive Tamper Section ──────────────────────── */}
      <section className="sec" id="chain" data-screen-label="04 Audit chain">
        <div className="sec-head">
          <h2>
            Try to <span className="it">rewrite</span>
            <br />
            history.
          </h2>
          <p>
            Every approval, override and deployment is hashed into the next. Change a single byte anywhere — and every record after
            it testifies against you. Go on, tamper with one.
          </p>
        </div>

        {/* Linked Cryptographic Blocks */}
        <div className="chain" id="chainEl">
          {chainBlocks.map((blk, idx) => {
            const isTampered = tamperedIndex !== null && idx >= tamperedIndex;
            return (
              <div key={blk.id} className={`chain-block ${isTampered ? 'tampered' : ''}`}>
                <div className="chain-header mono">
                  <span style={{ fontWeight: 700 }}>BLOCK #{blk.id}</span>
                  <span style={{ color: isTampered ? 'var(--red)' : 'var(--green)' }}>{isTampered ? '✗ BROKEN' : '✓ VALID'}</span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--bone)' }}>{blk.action}</div>
                <div className="chain-hash">{blk.hash.slice(0, 24)}…</div>
                <div style={{ fontSize: '11px', color: 'var(--bone-3)', marginBottom: 12 }}>{blk.data}</div>
                <button
                  type="button"
                  className="tamper-btn mono"
                  onClick={() => handleTamperBlock(idx)}
                  disabled={isTampered}
                >
                  {isTampered ? 'Manipulated' : 'Tamper with Block'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Chain Integrity Status Card */}
        <div className={`chain-status ${tamperedIndex !== null ? 'tampered' : ''}`} id="chainStatus">
          <div>
            <div className="mono" style={{ color: 'var(--bone-3)' }}>
              Verification
            </div>
            <div className="serif" id="chainMsg">
              {tamperedIndex !== null
                ? `🚨 Tamper detected at Block #${chainBlocks[tamperedIndex].id}! SHA-256 chain broken.`
                : 'Chain intact. Every signature checks out.'}
            </div>
          </div>
          <button type="button" className="btn btn-line" id="chainReset" onClick={handleResetChain}>
            Restore ledger
          </button>
        </div>
      </section>

      {/* ─── Runtime Drift & Atomic Rollback Section ────────────────────────── */}
      <section className="sec" id="drift" style={{ paddingTop: '6vh' }} data-screen-label="05 Drift">
        <div className="sec-head">
          <h2>
            When reality <span className="it">drifts,</span>
            <br />
            we pull the plug.
          </h2>
          <p>
            Live population‑stability monitoring on every feature. Cross the threshold and Sentinel atomically rolls production
            back to the last verified baseline — with the evidence already filed.
          </p>
        </div>

        <div className="drift">
          {/* Real-time Waveform Canvas */}
          <div className="drift-chart">
            <span className="lab mono">PSI · rolling 60s · credit-risk</span>
            <canvas id="driftCv" ref={driftCanvasRef} />
            <div className={`flash ${isDrifting ? 'active' : ''}`} id="flash" />
          </div>

          {/* Drift Controls & Incident Log */}
          <div className="drift-side">
            <div>
              <div className="mono" style={{ color: 'var(--bone-3)' }}>
                Current PSI
              </div>
              <div className="v" id="dPsi" style={{ color: driftPsi >= 0.2 ? 'var(--red)' : 'var(--bone)' }}>
                {driftPsi.toFixed(3)}
              </div>
            </div>

            <div className="versions" id="versions">
              <div className={`ver ${activeVersion === 'v2.2' ? 'live' : ''}`} data-v="v2.2">
                v2.2 · candidate
              </div>
              <div className={`ver ${activeVersion === 'v2.1' ? 'live' : ''}`} data-v="v2.1">
                v2.1 · verified
              </div>
              <div className={`ver ${activeVersion === 'v2.0' ? 'live' : ''}`} data-v="v2.0">
                v2.0 · baseline
              </div>
            </div>

            <button
              type="button"
              className="btn btn-line"
              id="injectDrift"
              onClick={handleInjectDrift}
              disabled={isDrifting}
              style={{ justifyContent: 'center' }}
            >
              {isDrifting ? 'Simulating Distribution Shift...' : 'Inject distribution shift'}
            </button>

            <div className="drift-log" id="driftLog">
              {driftLogs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Platform Bento Grid ────────────────────────────────────────────── */}
      <section className="sec" id="platform" style={{ paddingTop: '6vh' }} data-screen-label="06 Platform">
        <div className="sec-head">
          <h2>
            One system.
            <br />
            <span className="it">Five</span> instruments.
          </h2>
          <p>Built for the three people who must agree before a model touches a customer — and the regulator who'll ask about it later.</p>
        </div>

        <div className="bento">
          {/* Card 1: Fairness Engine */}
          <div className="card c1">
            <span className="mono" style={{ fontSize: '11px', color: 'var(--blue)' }}>
              01 · Fairness engine
            </span>
            <svg className="viz ring" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="2" />
              <circle
                id="ringArc"
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="var(--blue)"
                strokeWidth="2.5"
                strokeDasharray="326.7"
                strokeDashoffset="38"
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="66" textAnchor="middle" fill="currentColor" fontFamily="Instrument Serif" fontSize="30">
                .884
              </text>
            </svg>
            <h4>
              Statistical proof,
              <br />
              not good intentions.
            </h4>
            <p>
              Disparate impact, demographic parity and equalized odds — computed per protected attribute and checked against the
              four‑fifths rule automatically.
            </p>
          </div>

          {/* Card 2: Quorum Gates */}
          <div className="card c2">
            <span className="mono" style={{ fontSize: '11px', color: 'var(--blue)' }}>
              02 · Quorum gates
            </span>
            <div className="big-num">3/3</div>
            <h4>No single yes.</h4>
            <p>ML Lead, Governance Officer, Executive. Cryptographically signed.</p>
          </div>

          {/* Card 3: Atomic Rollback */}
          <div className="card c3">
            <span className="mono" style={{ fontSize: '11px', color: 'var(--blue)' }}>
              03 · Atomic rollback
            </span>
            <h4>One click back to the last good model.</h4>
            <p>Verified baselines, ready in under a second.</p>
          </div>

          {/* Card 4: Audit Chain */}
          <div className="card c4">
            <span className="mono" style={{ fontSize: '11px', color: 'var(--blue)' }}>
              04 · Audit chain
            </span>
            <h4>Tamper‑evident by construction.</h4>
            <p>SHA‑256 linked ledger with active tamper simulation.</p>
          </div>

          {/* Card 5: Dossier Export */}
          <div className="card c5">
            <span className="mono" style={{ fontSize: '11px', color: 'var(--blue)' }}>
              05 · Dossier export
            </span>
            <div className="dossier">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <h4>Annex IV, in one click.</h4>
            <p>EU AI Act technical documentation, assembled from evidence.</p>
          </div>
        </div>
      </section>

      {/* ─── Frameworks Marquee ─────────────────────────────────────────────── */}
      <section id="frameworks" className="marq" data-screen-label="07 Frameworks">
        <div className="marq-track">
          <span>EU AI Act · Annex III</span>
          <span>NIST AI RMF 1.0</span>
          <span>ISO/IEC 42001</span>
          <span>NYC Local Law 144</span>
          <span>SR 11‑7</span>
          <span>EU AI Act · Annex III</span>
          <span>NIST AI RMF 1.0</span>
          <span>ISO/IEC 42001</span>
          <span>NYC Local Law 144</span>
          <span>SR 11‑7</span>
        </div>
      </section>

      {/* ─── Finale CTA ─────────────────────────────────────────────────────── */}
      <section className="finale" data-screen-label="08 Finale">
        <div className="eyebrow mono" style={{ marginBottom: 34 }}>
          <b>Fin</b>Your move
        </div>
        <h2>
          Govern like
          <br />
          it's <span className="it">evidence.</span>
        </h2>
        <p>Register your first model in under ten minutes. Your auditors will think you hired a team.</p>
        <div className="hero-cta">
          <Link to="/signup" className="btn btn-amber btn-lg">
            Start free trial <span className="arr">→</span>
          </Link>
          <Link to="/login" className="btn btn-line btn-lg">
            Book a governance review
          </Link>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────────────── */}
      <footer>
        <div className="foot-grid">
          <div>
            <Link to="/" className="brand" aria-label="Sentinel Govern Home">
              <span className="brand-mark" />
              SENTINEL GOVERN
            </Link>
            <p style={{ color: 'var(--bone-3)', fontSize: '14px', marginTop: '18px', maxWidth: '280px' }}>
              Deterministic governance for the AI model lifecycle.
            </p>
            <div className="badges mono">
              <span className="tag">EU AI ACT</span>
              <span className="tag">NIST RMF</span>
              <span className="tag">ISO 42001</span>
            </div>
          </div>

          <div>
            <h5>Platform</h5>
            <ul>
              <li>
                <Link to="/app/models">Model registry</Link>
              </li>
              <li>
                <Link to="/app/fairness">Fairness studio</Link>
              </li>
              <li>
                <Link to="/app/policies">Policy gates</Link>
              </li>
              <li>
                <Link to="/app/monitoring">Telemetry</Link>
              </li>
            </ul>
          </div>

          <div>
            <h5>Compliance</h5>
            <ul>
              <li>
                <a href="#frameworks">EU AI Act</a>
              </li>
              <li>
                <a href="#frameworks">NIST AI RMF</a>
              </li>
              <li>
                <a href="#frameworks">ISO/IEC 42001</a>
              </li>
              <li>
                <Link to="/app/dossier">Trust center</Link>
              </li>
            </ul>
          </div>

          <div>
            <h5>Developers</h5>
            <ul>
              <li>
                <Link to="/app/audit">Audit API</Link>
              </li>
              <li>
                <a href="#chain">Cryptographic Hash</a>
              </li>
              <li>
                <Link to="/app/monitoring">Evidently AI 0.7.23</Link>
              </li>
              <li>
                <Link to="/app/issues">Issue Reporting</Link>
              </li>
            </ul>
          </div>

          <div>
            <h5>Company</h5>
            <ul>
              <li>
                <Link to="/login">Sign In</Link>
              </li>
              <li>
                <Link to="/signup">Start Free Trial</Link>
              </li>
              <li>
                <Link to="/app/profile">Enterprise Account</Link>
              </li>
              <li>
                <a href="mailto:support@sentinel.govern">Contact</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="foot-base mono">
          <span>© 2026 Sentinel Govern</span>
          <span className="status">
            <i />
            All systems operational
          </span>
        </div>
      </footer>
    </div>
  );
}
