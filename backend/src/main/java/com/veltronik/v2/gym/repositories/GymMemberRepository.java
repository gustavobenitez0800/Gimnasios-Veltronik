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
    List<GymMember> findByTenantIdAndDeletedAtIsNull(UUID tenantId);

    /**
     * El socio con su arancel ya resuelto. Mismo motivo que los listados: el DTO se arma
     * fuera de la transacción, y sin esto la ficha y el GUARDADO responden 500 apenas el
     * socio tiene arancel. El guardado es el peor de los dos: la edición SE APLICA y aun así
     * la pantalla muestra un error rojo, así que parece que no se guardó y alguien lo hace
     * de nuevo.
     */
    @EntityGraph(attributePaths = "plan")
    java.util.Optional<GymMember> findWithPlanById(UUID id);
    long countByTenantIdAndDeletedAtIsNull(UUID tenantId);

    /** Últimas altas de socios del tenant (para el feed de actividad del equipo). */
    List<GymMember> findTop25ByTenantIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID tenantId);

    /** Las cinco últimas altas, para el Dashboard: se piden cinco, no veinticinco para tirar veinte. */
    List<GymMember> findTop5ByTenantIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID tenantId);
    long countByTenantIdAndDeletedAtIsNullAndIsActiveTrue(UUID tenantId);

    // ── Paginación server-side ──
    @EntityGraph(attributePaths = "plan")
    Page<GymMember> findByTenantIdAndDeletedAtIsNull(UUID tenantId, Pageable pageable);

    /**
     * La papelera: los socios borrados de este gimnasio, del último borrado al primero.
     *
     * <p>Es el ÚNICO método que mira del otro lado de {@code deleted_at}. Todos los demás
     * dicen {@code ...AndDeletedAtIsNull} justamente para que este quede solo y a la vista:
     * si alguna vez aparece un segundo, hay que preguntarse por qué.</p>
     *
     * <p>Va con tope: la papelera es para encontrar "el que borré recién", no para pasear por
     * años de historia. Lo entra {@code Pageable} desde el servicio.</p>
     */
    @EntityGraph(attributePaths = "plan")
    List<GymMember> findByTenantIdAndDeletedAtIsNotNullOrderByDeletedAtDesc(UUID tenantId, Pageable pageable);

    @Query("SELECT m FROM GymMember m WHERE m.tenant.id = :tenantId AND m.deletedAt IS NULL AND (" +
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
            SELECT * FROM gym_member m
             WHERE m.tenant_id = :tenantId
               AND m.deleted_at IS NULL
               AND m.document IS NOT NULL
               AND UPPER(regexp_replace(m.document, '[^0-9A-Za-z]', '', 'g')) = :documentoNormalizado
            """, nativeQuery = true)
    List<GymMember> findByDocumentoNormalizado(@Param("tenantId") UUID tenantId,
                                               @Param("documentoNormalizado") String documentoNormalizado);

    /**
     * Los que vencen en los próximos días (Retención → "por vencer"). Solo los que siguen
     * siendo socios: al dado de baja no hay que avisarle que se le termina la cuota.
     */
    List<GymMember> findByTenantIdAndDeletedAtIsNullAndIsActiveTrueAndMembershipEndBetween(
            UUID tenantId, java.time.LocalDateTime start, java.time.LocalDateTime end);

    /**
     * El padrón contado por situación, con el MISMO criterio que {@code MemberAccessPolicy}
     * —la única fuente de verdad de "al día" y "vencido"— y en una sola pasada.
     *
     * <p>⚠️ Antes el Dashboard hacía su propia cuenta: "al día" era "activos menos vencidos",
     * así que un socio <b>sin fecha de vencimiento</b> contaba como al día. La política lo
     * marca aparte (SIN_DATOS: falta el dato, no es que pagó) y la pantalla de Socios le dice
     * "sin cuota". Dos pantallas, dos respuestas para el mismo socio.</p>
     *
     * <p>Vencido incluye a los que están en gracia: deben la cuota aunque todavía entren, y es
     * lo mismo que cuenta el filtro "Vencidos" de Socios.</p>
     *
     * @return una fila: [total, bajas, sinFecha, vencidos, alDia]
     */
    @Query(value = """
            SELECT COUNT(*)                                                         AS total,
                   COUNT(*) FILTER (WHERE NOT m.is_active)                          AS bajas,
                   COUNT(*) FILTER (WHERE m.is_active AND m.membership_end IS NULL) AS sin_fecha,
                   COUNT(*) FILTER (WHERE m.is_active AND m.membership_end <= :ahora) AS vencidos,
                   COUNT(*) FILTER (WHERE m.is_active AND m.membership_end > :ahora)  AS al_dia
              FROM gym_member m
             WHERE m.tenant_id = :tenantId AND m.deleted_at IS NULL
            """, nativeQuery = true)
    List<Object[]> contarPorSituacion(@Param("tenantId") UUID tenantId,
                                      @Param("ahora") java.time.LocalDateTime ahora);

    /**
     * Cuántos socios vencen entre ahora y {@code hasta}. Solo los que siguen siendo socios.
     *
     * <p>⚠️ La consulta derivada que había no miraba {@code is_active}: un dado de baja con la
     * cuota todavía corriendo contaba como "vence esta semana", mientras la lista de alertas
     * de al lado —que sí filtraba— no lo mostraba. El número y la lista no coincidían.</p>
     */
    @Query("SELECT COUNT(m) FROM GymMember m WHERE m.tenant.id = :tenantId AND m.deletedAt IS NULL "
         + "AND m.isActive = true AND m.membershipEnd > :ahora AND m.membershipEnd <= :hasta")
    long contarPorVencer(@Param("tenantId") UUID tenantId,
                         @Param("ahora") java.time.LocalDateTime ahora,
                         @Param("hasta") java.time.LocalDateTime hasta);

    /**
     * Los socios que necesitan atención —vencidos o por vencer—, del MÁS CERCANO a hoy al más
     * lejano, con un tope.
     *
     * <p>⚠️ Antes el orden era por fecha de vencimiento ascendente: primero el que venció hace
     * más tiempo. En un gimnasio que migró con 179 vencidos, las alertas mostraban gente que
     * no pisa el gimnasio desde hace meses, y quedaban afuera justo los que había que llamar:
     * el que vence mañana y el que venció ayer. Lo urgente es lo que está pasando ahora.</p>
     *
     * <p>A igual distancia, primero el que ya venció: ese ya debe.</p>
     */
    @Query(value = """
            SELECT m.* FROM gym_member m
             WHERE m.tenant_id = :tenantId AND m.deleted_at IS NULL AND m.is_active = true
               AND m.membership_end IS NOT NULL AND m.membership_end <= :hasta
             ORDER BY ABS(EXTRACT(EPOCH FROM (m.membership_end - :ahora))) ASC, m.membership_end ASC
             LIMIT :limite
            """, nativeQuery = true)
    List<GymMember> alertasPorCercania(@Param("tenantId") UUID tenantId,
                                       @Param("ahora") java.time.LocalDateTime ahora,
                                       @Param("hasta") java.time.LocalDateTime hasta,
                                       @Param("limite") int limite);

    /** Cuántos son en total, para poder decir "y N más" sin traerlos. */
    @Query("SELECT COUNT(m) FROM GymMember m WHERE m.tenant.id = :tenantId AND m.deletedAt IS NULL AND m.isActive = true "
         + "AND m.membershipEnd IS NOT NULL AND m.membershipEnd <= :hasta")
    long contarVencidosOPorVencer(@Param("tenantId") UUID tenantId,
                                  @Param("hasta") java.time.LocalDateTime hasta);

    /**
     * Los que cumplen años HOY. La comparación es por día y mes; el año no importa.
     *
     * <p>Desde la V78 {@code birth_date} es una columna {@code date} de verdad. Antes era
     * TEXTO, y esta consulta tenía que recortar el string por posición
     * ({@code SUBSTRING(birth_date FROM 6 FOR 5)}) confiando en que todos los valores
     * estuvieran en ISO — un socio con la fecha cargada de otra forma no cumplía años
     * nunca, y nadie se enteraba.</p>
     *
     * <p>Se usa {@code to_char(..., 'MM-DD')} y no EXTRACT para no cambiarle la firma a
     * este método ni a su llamador. No hay índice sobre esa expresión —Postgres no lo
     * permite, porque {@code to_char} es STABLE y no IMMUTABLE— y no hace falta: la
     * consulta entra por {@code ix_gym_member_tenant}, así que solo evalúa la expresión
     * sobre los socios de UN gimnasio. Ver V78.</p>
     *
     * <p>Traer el padrón entero para mirar diez fechas de nacimiento era el peor de los
     * cálculos que hacía el Dashboard.</p>
     */
    @Query(value = "SELECT * FROM gym_member m WHERE m.tenant_id = :tenantId "
                 + "AND m.deleted_at IS NULL AND m.birth_date IS NOT NULL AND m.is_active = true "
                 + "AND to_char(m.birth_date, 'MM-DD') = :mesYDia", nativeQuery = true)
    List<GymMember> cumplenHoy(@Param("tenantId") UUID tenantId, @Param("mesYDia") String mesYDia);

    // Para "At Risk" (vencidos en el pasado pero siguen marcados como activos)
    List<GymMember> findByTenantIdAndDeletedAtIsNullAndIsActiveTrueAndMembershipEndBefore(UUID tenantId, java.time.LocalDateTime date);


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
    @Query("UPDATE GymMember m SET m.plan = :plan WHERE m.tenant.id = :tenantId AND m.deletedAt IS NULL AND m.id IN :ids")
    int asignarArancel(@Param("tenantId") UUID tenantId,
                       @Param("ids") java.util.Collection<UUID> ids,
                       @Param("plan") com.veltronik.v2.gym.entities.GymPlan plan);

    // ── Para el importador (V84) ───────────────────────────────────────────────

    /**
     * Los documentos de los socios que están en la papelera, ya normalizados.
     *
     * <p>Si un archivo trae a alguien que se borró, el importador lo da de alta de nuevo —y
     * avisa—: si era la misma persona, conviene restaurarla, porque así recupera su historia
     * de visitas y cobros. Misma limpieza que {@link #findByDocumentoNormalizado}.</p>
     */
    @Query(value = """
            SELECT DISTINCT UPPER(regexp_replace(m.document, '[^0-9A-Za-z]', '', 'g'))
              FROM gym_member m
             WHERE m.tenant_id = :tenantId
               AND m.deleted_at IS NOT NULL
               AND m.document IS NOT NULL
            """, nativeQuery = true)
    List<String> documentosEnPapelera(@Param("tenantId") UUID tenantId);

    /**
     * Cuáles de estos socios tienen al menos un cobro registrado en Veltronik.
     *
     * <p>Para dos reglas del importador: a quien ya cobra por Veltronik el archivo no le mueve
     * el vencimiento (lo mueven los cobros), y un socio creado por una importación que ya
     * cobró no se puede deshacer.</p>
     *
     * <p>⚠️ <b>El historial importado NO cuenta</b> ({@code import_id IS NULL}, ADR-014). Un cobro
     * de ControlFit no movió ningún vencimiento, así que no puede quitarle al archivo del padrón
     * la palabra sobre la fecha: sin este filtro, cargar el historial de un gimnasio que migra
     * dejaba a casi todo su padrón con el vencimiento congelado para cualquier reimportación.</p>
     */
    @Query(value = "SELECT DISTINCT p.member_id FROM gym_payment p WHERE p.member_id IN (:ids) "
            + "AND p.import_id IS NULL",
            nativeQuery = true)
    List<UUID> conCobros(@Param("ids") java.util.Collection<UUID> ids);

    /**
     * Cuáles de estos socios tienen historial de caja importado. Deshacer la importación que
     * los creó dejaría ese historial sin dueño: primero se deshace el historial.
     */
    @Query(value = "SELECT DISTINCT p.member_id FROM gym_payment p WHERE p.member_id IN (:ids) "
            + "AND p.import_id IS NOT NULL",
            nativeQuery = true)
    List<UUID> conHistorialImportado(@Param("ids") java.util.Collection<UUID> ids);

    /** Cuáles de estos socios ya pasaron por la puerta. Registrar una entrada no toca al socio. */
    @Query(value = "SELECT DISTINCT a.member_id FROM access_log a WHERE a.member_id IN (:ids)",
            nativeQuery = true)
    List<UUID> conAccesos(@Param("ids") java.util.Collection<UUID> ids);

    /**
     * ⚠️ El ÚNICO borrado definitivo de socios del sistema, y es a propósito.
     *
     * <p>Desde la V80 borrar un socio lo manda a la papelera: se conserva su historia. Esto es
     * otra cosa — deshacer una importación. Los socios que borra los creó la importación y el
     * servicio verificó antes que nadie los tocó después: sin cobros, sin entradas, sin
     * ediciones. No hay historia que conservar, y mandarlos a la papelera dejaría 400 fichas
     * fantasma que el dueño nunca cargó.</p>
     *
     * <p>Si algo los referencia igual (una tabla sin cascada), la base rechaza el borrado y la
     * transacción entera vuelve atrás: nunca queda un deshacer a medias.</p>
     */
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("DELETE FROM GymMember m WHERE m.tenant.id = :tenantId AND m.id IN :ids")
    int borrarLosQueCreoUnaImportacion(@Param("tenantId") UUID tenantId,
                                       @Param("ids") java.util.Collection<UUID> ids);
}
