import Icon from '../Icon';

/**
 * EL EXCEL PARA EL CONTADOR, SIEMPRE A MANO.
 *
 * Va arriba, en el título de la Caja, que queda fijo al scrollear. Baja el período del selector
 * del balance (arranca en hoy) y lo dice en el botón: «Excel de hoy», «Excel del mes», «Excel
 * del 01/09/2026 al 30/09/2026». Hasta el 22/10 tenía su propio campo «Día», aparte del
 * selector, y bajaba el día equivocado.
 */
export default function ExcelDelPeriodo({ rango, balanceDesde, balanceHasta, exportando, exportar, excelDel }) {
  return (
    <div className="caja-excel">
      <button
        type="button" className="btn btn-primary" disabled={exportando || !!rango.problema}
        title={rango.problema?.texto}
        onClick={() => exportar(balanceDesde, balanceHasta)}
      >
        {exportando
          ? <><span className="spinner" /> Armando…</>
          : <><Icon name="download" size="1em" /> {excelDel}</>}
      </button>
    </div>
  );
}
