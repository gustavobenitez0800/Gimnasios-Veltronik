-- ============================================================================
-- V53 — El color de la marca del gimnasio
-- ============================================================================
-- El dueño elige UN color y el sistema arma la paleta entera a partir de él.
-- Se guarda solo ese color, no los diez pasos derivados: si mañana cambia la
-- curva del diseño, los gimnasios la reciben sin migrar una fila.
--
-- NULL = "no eligió" y significa la paleta de Veltronik, no "negro". Es la misma
-- distinción que classes_remaining en V52: el default no es un valor, es la
-- ausencia de valor.
--
-- Alcance: pinta el sistema (lo que vive adentro de AppLayout). El lobby, el
-- login y el portal de cobro quedan con la identidad de Veltronik, porque ahí
-- el dueño no está usando su gimnasio: está tratando con su proveedor.
-- ============================================================================

ALTER TABLE tenant ADD COLUMN IF NOT EXISTS brand_color VARCHAR(7);

COMMENT ON COLUMN tenant.brand_color IS
    'Color de marca en formato #RRGGBB. NULL = paleta por defecto de Veltronik.';
