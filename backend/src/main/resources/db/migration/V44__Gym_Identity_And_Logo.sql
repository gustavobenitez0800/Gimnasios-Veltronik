-- ============================================================================
-- V44 — Identidad del gimnasio: logo propio + el rubro deja de ser una pregunta
-- ============================================================================
-- Contexto: Veltronik es solo para gimnasios (decisión del 2026-07-27, V41/V42/V43).
-- Esta migración termina de sacar el "tipo de negocio" del camino del usuario y le
-- da al gimnasio una cara propia.
--
-- ES ADITIVA Y REVERSIBLE. En particular NO dropea `business_type`: la columna se
-- queda con un DEFAULT del lado del servidor. Ver la nota al final — es una decisión
-- deliberada, no un olvido.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El logo: de una URL corta a la imagen misma
-- ─────────────────────────────────────────────────────────────────────────────
-- `logo_url` nació VARCHAR(255) pensando en una URL de Supabase Storage. El logo
-- ahora viaja como data URI ya recortado y comprimido por el navegador (cuadrado de
-- 256px, ~30-60 KB), así que la columna tiene que ser TEXT. Con VARCHAR(255) el
-- primer dueño que subiera su logo se comía un error de base de datos.
--
-- En Postgres, VARCHAR(n) → TEXT no reescribe la tabla ni valida nada (es un
-- ensanchamiento del dominio): no hay riesgo de lock largo aunque haya datos.
ALTER TABLE tenant ALTER COLUMN logo_url TYPE text;

-- Identidad alternativa para el dueño que no quiere subir una imagen. Excluyente con
-- logo_url: la app borra uno al elegir el otro.
ALTER TABLE tenant ADD COLUMN IF NOT EXISTS logo_emoji varchar(16);

-- Los gimnasios que YA existen nunca tuvieron manera de elegir identidad: se les
-- pone el emoji por defecto para que ninguna tarjeta del lobby quede sin cara (antes
-- todas mostraban el logo viejo de Veltronik, que no es la marca del cliente).
UPDATE tenant
   SET logo_emoji = '🏋️'
 WHERE logo_emoji IS NULL
   AND (logo_url IS NULL OR logo_url = '');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. El rubro deja de ser un dato que alguien tenga que informar
-- ─────────────────────────────────────────────────────────────────────────────
-- Antes el navegador mandaba `businessType` en cada alta y en cada guardado del
-- gimnasio. Ahora lo fija el servidor, y la base tiene su propio default: cualquier
-- INSERT que llegue sin la columna (un script, una restauración, un backend viejo
-- todavía en el aire durante el deploy) queda con GYM en vez de fallar por NOT NULL.
ALTER TABLE tenant ALTER COLUMN business_type SET DEFAULT 'GYM';

-- Red de seguridad por si quedó alguna fila sin tipo de migraciones anteriores.
UPDATE tenant SET business_type = 'GYM' WHERE business_type IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTA — por qué NO se dropea `business_type`
-- ─────────────────────────────────────────────────────────────────────────────
-- La intención del pedido era que el DUEÑO nunca más vea ni conteste "¿qué tipo de
-- negocio tenés?", y eso está cumplido de punta a punta: la pantalla se dio de baja,
-- el campo salió del contrato de la API (TenantDTO), el mapper lo bloquea en la
-- dirección cliente → entidad, y el front no tiene ni un lugar donde leerlo.
--
-- La columna se queda por tres razones concretas:
--   1. `business_type` es NOT NULL en V1 y arrastra un CHECK/enum; dropearla es
--      IRREVERSIBLE y toca la tabla raíz de la que cuelga TODO el sistema. Si algo
--      sale mal en el deploy, no hay vuelta atrás sin restaurar backup.
--   2. Ya nos pasó: renumerar/tocar el esquema aplicado en producción tiró Railway
--      abajo una vez (V23/V25, junio 2026). La regla que salió de ahí es que el
--      esquema de la raíz se toca de a poco y siempre para adelante.
--   3. Un discriminador de una sola fila no molesta a nadie: no se lee, no se
--      muestra, no se puede escribir desde afuera. Cuesta 4 bytes y compra el día
--      que el propio pedido insinúa ("¿hay más tipos de gimnasios?").
--
-- Si aun así se quiere la columna afuera, es una migración de una línea
-- (`ALTER TABLE tenant DROP COLUMN business_type`) más sacar el campo de la entidad
-- y el enum. Que sea una decisión aparte, tomada en frío y con backup a mano, y no
-- un efecto colateral de este cambio.
