-- V38__Update_Rollout.sql  (Fase 1, ladrillo 7 — rollout escalonado, ADR-007)
--
-- La versión OBJETIVO que le corresponde a cada anillo. El fundador promueve una
-- versión anillo por anillo (Piloto → Amigos → Todos); el updater de cada equipo
-- consulta la de su anillo y solo actualiza hasta ahí. Sin fila para un anillo =
-- sin freno (fail-open: el equipo toma la última release disponible).
--
-- Global (no tenant-aware): el rollout es del fundador sobre toda la flota.

CREATE TABLE IF NOT EXISTS update_rollout (
    ring           smallint    PRIMARY KEY,   -- 0=piloto, 1=amigos, 2=todos
    target_version varchar(32) NOT NULL,
    updated_at     timestamp   NOT NULL DEFAULT now()
);
