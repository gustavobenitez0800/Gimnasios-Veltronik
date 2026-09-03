package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.GymMember;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GymMemberRepository extends JpaRepository<GymMember, UUID> {
    /**
     * ⚠️⚠️ EL ARANCEL VIAJA EN LA MISMA CONSULTA (@EntityGraph), Y NO ES UNA OPTIMIZACIÓN.
     *
     * <p>{@code GymMember.plan} es LAZY y el DTO se arma en el CONTROLADOR, fuera de la
     * transacción. Con {@code spring.jpa.open-in-view=false} —que es como corre este
     * backend— la sesión de Hibernate ya está cerrada cuando el mapper pide el nombre del
     * arancel: salta LazyInitializationException y <b>el listado entero responde 500</b>.</p>
     *
     * <p>No se vio durante meses porque ningún socio tenía arancel. Basta UNO para que la
     * pantalla de Socios deje de abrir para todo el gimnasio. Ver
     * ListadosConArancelIntegrationTest, que lo reproduce contra Postgres de verdad.</p>
     *
     * <p>De paso evita el N+1: sin esto serían 400 consultas para pintar 400 filas.</p>
     */
    @EntityGraph(attributePaths = "plan")
    List<GymMember> findByTenantId(UUID tenantId);

    /**
     * El socio con su arancel ya resuelto. Mismo motivo que los listados: el DTO se arma
     * fuera de la transacción, y sin esto la ficha y el GUARDADO responden 500 apenas el
     * socio tiene arancel. El guardado es el peor de los dos: la edición SE APLICA y aun así
     * la pantalla muestra un error rojo, así que parece que no se guardó y alguien lo hace
     * de nuevo.
     */
    @EntityGraph(attributePaths = "plan")
    java.util.Optional<GymMember> findWithPlanById(UUID id);
    long countByTenantId(UUID tenantId);

    /** Últimas altas de socios del tenant (para el feed de actividad del equipo). */
    List<GymMember> findTop25ByTenantIdOrderByCreatedAtDesc(UUID tenantId);
    long countByTenantIdAndIsActiveTrue(UUID tenantId);

    // ── Paginación server-side ──
    @EntityGraph(attributePaths = "plan")
    Page<GymMember> findByTenantId(UUID tenantId, Pageable pageable);

    @Query("SELECT m FROM GymMember m WHERE m.tenant.id = :tenantId AND (" +
           "LOWER(m.firstName) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(m.lastName) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(COALESCE(m.document, '')) LIKE LOWER(CONCAT('%', :q, '%')) OR " +
           "LOWER(COALESCE(m.email, '')) LIKE LOWER(CONCAT('%', :q, '%')))")
    @EntityGraph(attributePaths = "plan")
    Page<GymMember> searchByTenantId(@Param("tenantId") UUID tenantId, @Param("q") String q, Pageable pageable);

    /**
     * El socio con ese documento en ESTE gimnasio, comparando <b>normalizado</b>. Lo usa el
     * check-in por QR, donde el socio se identifica escribiendo su DNI.
     *
     * <p><b>Por qué normalizado y no exacto.</b> La primera versión comparaba el texto tal cual
     * y no encontraba a nadie: en la ficha puede estar {@code 30.111.222} y el socio escribe
     * {@code 30111222}, o al revés, o con un espacio de más al pegarlo. Son la misma persona y
     * el sistema decía "no te encontramos" con el número bien puesto. Un DNI es un número, no
     * una cadena: los puntos son adorno de impresión.</p>
     *
     * <p><b>Sigue siendo EXACTO, no "contiene".</b> Se limpian los separadores de los dos lados
     * y después se exige igualdad. El buscador del mostrador usa {@code LIKE} porque ahí hay una
     * persona eligiendo de una lista; acá no mira nadie, y un {@code LIKE} podría marcarle la
     * entrada al socio equivocado.</p>
     *
     * <p>Nativa porque {@code regexp_replace} es de Postgres. Lleva {@code tenant_id} explícito:
     * al ser nativa, el filtro de Hibernate no la toca y el aislamiento tiene que ir escrito a
     * mano — sin eso, un DNI podría encontrar al socio de otro gimnasio.</p>
     *
     * <p>Devuelve lista y no {@code Optional} porque el documento no tiene índice único: si un
     * gimnasio cargó dos veces a la misma persona, queremos enterarnos en vez de que explote.</p>
     *
     * @param documentoNormalizado el documento YA limpio (solo letras y números, en mayúsculas)
     */
    @Query(value = """
            SELECT * FROM gym_members m
             WHERE m.tenant_id = :tenantId
               AND m.document IS NOT NULL
               AND UPPER(regexp_replace(m.document, '[^0-9A-Za-z]', '', 'g')) = :documentoNormalizado
            """, nativeQuery = true)
    List<GymMember> findByDocumentoNormalizado(@Param("tenantId") UUID tenantId,
                                               @Param("documentoNormalizado") String documentoNormalizado);

    // Para "Expiring Soon" (vencen en los próximos días)
    List<GymMember> findByTenantIdAndMembershipEndBetween(UUID tenantId, java.time.LocalDateTime start, java.time.LocalDateTime end);

    // Para "At Risk" (vencidos en el pasado pero siguen marcados como activos)
    List<GymMember> findByTenantIdAndIsActiveTrueAndMembershipEndBefore(UUID tenantId, java.time.LocalDateTime date);

    // Versiones COUNT (el dashboard solo necesita el número; cargar las entidades para .size() no escala)
    long countByTenantIdAndMembershipEndBetween(UUID tenantId, java.time.LocalDateTime start, java.time.LocalDateTime end);
    long countByTenantIdAndIsActiveTrueAndMembershipEndBefore(UUID tenantId, java.time.LocalDateTime date);

    /**
     * Le pone (o le saca) el arancel a muchos socios de una sola vez.
     *
     * <p><b>Escribe UNA columna.</b> No carga los socios ni los vuelve a guardar enteros: si
     * mandara el objeto completo, cualquier campo que no viniera cargado se borraría — y en
     * masa, que es la peor forma de perder datos.</p>
     *
     * <p>⚠️ El {@code tenant.id} del WHERE no es decorativo. Una operación que recibe una
     * lista de ids es exactamente donde se cuela el id de otro gimnasio; sin esa condición,
     * un pedido armado a mano podría escribir sobre socios ajenos.</p>
     *
     * <p>{@code clearAutomatically} porque después de un UPDATE masivo lo que haya en la
     * sesión de Hibernate quedó viejo: sin limpiarla, una lectura posterior devolvería el
     * valor anterior desde su caché de primer nivel.</p>
     *
     * @return cuántas filas cambiaron de verdad
     */
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("UPDATE GymMember m SET m.plan = :plan WHERE m.tenant.id = :tenantId AND m.id IN :ids")
    int asignarArancel(@Param("tenantId") UUID tenantId,
                       @Param("ids") java.util.Collection<UUID> ids,
                       @Param("plan") com.veltronik.v2.gym.entities.GymPlan plan);
}
