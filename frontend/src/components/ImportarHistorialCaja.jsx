// ============================================
// IMPORTAR EL HISTORIAL DE CAJA DE OTRO SISTEMA
// ============================================
// Los mismos tres pasos que el importador de socios, y por lo mismo:
//
//   1. ELEGIR  — el export de caja del sistema anterior.
//   2. REVISAR — el backend dice qué entra, MES POR MES, sin escribir nada. Esos totales son
//                los que después va a mostrar el tablero: se pueden comparar con el sistema
//                viejo antes de confirmar. Una sola fila con error y no hay botón.
//   3. LISTO   — y ahí mismo, deshacer.
//
// ⭐ Lo que esta pantalla tiene que dejar claro es la regla (ADR-014): lo importado es
// HISTORIA. Suma en los ingresos, pero no corre ningún vencimiento ni entra al cierre de caja.
// ============================================

import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import Icon from './Icon';
import { useToast } from '../contexts/ToastContext';
import { errorService } from '../services';
import { paymentService } from '../services/PaymentService';
import { leerArchivoDeCaja } from '../lib/importarCaja';
import { formatCurrency, formatDate } from '../lib/utils';

/** Cuántas filas de un listado se muestran antes de "y N más". */
const TOPE_LISTA = 60;

const plural = (n, uno, varios) => `${n.toLocaleString('es-AR')} ${n === 1 ? uno : varios}`;

/** "2026-01" → "Enero 2026". */
function nombreDelMes(clave) {
  const [anio, mes] = clave.split('-').map(Number);
  const n = new Date(anio, mes - 1, 1).toLocaleDateString('es-AR', { month: 'long' });
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${anio}`;
}

export default function ImportarHistorialCaja({ abierto, onCerrar, onImportado }) {
  const { showToast } = useToast();
  const inputRef = useRef(null);

  const [paso, setPaso] = useState('elegir'); // elegir | leyendo | revisar | importando | listo
  const [lectura, setLectura] = useState(null);
  const [analisis, setAnalisis] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [ultima, setUltima] = useState(null);
  const [problema, setProblema] = useState('');
  const [confirmarDeshacer, setConfirmarDeshacer] = useState(false);
  const [deshaciendo, setDeshaciendo] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setPaso('elegir');
    setLectura(null);
    setAnalisis(null);
    setResultado(null);
    setProblema('');
    paymentService.ultimoHistorial().then(setUltima).catch(() => setUltima(null));
  }, [abierto]);

  const elegirArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // que elegir el MISMO archivo corregido vuelva a disparar el cambio
    if (!archivo) return;

    setProblema('');
    setAnalisis(null);
    setPaso('leyendo');
    try {
      const leido = await leerArchivoDeCaja(archivo);
      setLectura(leido);
      if (leido.error) {
        setProblema(leido.error);
        setPaso('elegir');
        return;
      }
      setAnalisis(await paymentService.analizarHistorial(leido.archivo, leido.filas));
      setPaso('revisar');
    } catch (error) {
      setProblema(
        error.response ? errorService.getMessage(error) : 'No pude leer el archivo. ¿Es un Excel (.xlsx o .xls) o un CSV?'
      );
      setPaso('elegir');
    }
  };

  const importar = async () => {
    setPaso('importando');
    try {
      const r = await paymentService.importarHistorial(lectura.archivo, lectura.filas);
      if (!r.ok) {
        setAnalisis(r.analisis);
        setPaso('revisar');
        return;
      }
      setResultado(r.resultado);
      setPaso('listo');
      onImportado?.();
      setUltima(await paymentService.ultimoHistorial().catch(() => null));
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
      setPaso('revisar');
    }
  };

  const deshacer = async () => {
    setConfirmarDeshacer(false);
    setDeshaciendo(true);
    try {
      const u = await paymentService.deshacerHistorial(ultima.id);
      setUltima(u);
      showToast('Importación deshecha', 'success');
      onImportado?.();
      if (paso === 'listo') onCerrar();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setDeshaciendo(false);
    }
  };

  const titulo = paso === 'listo' ? 'Historial importado' : 'Importar historial de caja';

  return (
    <>
      <Modal isOpen={abierto} onClose={onCerrar} title={titulo} size="large" actions={acciones()}>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={elegirArchivo} />
        {(paso === 'elegir' || paso === 'leyendo') && pasoElegir()}
        {(paso === 'revisar' || paso === 'importando') && analisis && pasoRevisar()}
        {paso === 'listo' && pasoListo()}
      </Modal>

      <ConfirmDialog
        open={confirmarDeshacer}
        title="Deshacer la importación"
        message={ultima ? `¿Deshacer el historial de "${ultima.archivo || 'archivo'}"?` : ''}
        extra={ultima ? `Se borran los ${plural(ultima.cobros, 'cobro', 'cobros')} y ${plural(ultima.gastos, 'gasto', 'gastos')} que trajo. Lo cobrado en Veltronik no se toca.` : null}
        icon="rotateCw"
        confirmText="Deshacer"
        confirmClass="btn-danger"
        onConfirm={deshacer}
        onCancel={() => setConfirmarDeshacer(false)}
      />
    </>
  );

  // ── Paso 1 ───────────────────────────────────────────────────────────────

  function pasoElegir() {
    return (
      <div className="importar">
        <p className="text-muted" style={{ marginTop: 0 }}>
          Subí el Excel de caja de tu sistema anterior para ver tus ingresos desde el primer mes en el panel.
          <strong> Antes de guardar nada</strong> te mostramos cuánto entra, mes por mes.
        </p>

        {regla()}

        <div className="importar-opcion">
          <h4>Qué columnas tiene que tener</h4>
          <p className="text-muted">
            <strong>Fecha</strong>, <strong>Monto</strong> y <strong>Medio</strong> (Efectivo, Transferencia, Mercado Pago o Tarjeta).
            Si trae Hora, Socio, DNI, Concepto y Nota, mejor. Un monto negativo es un gasto.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary importar-elegir"
          disabled={paso === 'leyendo'}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="fileText" /> {paso === 'leyendo' ? 'Leyendo el archivo…' : 'Elegir archivo'}
        </button>

        {problema && (
          <div className="importar-aviso importar-aviso-error" role="alert">
            <Icon name="xCircle" /> <span>{problema}</span>
          </div>
        )}
        {lectura?.detectadas?.length > 0 && problema && columnasDetectadas()}

        {ultima && !ultima.deshecha && cajaUltima()}
      </div>
    );
  }

  function regla() {
    return (
      <div className="importar-aviso importar-aviso-atencion">
        <Icon name="alertTriangle" />
        <span>
          Estos cobros son <strong>historia</strong>: suman en los ingresos del panel y aparecen en Pagos,
          pero <strong>no le cambian el vencimiento a ningún socio</strong> ni entran en el cierre de caja.
        </span>
      </div>
    );
  }

  function cajaUltima() {
    return (
      <div className="importar-ultima">
        <div>
          <strong>Última importación:</strong> {formatDate(ultima.cuando)} — {ultima.archivo || 'archivo'}
          {' '}({plural(ultima.cobros, 'cobro', 'cobros')} por {formatCurrency(ultima.totalCobros)}
          {ultima.desde && ultima.hasta && `, del ${formatDate(ultima.desde)} al ${formatDate(ultima.hasta)}`})
          {!ultima.sePuedeDeshacer && ultima.porQueNo && (
            <div className="text-muted importar-chico">Ya no se puede deshacer: {ultima.porQueNo}</div>
          )}
        </div>
        {ultima.sePuedeDeshacer && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={deshaciendo}
            onClick={() => setConfirmarDeshacer(true)}
          >
            <Icon name="rotateCw" /> {deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
          </button>
        )}
      </div>
    );
  }

  // ── Paso 2 ───────────────────────────────────────────────────────────────

  function pasoRevisar() {
    const a = analisis;
    const conError = a.filas.filter((f) => f.accion === 'ERROR');
    const conAviso = a.filas.filter((f) => f.accion !== 'ERROR' && f.avisos.length > 0);

    return (
      <div className="importar">
        <p className="text-muted" style={{ marginTop: 0 }}>
          <strong>{lectura.archivo}</strong> — {plural(a.total, 'movimiento', 'movimientos')}
          {a.desde && a.hasta && <> del {formatDate(a.desde)} al {formatDate(a.hasta)}</>}. Todavía no se guardó nada.
        </p>

        <div className="importar-numeros">
          <Numero valor={a.cobros} texto={`cobros · ${formatCurrency(a.totalCobros)}`} tono="ok" />
          <Numero valor={a.gastos} texto={`gastos · ${formatCurrency(a.totalGastos)}`} tono="info" />
          <Numero valor={a.yaImportados + a.yaCobrados} texto="ya estaban" tono="neutro" />
          <Numero valor={a.conError} texto="con error" tono={a.conError ? 'error' : 'neutro'} />
        </div>

        {regla()}
        {columnasDetectadas()}

        {conError.length > 0 && (
          <>
            <div className="importar-aviso importar-aviso-error" role="alert">
              <Icon name="xCircle" />
              <span>
                <strong>No se va a importar nada hasta que se corrijan estas filas.</strong> Arreglalas en el Excel,
                guardalo y volvé a elegirlo.
              </span>
            </div>
            <TablaFilas filas={conError} detalle={(f) => f.errores} />
          </>
        )}

        {a.porMes.length > 0 && (
          <details className="importar-detalle" open>
            <summary>Lo que entra, mes por mes (es lo que va a mostrar el panel)</summary>
            <TablaMeses meses={a.porMes} />
          </details>
        )}

        {a.avisosGenerales.length > 0 && (
          <div className="importar-aviso importar-aviso-atencion">
            <Icon name="alertTriangle" />
            <ul>{a.avisosGenerales.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}

        {conAviso.length > 0 && (
          <details className="importar-detalle">
            <summary>{plural(conAviso.length, 'fila para mirar', 'filas para mirar')}</summary>
            <TablaFilas filas={conAviso} detalle={(f) => f.avisos} />
          </details>
        )}

        {a.cobros + a.gastos === 0 && a.conError === 0 && (
          <div className="importar-aviso importar-aviso-ok">
            <Icon name="checkCircle" /> <span>Todo lo del archivo ya está cargado en Veltronik. No hay nada para importar.</span>
          </div>
        )}
      </div>
    );
  }

  function columnasDetectadas() {
    if (!lectura?.detectadas?.length) return null;
    return (
      <div className="importar-columnas importar-chico">
        <span className="text-muted">Columnas: </span>
        {lectura.detectadas.map((d) => (
          <span key={d.campo} className="importar-columna" title={`La columna «${d.titulo}» se lee como ${d.etiqueta}`}>
            {d.titulo === d.etiqueta ? d.etiqueta : `${d.titulo} → ${d.etiqueta}`}
          </span>
        ))}
        {lectura.ignoradas.length > 0 && (
          <span className="text-muted"> · Se ignoran: {lectura.ignoradas.join(', ')}</span>
        )}
      </div>
    );
  }

  // ── Paso 3 ───────────────────────────────────────────────────────────────

  function pasoListo() {
    return (
      <div className="importar">
        <div className="importar-aviso importar-aviso-ok">
          <Icon name="checkCircle" />
          <span>
            <strong>Listo:</strong> {plural(resultado.cobros, 'cobro', 'cobros')} por {formatCurrency(resultado.totalCobros)}
            {resultado.gastos > 0 && ` y ${plural(resultado.gastos, 'gasto', 'gastos')} por ${formatCurrency(resultado.totalGastos)}`}.
            Ya se ven en el panel.
          </span>
        </div>
        <p className="text-muted">
          Si algo no quedó como esperabas, se puede deshacer entera mientras nadie haya editado esos cobros.
          Subir el mismo archivo de nuevo no duplica nada: solo agrega lo que falte.
        </p>
        {ultima && !ultima.deshecha && cajaUltima()}
      </div>
    );
  }

  // ── Botones de abajo ─────────────────────────────────────────────────────

  function acciones() {
    if (paso === 'revisar' || paso === 'importando') {
      const a = analisis;
      const puede = a && a.conError === 0 && a.cobros + a.gastos > 0;
      return (
        <>
          <button type="button" className="btn btn-secondary" disabled={paso === 'importando'} onClick={() => inputRef.current?.click()}>
            Elegir otro archivo
          </button>
          <button type="button" className="btn btn-primary" disabled={!puede || paso === 'importando'} onClick={importar}>
            {paso === 'importando' ? 'Importando…' : textoBotonImportar(a)}
          </button>
        </>
      );
    }
    return (
      <button type="button" className="btn btn-secondary" onClick={onCerrar}>
        {paso === 'listo' ? 'Cerrar' : 'Cancelar'}
      </button>
    );
  }
}

function textoBotonImportar(a) {
  if (!a || a.cobros + a.gastos === 0) return 'Nada para importar';
  const partes = [];
  if (a.cobros) partes.push(plural(a.cobros, 'cobro', 'cobros'));
  if (a.gastos) partes.push(plural(a.gastos, 'gasto', 'gastos'));
  return `Importar: ${partes.join(' y ')}`;
}

function Numero({ valor, texto, tono }) {
  return (
    <div className={`importar-numero importar-numero-${tono}`}>
      <span className="importar-numero-valor">{valor.toLocaleString('es-AR')}</span>
      <span className="importar-numero-texto">{texto}</span>
    </div>
  );
}

/** Los totales por mes: cobros, gastos y lo que queda. */
function TablaMeses({ meses }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table importar-tabla">
        <thead>
          <tr>
            <th>Mes</th>
            <th style={{ textAlign: 'right' }}>Cobros</th>
            <th style={{ textAlign: 'right' }}>Ingresos</th>
            <th style={{ textAlign: 'right' }}>Gastos</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.mes}>
              <td>{nombreDelMes(m.mes)}</td>
              <td style={{ textAlign: 'right' }}>{m.cobros.toLocaleString('es-AR')}</td>
              <td style={{ textAlign: 'right' }}>{formatCurrency(m.totalCobros)}</td>
              <td style={{ textAlign: 'right' }}>{m.gastos > 0 ? formatCurrency(m.totalGastos) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Fila del Excel, de quién, y qué pasa. Con tope, para que mil avisos no cuelguen el modal. */
function TablaFilas({ filas, detalle }) {
  const visibles = filas.slice(0, TOPE_LISTA);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table importar-tabla">
        <thead>
          <tr>
            <th style={{ width: '4rem' }}>Fila</th>
            <th>Movimiento</th>
            <th>Qué pasa</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((f) => (
            <tr key={f.fila}>
              <td>{f.fila}</td>
              <td>
                {f.socio || '—'}
                <div className="text-muted importar-chico">
                  {[f.fecha, f.monto && `$ ${f.monto}`, f.documento && `DNI ${f.documento}`].filter(Boolean).join(' · ')}
                </div>
              </td>
              <td>
                {detalle(f).map((t) => <div key={t}>{t}</div>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length > TOPE_LISTA && (
        <p className="text-muted importar-chico">… y {filas.length - TOPE_LISTA} más.</p>
      )}
    </div>
  );
}
