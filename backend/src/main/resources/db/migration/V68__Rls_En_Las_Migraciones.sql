-- ============================================================================
-- V68 — El cierre de RLS entra a las migraciones
-- ============================================================================
-- POR QUÉ.
-- El 2026-09-06 se cerró el agujero grande: la clave `anon` de Supabase viaja
-- HORNEADA en el bundle del frontend —cualquiera que abra el instalable la
-- tiene— y con ella se llegaba a leer todo `public`. Se arregló prendiendo Row
-- Level Security en el panel de Supabase, y se verificó.
--
-- Pero se arregló A MANO. En el repositorio no hay una sola línea de RLS: las
-- 62 migraciones anteriores crean 22 tablas y ninguna la prende. O sea que hoy
-- LA BASE DE PRODUCCIÓN Y LAS MIGRACIONES NO DICEN LO MISMO, y el que manda es
-- el que nadie puede leer.
--
-- Eso tiene un costo concreto y una fecha de vencimiento: el día que la base se
-- reconstruya desde las migraciones —una restauración, una réplica, un entorno
-- de staging, la base de un cliente nuevo— nace CON EL AGUJERO ABIERTO. Los 25
-- CRITICAL vuelven solos, sin que nadie haya tocado nada y sin un error que lo
-- delate. Es exactamente la lección que ya dejó el outage del kiosco: el
-- esquema de producción tiene que estar 100% en las migraciones.
--
-- ── QUÉ HACE, EXACTAMENTE ──────────────────────────────────────────────────
-- Prende RLS en las 22 tablas y NO crea ninguna política. En Postgres eso no
-- es un permiso a medias: sin política que la permita, la fila no se ve. El
-- resultado es negar por defecto, que es lo que corresponde acá porque NINGÚN
-- cliente de Supabase tiene que leer tablas directamente.
--
-- ── POR QUÉ NO ROMPE EL BACKEND ────────────────────────────────────────────
-- El backend no entra por la API de Supabase: abre una conexión Postgres propia
-- (DB_URL/DB_USERNAME) con el rol dueño de las tablas, y el dueño NO pasa por
-- RLS salvo que se use FORCE ROW LEVEL SECURITY. Acá no se usa, a propósito.
--
-- ── POR QUÉ NO ROMPE EL FRONTEND ───────────────────────────────────────────
-- Se verificó tabla por tabla: el frontend usa `supabase.` SOLO para auth
-- (signIn, signOut, getSession, refreshSession, OAuth). No hay un solo
-- `.from(...)` contra una tabla en `frontend/src` ni en `landing/`. Todo dato
-- de negocio viaja por el backend, con el JWT validado contra JWKS. Prender RLS
-- le saca a la clave `anon` un acceso que la aplicación nunca usó.
--
-- ── IDEMPOTENTE A PROPÓSITO ────────────────────────────────────────────────
-- En producción esto es un NO-OP: RLS ya está prendido desde el 6/9. La
-- migración no está para cambiar prod, está para que prod y el repositorio
-- vuelvan a decir lo mismo, y para que la PRÓXIMA base nazca cerrada.
-- ENABLE ROW LEVEL SECURITY sobre una tabla que ya lo tiene no falla.
--
-- ── LA LISTA ES EXPLÍCITA, Y HAY UN TEST QUE LA CUIDA ──────────────────────
-- Se listan las 22 tablas una por una en vez de recorrer `pg_tables` en un
-- loop. Una lista se revisa; un loop no. Lo que un loop resolvía —que una tabla
-- nueva no se olvide— lo resuelve mejor `EsquemaInvariantesTest`, que falla el
-- build si aparece una tabla en `public` sin RLS. La regla se verifica donde se
-- verifican las reglas, no se confía a un comentario.
-- ============================================================================

-- ── Núcleo: cuentas, negocios, equipos y cobranza del SaaS ─────────────────
ALTER TABLE app_user           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_group       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_membership  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_payment     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_revenue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier            ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_registry    ENABLE ROW LEVEL SECURITY;
ALTER TABLE update_rollout     ENABLE ROW LEVEL SECURITY;

-- ── Gimnasio: padrón, cobros, aranceles y clases ───────────────────────────
ALTER TABLE gym_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_payment_ajuste ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_class          ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_booking      ENABLE ROW LEVEL SECURITY;

-- ── Puerta: accesos, rechazos y puntos de check-in ─────────────────────────
ALTER TABLE access_log         ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_denied      ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_point      ENABLE ROW LEVEL SECURITY;

-- ── Caja del mostrador ─────────────────────────────────────────────────────
ALTER TABLE caja_sesion        ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_movimiento    ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_cierre        ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- Segunda cerradura: sacarles el GRANT, no solo taparlos con RLS
-- ============================================================================
-- RLS filtra FILAS; los GRANT deciden si el rol puede siquiera tocar la TABLA.
-- Con las dos puestas, desprender RLS de una tabla por error no vuelve a abrir
-- nada: `anon` tampoco tiene permiso. Una sola cerradura es una sola distracción
-- de distancia.
--
-- Va en un bloque con guarda porque `anon` y `authenticated` son roles de
-- Supabase: en la Postgres embebida de los tests no existen, y sin la guarda
-- toda la suite se caería acá. Que falte el rol no es un error — es una base
-- que no es Supabase.
-- ============================================================================
DO $$
DECLARE
    rol text;
BEGIN
    FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
            EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', rol);
            EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', rol);
            EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', rol);
            -- Y que las tablas que se creen de acá en adelante nazcan igual de
            -- cerradas, sin depender de que alguien se acuerde de revocarlas.
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', rol);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', rol);
            RAISE NOTICE 'V68: permisos revocados para el rol %', rol;
        ELSE
            RAISE NOTICE 'V68: el rol % no existe en esta base (no es Supabase), se omite', rol;
        END IF;
    END LOOP;
END $$;
