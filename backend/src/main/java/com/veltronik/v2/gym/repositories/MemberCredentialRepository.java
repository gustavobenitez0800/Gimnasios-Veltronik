package com.veltronik.v2.gym.repositories;

import com.veltronik.v2.gym.entities.MemberCredential;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface MemberCredentialRepository extends JpaRepository<MemberCredential, UUID> {

    /** El llavero activo con ese código en este gimnasio. Hay uno como mucho (índice de la V90). */
    Optional<MemberCredential> findByTenantIdAndTipoAndCodigoAndDadoDeBajaAtIsNull(
            UUID tenantId, String tipo, String codigo);

    /** La última vez que ese llavero se dio de baja: para decir «lo perdió fulano el día tal». */
    Optional<MemberCredential> findFirstByTenantIdAndTipoAndCodigoAndDadoDeBajaAtIsNotNullOrderByDadoDeBajaAtDesc(
            UUID tenantId, String tipo, String codigo);

    /** Todos los llaveros de un socio, los activos y los dados de baja: es su ficha. */
    List<MemberCredential> findByTenantIdAndMemberIdOrderByCreatedAtDesc(UUID tenantId, UUID memberId);

    /** Uno de este gimnasio, por id. El filtro del tenant no se aplica a las búsquedas por clave. */
    Optional<MemberCredential> findByIdAndTenantId(UUID id, UUID tenantId);

    /**
     * Los llaveros activos del gimnasio, solo el socio y el código: es lo que viaja en la lista
     * de socios para que el mostrador los encuentre sin internet. Dos columnas, no la fila.
     */
    @Query("""
            SELECT c.memberId AS memberId, c.codigo AS codigo
            FROM MemberCredential c
            WHERE c.tenant.id = :tenantId AND c.dadoDeBajaAt IS NULL
            """)
    List<CodigoDelSocio> activosDelGimnasio(@Param("tenantId") UUID tenantId);

    /** Lo que trae {@link #activosDelGimnasio}. */
    interface CodigoDelSocio {
        UUID getMemberId();
        String getCodigo();
    }

    /**
     * La marca de los llaveros del gimnasio: cambia con cada asignación y cada baja. La misma
     * cuenta que {@code GymMemberRepository#marcaDelGimnasio}, por los mismos motivos (la suma y
     * no el máximo), y con las dadas de baja adentro: una baja también tiene que verse.
     */
    @Query(value = """
            SELECT count(*) || ':' || coalesce(sum(extract(epoch FROM updated_at))::text, '-')
            FROM member_credential
            WHERE tenant_id = :tenantId
            """, nativeQuery = true)
    String marcaDelGimnasio(@Param("tenantId") UUID tenantId);
}
