// ============================================
// VELTRONIK - FilterBar Component
// ============================================
// Barra de filtros reutilizable con búsqueda
// y selects opcionales.
// ============================================

export default function FilterBar({
  onSearch,
  searchPlaceholder = 'Buscar...',
  searchMaxWidth = 340,
  filters = [],  // [{ value, onChange, options: [{value, label}], style }]
  count = null,
  countLabel = '',
  children = null,
}) {
  return (
    <div className="card mb-3">
      <div className="table-header">
        <div className="table-filters">
          {onSearch && (
            <input
              type="text"
              className="form-input"
              placeholder={searchPlaceholder}
              onChange={onSearch}
              style={{ maxWidth: searchMaxWidth }}
            />
          )}
          {filters.map((filter, i) => (
            <select
              key={i}
              className="form-select"
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              style={filter.style || { width: 'auto' }}
            >
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ))}
          {children}
        </div>
        {count !== null && (
          <span className="text-muted">
            {count} {countLabel}
          </span>
        )}
      </div>
    </div>
  );
}
