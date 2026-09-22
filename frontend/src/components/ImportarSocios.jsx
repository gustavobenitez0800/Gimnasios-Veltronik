// ============================================
// IMPORTAR SOCIOS DESDE UN ARCHIVO
// ============================================
// Tres pasos, y el orden es la garantía:
//
//   1. ELEGIR  — la plantilla, o directamente el Excel que baja el sistema anterior.
//   2. REVISAR — el backend dice qué va a pasar con CADA fila, sin escribir nada.
//                Una sola fila con error y no hay botón de importar.
//   3. LISTO   — y ahí mismo, deshacer.
//
// Nada de esto valida datos: leer el archivo es trabajo de lib/importarSocios y decidir
// qué es válido, del backend. Esta pantalla solo muestra lo que el backend contestó.
// ============================================

import { useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import ConfirmDialog from './ui/ConfirmDialog';
import Icon from './Icon';
import { useToast } from '../contexts/ToastContext';
import { errorService } from '../services';
import { memberService } from '../services/MemberService';
import { leerArchivo, descargarPlantilla } from '../lib/importarSocios';
import { formatDate } from '../lib/utils';

/** Cuántas filas de un listado se muestran antes de "y N más". */
const TOPE_LISTA = 60;

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export default function ImportarSocios({ abierto, onCerrar, onImportado }) {
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

  // Cada vez que se abre, empieza de cero y trae la última importación: si alguien cerró el
  // modal y después se dio cuenta de que subió el archivo equivocado, el deshacer está acá.
  useEffect(() => {
    if (!abierto) return;
    setPaso('elegir');
    setLectura(null);
    setAnalisis(null);
    setResultado(null);
    setProblema('');
    memberService.ultimaImportacion().then(setUltima).catch(() => setUltima(null));
  }, [abierto]);

  const elegirArchivo = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = ''; // que elegir el MISMO archivo corregido vuelva a disparar el cambio
    if (!archivo) return;

    setProblema('');
    setAnalisis(null);
    setPaso('leyendo');
    try {
      const leido = await leerArchivo(archivo);
      setLectura(leido);
      if (leido.error) {
        setProblema(leido.error);
        setPaso('elegir');
        return;
      }
      setAnalisis(await memberService.analizarImportacion(leido.archivo, leido.filas));
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
      const r = await memberService.importar(lectura.archivo, lectura.filas);
      if (!r.ok) {
        // Entre la vista previa y el clic algo cambió (otra pestaña, otro usuario): el
        // backend volvió a analizar y encontró errores. Se muestran igual que antes.
        setAnalisis(r.analisis);
        setPaso('revisar');
        return;
      }
      setResultado(r.resultado);
      setPaso('listo');
      onImportado?.();
      setUltima(await memberService.ultimaImportacion().catch(() => null));
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
      setPaso('revisar');
    }
  };

  const deshacer = async () => {
    setConfirmarDeshacer(false);
    setDeshaciendo(true);
    try {
      const u = await memberService.deshacerImportacion(ultima.id);
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

  const titulo = paso === 'listo' ? 'Importación terminada' : 'Importar socios';

  return (
    <>
      <Modal isOpen={abierto} onClose={onCerrar} title={titulo} size="large" actions={acciones()}>
        {/* Uno solo y siempre montado: lo usan "Elegir archivo" y "Elegir otro archivo". */}
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={elegirArchivo} />
        {(paso === 'elegir' || paso === 'leyendo') && pasoElegir()}
        {(paso === 'revisar' || paso === 'importando') && analisis && pasoRevisar()}
        {paso === 'listo' && pasoListo()}
      </Modal>

      <ConfirmDialog
        open={confirmarDeshacer}
        title="Deshacer la importación"
        message={ultima ? `¿Deshacer la importación de "${ultima.archivo || 'archivo'}"?` : ''}
        extra={ultima ? textoDeshacer(ultima) : null}
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
          Subí un Excel con tus socios. <strong>Antes de guardar nada</strong> te mostramos qué va a pasar con cada uno.
        </p>

        <div className="importar-opciones">
          <div className="importar-opcion">
            <h4>¿Venís de otro sistema?</h4>
            <p className="text-muted">Subí directamente el Excel que te baja. Reconocemos las columnas más comunes: Nombre, DNI, Vencimiento, Teléfono…</p>
          </div>
          <div className="importar-opcion">
            <h4>¿Lo armás a mano?</h4>
            <p className="text-muted">Bajá la plantilla: trae las columnas y cómo llenarlas.</p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => descargarPlantilla()}>
              <Icon name="download" /> Bajar plantilla
            </button>
          </div>
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

  function cajaUltima() {
    return (
      <div className="importar-ultima">
        <div>
          <strong>Última importación:</strong> {ultima.archivo || 'archivo'}, el {formatDate(ultima.cuando)}
          {' '}({plural(ultima.creados, 'nuevo', 'nuevos')}, {plural(ultima.actualizados, 'actualizado', 'actualizados')})
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
    const actualizan = a.filas.filter((f) => f.accion === 'ACTUALIZAR');
    const conAviso = a.filas.filter((f) => f.accion !== 'ERROR' && f.avisos.length > 0);

    return (
      <div className="importar">
        <p className="text-muted" style={{ marginTop: 0 }}>
          <strong>{lectura.archivo}</strong>: {plural(a.total, 'socio', 'socios')} en el archivo. Todavía no se guardó nada.
        </p>

        <div className="importar-numeros">
          <Numero valor={a.crear} texto="nuevos" tono="ok" />
          <Numero valor={a.actualizar} texto="se actualizan" tono="info" />
          <Numero valor={a.sinCambios} texto="sin cambios" tono="neutro" />
          <Numero valor={a.conError} texto="con error" tono={a.conError ? 'error' : 'neutro'} />
        </div>

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

        {a.avisosGenerales.length > 0 && (
          <div className="importar-aviso importar-aviso-atencion">
            <Icon name="alertTriangle" />
            <ul>{a.avisosGenerales.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}

        {actualizan.length > 0 && (
          <details className="importar-detalle" open={actualizan.length <= 10}>
            <summary>{plural(actualizan.length, 'socio que ya existe cambia', 'socios que ya existen cambian')}</summary>
            <TablaFilas filas={actualizan} detalle={(f) => f.cambios} />
          </details>
        )}

        {conAviso.length > 0 && (
          <details className="importar-detalle">
            <summary>{plural(conAviso.length, 'fila para mirar', 'filas para mirar')} (se importan igual)</summary>
            <TablaFilas filas={conAviso} detalle={(f) => f.avisos} />
          </details>
        )}

        {a.crear + a.actualizar === 0 && a.conError === 0 && (
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
        {!lectura.tieneVencimiento && (
          <div className="importar-aviso importar-aviso-atencion" style={{ marginTop: '0.5rem' }}>
            <Icon name="alertTriangle" />
            <span>El archivo no tiene columna de vencimiento: los socios no van a aparecer en vencidos ni en los avisos del mostrador.</span>
          </div>
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
            <strong>Listo:</strong> {plural(resultado.creados, 'socio nuevo', 'socios nuevos')}
            {resultado.actualizados > 0 && ` y ${plural(resultado.actualizados, 'actualizado', 'actualizados')}`}.
          </span>
        </div>
        <p className="text-muted">
          Si algo no quedó como esperabas, se puede deshacer entera mientras nadie haya tocado esos socios
          (un cobro, una edición o una entrada por la puerta).
        </p>
        {ultima && !ultima.deshecha && cajaUltima()}
      </div>
    );
  }

  // ── Botones de abajo ─────────────────────────────────────────────────────

  function acciones() {
    if (paso === 'revisar' || paso === 'importando') {
      const a = analisis;
      const puede = a && a.conError === 0 && a.crear + a.actualizar > 0;
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
  if (!a) return 'Importar';
  const partes = [];
  if (a.crear) partes.push(plural(a.crear, 'nuevo', 'nuevos'));
  if (a.actualizar) partes.push(plural(a.actualizar, 'actualización', 'actualizaciones'));
  return partes.length ? `Importar: ${partes.join(' y ')}` : 'Nada para importar';
}

function textoDeshacer(u) {
  const partes = [];
  if (u.creados) partes.push(`se borran los ${plural(u.creados, 'socio', 'socios')} que agregó`);
  if (u.actualizados) partes.push(`${plural(u.actualizados, 'socio vuelve', 'socios vuelven')} a como estaban antes`);
  return partes.length ? `${partes.join(', y ')}.` : null;
}

function Numero({ valor, texto, tono }) {
  return (
    <div className={`importar-numero importar-numero-${tono}`}>
      <span className="importar-numero-valor">{valor}</span>
      <span className="importar-numero-texto">{texto}</span>
    </div>
  );
}

/** Fila del Excel, quién es, y qué pasa. Con tope, para que 400 avisos no cuelguen el modal. */
function TablaFilas({ filas, detalle }) {
  const visibles = filas.slice(0, TOPE_LISTA);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table importar-tabla">
        <thead>
          <tr>
            <th style={{ width: '4rem' }}>Fila</th>
            <th>Socio</th>
            <th>Qué pasa</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((f) => (
            <tr key={f.fila}>
              <td>{f.fila}</td>
              <td>
                {f.nombre || '—'}
                {f.documento && <div className="text-muted importar-chico">DNI {f.documento}</div>}
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
