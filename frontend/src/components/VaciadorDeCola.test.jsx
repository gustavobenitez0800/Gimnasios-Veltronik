// @vitest-environment happy-dom
//
// ============================================
// VELTRONIK - Tests del vaciado de la cola
// ============================================
// ⚠️ ESTE COMPONENTE EXISTE POR UN AGUJERO QUE TENÍA LA PRIMERA VERSIÓN. El vaciado vivía en
// la pantalla de Acceso, así que solo corría mientras ESA pantalla estuviera abierta: un
// terminal que quedó en el Dashboard cuando volvió el internet se guardaba las visitas
// adentro hasta que a alguien se le ocurriera volver al mostrador. Y como no avisa nada,
// podían pasar días.
//
// Lo que hay en esa cola son visitas reales que el gimnasio TODAVÍA NO TIENE en ningún otro
// lado. Que suban no puede depender de en qué pantalla quedó parado el terminal — y eso es
// exactamente lo que fijan estos tests.
// ============================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const toast = { showToast: vi.fn() };
const accessService = { enviarEncolado: vi.fn() };
const cola = { vaciar: vi.fn(), disponible: vi.fn(() => true) };
const sesion = { orgId: '11111111-1111-1111-1111-111111111111' };

vi.mock('../contexts/ToastContext', () => ({ useToast: () => toast }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => sesion }));
vi.mock('../services', () => ({ accessService }));
vi.mock('../lib/colaAccesos', () => ({
  vaciar: (...a) => cola.vaciar(...a),
  disponible: () => cola.disponible(),
}));

/**
 * La conexión, en manos del test: `cortado` es lo que declara el sondeo del escritorio cuando
 * el servidor no contesta aunque Windows diga que hay red.
 */
const conexion = { cortado: false, oyentes: new Set() };
vi.mock('../lib/conexion', () => ({
  sinConexion: () => conexion.cortado || navigator.onLine === false,
  alCambiarLaConexion: (fn) => { conexion.oyentes.add(fn); return () => conexion.oyentes.delete(fn); },
}));
const alDia = { refrescarTodo: vi.fn(), refrescarSocios: vi.fn(() => Promise.resolve()) };
vi.mock('../hooks/queryCacheStore', () => ({ refrescarTodo: (...a) => alDia.refrescarTodo(...a) }));
vi.mock('../lib/localMembers', () => ({ refrescarSocios: (...a) => alDia.refrescarSocios(...a) }));

/** Lo que avisa lib/conexion cuando el sondeo vuelve a encontrar al servidor. */
async function volvioElServidor() {
  conexion.cortado = false;
  await act(async () => { for (const fn of [...conexion.oyentes]) fn(true); });
  await act(async () => { await Promise.resolve(); });
}

const { default: VaciadorDeCola, EVENTO_COLA_CAMBIO } = await import('./VaciadorDeCola');

/** Pone (o saca) la máquina en modo "sin red". */
function sinRed(hay) {
  Object.defineProperty(window.navigator, 'onLine', { value: hay, configurable: true });
}

let root;
let container;

async function montar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<VaciadorDeCola />); });
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.clearAllMocks();
  cola.disponible.mockReturnValue(true);
  cola.vaciar.mockResolvedValue({ enviados: 0, quedan: 0, descartados: 0 });
  sinRed(true);
  conexion.cortado = false;
  sesion.orgId = '11111111-1111-1111-1111-111111111111';
});

// Sin desmontar, el vaciador de un test seguía escuchando en el siguiente.
afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  root = null;
  container = null;
});

describe('⚠️ sin sucursal no sale nada', () => {
  // ENCONTRADO AL REVÉS: una fila en la cola con `intentos: 2` y ningún motivo a la vista.
  //
  // El escritorio arranca BORRANDO `current_org_id` a propósito (`main.desktop.jsx`: la
  // sucursal la manda el enrolamiento, no el localStorage), así que en cada arranque hay una
  // ventana sin sucursal. Un acceso que sale ahí viaja sin `X-Tenant-ID` y el backend lo corta
  // (hoy con 400 TENANT_CONTEXT_MISSING; antes de la fase A de la sesión, con 401).
  //
  // No se perdía nada —un 401 no es definitivo, la fila se queda—, pero se quemaban dos
  // intentos en CADA arranque, para siempre.

  it('no intenta subir mientras la app no sabe en qué gimnasio está', async () => {
    sesion.orgId = null;

    await montar();

    expect(cola.vaciar, 'sin sucursal el pedido es un 401 seguro').not.toHaveBeenCalled();
  });

  it('y arranca solo apenas la sucursal aparece', async () => {
    sesion.orgId = null;
    await montar();
    expect(cola.vaciar).not.toHaveBeenCalled();

    sesion.orgId = '22222222-2222-2222-2222-222222222222';
    await act(async () => { root.render(<VaciadorDeCola />); });
    await act(async () => { await Promise.resolve(); });

    expect(cola.vaciar, 'esperar no puede significar no subir nunca').toHaveBeenCalledTimes(1);
  });
});

describe('el vaciado corre esté abierta la pantalla que esté', () => {
  it('intenta apenas monta, sin que nadie abra el mostrador', async () => {
    await montar();
    expect(cola.vaciar).toHaveBeenCalledTimes(1);
  });

  it('vuelve a intentar cuando el navegador avisa que volvió la red', async () => {
    await montar();
    cola.vaciar.mockClear();

    await act(async () => { window.dispatchEvent(new Event('online')); });
    await act(async () => { await Promise.resolve(); });

    expect(cola.vaciar).toHaveBeenCalled();
  });

  it('sin red NO intenta: serían pedidos condenados a fallar', async () => {
    sinRed(false);
    await montar();
    expect(cola.vaciar).not.toHaveBeenCalled();
  });

  it('en la web no hace nada: ahí no hay cola', async () => {
    cola.disponible.mockReturnValue(false);
    await montar();
    expect(cola.vaciar).not.toHaveBeenCalled();
  });
});

describe('lo que le cuenta al resto de la app', () => {
  it('avisa por evento para que el mostrador vuelva a contar', async () => {
    const oido = vi.fn();
    window.addEventListener(EVENTO_COLA_CAMBIO, oido);

    await montar();

    expect(oido).toHaveBeenCalled();
    window.removeEventListener(EVENTO_COLA_CAMBIO, oido);
  });

  it('cuando sube algo lo dice, y en singular si fue una sola', async () => {
    cola.vaciar.mockResolvedValue({ enviados: 1, quedan: 0, descartados: 0 });
    await montar();

    const mensaje = toast.showToast.mock.calls.at(-1)?.[0] || '';
    expect(mensaje).toContain('1');
    expect(mensaje).toMatch(/registró/);
    expect(mensaje).not.toMatch(/registraron/);
  });

  it('⚠️ y dice "acceso", NO "entrada": la dirección no la sabe nadie todavía', async () => {
    // Lo vio el dueño en pantalla: subió una SALIDA y el aviso le dijo "entrada".
    //
    // La cola no sabe la dirección —eso lo decide el servidor mirando el estado del socio en
    // el momento en que ocurrió—, y desde que la salida sin conexión también pasa por acá,
    // llamarle "entrada" a lo que sube es directamente falso la mitad de las veces. Es la
    // misma regla que ya aplica el mostrador cuando dice "Guardado sin conexión" en vez de
    // "Entrada registrada".
    //
    // Se fija con un test porque cuando cambió el texto, la suite entera siguió en verde: no
    // había nada mirándolo.
    cola.vaciar.mockResolvedValue({ enviados: 2, quedan: 0, descartados: 0 });
    await montar();

    const mensaje = toast.showToast.mock.calls.at(-1)?.[0] || '';
    expect(mensaje).toContain('accesos');
    expect(mensaje, 'puede haber sido una salida').not.toMatch(/entrada/i);
  });

  it('si no subió nada, no molesta a nadie', async () => {
    await montar();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it('un vaciado que explota no rompe la app: la cola se reintenta sola', async () => {
    cola.vaciar.mockRejectedValue(new Error('lo que sea'));
    const oido = vi.fn();
    window.addEventListener(EVENTO_COLA_CAMBIO, oido);

    await montar();

    expect(container.innerHTML, 'no dibuja nada, ni siquiera cuando falla').toBe('');
    expect(oido, 'y avisa igual: quizá alcanzó a subir algo antes de fallar').toHaveBeenCalled();
    window.removeEventListener(EVENTO_COLA_CAMBIO, oido);
  });
});

describe('⭐ al volver la conexión, todo se pone al día solo', () => {
  // REPORTADO POR EL DUEÑO (30/09): al prender internet, Socios, Pagos y la Caja seguían
  // mostrando lo que habían sacado de la copia local. Había que salir y volver a entrar.

  it('⚠️ con el corte declarado no intenta, aunque Windows diga que hay red', async () => {
    // El router prendido y sin internet: `navigator.onLine` en true, el servidor sin contestar.
    conexion.cortado = true;
    await montar();
    expect(cola.vaciar).not.toHaveBeenCalled();
  });

  it('al volver el servidor, sube la cola y pone todo al día — sin ningún `online`', async () => {
    conexion.cortado = true;
    await montar();

    await volvioElServidor();

    expect(cola.vaciar).toHaveBeenCalledTimes(1);
    expect(alDia.refrescarTodo).toHaveBeenCalledTimes(1);
    expect(alDia.refrescarSocios).toHaveBeenCalledWith(sesion.orgId);
  });

  it('⭐ PRIMERO sube la cola y DESPUÉS se piden los datos', async () => {
    // Al revés, la Caja traería del servidor unos totales SIN los cobros hechos sin conexión:
    // un número más bajo que el que se veía un segundo antes.
    conexion.cortado = true;
    await montar();
    let terminarVaciado;
    cola.vaciar.mockReturnValue(new Promise((r) => { terminarVaciado = r; }));

    await volvioElServidor();
    expect(alDia.refrescarTodo, 'la cola todavía está subiendo').not.toHaveBeenCalled();

    await act(async () => { terminarVaciado({ enviados: 2, quedan: 0, descartados: 0 }); });
    await act(async () => { await Promise.resolve(); });

    expect(alDia.refrescarTodo).toHaveBeenCalledTimes(1);
  });

  it('volviendo sin nada en la cola, igual pone todo al día', async () => {
    // Lo que se vio sin conexión salió de la copia: está viejo aunque no se haya encolado nada.
    conexion.cortado = true;
    await montar();

    await volvioElServidor();

    expect(alDia.refrescarTodo).toHaveBeenCalled();
  });

  it('con conexión, si el vaciado de rutina sube algo, también pone todo al día', async () => {
    cola.vaciar.mockResolvedValue({ enviados: 3, quedan: 0, descartados: 0 });
    await montar();
    expect(alDia.refrescarTodo).toHaveBeenCalledTimes(1);
  });

  it('y si no subió nada, no molesta a las pantallas', async () => {
    await montar();
    expect(alDia.refrescarTodo).not.toHaveBeenCalled();
  });
});
