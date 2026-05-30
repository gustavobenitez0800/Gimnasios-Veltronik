// ============================================
// VELTRONIK - ORG TYPE GUARD
// ============================================
// Route guard that ensures the user's current
// organization type matches the required type.
// Reads from AuthContext (reactive) with localStorage
// fallback only during initial load.
//
// Usage: <Route element={<OrgTypeGuard allowedTypes={['GYM']} />}>
//          <Route path="/members" ... />
//        </Route>
// ============================================

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CONFIG from '../lib/config';

/**
 * Checks that the currently selected org type matches at least one
 * of the allowed types. If not, redirects to dashboard.
 *
 * @param {{ allowedTypes: string[] }} props
 *   allowedTypes — array of ORG_TYPES, e.g. ['GYM'] or ['RESTO']
 */
export default function OrgTypeGuard({ allowedTypes }) {
  const { gym, loading } = useAuth();

  // While auth is loading, render nothing to avoid premature redirects
  if (loading) return null;

  // Read from context first, localStorage only as fallback for F5 scenarios
  const currentOrgType = gym?.type || localStorage.getItem('current_org_type') || 'GYM';

  if (!allowedTypes.includes(currentOrgType)) {
    // Mismatch: user is trying to access routes that don't belong to their org type
    return <Navigate to={CONFIG.ROUTES.DASHBOARD} replace />;
  }

  return <Outlet />;
}
