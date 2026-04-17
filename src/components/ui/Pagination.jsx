// ============================================
// VELTRONIK - Pagination Component
// ============================================
// Componente de paginación reutilizable.
// Diseñado para funcionar con usePagination hook.
// ============================================

export default function Pagination({
  page,
  totalPages,
  pageStart,
  pageEnd,
  totalCount,
  visiblePages,
  isFirstPage,
  isLastPage,
  goToNext,
  goToPrev,
  goToPage,
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination-container">
      <div className="pagination-info">
        Mostrando {pageStart}-{pageEnd} de {totalCount}
      </div>
      <div className="pagination-controls">
        <button
          className="btn btn-secondary btn-sm"
          onClick={goToPrev}
          disabled={isFirstPage}
        >
          ← Anterior
        </button>
        <div className="pagination-pages">
          {visiblePages.map((pageNum) => (
            <button
              key={pageNum}
              className={`page-btn ${page === pageNum ? 'active' : ''}`}
              onClick={() => goToPage(pageNum)}
            >
              {pageNum + 1}
            </button>
          ))}
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={goToNext}
          disabled={isLastPage}
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
