// ============================================
// VELTRONIK - ORG TYPE GUARD
// ============================================
// Route guard that ensures the user's current
// organization type matches the required type.
// Redirects to /dashboard if there's a mismatch.
//
// Usage: <Route element={<OrgTypeGuard allowedTypes={['GYM']} />}>
//          <Route path="/members" ... />
//        </Route>
// ============================================

import { Navigate, Outlet } from 'react-router-dom';
import CONFIG from '../lib/config';

/**
 * Checks that the currently selected org type matches at least one
 * of the allowed types. If not, redirects to dashboard.
 *
 * @param {{ allowedTypes: string[] }} props
 *   allowedTypes — array of ORG_TYPES, e.g. ['GYM'] or ['RESTO']
 */
export default function OrgTypeGuard({ allowedTypes }) {
  const currentOrgType = localStorage.getItem('current_org_type') || 'GYM';

  if (!allowedTypes.includes(currentOrgType)) {
    // Mismatch: user is trying to access routes that don't belong to their org type
    return <Navigate to={CONFIG.ROUTES.DASHBOARD} replace />;
  }

  return <Outlet />;
}
