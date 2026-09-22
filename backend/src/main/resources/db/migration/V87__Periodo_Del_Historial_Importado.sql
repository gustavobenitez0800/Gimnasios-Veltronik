-- ============================================================================
-- V87 — El período del historial importado, para MOSTRARLO
-- ============================================================================
-- POR QUÉ.
-- En Pagos, la columna Período aparecía vacía en todo el historial que vino de
-- ControlFit: solo la tenían los cobros hechos en Veltronik. El dueño quiere ver
-- qué mes pagó cada uno, y el dato se puede reconstruir: el sistema anterior
-- corre el vencimiento de a un mes desde el vencimiento de antes, y el padrón que
-- se importó trae el vencimiento de cada socio. El último pago termina ahí; el
-- anterior, un mes antes; y así para atrás.
--
-- ── POR QUÉ COLUMNAS NUEVAS Y NO period_start / period_end ─────────────────
-- Esas dos columnas SON la cobertura: de period_end salen findPaidUntil y "pagó
-- y figura vencido", y la V86 prohíbe con un CHECK que un cobro importado las
-- tenga (ADR-014: la historia no corre vencimientos). Escribir ahí el período
-- reconstruido le correría la fecha a cualquier socio al que una consulta lo
-- encuentre, y a los ex-socios los revive.
--
-- Estas columnas son solo para leer: ninguna cuenta de cobertura las mira. Y son
-- una ESTIMACIÓN (el sistema anterior no exporta el período de cada pago), por eso
-- van aparte y con su nombre: nadie las puede confundir con un período cobrado.
--
-- ── QUIÉN LAS LLENA ─────────────────────────────────────────────────────────
-- PeriodosDelHistorialService, al importar. Para lo que ya estaba importado antes
-- de esta versión, lo completa solo al arrancar: busca las importaciones con
-- periodos_at en NULL. Escribe con un UPDATE directo, sin tocar updated_at, para
-- no bloquear el "deshacer" de la importación (que mira justamente eso).
-- ============================================================================

ALTER TABLE gym_payment ADD COLUMN periodo_importado_desde DATE;
ALTER TABLE gym_payment ADD COLUMN periodo_importado_hasta DATE;

-- Solo un cobro importado puede tener un período reconstruido, y si lo tiene está
-- completo y en orden. Un cobro de Veltronik tiene el suyo de verdad en period_*.
ALTER TABLE gym_payment
    ADD CONSTRAINT ck_gym_payment_periodo_importado
        CHECK (
            (periodo_importado_desde IS NULL AND periodo_importado_hasta IS NULL)
            OR (import_id IS NOT NULL
                AND periodo_importado_desde IS NOT NULL
                AND periodo_importado_hasta IS NOT NULL
                AND periodo_importado_hasta >= periodo_importado_desde)
        );

-- Cuándo se calcularon los períodos de esta importación. NULL = todavía no.
ALTER TABLE gym_payment_import ADD COLUMN periodos_at TIMESTAMP;

COMMENT ON COLUMN gym_payment.periodo_importado_desde IS
    'Período ESTIMADO de un cobro importado, solo para mostrar (V87). No es cobertura: esa vive en period_start/period_end.';
COMMENT ON COLUMN gym_payment.periodo_importado_hasta IS
    'Fin del período ESTIMADO de un cobro importado (V87). Ninguna cuenta de vencimientos lo mira.';
COMMENT ON COLUMN gym_payment_import.periodos_at IS
    'Cuándo se reconstruyeron los períodos de esta importación. NULL = pendiente (se completa al arrancar).';
