# Aegis AI — UI/UX Design System & Guidelines

This document details the visual design principles, typography, color tokens, layout hierarchy, and component conventions established for Aegis AI.

---

## 1. Visual Design Philosophy & Aesthetic Requirements

- **Design Persona:** Clean, international-grade Enterprise SaaS (inspired by modern governance platforms like Datadog, Snowflake, Linear, and Stripe).
- **Primary Aesthetic:** Professional, crisp, modern, and accessible.
- **Color Philosophy:**
  - Employs deep slate navy and charcoal (`#0F172A`, `#1E293B`) for navigation and structural chrome.
  - **Explicitly Avoids:** Pure pitch black (`#000000`), cyberpunk themes, glowing neon borders, matrix-style effects, or overly aggressive saturated gradients.
  - Accentuated by clean primary cobalt blue (`#2563EB`) and emerald green (`#16A34A`).
- **Typography:** Inter, system-ui, -apple-system, sans-serif. High legibility, tabular numbers (`font-variant-numeric: tabular-nums`) for statistical tables.

---

## 2. Core Color Tokens & CSS Variables

Defined in [frontend/src/index.css](file:///d:/Projects/ai%20govern/frontend/src/index.css):

```css
:root {
  /* Surfaces & Backgrounds */
  --bg-app: #F8FAFC;          /* Main application canvas */
  --bg-surface: #FFFFFF;      /* Cards, tables, modals */
  --bg-subtle: #F1F5F9;       /* Secondary containers, input fills */
  
  /* Text & Typography */
  --text-primary: #0F172A;    /* Slate-900: Primary titles and data values */
  --text-secondary: #475569;  /* Slate-600: Descriptions and secondary labels */
  --text-muted: #94A3B8;      /* Slate-400: Metadata timestamps and placeholders */
  
  /* Borders & Dividers */
  --border-color: #E2E8F0;    /* Slate-200: Card borders, table dividers */
  --border-light: #F1F5F9;    /* Subtle inner dividers */
  
  /* Brand & Accents */
  --primary-blue: #2563EB;    /* Blue-600: Primary CTA buttons, active tabs */
  --primary-hover: #1D4ED8;   /* Blue-700 */
  --primary-subtle: #EFF6FF;  /* Blue-50: Active badge backgrounds */
  
  /* Semantic Status Tokens */
  --status-success: #16A34A;  /* Emerald-600: Passed gates, healthy PSI, approved */
  --status-success-bg: #F0FDF4;
  --status-warning: #D97706;  /* Amber-600: Warning PSI, pending review */
  --status-warning-bg: #FFFBEB;
  --status-danger: #DC2626;   /* Red-600: Policy violations, drift, critical errors */
  --status-danger-bg: #FEF2F2;
  
  /* Structural Dimensions */
  --sidebar-width: 250px;
  --sidebar-collapsed-width: 68px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
}
```

---

## 3. Structural Layout & Navigation Architecture

### 1. Left Sidebar Navigation (`Sidebar.jsx`):
- Persistent left rail supporting smooth toggle collapse between `250px` (expanded) and `68px` (collapsed).
- **Grouped Categories:**
  - *Platform Administration:* Users & Roles (Visible to `PLATFORM_ADMIN`).
  - *Lifecycle & Governance:* Dashboard, Model Registry, Fairness & Eval Studio, Policy Management, Approval Center, Runtime Drift & Health, Incident Management, Audit Trail & Ledger, Compliance Dossier.
  - *Operational:* Governance Issue Reporting.

### 2. Top Header Navigation Bar (`Navbar.jsx`):
- Displays breadcrumbs, organization badge, light/dark theme toggle, system status indicators, and user persona menu.
- Displays persistent warning banner when `user.verificationStatus === 'PENDING'`.

---

## 4. Component Conventions

### 1. Cards (`MetricCard.jsx`):
- Clean white background, 1px solid border (`--border-color`), subtle shadow on hover (`box-shadow: 0 4px 12px rgba(0,0,0,0.05)`).
- Contains icon container with subtle brand background, small uppercase label, large primary metric value, and change indicator badge.

### 2. Status Badges (`StatusBadge.jsx`, `RiskBadge.jsx`):
- Rounded pill badges (`border-radius: 9999px`) with 12px font size and bold weights.
- Color coordinated:
  - `HIGH` Risk: Red text with light red background.
  - `LIMITED` Risk: Amber text with light amber background.
  - `MINIMAL` Risk: Slate text with light slate background.
  - `IN_PRODUCTION`: Emerald text with light emerald background.
  - `DEPRECATED`: Slate text with light gray background.

### 3. Lifecycle Stepper (`LifecycleStepper.jsx`):
- Displays horizontal progression through stages:
  $\text{Draft} \rightarrow \text{Under Review} \rightarrow \text{Evaluation} \rightarrow \text{Approval Gate} \rightarrow \text{Approved} \rightarrow \text{In Production}$.
- Green checkmark for completed stages, clock icon for active stage, red 'X' when blocked by governance policy failures.

### 4. Triad State Pattern (Mandatory for all Data Views):
1. **Loading State:** Must render `<LoadingSkeleton />` with realistic pulse animations. Never leave an empty or flickering screen.
2. **Empty State:** Must render `<EmptyState />` featuring a clean SVG icon, friendly heading, explanatory subtext, and clear call-to-action button.
3. **Error State:** Must render `<ErrorState />` with a distinct warning icon, humanized error message, and a "Retry" button.
