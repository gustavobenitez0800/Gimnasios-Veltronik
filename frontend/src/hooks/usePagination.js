// ============================================
// VELTRONIK - usePagination Hook
// ============================================
// Hook para lógica de paginación reutilizable.
// ============================================

import { useState, useMemo, useCallback } from 'react';

/**
 * @param {number} totalCount — Total de registros
 * @param {number} pageSize — Registros por página
 */
export function usePagination(totalCount = 0, pageSize = 25) {
  const [page, setPage] = useState(0);

  const totalPages = useMemo(
    () => Math.ceil(totalCount / pageSize),
    [totalCount, pageSize]
  );

  const pageStart = page * pageSize + 1;
  const pageEnd = Math.min((page + 1) * pageSize, totalCount);

  const goToNext = useCallback(() => {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }, [totalPages]);

  const goToPrev = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const goToPage = useCallback((n) => {
    setPage(n);
  }, []);

  const reset = useCallback(() => {
    setPage(0);
  }, []);

  /**
   * Generar array de números de página visibles (máximo 5).
   */
  const visiblePages = useMemo(() => {
    const maxVisible = 5;
    const count = Math.min(maxVisible, totalPages);
    return Array.from({ length: count }, (_, i) => {
      if (totalPages <= maxVisible) return i;
      if (page < 3) return i;
      if (page > totalPages - 4) return totalPages - maxVisible + i;
      return page - 2 + i;
    });
  }, [page, totalPages]);

  return {
    page,
    totalPages,
    pageStart,
    pageEnd,
    visiblePages,
    isFirstPage: page === 0,
    isLastPage: page >= totalPages - 1,
    goToNext,
    goToPrev,
    goToPage,
    reset,
    setPage,
  };
}
