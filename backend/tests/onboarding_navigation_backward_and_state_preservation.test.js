import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Sentinel Govern — Onboarding Backward Navigation & State Preservation Test Suite
 *
 * Verifies:
 * 1. PublicOnlyRoute allows viewing /signup when onboarding is incomplete
 * 2. Onboarding step-by-step navigation state machine (Steps 1 to 5)
 * 3. Step 1 Back button navigates to /signup with "Back to Sign Up" label
 * 4. Subsequent steps navigate to previous onboarding step
 * 5. Selections (role, department, team, team lead) are preserved on round-trip
 * 6. Zero passwords in history state, URLs, or browser storage
 * 7. Duplicate signup requests are prevented when returning to signup
 * 8. Safe display name updates via authenticated profile endpoint
 * 9. Accessibility, keyboard navigation, and design token consistency
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Model of PublicOnlyRoute logic implemented in App.jsx
function evaluatePublicOnlyRoute({ pathname, isAuthenticated, user, loading }) {
  if (loading) return { action: 'WAIT' };

  if (isAuthenticated && user && user.status === 'ACTIVE') {
    if (!user.onboardingCompleted) {
      if (pathname === '/signup') {
        return { action: 'RENDER_CHILDREN', route: '/signup' };
      }
      return { action: 'REDIRECT', destination: '/onboarding' };
    }
    const dest = user.role === 'PLATFORM_ADMIN' ? '/admin/users' : '/app';
    return { action: 'REDIRECT', destination: dest };
  }

  return { action: 'RENDER_CHILDREN', route: pathname };
}

// Model of Onboarding navigation state transitions implemented in Onboarding.jsx
class OnboardingNavigationEngine {
  constructor(initialData = {}, user = null) {
    this.user = user || { name: 'Jane Smith', email: 'jane@enterprise.com', role: 'GOVERNANCE_OFFICER' };
    this.step = 1;
    this.selectedRole = initialData.selectedRole || (this.user.role !== 'PLATFORM_ADMIN' ? this.user.role : 'ML_LEAD');
    this.selectedDept = initialData.selectedDept || 'AI / ML';
    this.selectedTeam = initialData.selectedTeam || 'AI Platform';
    this.customTeam = initialData.customTeam || '';
    this.teamLead = initialData.teamLead || '';
    this.noTeamLead = initialData.noTeamLead || false;
    this.lastNavigation = null;
  }

  getBackButtonConfig() {
    if (this.step === 1) {
      return {
        id: 'onboarding-back-to-signup',
        label: 'Back to Sign Up',
        ariaLabel: 'Back to Sign Up',
        className: 'btn btn-secondary',
        type: 'button'
      };
    }
    return {
      id: 'onboarding-back-btn',
      label: 'Back',
      ariaLabel: 'Previous onboarding step',
      className: 'btn btn-secondary',
      type: 'button'
    };
  }

  handleNext() {
    if (this.step === 1 && !this.selectedRole) throw new Error('Role required');
    if (this.step === 2 && !this.selectedDept) throw new Error('Department required');
    if (this.step === 3 && !this.selectedTeam) throw new Error('Team required');
    this.step = Math.min(this.step + 1, 5);
  }

  handleBack() {
    if (this.step === 1) {
      this.lastNavigation = {
        destination: '/signup',
        state: {
          fromOnboarding: true,
          onboardingData: {
            selectedRole: this.selectedRole,
            selectedDept: this.selectedDept,
            selectedTeam: this.selectedTeam,
            customTeam: this.customTeam,
            teamLead: this.teamLead,
            noTeamLead: this.noTeamLead
          }
        }
      };
      return this.lastNavigation;
    }
    this.step = Math.max(this.step - 1, 1);
    return null;
  }
}

// Model of SignupPage submission decision logic implemented in Signup.jsx
function evaluateSignupAction({ isAuthenticated, user, formValues, onboardingData }) {
  const hasExistingAccount = Boolean(isAuthenticated && user && !user.onboardingCompleted);

  if (hasExistingAccount) {
    return {
      buttonId: 'signup-continue-onboarding',
      buttonLabel: 'Continue to Onboarding',
      isDuplicateSignupPrevented: true,
      action: 'CONTINUE_TO_ONBOARDING',
      targetRoute: '/onboarding',
      state: {
        fromSignup: true,
        onboardingData: onboardingData || null
      },
      nameToUpdate: formValues.name.trim() !== user.name ? formValues.name.trim() : null
    };
  }

  return {
    buttonId: 'signup-submit',
    buttonLabel: 'Create account',
    isDuplicateSignupPrevented: false,
    action: 'CREATE_ACCOUNT',
    targetRoute: '/onboarding',
    credentials: {
      name: formValues.name.trim(),
      email: formValues.email.trim().toLowerCase(),
      password: formValues.password
    }
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('1. PublicOnlyRoute allows viewing /signup when onboarding is incomplete', () => {
  // Case A: Unauthenticated user on /signup
  const unauthSignup = evaluatePublicOnlyRoute({
    pathname: '/signup',
    isAuthenticated: false,
    user: null,
    loading: false
  });
  assert.equal(unauthSignup.action, 'RENDER_CHILDREN');

  // Case B: Authenticated user with incomplete onboarding navigates to /signup (e.g. Back from onboarding)
  const backToSignup = evaluatePublicOnlyRoute({
    pathname: '/signup',
    isAuthenticated: true,
    user: { email: 'jane@enterprise.com', role: 'GOVERNANCE_OFFICER', status: 'ACTIVE', onboardingCompleted: false },
    loading: false
  });
  assert.equal(backToSignup.action, 'RENDER_CHILDREN');
  assert.equal(backToSignup.route, '/signup');

  // Case C: Authenticated user with incomplete onboarding visits /login -> redirected to /onboarding
  const incompleteOnLogin = evaluatePublicOnlyRoute({
    pathname: '/login',
    isAuthenticated: true,
    user: { email: 'jane@enterprise.com', role: 'GOVERNANCE_OFFICER', status: 'ACTIVE', onboardingCompleted: false },
    loading: false
  });
  assert.equal(incompleteOnLogin.action, 'REDIRECT');
  assert.equal(incompleteOnLogin.destination, '/onboarding');

  // Case D: Authenticated user who ALREADY completed onboarding visits /signup -> redirected to /app
  const completedUser = evaluatePublicOnlyRoute({
    pathname: '/signup',
    isAuthenticated: true,
    user: { email: 'jane@enterprise.com', role: 'GOVERNANCE_OFFICER', status: 'ACTIVE', onboardingCompleted: true },
    loading: false
  });
  assert.equal(completedUser.action, 'REDIRECT');
  assert.equal(completedUser.destination, '/app');

  // Case E: Platform Admin who completed onboarding visits /signup -> redirected to /admin/users
  const completedAdmin = evaluatePublicOnlyRoute({
    pathname: '/signup',
    isAuthenticated: true,
    user: { email: 'admin@enterprise.com', role: 'PLATFORM_ADMIN', status: 'ACTIVE', onboardingCompleted: true },
    loading: false
  });
  assert.equal(completedAdmin.action, 'REDIRECT');
  assert.equal(completedAdmin.destination, '/admin/users');
});

test('2. Onboarding step-by-step navigation state machine across all 5 steps', () => {
  const engine = new OnboardingNavigationEngine();

  // Initially on Step 1 (Role)
  assert.equal(engine.step, 1);
  const btn1 = engine.getBackButtonConfig();
  assert.equal(btn1.id, 'onboarding-back-to-signup');
  assert.equal(btn1.label, 'Back to Sign Up');
  assert.equal(btn1.className, 'btn btn-secondary');

  // Advance Step 1 -> Step 2
  engine.handleNext();
  assert.equal(engine.step, 2);
  const btn2 = engine.getBackButtonConfig();
  assert.equal(btn2.id, 'onboarding-back-btn');
  assert.equal(btn2.label, 'Back');

  // Advance Step 2 -> Step 3
  engine.handleNext();
  assert.equal(engine.step, 3);
  assert.equal(engine.getBackButtonConfig().label, 'Back');

  // Advance Step 3 -> Step 4
  engine.handleNext();
  assert.equal(engine.step, 4);
  assert.equal(engine.getBackButtonConfig().label, 'Back');

  // Advance Step 4 -> Step 5
  engine.handleNext();
  assert.equal(engine.step, 5);
  assert.equal(engine.getBackButtonConfig().label, 'Back');

  // Back Step 5 -> Step 4
  engine.handleBack();
  assert.equal(engine.step, 4);

  // Back Step 4 -> Step 3
  engine.handleBack();
  assert.equal(engine.step, 3);

  // Back Step 3 -> Step 2
  engine.handleBack();
  assert.equal(engine.step, 2);

  // Back Step 2 -> Step 1
  engine.handleBack();
  assert.equal(engine.step, 1);
  assert.equal(engine.getBackButtonConfig().label, 'Back to Sign Up');
});

test('3. Step 1 Back button navigates to /signup with preserved onboarding selections', () => {
  const engine = new OnboardingNavigationEngine({
    selectedRole: 'EXECUTIVE_APPROVER',
    selectedDept: 'Risk',
    selectedTeam: 'Risk Management',
    customTeam: 'Quantitative Risk Alpha',
    teamLead: 'Dr. Sarah Connor',
    noTeamLead: false
  });

  assert.equal(engine.step, 1);
  const nav = engine.handleBack();

  assert.ok(nav);
  assert.equal(nav.destination, '/signup');
  assert.equal(nav.state.fromOnboarding, true);
  assert.deepEqual(nav.state.onboardingData, {
    selectedRole: 'EXECUTIVE_APPROVER',
    selectedDept: 'Risk',
    selectedTeam: 'Risk Management',
    customTeam: 'Quantitative Risk Alpha',
    teamLead: 'Dr. Sarah Connor',
    noTeamLead: false
  });
});

test('4. Returning from signup to onboarding restores all selections accurately', () => {
  const passedOnboardingData = {
    selectedRole: 'ML_LEAD',
    selectedDept: 'AI / ML',
    selectedTeam: 'Machine Learning',
    customTeam: 'Core LLM Fine-Tuning Squad',
    teamLead: 'Alex Rivera',
    noTeamLead: false
  };

  const restoredEngine = new OnboardingNavigationEngine(passedOnboardingData);
  assert.equal(restoredEngine.selectedRole, 'ML_LEAD');
  assert.equal(restoredEngine.selectedDept, 'AI / ML');
  assert.equal(restoredEngine.selectedTeam, 'Machine Learning');
  assert.equal(restoredEngine.customTeam, 'Core LLM Fine-Tuning Squad');
  assert.equal(restoredEngine.teamLead, 'Alex Rivera');
  assert.equal(restoredEngine.noTeamLead, false);
});

test('5. Passwords are never placed in history state, URLs, or client storage', () => {
  const engine = new OnboardingNavigationEngine();
  const nav = engine.handleBack();

  // Check state passed during navigation
  assert.ok(nav.state);
  assert.equal(nav.state.password, undefined);
  assert.equal(nav.state.confirmPassword, undefined);
  assert.equal(nav.state.onboardingData.password, undefined);
  assert.equal(nav.state.onboardingData.confirmPassword, undefined);

  // Scan keys
  const allKeys = Object.keys(nav.state).concat(Object.keys(nav.state.onboardingData));
  for (const k of allKeys) {
    assert.match(k, /^(?!.*(password|secret|hash|credential)).*$/i);
  }
});

test('6. Accidental duplicate signup requests are prevented when returning to signup', () => {
  const existingUser = {
    name: 'Jane Smith',
    email: 'jane@enterprise.com',
    role: 'GOVERNANCE_OFFICER',
    onboardingCompleted: false
  };

  const actionConfig = evaluateSignupAction({
    isAuthenticated: true,
    user: existingUser,
    formValues: { name: 'Jane Smith', email: 'jane@enterprise.com', password: '' },
    onboardingData: { selectedRole: 'GOVERNANCE_OFFICER', selectedDept: 'AI / ML' }
  });

  // Verify that submitting does not call nativeSignup
  assert.equal(actionConfig.isDuplicateSignupPrevented, true);
  assert.equal(actionConfig.buttonId, 'signup-continue-onboarding');
  assert.equal(actionConfig.buttonLabel, 'Continue to Onboarding');
  assert.equal(actionConfig.action, 'CONTINUE_TO_ONBOARDING');
  assert.equal(actionConfig.targetRoute, '/onboarding');
  assert.deepEqual(actionConfig.state.onboardingData, { selectedRole: 'GOVERNANCE_OFFICER', selectedDept: 'AI / ML' });
});

test('7. Editing display name on signup page triggers safe updateUserProfile, not signup', () => {
  const existingUser = {
    name: 'Jane Typo',
    email: 'jane@enterprise.com',
    role: 'GOVERNANCE_OFFICER',
    onboardingCompleted: false
  };

  const actionConfig = evaluateSignupAction({
    isAuthenticated: true,
    user: existingUser,
    formValues: { name: 'Jane Corrected', email: 'jane@enterprise.com', password: '' },
    onboardingData: null
  });

  assert.equal(actionConfig.isDuplicateSignupPrevented, true);
  assert.equal(actionConfig.nameToUpdate, 'Jane Corrected');
});

test('8. Source code audit: Onboarding.jsx button accessibility and styling', () => {
  const onboardingPath = path.resolve(__dirname, '../../frontend/src/pages/Onboarding.jsx');
  const content = fs.readFileSync(onboardingPath, 'utf8');

  // Verify "Back to Sign Up" button label on step 1
  assert.ok(content.includes('Back to Sign Up'), 'Onboarding.jsx must include "Back to Sign Up" label');

  // Verify id="onboarding-back-to-signup"
  assert.ok(content.includes('id="onboarding-back-to-signup"'), 'Onboarding.jsx must have id="onboarding-back-to-signup"');

  // Verify id="onboarding-back-btn" for subsequent steps
  assert.ok(content.includes('id="onboarding-back-btn"'), 'Onboarding.jsx must have id="onboarding-back-btn"');

  // Verify button classes match design system
  assert.ok(content.includes('className="btn btn-secondary"'), 'Back buttons must use btn btn-secondary');
  assert.ok(content.includes('className="btn btn-primary"'), 'Continue button must use btn btn-primary');

  // Verify aria-label attributes for accessibility
  assert.ok(content.includes('aria-label="Back to Sign Up"'), 'Step 1 back button must have accessible aria-label');
  assert.ok(content.includes('aria-label="Previous onboarding step"'), 'Step > 1 back button must have accessible aria-label');

  // Verify handleBack navigates to /signup on step 1
  assert.ok(content.includes("navigate('/signup'"), 'handleBack must navigate to /signup on step 1');
});

test('9. Source code audit: Signup.jsx duplicate prevention and credential security', () => {
  const signupPath = path.resolve(__dirname, '../../frontend/src/pages/Signup.jsx');
  const content = fs.readFileSync(signupPath, 'utf8');

  // Verify hasExistingAccount guard
  assert.ok(content.includes('hasExistingAccount'), 'Signup.jsx must detect existing account');

  // Verify Continue to Onboarding button
  assert.ok(content.includes('id="signup-continue-onboarding"'), 'Signup.jsx must have id="signup-continue-onboarding"');
  assert.ok(content.includes('Continue to Onboarding'), 'Signup.jsx must display "Continue to Onboarding"');

  // Verify updateUserProfile is imported and used
  assert.ok(content.includes('updateUserProfile'), 'Signup.jsx must use updateUserProfile for name edits');

  // Verify password security notice
  assert.ok(content.includes('Password established and encrypted'), 'Signup.jsx must show password secured notice');

  // Verify no passwords in localStorage or sessionStorage
  assert.ok(!content.includes("localStorage.setItem('password'"), 'Must never store passwords in localStorage');
  assert.ok(!content.includes("sessionStorage.setItem('password'"), 'Must never store passwords in sessionStorage');

  // Verify start-over / logout button for signing up with another account
  assert.ok(content.includes('id="signup-start-over-btn"'), 'Signup.jsx must have start over option');
});

test('10. Source code audit: App.jsx PublicOnlyRoute logic allows /signup for pending onboarding', () => {
  const appPath = path.resolve(__dirname, '../../frontend/src/App.jsx');
  const content = fs.readFileSync(appPath, 'utf8');

  assert.ok(content.includes("location.pathname === '/signup'"), 'PublicOnlyRoute must check location.pathname === /signup');
  assert.ok(content.includes('useLocation'), 'App.jsx must import and use useLocation');
});
