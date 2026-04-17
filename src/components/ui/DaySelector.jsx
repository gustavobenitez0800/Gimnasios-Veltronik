// ============================================
// VELTRONIK - DaySelector Component
// ============================================
// Selector de días de la semana reutilizable.
// Usado en MembersPage para attendance_days.
// ============================================

const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lunes a Domingo

/**
 * Selector interactivo de días de la semana.
 * @param {number[]} selectedDays — Array de índices de días seleccionados
 * @param {Function} onChange — Callback con el nuevo array de días
 * @param {boolean} readOnly — Si es solo lectura (muestra pills sin interacción)
 */
export default function DaySelector({ selectedDays = [], onChange, readOnly = false }) {
  const toggleDay = (day) => {
    if (readOnly) return;
    const newDays = selectedDays.includes(day)
      ? selectedDays.filter((d) => d !== day)
      : [...selectedDays, day];
    onChange(newDays);
  };

  if (readOnly) {
    return (
      <div className="attendance-pills">
        {selectedDays.length > 0 ? (
          DAY_ORDER.map((d) => (
            <span
              key={d}
              className={`day-pill ${selectedDays.includes(d) ? 'active' : ''}`}
            >
              {DAY_LETTERS[d]}
            </span>
          ))
        ) : (
          <span className="text-muted" style={{ fontSize: '0.7rem' }}>
            —
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="days-selector">
        {DAY_ORDER.map((day) => (
          <div
            key={day}
            className={`day-option ${selectedDays.includes(day) ? 'selected' : ''}`}
            onClick={() => toggleDay(day)}
            title={DAY_NAMES[day]}
          >
            {DAY_LETTERS[day]}
          </div>
        ))}
      </div>
      <div className="days-summary">
        {selectedDays.length === 0
          ? 'Seleccioná los días que asistirá el socio'
          : `${selectedDays.length} día${selectedDays.length > 1 ? 's' : ''} seleccionado${selectedDays.length > 1 ? 's' : ''}`}
      </div>
    </>
  );
}

// Exportar constantes para uso externo
export { DAY_LETTERS, DAY_NAMES, DAY_ORDER };
