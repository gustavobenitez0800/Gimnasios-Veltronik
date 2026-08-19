// ============================================
// VELTRONIK - PUERTA DE ENTRADA DEL TERMINAL (Fase 3)
// ============================================
// Lo que en la web es el Lobby, en el escritorio es esto. Y la diferencia es el punto de
// toda la fase: acá NO se elige sucursal.
//
// Un terminal de mostrador se activa UNA vez y queda atado a su sucursal. A partir de ahí
// esta pantalla no pregunta nada: averigua a qué sucursal pertenece el equipo y entra.
// El empleado que se loguea no elige, porque la sucursal no la decide la persona — la
// decide la máquina donde está parada.
//
// LAS DOS IDENTIDADES
//   · la del EQUIPO  (enrolamiento)  → QUÉ sucursal
//   · la de la PERSONA (login + rol) → QUÉ puede hacer adentro
// Un empleado con acceso a dos sucursales no puede abrir la otra desde este terminal, y
// no porque la pantalla no se lo ofrezca: el backend lo rechaza (TenantContextFilter).
// Esconder el selector sin eso sería teatro.
//
// Ocupa la ruta /lobby a propósito, igual que BillingWall ocupa /blocked: así todo lo que
// ya manda al Lobby (el guard de AuthContext cuando no hay sucursal, el "Ya pagué" del
// muro, la expulsión por FORBIDDEN_TENANT) sigue funcionando sin tocar nada.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { gymService, deviceService, errorService } from '../services';
import CONFIG from '../lib/config';
import Icon from '../components/Icon';
import logoSrc from '../assets/LogotipoSecundario.png';

/** Roles que pueden activar un terminal (los mismos que gestionan equipos en el backend). */
const PUEDEN_ACTIVAR = ['owner', 'admin'];

/**
 * Rol de equipo con el que se enrola.
 *
 * Siempre CAJA. El otro rol, ENCARGADO ("Caja Madre"), existía para el cerebro local del
 * circuito offline: era el equipo que arbitraba el stock. Ese circuito se dio de baja en
 * la V43, así que hoy elegirlo solo serviría para chocar contra la regla de "un ENCARGADO
 * activo por sucursal" sin ganar nada. Se sigue pudiendo elegir a mano desde Ajustes →
 * Equipos, que es donde vive la gestión fina.
 */
const ROL_DE_EQUIPO = 'CAJA';

/** A dónde entra cada rol después de activar. Mismo criterio que el Lobby web. */
function landingRoute(role) {
  return (role === 'owner' || role === 'admin') ? CONFIG.ROUTES.DASHBOARD : CONFIG.ROUTES.ACCESS;
}

export default function DeviceGate() {
  const { profile, logout, refreshOrgContext } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [estado, setEstado] = useState('cargando'); // cargando | activar | sin-permiso | error
  const [sucursales, setSucursales] = useState([]);
  const [elegida, setElegida] = useState('');
  const [nombreEquipo, setNombreEquipo] = useState('Recepción');
  const [activando, setActivando] = useState(false);
  const [detalleError, setDetalleError] = useState('');

  /** Deja la sucursal fija para esta sesión y entra. */
  const entrarA = useCallback(async (orgId, orgName, role) => {
    localStorage.setItem('current_org_id', orgId);
    localStorage.setItem('current_org_role', role);
    localStorage.setItem('current_org_name', orgName || '');
    navigate(landingRoute(role), { replace: true });
    refreshOrgContext(orgId);
  }, [navigate, refreshOrgContext]);

  const identificar = useCallback(async () => {
    setEstado('cargando');
    setDetalleError('');

    // Sin sucursal en el contexto: si quedara una vieja, apiClient la mandaría en el
    // header y el propio chequeo de atadura podría rechazar esta consulta — la pantalla
    // que existe para averiguar a qué sucursal pertenecemos quedaría en un punto muerto.
    localStorage.removeItem('current_org_id');

    try {
      // Las dos preguntas en paralelo: a qué sucursal pertenece el equipo, y a cuáles
      // pertenece la persona (que además trae su rol en cada una).
      const [equipo, misSucursales] = await Promise.all([
        deviceService.me(),
        gymService.getUserGyms().catch(() => []),
      ]);

      const lista = Array.from(new Map((misSucursales || []).map((o) => [o.id, o])).values());
      setSucursales(lista);

      // ── Equipo ya activado: entramos derecho, sin preguntar nada ──
      if (equipo?.enrolledTenantId) {
        const propia = lista.find((o) => o.id === equipo.enrolledTenantId);
        if (!propia) {
          // El equipo pertenece a una sucursal donde esta persona NO es miembro.
          setEstado('sin-permiso');
          setDetalleError(
            `Este equipo pertenece a ${equipo.enrolledTenantName || 'otra sucursal'}, y tu usuario no tiene acceso a ella.`,
          );
          return;
        }
        await entrarA(propia.id, propia.name, propia.role || 'staff');
        return;
      }

      // ── Equipo sin activar ──
      const activables = lista.filter((o) => PUEDEN_ACTIVAR.includes(o.role));
      if (activables.length === 0) {
        setEstado('sin-permiso');
        setDetalleError('');
        return;
      }
      setElegida(activables[0].id);
      setEstado('activar');
    } catch (error) {
      setEstado('error');
      setDetalleError(errorService.getMessage(error));
    }
  }, [entrarA]);

  useEffect(() => { identificar(); }, [identificar]);

  const activar = async () => {
    const sucursal = sucursales.find((o) => o.id === elegida);
    if (!sucursal) return;
    if (!nombreEquipo.trim()) {
      showToast('Poné un nombre para este equipo (ej: Recepción).', 'error');
      return;
    }

    setActivando(true);
    try {
      // El backend lee la sucursal del header X-Tenant-ID, que apiClient toma de acá:
      // hay que fijarla ANTES de enrolar o el equipo termina atado a otra sucursal.
      localStorage.setItem('current_org_id', sucursal.id);
      await deviceService.enroll({ role: ROL_DE_EQUIPO, displayName: nombreEquipo.trim() });
      showToast(`Equipo activado en ${sucursal.name}`, 'success');
      await entrarA(sucursal.id, sucursal.name, sucursal.role || 'owner');
    } catch (error) {
      localStorage.removeItem('current_org_id'); // no dejar una sucursal a medio fijar
      showToast(errorService.getMessage(error), 'error');
      setActivando(false);
    }
  };

  const activables = sucursales.filter((o) => PUEDEN_ACTIVAR.includes(o.role));

  return (
    <div className="auth-card" style={{ maxWidth: '460px' }}>
      <img src={logoSrc} alt="Veltronik" style={{ height: '44px', margin: '0 auto 1.5rem', display: 'block' }} />

      {estado === 'cargando' && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
          <span className="spinner" />
          <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem' }}>Identificando este equipo…</p>
        </div>
      )}

      {estado === 'activar' && (
        <>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.5rem', textAlign: 'center' }}>
            Activá este equipo
          </h1>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.95rem' }}>
            Elegí a qué sucursal pertenece esta computadora. Queda fija: de acá en más, quien
            trabaje en este equipo entra siempre a esa sucursal.
          </p>

          <div className="form-group">
            <label className="form-label">Sucursal</label>
            <select
              className="form-input"
              value={elegida}
              onChange={(e) => setElegida(e.target.value)}
              disabled={activando}
            >
              {activables.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Nombre de este equipo</label>
            <input
              type="text"
              className="form-input"
              value={nombreEquipo}
              onChange={(e) => setNombreEquipo(e.target.value)}
              placeholder="Recepción"
              maxLength={120}
              disabled={activando}
            />
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '0.4rem' }}>
              Para reconocerlo en Ajustes → Equipos si tenés varias computadoras.
            </p>
          </div>

          <button className="auth-submit" style={{ width: '100%' }} onClick={activar} disabled={activando}>
            {activando ? (<><span className="spinner" /> Activando…</>) : 'Activar y entrar'}
          </button>

          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '1rem', textAlign: 'center', lineHeight: 1.5 }}>
            ¿Te equivocaste? Se puede cambiar después desde Ajustes → Equipos.
          </p>
        </>
      )}

      {estado === 'sin-permiso' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--primary-400)', marginBottom: '1rem' }}>
            <Icon name="monitor" size="2.5rem" />
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            Este equipo todavía no está activado
          </h1>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
            {detalleError || 'Pedile al dueño que inicie sesión una vez en esta computadora para activarla en su sucursal. Después vas a poder entrar normalmente.'}
          </p>
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: '1.5rem' }} onClick={logout}>
            <Icon name="logout" size="1em" /> Cerrar sesión
          </button>
        </div>
      )}

      {estado === 'error' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#ef4444', marginBottom: '1rem' }}>
            <Icon name="alertTriangle" size="2.5rem" />
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.75rem' }}>
            No pudimos identificar este equipo
          </h1>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{detalleError}</p>
          <button className="auth-submit" style={{ width: '100%', marginTop: '1.5rem' }} onClick={identificar}>
            Reintentar
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.75rem' }} onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      )}

      {estado !== 'cargando' && profile?.email && (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '1.25rem', textAlign: 'center' }}>
          Sesión de {profile.email}
        </p>
      )}
    </div>
  );
}
