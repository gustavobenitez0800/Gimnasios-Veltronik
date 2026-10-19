// ============================================
// VELTRONIK - CIERRE DE CAJA DIARIO
// ============================================
// Una pregunta: ¿la plata que entró al sistema es la plata que hay?
//
// ─── EL CAMBIO DEL 2026-09-02, Y POR QUÉ ───
//
// Esta pantalla era un ARQUEO A CIEGAS: quien cerraba contaba la plata, escribía el monto
// sin poder ver lo esperado, y recién ahí el sistema mostraba la diferencia. La idea era
// que no se pudiera "ajustar" el número al esperado.
//
// El dueño lo cambió, y el motivo es bueno: el sistema YA SABE cuánto entró por efectivo y
// cuánto por transferencia —cada cobro tiene su forma de pago— así que hacer que una
// persona lo vuelva a averiguar y lo tipee es rehacer a mano una cuenta ya hecha. Ahora la
// pantalla lo muestra sumado, y lo único que decide una persona es CUÁNTO SE LLEVA.
//
// ⚠️ LO QUE SE PIERDE, DICHO EN CLARO: sin conteo declarado el sistema no puede avisar que
// falta plata del cajón. Se decidió sabiendo el costo — contar y tipear todos los días
// también tiene el suyo, y es que la caja deje de cerrarse. Una caja que no se cierra no
// detecta nada.
//
// ─── LO QUE NO CAMBIÓ, Y NO HAY QUE TOCAR ───
//
// EL FONDO. En el cajón está el cambio de ayer MÁS lo cobrado hoy. Sin sumarlo, todos los
// cierres daban sobrante por el mismo monto. Ahora no lo declara nadie: es lo que el cierre
// de ayer decidió DEJAR en el cajón, y por eso desapareció el paso de "abrir caja".
//
// LOS EGRESOS. Del cajón también sale plata. Sin restarlos, el día que se le paga a la
// limpieza el cierre decía FALTANTE y acusaba a quien atendió.

// ─── DÓNDE ESTÁ CADA COSA ───
//
// Esta página solo ordena las tarjetas. El estado, los pedidos al servidor y las acciones
// (anotar, anular, cerrar) viven en controllers/useCajaController.js; cada tarjeta y cada
// ventana, en components/caja/ con el nombre que se ve en pantalla; los formatos de fecha y
// los rubros, en lib/formatoDeCaja.js.

import { useCajaController } from '../controllers/useCajaController';
import { PageHeader } from '../components/Layout';
import Icon from '../components/Icon';
import ExcelDelPeriodo from '../components/caja/ExcelDelPeriodo';
import BalanceDeIngresos from '../components/caja/BalanceDeIngresos';
import CobrosACerrar from '../components/caja/CobrosACerrar';
import ResumenPorForma from '../components/caja/ResumenPorForma';
import CorreccionesDeDiasCerrados from '../components/caja/CorreccionesDeDiasCerrados';
import GastosEIngresos from '../components/caja/GastosEIngresos';
import DistribucionDelEfectivo from '../components/caja/DistribucionDelEfectivo';
import CierresAnteriores from '../components/caja/CierresAnteriores';
import { ConfirmarCierre, CierreHecho, AnularMovimiento, AnotarMovimiento } from '../components/caja/VentanasDeCaja';

export default function CajaPage() {
  const caja = useCajaController();
  const { esDueno, abierto, fallo, hayBalance, hayMovimientos, sinCerrarHace } = caja;

  return (
    <div className="caja-page">
      <PageHeader
        title="Cierre de caja"
        subtitle="El sistema cuenta; vos decidís cuánto se retira"
        icon="receipt"
        actions={esDueno && <ExcelDelPeriodo {...caja} />}
      />

      {/* La forma más fácil de esconder algo no es mentir en el cierre: es no cerrar. */}
      {sinCerrarHace !== null && sinCerrarHace >= 2 && (
        <div className="caja-alerta">
          <Icon name="alertTriangle" size="1em" />
          <span>Hace {sinCerrarHace} días que no se cierra la caja.</span>
        </div>
      )}

      {fallo && (
        <div className="caja-alerta">
          <Icon name="alertTriangle" size="1em" />
          <span>No pudimos traer los datos de la caja. Probá de nuevo: cerrar sin esto sería a ciegas.</span>
        </div>
      )}

      {hayBalance && <BalanceDeIngresos {...caja} />}
      <CobrosACerrar {...caja} />
      <ResumenPorForma {...caja} />
      {!!abierto?.correcciones?.length && <CorreccionesDeDiasCerrados correcciones={abierto.correcciones} />}
      {hayMovimientos && <GastosEIngresos {...caja} />}
      <DistribucionDelEfectivo {...caja} />
      {esDueno && <CierresAnteriores {...caja} />}

      <ConfirmarCierre {...caja} />
      <CierreHecho {...caja} />
      <AnularMovimiento {...caja} />
      <AnotarMovimiento {...caja} />
    </div>
  );
}
