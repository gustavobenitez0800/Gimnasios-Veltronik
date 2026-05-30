// ============================================
// VELTRONIK - useDebouncedSearch Hook
// ============================================
// Hook para búsqueda con debounce integrado.
// ============================================

import { useState, useMemo, useCallback } from 'react';
import { debounce } from '../lib/utils';

/**
 * @param {number} delay — Tiempo de debounce en ms
 * @param {Function} onReset — Callback opcional al cambiar búsqueda (ej: resetear paginación)
 */
export function useDebouncedSearch(delay = 300, onReset = null) {
  const [search, setSearch] = useState('');

  const debouncedSetSearch = useMemo(
    () =>
      debounce((value) => {
        setSearch(value);
        if (onReset) onReset();
      }, delay),
    [delay, onReset]
  );

  const handleSearchInput = useCallback(
    (e) => {
      debouncedSetSearch(e.target.value);
    },
    [debouncedSetSearch]
  );

  const clearSearch = useCallback(() => {
    setSearch('');
    if (onReset) onReset();
  }, [onReset]);

  return { search, handleSearchInput, clearSearch, setSearch };
}
