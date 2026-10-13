import React, { createContext, useContext, useState, useMemo } from 'react';
import { useAuth } from './AuthContext';

const RoleContext = createContext();

export const ROLES = [
  { id: 'ML_LEAD', name: 'ML Lead', title: 'ML Lead' },
  { id: 'GOVERNANCE_OFFICER', name: 'Governance Officer', title: 'Governance Officer' },
  { id: 'EXECUTIVE_APPROVER', name: 'Executive Approver', title: 'Executive Approver' },
  { id: 'PLATFORM_ADMIN', name: 'Platform Administrator', title: 'Platform Admin' }
];

export function RoleProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [mockRole, setMockRole] = useState(ROLES[0]);

  // When authenticated, the backend-assigned role is authoritative.
  // When unauthenticated, preserve mock persona selection from authoritative ROLES only.
  const currentRole = useMemo(() => {
    if (isAuthenticated && user?.role) {
      const matched = ROLES.find(r => r.id === user.role);
      if (matched) {
        return {
          id: matched.id,
          name: user.name || matched.name,
          title: user.title || matched.title
        };
      }
      // If legacy or unrecognized role, fallback strictly to GOVERNANCE_OFFICER
      const fallback = ROLES.find(r => r.id === 'GOVERNANCE_OFFICER') || ROLES[0];
      return fallback;
    }
    return mockRole;
  }, [isAuthenticated, user, mockRole]);

  const switchRole = (roleId) => {
    if (isAuthenticated) {
      console.warn('[RoleContext] Role cannot be overridden: Authenticated Sentinel Govern role is server-authoritative.');
      return;
    }
    const found = ROLES.find(r => r.id === roleId);
    if (found) setMockRole(found);
  };

  return (
    <RoleContext.Provider value={{ currentRole, switchRole, roles: ROLES, isAuthoritative: isAuthenticated }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within a RoleProvider');
  return context;
}
