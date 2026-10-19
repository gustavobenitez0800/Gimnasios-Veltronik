// ============================================
// LA CAJA — el estado y las acciones del cierre diario
// ============================================
// Todo lo que pages/CajaPage.jsx sabe y hace, sin nada de dibujo. Por qué la caja funciona
// así (sin arqueo a ciegas, el fondo, los egresos) está explicado arriba de la página.

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { cajaService } from '../services/CajaService';
import { errorService } from '../services';
import { formatDate, sumarPlata } from '../lib/utils';
import { diasDesde, numero, EXCEL_DEL } from '../lib/formatoDeCaja';
import { getShift } from '../lib/shift';
import { descargarExcelDeCaja } from '../lib/excelDeCaja';
import { useRangoDeFechas, problemaDelRango } from '../hooks/useRangoDeFechas';
import { useAlPonerseAlDia } from '../hooks/useAlPonerseAlDia';

export function useCajaController() {
  const { showToast } = useToast();
  const { orgRole, profile } = useAuth();
  const esDueno = ['owner', 'admin'].includes(orgRole);

  const [abierto, setAbierto] = useState(null);
  const [cobros, setCobros] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  // Un pedido que falló no es un período vacío. Mostrar "0 cobros" cuando no se pudo
  // preguntar hace que alguien cierre una caja creyendo que no entró nada.
  const [fallo, setFallo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // ─── El balance de ingresos: el rango que elige el dueño ───
  //
  // Es una pregunta DISTINTA de "¿qué hay sin cerrar?". Si nadie cerró ayer, el período
  // abierto arrastra dos días y esto sigue diciendo lo de hoy. Por eso son dos pedidos y no
  // una resta sobre el mismo número. El selector es el mismo de Pagos (Hoy, Semana, Mes, Año
  // o dos fechas a mano).
  const rango = useRangoDeFechas('today');
  const { desde: balanceDesde, hasta: balanceHasta } = rango;
  const [balance, setBalance] = useState(null);
  // De qué rango son los números de `balance`. Mientras llega el del rango nuevo, los de antes
  // se ven apagados: son de otras fechas que las que dice el título.
  const [rangoDelBalance, setRangoDelBalance] = useState('');
  const balanceAlDia = rangoDelBalance === `${balanceDesde}|${balanceHasta}`;
  const ultimoPedidoDeBalance = useRef(0);
  const [hayBalance, setHayBalance] = useState(true);

  // ─── El Excel para el contador ───
  // ⭐ BAJA EL RANGO DEL SELECTOR, Y NADA MÁS. Hasta el 22/10 el título tenía su propio "Día"
  // (arrancaba en hoy) además del Desde/Hasta del balance: el dueño ponía el período en el
  // selector, apretaba el botón azul del título y bajaba el Excel de HOY, con el aviso de
  // "Excel descargado". Y ese "Día" se quedaba en el día en que se abrió la pantalla. Ahora hay
  // una sola fuente (useRangoDeFechas) y el botón dice qué período va a bajar.
  const [exportando, setExportando] = useState(false);
  const excelDel = rango.problema ? 'Excel del período' : EXCEL_DEL[rango.periodo]
    || (balanceDesde === balanceHasta
      ? `Excel del ${formatDate(balanceDesde)}`
      : `Excel del ${formatDate(balanceDesde)} al ${formatDate(balanceHasta)}`);

  // Lo único que se declara al cerrar.
  const [retiro, setRetiro] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState(null);

  // ─── Los movimientos de caja: lo que sale y entra sin ser un cobro ───
  //
  // ⚠️ ESTO ES LO QUE EVITA QUE LA CAJA MIENTA TODOS LOS DÍAS. Se le pagan $15.000 a la
  // chica de la limpieza del cajón; si no queda anotado, el sistema espera esa plata igual.
  const [movsCaja, setMovsCaja] = useState([]);
  // ¿El backend de este gimnasio sabe de movimientos? Uno que todavía no actualizó responde
  // 404, y ahí los botones se esconden en vez de ofrecer algo que va a fallar.
  const [hayMovimientos, setHayMovimientos] = useState(true);
  const [anotando, setAnotando] = useState(false);
  const [movTipo, setMovTipo] = useState('EGRESO');
  const [movCategoria, setMovCategoria] = useState('');
  const [movDetalle, setMovDetalle] = useState('');
  const [movMonto, setMovMonto] = useState('');
  const [movMetodo, setMovMetodo] = useState('CASH');

  const cargarBalance = useCallback(async (desde, hasta) => {
    const pedido = ++ultimoPedidoDeBalance.current;
    // Una fecha a medio escribir (el año pasa por 0002, 0020 y 0202), al revés o de más de un
    // año: no se pregunta nada. ⚠️ Y NO SE ESCONDE EL BLOQUE: preguntar por el 0002-09-01 hacía
    // que el servidor contestara "rango demasiado largo", y el catch de abajo escondía el
    // balance —con el selector adentro— mientras el dueño escribía el año.
    if (problemaDelRango(desde, hasta)) return;
    try {
      const b = await cajaService.balanceDeRango(desde, hasta);
      // Escribiendo una fecha salen varios pedidos seguidos: si uno viejo llega último, no pisa
      // al del rango que está puesto.
      if (pedido !== ultimoPedidoDeBalance.current) return;
      setBalance(b);
      setRangoDelBalance(`${desde}|${hasta}`);
      setHayBalance(true);
    } catch {
      if (pedido !== ultimoPedidoDeBalance.current) return;
      // Backend viejo o sin conexión: el bloque se esconde y el cierre sigue funcionando.
      setBalance(null);
      setRangoDelBalance('');
      setHayBalance(false);
    }
  }, []);

  const exportar = async (desde, hasta) => {
    const problema = problemaDelRango(desde, hasta);
    if (problema) {
      showToast(problema.texto, 'error');
      return;
    }
    setExportando(true);
    try {
      await descargarExcelDeCaja(await cajaService.reporte(desde, hasta));
      showToast('Excel descargado.', 'success');
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setExportando(false);
    }
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    setFallo(false);

    // ⚠️ LOS MOVIMIENTOS SE CARGAN PRIMERO Y APARTE, Y AHORA NO ES SOLO PRECAUCIÓN.
    //
    // Nació así para que un backend sin esta función no dejara el cierre inutilizable. Con
    // los egresos sin internet pasó a ser necesario: sin conexión, el período abierto falla
    // —lo calcula el servidor— y dentro del mismo try eso se llevaba puesta la lista. Quien
    // acaba de anotar un gasto no lo vería, y lo cargaría de nuevo.
    try {
      setMovsCaja((await cajaService.movimientosDeCaja()) || []);
      setHayMovimientos(true);
    } catch {
      setMovsCaja([]);
      setHayMovimientos(false);
    }

    // ⚠️⚠️ ACÁ NO VA UN Promise.all, Y COSTÓ UNA PRUEBA EN UNA MÁQUINA DESCUBRIRLO.
    //
    // `Promise.all` se cae ENTERO si una sola de sus promesas falla. Los totales ya sabían
    // resolverse sin conexión —salen del espejo local— pero viajaban en el mismo Promise.all
    // que la lista de cobros, que iba derecho al servidor. Sin internet la lista explotaba y
    // se llevaba puestos los totales: la caja aparecía con TODO EN CERO, sin el cartel que
    // avisa, y ofreciendo cerrar un día que no había podido leer.
    //
    // Y es la MISMA trampa que el bloque de arriba ya había resuelto para los movimientos,
    // una llamada más allá. Por eso ahora las tres van separadas por lo que valen:
    //
    //   · los TOTALES mandan. Sin ellos no se puede cerrar, y no se debe ofrecer.
    //   · la lista de cobros y el historial son complemento: si faltan, se cierra igual.
    const [tot, lista] = await Promise.allSettled([
      cajaService.abierto(),
      cajaService.movimientos(),
    ]);

    if (tot.status === 'fulfilled') {
      setAbierto(tot.value);
    } else {
      setFallo(true);
      showToast(errorService.getMessage(tot.reason), 'error');
    }

    setCobros(lista.status === 'fulfilled' ? (lista.value || []) : []);

    if (esDueno) {
      try {
        setHistorial(await cajaService.historial(60));
      } catch {
        // El historial es del dueño y no hace falta para cerrar el día. Que no ande sin
        // conexión no puede trabar a quien está con el cajón adelante.
      }
    }

    setCargando(false);
  }, [esDueno, showToast]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { cargarBalance(balanceDesde, balanceHasta); }, [cargarBalance, balanceDesde, balanceHasta]);

  // ⭐ Volvió la conexión, o subió lo que esperaba en la cola: lo que se ve salió de la copia
  // del terminal y el servidor ya sabe más. Sin esto la caja seguía mostrando los números de
  // la copia —sin el balance, que sin red se esconde— hasta salir y volver a entrar.
  useAlPonerseAlDia(() => {
    cargar();
    cargarBalance(balanceDesde, balanceHasta);
  });

  // ─── La cuenta del cajón, en un solo lugar ───
  //
  // El backend manda `esperadoEnElCajon` ya calculado (fondo + efectivo + ingresos −
  // egresos). Acá NO se recalcula: una cuenta de plata copiada en dos lados es una cuenta
  // que en algún lado va a estar mal, y este proyecto ya se comió esa lección tres veces.
  const enElCajon = numero(abierto?.esperadoEnElCajon);
  const retiroNum = useMemo(() => {
    const n = parseFloat(retiro);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [retiro]);
  const quedaEnCaja = Math.max(0, enElCajon - retiroNum);
  const retiroExcedido = retiroNum > enElCajon;

  const pedirMovimiento = (tipo) => {
    setMovTipo(tipo);
    setMovCategoria('');
    setMovDetalle('');
    setMovMonto('');
    setMovMetodo('CASH');
    setAnotando(true);
  };

  const anotarMovimiento = async (e) => {
    e?.preventDefault();
    if (!movCategoria) {
      showToast('Elegí en qué fue el gasto.', 'error');
      return;
    }
    if (movMonto.trim() === '' || !(parseFloat(movMonto) > 0)) {
      showToast('Escribí cuánta plata fue.', 'error');
      return;
    }
    // ⚠️ El detalle es obligatorio en los egresos y no es burocracia: es lo ÚNICO que hace
    // la lista revisable. "Proveedor — agua, factura 4412" se puede verificar; "Proveedor",
    // no. Un egreso inventado es el robo perfecto de este módulo.
    if (movTipo === 'EGRESO' && !movDetalle.trim()) {
      showToast('Escribí en qué se gastó. Sin eso no se puede verificar después.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const turno = getShift();
      const guardado = await cajaService.registrarMovimiento({
        tipo: movTipo,
        categoria: movCategoria,
        detalle: movDetalle.trim() || null,
        monto: parseFloat(movMonto),
        metodo: movMetodo,
        hechoPor: turno?.name || profile?.fullName || 'Sin identificar',
      });
      setAnotando(false);
      // ⚠️ SIN INTERNET NO SE DICE "ANOTADO" A SECAS. El renglón está guardado y la plata
      // salió del cajón —eso es cierto y hay que decirlo— pero el servidor todavía no lo
      // sabe. Decir lo mismo en los dos casos es la mentira chiquita que después vuelve
      // como "lo anoté y no está".
      const queEs = movTipo === 'EGRESO' ? 'Gasto' : 'Ingreso';
      showToast(
        guardado?.encolado
          ? `${queEs} guardado sin conexión. Sube solo cuando vuelva el internet.`
          : `${queEs} anotado.`,
        'success',
      );
      cargar();
      cargarBalance(balanceDesde, balanceHasta);
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  };

  // Anular un movimiento pide el motivo en un diálogo NUESTRO. Acá había un `window.prompt`:
  // el cartel gris del navegador, sin el aspecto del sistema, que además bloquea toda la
  // pantalla y en el escritorio (Electron) puede ni aparecer.
  const [anulando, setAnulando] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');

  const pedirAnulacion = (mov) => {
    setMotivoAnulacion('');
    setAnulando(mov);
  };

  const confirmarAnulacion = async (e) => {
    e?.preventDefault();
    if (!anulando) return;
    // El motivo queda registrado a la vista de todos: es lo que hace que anular no sea
    // borrar. Sin motivo no se anula.
    if (!motivoAnulacion.trim()) {
      showToast('Escribí por qué se anula. Queda registrado.', 'error');
      return;
    }
    setGuardando(true);
    try {
      const turno = getShift();
      await cajaService.anularMovimiento(anulando.id, {
        motivo: motivoAnulacion.trim(),
        anuladoPor: turno?.name || profile?.fullName || 'Sin identificar',
      });
      setAnulando(null);
      showToast('Movimiento anulado.', 'success');
      cargar();
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const cerrarCaja = async () => {
    setGuardando(true);
    try {
      const turno = getShift();
      const cierre = await cajaService.cerrar({
        retiroEfectivo: retiroNum,
        nota: null,
        cerradoPor: turno?.name || profile?.fullName || 'Sin identificar',
        // ⭐ LO QUE ESTA PANTALLA MOSTRÓ, no lo que el servidor va a calcular. Viaja para
        // quedar guardado AL LADO del número del servidor: si las dos cuentas difieren, eso
        // queda registrado en vez de desaparecer. El que decide la plata sigue siendo el del
        // servidor, que cuando recibe esto ya recibió todos los cobros del día.
        esperadoSegunTerminal: enElCajon,
        cobrosSegunTerminal: numero(abierto?.cantidadCobros),
      });
      setConfirmando(false);
      setRetiro('');
      setResultado(cierre);
      if (cierre?.encolado) {
        showToast('Caja cerrada. Se manda sola cuando vuelva internet.', 'success');
      }
      cargar();
      cargarBalance(balanceDesde, balanceHasta);
    } catch (err) {
      showToast(errorService.getMessage(err), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const sinCerrarHace = diasDesde(abierto?.ultimoCierre);
  // En centavos: 0,1 + 0,2 no da 0,3 en JavaScript.
  const totalCobrado = sumarPlata([abierto?.efectivo, abierto?.digital, abierto?.tarjeta, abierto?.otros]);

  return {
    esDueno, abierto, cobros, historial, cargando, fallo, guardando,
    rango, balanceDesde, balanceHasta, balance, balanceAlDia, hayBalance,
    exportando, exportar, excelDel,
    retiro, setRetiro, confirmando, setConfirmando, resultado, setResultado,
    movsCaja, hayMovimientos, anotando, setAnotando,
    movTipo, movCategoria, setMovCategoria, movDetalle, setMovDetalle,
    movMonto, setMovMonto, movMetodo, setMovMetodo, pedirMovimiento, anotarMovimiento,
    anulando, setAnulando, motivoAnulacion, setMotivoAnulacion, pedirAnulacion, confirmarAnulacion,
    cerrarCaja, enElCajon, retiroNum, quedaEnCaja, retiroExcedido, sinCerrarHace, totalCobrado,
  };
}
