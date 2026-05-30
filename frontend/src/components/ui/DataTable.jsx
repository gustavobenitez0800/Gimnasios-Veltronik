// ============================================
// VELTRONIK - DataTable Component
// ============================================
// Tabla de datos genérica con loading state,
// empty state, y soporte para acciones por fila.
// ============================================

export default function DataTable({
  columns,  // [{ key, label, render?: (row) => JSX }]
  data,
  loading = false,
  emptyMessage = 'No se encontraron datos',
  loadingMessage = 'Cargando...',
  onRowClick = null,
}) {
  return (
    <div className="card">
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center text-muted"
                  style={{ padding: '3rem' }}
                >
                  <span className="spinner" /> {loadingMessage}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center text-muted"
                  style={{ padding: '3rem' }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} data-label={col.label}>
                      {col.render ? col.render(row) : row[col.key] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
