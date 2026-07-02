package com.veltronik.v2.core.entities;

import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.id.IdentifierGenerator;

import java.util.UUID;

/**
 * Generador de UUID que RESPETA un id pre-asignado (Fase 0 de la V3 local-first, ADR-003).
 *
 * <p><b>Por qué existe:</b> con {@code @GeneratedValue(strategy = UUID)} el id lo inventa
 * siempre el servidor al insertar. Para el sync engine de la V3, los eventos operativos
 * (ventas, cobros, asistencias) deben poder <b>nacer con su UUID generado en el dispositivo</b>:
 * así un reintento de sincronización jamás duplica una venta (idempotencia — el mismo evento
 * llega dos veces con el mismo id y la segunda inserción se detecta como duplicado).</p>
 *
 * <p><b>Comportamiento:</b></p>
 * <ul>
 *   <li>Id nulo (todo el tráfico actual: DTO → entity → save) → genera un UUID aleatorio.
 *       Idéntico al comportamiento anterior; nada cambia para los flujos existentes.</li>
 *   <li>Id ya seteado (el futuro camino de sincronización) → lo respeta tal cual.</li>
 * </ul>
 *
 * <p><b>Nota para el sync engine (Fase 1):</b> {@code JpaRepository.save()} con id no nulo
 * hace merge (SELECT previo). El camino de sincronización deberá usar {@code persist} explícito
 * o detección de duplicados por id — se decide al construirlo.</p>
 */
public class AssignableUuidGenerator implements IdentifierGenerator {

    @Override
    public Object generate(SharedSessionContractImplementor session, Object entity) {
        Object currentId = session.getEntityPersister(null, entity)
                .getIdentifier(entity, session);
        return currentId != null ? currentId : UUID.randomUUID();
    }
}
