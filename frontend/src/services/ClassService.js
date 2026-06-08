import apiClient from '../lib/apiClient';

/**
 * Adaptador entre el contrato del backend y la forma que usa la UI de Clases.
 *
 * El backend (entidad GymClass) habla camelCase y usa `isActive` (boolean) y
 * `dayOfWeek` (String). La UI de Clases trabaja en snake_case con `status`
 * ('active'/'inactive') y un día NUMÉRICO (0=Dom … 6=Sáb).
 *
 * Sin este adaptador el front mandaba `day_of_week`/`start_time`/`end_time` y
 * Jackson (que espera camelCase) los ignoraba → `day_of_week` viajaba NULL →
 * violaba el NOT NULL al guardar. Además rompía la lectura (el calendario nunca
 * encontraba clases porque leía `day_of_week` y el backend devolvía `dayOfWeek`).
 */
function fromApi(c) {
  if (!c) return c;
  return {
    id: c.id,
    name: c.name || '',
    instructor: c.instructor || '',
    day_of_week:
      c.dayOfWeek !== null && c.dayOfWeek !== undefined && c.dayOfWeek !== ''
        ? Number(c.dayOfWeek)
        : null,
    start_time: c.startTime || '',
    end_time: c.endTime || '',
    capacity: c.capacity ?? 20,
    room: c.room || '',
    color: c.color || '#0EA5E9',
    description: c.description || '',
    // El backend serializa el booleano como JSON "active" (Jackson). El estado se deriva de ahí.
    status: c.active === false ? 'inactive' : 'active',
  };
}

function toApi(c) {
  return {
    name: c.name ?? null,
    instructor: c.instructor ?? null,
    dayOfWeek:
      c.day_of_week !== null && c.day_of_week !== undefined && c.day_of_week !== ''
        ? String(c.day_of_week)
        : null,
    startTime: c.start_time ?? null,
    endTime: c.end_time ?? null,
    capacity:
      c.capacity !== null && c.capacity !== undefined && c.capacity !== ''
        ? Number(c.capacity)
        : 20,
    room: c.room ?? null,
    color: c.color ?? null,
    description: c.description ?? null,
    active: c.status ? c.status === 'active' : true,
  };
}

class ClassService {
  async getActiveClasses() {
    const response = await apiClient.get('/gym/classes');
    return Array.isArray(response.data) ? response.data.map(fromApi) : [];
  }

  async create(classData) {
    const response = await apiClient.post('/gym/classes', toApi(classData));
    return fromApi(response.data);
  }

  async update(id, updates) {
    const response = await apiClient.put(`/gym/classes/${id}`, toApi(updates));
    return fromApi(response.data);
  }

  async delete(id) {
    await apiClient.delete(`/gym/classes/${id}`);
    return true;
  }
}

export const classService = new ClassService();
