// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Clases: lo que se arregló en el recorrido del 09/11/2026
// ============================================
//   1. Dentro de cada día, las clases van por hora (el martes decía 09:00, 19:00, 18:00).
//   2. "Eliminar" dice QUÉ clase se borra (cada clase es de un solo día).
//   3. En la lista no hay flechas de semana: ahí no cambiaban nada.
//   4. Una clase no puede terminar antes de empezar.
//   5. Si crear una clase de varios días se corta a mitad, reintentar no duplica los creados.
// Datos inventados (el repositorio es público).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const CLASES = [
  { id: 'c1', name: 'Spinning', instructor: 'Ana', day_of_week: 2, start_time: '19:00', end_time: '19:50', capacity: 15, status: 'active', color: '#F59E0B' },
  { id: 'c2', name: 'Yoga', instructor: 'Beto', day_of_week: 2, start_time: '09:00', end_time: '10:00', capacity: 16, status: 'active', color: '#8B5CF6' },
  { id: 'c3', name: 'Cross training', instructor: 'Ceci', day_of_week: 2, start_time: '18:00', end_time: '19:00', capacity: 18, status: 'active', color: '#EF4444' },
];

const toastEstable = { showToast: vi.fn() };
const saveClass = vi.fn();
const controladorEstable = { classes: CLASES, loading: false, saveClass, deleteClass: vi.fn() };

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toastEstable }));
vi.mock('../services', () => ({ errorService: { getMessage: (e) => String(e?.message || e) } }));
vi.mock('../controllers/useClassController', () => ({ useClassController: () => controladorEstable }));

const { default: ClassesPage } = await import('./ClassesPage');

let root;
let container;

const listo = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); }); };

async function pintar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<ClassesPage />); });
  await listo();
}

async function clic(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await listo();
}

const boton = (texto) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);

const setValor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
async function escribir(input, valor) {
  await act(async () => {
    setValor.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function nuevaClase({ nombre, inicio, fin, dias = [] }) {
  await clic(boton('Nueva clase'));
  const dialogo = document.querySelector('[role="dialog"]');
  const [campoNombre] = dialogo.querySelectorAll('input[type="text"]');
  const [campoInicio, campoFin] = dialogo.querySelectorAll('input[type="time"]');
  await escribir(campoNombre, nombre);
  await escribir(campoInicio, inicio);
  await escribir(campoFin, fin);
  for (const dia of dias) await clic(dialogo.querySelector(`button[aria-label="${dia}"]`));
  return dialogo;
}

const guardar = async (dialogo) => {
  await act(async () => {
    dialogo.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await listo();
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
});

afterEach(() => {
  if (root) act(() => root.unmount());
  container?.remove();
  document.body.innerHTML = '';
});

describe('Clases', () => {
  it('🔴 dentro de cada día van por hora, no en el orden en que se cargaron', async () => {
    await pintar();
    const horas = [...container.querySelectorAll('.class-card .class-time')].map((n) => n.textContent);
    expect(horas).toEqual(['09:00 - 10:00', '18:00 - 19:00', '19:00 - 19:50']);
  });

  it('cada clase del calendario es un botón: se abre también con el teclado', async () => {
    await pintar();
    const tarjeta = container.querySelector('.class-card');
    expect(tarjeta.tagName).toBe('BUTTON');
    await clic(tarjeta);
    expect(document.body.textContent).toContain('Martes · 09:00 - 10:00');
  });

  it('"Eliminar" dice qué clase se borra y que las de otros días quedan', async () => {
    await pintar();
    await clic(boton('Lista'));
    await clic(container.querySelector('button[aria-label="Eliminar Spinning"]'));
    expect(document.body.textContent).toContain('Se borra «Spinning» de los martes de 19:00 a 19:50. Las de los otros días quedan como están.');
  });

  it('en la lista no hay flechas de semana (ahí no cambiaban nada)', async () => {
    await pintar();
    expect(container.querySelector('button[aria-label="Semana anterior"]')).not.toBeNull();
    await clic(boton('Lista'));
    expect(container.querySelector('button[aria-label="Semana anterior"]')).toBeNull();
    expect(container.textContent).toContain('Se repiten todas las semanas');
  });

  it('🔴 una clase que termina antes de empezar no se guarda', async () => {
    await pintar();
    const dialogo = await nuevaClase({ nombre: 'Zumba', inicio: '20:00', fin: '19:00', dias: ['Lunes'] });
    await guardar(dialogo);
    expect(saveClass).not.toHaveBeenCalled();
    expect(toastEstable.showToast).toHaveBeenCalledWith('La clase tiene que terminar después de la hora de inicio', 'warning');
  });

  it('🔴 si se corta a mitad, reintentar crea solo los días que faltaban', async () => {
    saveClass
      .mockResolvedValueOnce({ id: 'n1' })
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValueOnce({ id: 'n2' });
    await pintar();
    const dialogo = await nuevaClase({ nombre: 'Zumba', inicio: '20:00', fin: '21:00', dias: ['Lunes', 'Miércoles'] });

    await guardar(dialogo);
    expect(saveClass).toHaveBeenCalledTimes(2);
    expect(toastEstable.showToast.mock.calls.at(-1)[0]).toContain('Se crearon 1 de 2 días');
    expect(dialogo.querySelector('button[aria-label="Lunes"]').getAttribute('aria-pressed')).toBe('false');
    expect(dialogo.querySelector('button[aria-label="Miércoles"]').getAttribute('aria-pressed')).toBe('true');

    await guardar(dialogo);
    expect(saveClass).toHaveBeenCalledTimes(3);
    expect(saveClass.mock.calls[2][0].day_of_week).toBe(3);
    expect(toastEstable.showToast.mock.calls.at(-1)).toEqual(['Clase creada', 'success']);
  });
});
