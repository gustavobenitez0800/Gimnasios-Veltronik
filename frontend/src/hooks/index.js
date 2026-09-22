// ============================================
// VELTRONIK - HOOKS INDEX
// ============================================

export { useModal } from './useModal';
export { useConfirmDialog } from './useConfirmDialog';
export { usePagination } from './usePagination';
export { useDebouncedSearch } from './useDebouncedSearch';
export { useQueryCache, invalidateQueries, clearQueryCache } from './useQueryCache';
export { useRefrescoAutomatico } from './useRefrescoAutomatico';
// El mostrador se entera al instante de lo que pasa en la puerta (QR, molinete).
export { useNovedadesDeLaPuerta } from './useNovedadesDeLaPuerta';
export { useEstaEnLinea } from './useEstaEnLinea';
export { useLoadOnMount } from './useLoadOnMount';
export { useVisualViewport } from './useVisualViewport';
export { useMonthlyPrice, useMonthlyPriceLabel } from './useMonthlyPrice';
// Molinete facial: si esta computadora le llega al equipo y está configurado.
export { useMolinete } from './useMolinete';
