// ============================================
// VELTRONIK - RESUMEN DEL DUEÑO
// ============================================
// La pantalla que contesta lo que hoy el dueño de tres locales resuelve con una
// calculadora: entra a cada sucursal, anota, y suma a mano.
//
// Es también la respuesta a "¿qué gano teniendo mis tres gimnasios en el mismo sistema?".
// Hasta acá, nada: entraba a cada uno por separado, como si fueran tres cuentas sueltas.
//
// Solo vive en el portal web. En la app de escritorio no existe — ese terminal está atado
// a UNA sucursal y no tiene por qué mostrar las otras.
// ============================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ownerInsightsService, errorService } from '../services';
import { formatCurrency } from '../lib/utils';
import CONFIG from '../lib/config';
import Icon from '../components/Icon';

/** Las tres métricas, con lo justo para dibujarlas. */
const METRICAS = [
  { key: 'revenue', label: 'Plata cobrada', icon: 'dollarSign', formato: (v) => formatCurrency(v) },
  { key: 'newMembers', label: 'Socios nuevos', icon: 'users', formato: (v) => String(v) },
  { key: 'churned', label: 'Bajas', icon: 'trendingDown', formato: (v) => String(v) },
];

/** "2026-08" → "ago 2026". */
function nombreMes(mes) {
  const [anio, m] = mes.split('-');
  const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${nombres[Number(m) - 1]} ${anio}`;
}

export default function OwnerInsightsPage() {
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [metrica, setMetrica] = useState('revenue');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setData(await ownerInsightsService.forOwner(12));
    } catch (e) {
      setError(errorService.getMessage(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const activa = METRICAS.find((m) => m.key === metrica);

  // Los meses van del más nuevo al más viejo: el dueño mira "cómo venimos", y eso empieza
  // por arriba. El backend los manda al revés (cronológicos) porque para sumar conviene así.
  const mesesVisibles = useMemo(
    () => (data ? [...data.months].reverse() : []),
    [data],
  );

  /** ¿Las bajas de este mes todavía se pueden mover? */
  const esProvisorio = (mes) => metrica === 'churned' && data?.provisionalFrom && mes >= data.provisionalFrom;

  const valorDe = (branch, mes) => {
    const fila = branch.months.find((m) => m.month === mes);
    return fila ? fila[metrica] : 0;
  };

  const totalDe = (mes) => {
    const fila = data.totals.find((m) => m.month === mes);
    return fila ? fila[metrica] : 0;
  };

  const ultimoMes = data?.months?.[data.months.length - 1];

  return (
    <div className="lobby-wrapper">
      <div className="liquid-bg">
        <div className="liquid-orb liquid-orb-1"></div>
        <div className="liquid-orb liquid-orb-2"></div>
      </div>

      <div className="lobby-container">
        <div className="lobby-header">
          <div>
            <h1 className="lobby-title" style={{ marginBottom: '0.25rem' }}>Resumen de tus gimnasios</h1>
            <p className="lobby-subtitle">Los últimos 12 meses, sucursal por sucursal</p>
          </div>
          <div className="lobby-header-actions">
            <button className="btn btn-ghost" onClick={() => navigate(CONFIG.ROUTES.LOBBY)}>
              <Icon name="chevronLeft" /> Volver
            </button>
          </div>
        </div>

        {cargando && (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <span className="spinner" /> Juntando los números de tus sucursales…
          </div>
        )}

        {!cargando && error && (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <div style={{ color: '#ef4444', marginBottom: '0.75rem' }}><Icon name="alertTriangle" size="2rem" /></div>
            <p style={{ color: 'var(--text-muted)' }}>{error}</p>
            <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={cargar}>Reintentar</button>
          </div>
        )}

        {!cargando && !error && data?.branches?.length === 0 && (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)' }}>
              Todavía no sos dueño de ninguna sucursal. Este resumen suma los gimnasios que estén a tu nombre.
            </p>
          </div>
        )}

        {!cargando && !error && data?.branches?.length > 0 && (
          <>
            {/* Titulares del mes en curso: lo primero que mira alguien el día 1. */}
            <div className="stats-grid mb-3">
              {METRICAS.map((m) => {
                const fila = data.totals.find((t) => t.month === ultimoMes);
                return (
                  <button
                    key={m.key}
                    className="stat-card"
                    onClick={() => setMetrica(m.key)}
                    style={{
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      borderColor: metrica === m.key ? 'var(--primary-400)' : undefined,
                    }}
                  >
                    <div className="stat-icon stat-icon-success"><Icon name={m.icon} /></div>
                    <div className="stat-content">
                      <div className="stat-value">{m.formato(fila ? fila[m.key] : 0)}</div>
                      <div className="stat-label">{m.label} · {nombreMes(ultimoMes)}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Una tabla por métrica, con los meses como FILAS: con tres sucursales entra
                sin scroll horizontal, y agregar un local suma una columna, no doce. */}
            <div className="card">
              <div style={{ padding: '1rem 1.25rem 0' }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon name={activa.icon} size="1em" /> {activa.label}, mes a mes
                </h2>
                {metrica === 'churned' && (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                    Una baja se cuenta cuando pasaron <strong>{data.graceDays} días</strong> del vencimiento sin que la
                    persona pague. Si no, todo el que se atrasa una semana figuraría como que se fue — por eso los meses
                    marcados con <em>·</em> todavía pueden subir.
                  </p>
                )}
              </div>

              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      {data.branches.map((b) => <th key={b.tenantId}>{b.name}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesesVisibles.map((mes) => (
                      <tr key={mes}>
                        <td data-label="Mes">
                          {nombreMes(mes)}
                          {esProvisorio(mes) && (
                            <span title="Todavía puede subir" style={{ color: 'var(--text-muted)', marginLeft: '0.35rem' }}>·</span>
                          )}
                        </td>
                        {data.branches.map((b) => (
                          <td key={b.tenantId} data-label={b.name}>{activa.formato(valorDe(b, mes))}</td>
                        ))}
                        <td data-label="Total"><strong>{activa.formato(totalDe(mes))}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '1rem', lineHeight: 1.6 }}>
              "Plata cobrada" son las cuotas que cobró cada gimnasio, no lo que pagás por Veltronik.
              Si ves bajas que no reconocés, mirá en Ajustes si hay socios que pagaron y quedaron figurando vencidos.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
