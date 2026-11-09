// ============================================
// VELTRONIK V2 - CLASES (gym)
// ============================================
// Grilla semanal de clases fijas: se definen por día de la semana, así que la
// misma clase se repite todas las semanas (navegar el calendario cambia las
// fechas del encabezado, no las clases).
// ============================================

import { useState, useMemo } from 'react';
import { useToast } from '../contexts/ToastContext';
import { errorService } from '../services';
import { useClassController } from '../controllers/useClassController';
import { formatTime, getDayName } from '../lib/utils';
import { PageHeader, ConfirmDialog, EmptyState } from '../components/Layout';
import Modal, { ModalActions } from '../components/ui/Modal';
import Icon from '../components/Icon';
import DaySelector from '../components/ui/DaySelector';

const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const COLORS = ['#0EA5E9', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
/** Para el lector de pantalla y el cartelito: un círculo de color no dice cuál es. */
const NOMBRE_DEL_COLOR = {
  '#0EA5E9': 'Celeste', '#22C55E': 'Verde', '#F59E0B': 'Naranja',
  '#EF4444': 'Rojo', '#8B5CF6': 'Violeta', '#EC4899': 'Rosa',
};

/** Las clases de un día, de la más temprana a la más tarde (antes salían en el orden de carga:
 *  el martes decía 09:00, 19:00 y después 18:00). */
const porHora = (a, b) => String(a.start_time || '').localeCompare(String(b.start_time || ''));

/** «de los lunes», «de los sábados»: cada clase es de UN día, y se borra solo ese. */
const losDias = (dia) => {
  const nombre = getDayName(dia).toLowerCase();
  return nombre.endsWith('s') ? nombre : `${nombre}s`;
};

const INITIAL_FORM = {
  name: '', instructor: '', start_time: '', end_time: '',
  day_of_week: '', capacity: 20, room: '', color: '#0EA5E9', description: '', status: 'active',
  days_of_week: [],
};

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function ClassesPage() {
  const { showToast } = useToast();
  // Controller
  const {
    classes,
    loading: isFetching,
    saveClass,
    deleteClass,
  } = useClassController();

  const [view, setView] = useState('calendar');
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);

  // Detail modal
  const [detailModal, setDetailModal] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);

  // Delete
  const [deleteId, setDeleteId] = useState(null);

  // Week navigation
  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  // "21 al 27 de septiembre", o "29 de septiembre al 5 de octubre" cuando cruza de mes.
  const weekLabel = useMemo(() => {
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
      'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const mismoMes = end.getMonth() === weekStart.getMonth();
    return mismoMes
      ? `${weekStart.getDate()} al ${end.getDate()} de ${months[end.getMonth()]}`
      : `${weekStart.getDate()} de ${months[weekStart.getMonth()]} al ${end.getDate()} de ${months[end.getMonth()]}`;
  }, [weekStart]);

  const hayClasesActivas = classes.some((c) => c.status === 'active');

  const changeWeek = (dir) => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  // Handlers
  const openNew = () => { setEditingId(null); setForm(INITIAL_FORM); setModalOpen(true); };

  const openEdit = (cls) => {
    setEditingId(cls.id);
    setForm({
      name: cls.name || '', instructor: cls.instructor || '',
      start_time: cls.start_time || '', end_time: cls.end_time || '',
      day_of_week: cls.day_of_week?.toString() || '', capacity: cls.capacity || 20,
      room: cls.room || '', color: cls.color || '#0EA5E9',
      description: cls.description || '', status: cls.status || 'active',
    });
    setModalOpen(true);
  };

  const openDetail = (cls) => {
    setSelectedClass(cls);
    setDetailModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Poné el nombre de la clase', 'error'); return; }
    // "08:00" contra "09:00": con dos cifras siempre, comparar el texto es comparar la hora.
    if (form.start_time && form.end_time && form.end_time <= form.start_time) {
      showToast('La clase tiene que terminar después de la hora de inicio', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const data = { 
          ...form, 
          day_of_week: form.day_of_week !== '' ? parseInt(form.day_of_week) : null, 
          capacity: form.capacity !== '' ? parseInt(form.capacity) : 20 
        };
        delete data.days_of_week;
        Object.keys(data).forEach((k) => { if (data[k] === '') data[k] = null; });
        data.id = editingId;
        await saveClass(data);
        showToast('Clase actualizada', 'success');
      } else {
        if (!form.days_of_week || form.days_of_week.length === 0) {
          showToast('Seleccioná al menos un día', 'warning');
          setSaving(false);
          return;
        }
        // Una clase por día. Si se corta a mitad, los días que ya se crearon salen de la
        // selección: volver a tocar "Guardar" no los duplica.
        const dias = [...form.days_of_week];
        let hechos = 0;
        try {
          for (const day of dias) {
            const data = {
              ...form,
              day_of_week: day,
              capacity: form.capacity !== '' ? parseInt(form.capacity) : 20
            };
            delete data.days_of_week;
            Object.keys(data).forEach((k) => { if (data[k] === '') data[k] = null; });
            await saveClass(data);
            hechos++;
          }
        } catch (error) {
          if (hechos === 0) throw error;
          setForm(f => ({ ...f, days_of_week: dias.slice(hechos) }));
          throw new Error(`Se crearon ${hechos} de ${dias.length} días; quedaron marcados los que faltan. ${errorService.getMessage(error)}`);
        }
        showToast(dias.length === 1 ? 'Clase creada' : `Clase creada para ${dias.length} días`, 'success');
      }

      setModalOpen(false);
    } catch (error) {
      showToast(error.message || errorService.getMessage(error), 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteClass(deleteId);
      showToast('Clase eliminada', 'success');
      setDeleteId(null);
      setDetailModal(false);
    } catch (error) { showToast(errorService.getMessage(error), 'error'); }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const aBorrar = deleteId ? classes.find((c) => c.id === deleteId) : null;

  return (
    <div className="classes-page">
      <PageHeader title="Clases y actividades" subtitle="Los horarios fijos de cada semana" icon="calendarEvent"
        actions={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Nueva clase</button>} />

      {/* La barra de la semana: como la de filtros, el encabezado ES la tarjeta. */}
      <div className="card card-barra mb-3">
        <div className="table-header">
          {/* Las semanas solo en el calendario: la lista es la de todas las semanas, y ahí las
              flechas no cambiaban nada (parecía que no andaban). */}
          {view === 'calendar' ? (
            <div className="calendar-nav">
              <button className="btn btn-secondary btn-sm" onClick={() => changeWeek(-1)} aria-label="Semana anterior" title="Semana anterior">
                <Icon name="chevronLeft" size="1em" />
              </button>
              <span className="current-week">{weekLabel}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => changeWeek(1)} aria-label="Semana siguiente" title="Semana siguiente">
                <Icon name="chevronRight" size="1em" />
              </button>
            </div>
          ) : (
            <span className="lista-todas-las-semanas">Se repiten todas las semanas</span>
          )}
          <div className="view-toggle">
            <button className={`btn btn-sm ${view === 'calendar' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('calendar')}><Icon name="calendarEvent" size="1em" /> Calendario</button>
            <button className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setView('list')}><Icon name="list" size="1em" /> Lista</button>
          </div>
        </div>
      </div>

      {isFetching ? (
        <div className="dashboard-loading"><span className="spinner" /> Cargando clases...</div>
      ) : view === 'calendar' && !hayClasesActivas ? (
        /* Sin ninguna clase: UN cartel que dice qué hacer, no siete columnas que dicen "Sin
           clases" cada una. */
        <div className="card">
          <EmptyState icon="calendarEvent" title="Todavía no hay clases"
            description="Creá la primera y aparece en el calendario de la semana."
            action={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" /> Nueva clase</button>} />
        </div>
      ) : view === 'calendar' ? (
        /* Weekly Calendar */
        <div className="card">
          <div className="weekly-calendar">
            {weekDates.map((date, i) => {
              const dayOfWeek = date.getDay();
              const isToday = date.getTime() === today.getTime();
              const dayClasses = classes.filter(c => c.day_of_week === dayOfWeek && c.status === 'active').sort(porHora);

              return (
                <div key={i} className="day-column">
                  <div className={`day-header ${isToday ? 'today' : ''}`}>
                    <div className="day-name">{DAY_NAMES_SHORT[dayOfWeek]}</div>
                    <div className="day-date">{date.getDate()}/{date.getMonth() + 1}</div>
                  </div>
                  <div className="day-classes">
                    {/* Un botón y no un <div>: con el teclado también se abre. */}
                    {dayClasses.length > 0 ? dayClasses.map(cls => (
                      <button type="button" key={cls.id} className="class-card"
                        style={{ borderLeftColor: cls.color || '#0EA5E9' }}
                        onClick={() => openDetail(cls)}>
                        <span className="class-time">{formatTime(cls.start_time)} - {formatTime(cls.end_time)}</span>
                        <span className="class-name">{cls.name}</span>
                        <span className="class-instructor">{cls.instructor || 'Sin instructor'}</span>
                        <span className="class-spots available"><Icon name="users" size="0.9em" /> {cls.capacity || 20} cupos</span>
                      </button>
                    )) : <div className="no-classes">Sin clases</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* List View */
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Clase</th><th>Instructor</th><th>Día</th><th>Horario</th><th>Cupos</th><th>Estado</th><th aria-label="Acciones" /></tr>
              </thead>
              <tbody>
                {classes.length === 0 ? (
                  <tr><td colSpan="7" className="table-empty"><EmptyState icon="calendarEvent" title="Todavía no hay clases" description="Creá la primera y aparece en el calendario de la semana." /></td></tr>
                ) : classes.map(cls => (
                  <tr key={cls.id}>
                    <td data-label="Clase"><div className="flex items-center gap-1">
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: cls.color || '#0EA5E9', display: 'inline-block' }} />
                      <strong>{cls.name}</strong>
                    </div></td>
                    <td data-label="Instructor">{cls.instructor || '-'}</td>
                    <td data-label="Día">{getDayName(cls.day_of_week)}</td>
                    <td data-label="Horario">{formatTime(cls.start_time)} - {formatTime(cls.end_time)}</td>
                    <td data-label="Cupos">{cls.capacity || 20}</td>
                    <td data-label="Estado"><span className={`badge ${cls.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                      {cls.status === 'active' ? 'Activa' : 'Inactiva'}</span></td>
                    <td data-label="Acciones"><div className="table-actions">
                      <button className="action-btn-quick action-btn-payment" onClick={() => openEdit(cls)} title="Editar" aria-label={`Editar ${cls.name}`}><Icon name="edit" /></button>
                      <button className="action-btn-quick action-btn-delete"
                        onClick={() => setDeleteId(cls.id)} title="Eliminar" aria-label={`Eliminar ${cls.name}`}><Icon name="trash" /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Class CRUD Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar clase' : 'Nueva clase'}
      >
        <form onSubmit={handleSave}>
          <div className="modal-form">
            <div className="form-group full-width">
              <label className="form-label">Nombre *</label>
              <input type="text" className="form-input" placeholder="Ej: Spinning, Yoga"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Instructor</label>
              <input type="text" className="form-input" value={form.instructor}
                onChange={e => setForm(f => ({ ...f, instructor: e.target.value }))} />
            </div>
            {editingId ? (
              <div className="form-group">
                <label className="form-label">Día de la semana *</label>
                <select className="form-select" value={form.day_of_week}
                  onChange={e => setForm(f => ({ ...f, day_of_week: e.target.value }))} required>
                  <option value="">Seleccionar...</option>
                  <option value="1">Lunes</option>
                  <option value="2">Martes</option>
                  <option value="3">Miércoles</option>
                  <option value="4">Jueves</option>
                  <option value="5">Viernes</option>
                  <option value="6">Sábado</option>
                  <option value="0">Domingo</option>
                </select>
              </div>
            ) : (
              <div className="form-group full-width">
                <label className="form-label">Días de la semana *</label>
                <DaySelector
                  ayuda="Elegí los días de la clase: se crea una por cada día"
                  selectedDays={form.days_of_week || []}
                  onChange={(days) => setForm(f => ({ ...f, days_of_week: days }))}
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Hora inicio *</label>
              <input type="time" className="form-input" value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Hora fin *</label>
              <input type="time" className="form-input" value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Capacidad</label>
              <input type="number" className="form-input" min="1" max="100" value={form.capacity}
                onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Sala/Lugar</label>
              <input type="text" className="form-input" value={form.room}
                onChange={e => setForm(f => ({ ...f, room: e.target.value }))} />
            </div>
            <div className="form-group full-width">
              <label className="form-label">Color</label>
              <div className="class-color-picker" role="group" aria-label="Color de la clase">
                {COLORS.map(c => (
                  <button type="button" key={c} className={`color-option ${form.color === c ? 'selected' : ''}`}
                    style={{ background: c }} title={NOMBRE_DEL_COLOR[c]} aria-label={NOMBRE_DEL_COLOR[c]}
                    aria-pressed={form.color === c} onClick={() => setForm(f => ({ ...f, color: c }))} />
                ))}
              </div>
            </div>
            <div className="form-group full-width">
              <label className="form-label">Descripción</label>
              <textarea className="form-textarea" rows="2" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <ModalActions onCancel={() => setModalOpen(false)} saving={saving} />
        </form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={detailModal && !!selectedClass}
        onClose={() => setDetailModal(false)}
        title={selectedClass && (
          <>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: selectedClass.color, display: 'inline-block', marginRight: 8 }} />
            {selectedClass.name}
          </>
        )}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => setDetailModal(false)}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => { setDetailModal(false); openEdit(selectedClass); }}>Editar</button>
            <button className="btn btn-danger" onClick={() => setDeleteId(selectedClass.id)}>Eliminar</button>
          </>
        }
      >
        {selectedClass && (
          <>
            <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <p className="text-muted mb-1" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}><Icon name="calendarEvent" size="1em" /> {getDayName(selectedClass.day_of_week)} · {formatTime(selectedClass.start_time)} - {formatTime(selectedClass.end_time)}</p>
              <p className="text-muted mb-1" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}><Icon name="user" size="1em" /> {selectedClass.instructor || 'Sin instructor'}</p>
              <p className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}><Icon name="users" size="1em" /> {selectedClass.capacity || 20} cupos · {selectedClass.room || 'Sin sala'}</p>
            </div>
            {selectedClass.description && (
              <p className="text-muted" style={{ marginTop: 0, marginBottom: '1rem' }}>{selectedClass.description}</p>
            )}
          </>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteId} title="Eliminar clase" message={aBorrar
        ? `Se borra «${aBorrar.name}» de los ${losDias(aBorrar.day_of_week)} de ${formatTime(aBorrar.start_time)} a ${formatTime(aBorrar.end_time)}. Las de los otros días quedan como están.`
        : '¿Eliminar esta clase?'}
        icon="trash" confirmText="Eliminar" confirmClass="btn-danger" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}
