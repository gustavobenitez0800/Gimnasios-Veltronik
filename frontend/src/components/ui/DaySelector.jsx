// ============================================
// VELTRONIK - DaySelector Component
// ============================================
// Selector de días de la semana reutilizable.
// Usado en MembersPage para attendanceDays.
// ============================================

const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lunes a Domingo

/**
 * Selector interactivo de días de la semana.
 * @param {number[]} selectedDays — Array de índices de días seleccionados
 * @param {Function} onChange — Callback con el nuevo array de días
 * @param {boolean} readOnly — Si es solo lectura (muestra pills sin interacción)
 * @param {string} ayuda — Lo que dice abajo mientras no hay ningún día elegido. El de siempre es
 *   el del socio; Clases pasa el suyo (decía «los días que asistirá el socio» en una clase).
 */
export default function DaySelector({
  selectedDays = [], onChange, readOnly = false, ayuda = 'Seleccioná los días que asistirá el socio',
}) {
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
      {/* Botones y no <div>: se eligen también con el teclado, y el lector de pantalla dice el
          día entero ("Miércoles", no "X") y si está elegido. */}
      <div className="days-selector" role="group" aria-label="Días de la semana">
        {DAY_ORDER.map((day) => (
          <button
            type="button"
            key={day}
            className={`day-option ${selectedDays.includes(day) ? 'selected' : ''}`}
            onClick={() => toggleDay(day)}
            title={DAY_NAMES[day]}
            aria-label={DAY_NAMES[day]}
            aria-pressed={selectedDays.includes(day)}
          >
            {DAY_LETTERS[day]}
          </button>
        ))}
      </div>
      <div className="days-summary">
        {selectedDays.length === 0
          ? ayuda
          : `${selectedDays.length} día${selectedDays.length > 1 ? 's' : ''} seleccionado${selectedDays.length > 1 ? 's' : ''}`}
      </div>
    </>
  );
}

// Exportar constantes para uso externo
export { DAY_LETTERS, DAY_NAMES, DAY_ORDER };
