// ============================================
// VELTRONIK - useFilteredData Hook
// ============================================
// Hook para filtrar y buscar en arrays de datos.
// ============================================

import { useMemo } from 'react';

/**
 * @param {Array} data — Array de datos a filtrar
 * @param {object} filters — { search: string, ...otherFilters }
 * @param {object} config — Configuración de filtrado
 * @param {string[]} config.searchFields — Campos en los que buscar (e.g. ['full_name', 'dni'])
 * @param {object} config.exactFilters — { filterKey: dataField } para filtros exactos
 */
export function useFilteredData(data = [], filters = {}, config = {}) {
  const { searchFields = [], exactFilters = {} } = config;

  const filteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.filter((item) => {
      // Search filter
      if (filters.search && searchFields.length > 0) {
        const query = filters.search.toLowerCase();
        const matches = searchFields.some((field) => {
          // Soporta campos anidados (e.g. 'member.full_name')
          const value = field.split('.').reduce((obj, key) => obj?.[key], item);
          return value && String(value).toLowerCase().includes(query);
        });
        if (!matches) return false;
      }

      // Exact match filters
      for (const [filterKey, dataField] of Object.entries(exactFilters)) {
        if (filters[filterKey] && item[dataField] !== filters[filterKey]) {
          return false;
        }
      }

      // Custom filter function
      if (filters.customFilter && typeof filters.customFilter === 'function') {
        if (!filters.customFilter(item)) return false;
      }

      return true;
    });
  }, [data, filters, searchFields, exactFilters]);

  return filteredData;
}
