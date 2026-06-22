// ============================================
// VELTRONIK - useWorkspace (manifiesto del backend)
// ============================================
// Trae GET /tenants/{id}/workspace → { tenantId, orgType, role, modules }.
// El front dibuja la navegación según `modules` (el backend es la fuente única de
// la política de roles). Si el endpoint todavía no está deployado o falla, devuelve
// null y el consumidor cae a su lógica por rol heredada (seguro ante orden de deploy).

import { useQuery } from '@tanstack/react-query';
import apiClient from '../lib/apiClient';

export function useWorkspace(orgId) {
  const { data } = useQuery({
    queryKey: ['workspace', orgId],
    enabled: !!orgId,
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      try {
        const res = await apiClient.get(`/tenants/${orgId}/workspace`);
        return res.data;
      } catch {
        // Backend viejo (sin el endpoint) o sin acceso → fallback silencioso.
        return null;
      }
    },
  });
  return data ?? null;
}
