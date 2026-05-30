// ============================================
// VELTRONIK - FormField Component
// ============================================
// Campo de formulario genérico con label,
// input/select/textarea, y mensajes de error.
// ============================================

export default function FormField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder = '',
  required = false,
  fullWidth = false,
  error = null,
  hint = null,
  options = null, // Para select: [{ value, label }]
  rows = 2,       // Para textarea
  children = null, // Contenido custom
  ...rest         // Props adicionales (min, max, step, etc.)
}) {
  const fieldClass = `form-group${fullWidth ? ' full-width' : ''}`;

  const handleChange = (e) => {
    if (onChange) onChange(e.target.value);
  };

  const renderInput = () => {
    // Custom children (ej: DaySelector)
    if (children) return children;

    // Textarea
    if (type === 'textarea') {
      return (
        <textarea
          className="form-textarea"
          rows={rows}
          value={value ?? ''}
          onChange={handleChange}
          placeholder={placeholder}
          required={required}
          {...rest}
        />
      );
    }

    // Select
    if (type === 'select' && options) {
      return (
        <select
          className="form-select"
          value={value ?? ''}
          onChange={handleChange}
          required={required}
          {...rest}
        >
          {options.map((opt) =>
            typeof opt === 'string' ? (
              <option key={opt} value={opt}>{opt}</option>
            ) : (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            )
          )}
        </select>
      );
    }

    // Standard input (text, email, tel, number, date, etc.)
    return (
      <input
        type={type}
        className="form-input"
        value={value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        {...rest}
      />
    );
  };

  return (
    <div className={fieldClass}>
      {label && <label className="form-label">{label}{required ? ' *' : ''}</label>}
      {renderInput()}
      {hint && <div className="form-hint">{hint}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
