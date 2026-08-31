package com.veltronik.v2.gym.mappers;

import com.veltronik.v2.gym.dto.GymMemberDTO;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.security.MemberAccessPolicy;
import org.mapstruct.AfterMapping;
import org.mapstruct.Context;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Mapper automático entre la entidad {@link GymMember} y su {@link GymMemberDTO}.
 *
 * <p>Genera la implementación en compilación (MapStruct). Mapea {@code dni} desde
 * {@code document} por compatibilidad con el frontend legacy; el resto por nombre. NO expone
 * campos internos como tenant o userId.</p>
 *
 * <p><b>Además adjunta la situación de la cuota</b>, y eso no es un adorno: la misma cuenta
 * estaba escrita en cinco lugares del frontend y no daban lo mismo. Para el mismo socio, el
 * aviso del mostrador decía "hace 2 días" y la lista decía "4d vencido".</p>
 *
 * <p><b>La política llega como {@code @Context}, no como campo inyectado.</b> Dos motivos: la
 * regla de arquitectura del proyecto prohíbe {@code @Autowired} en campos (y hay un test que
 * la hace cumplir), y MapStruct no sabe generar una subclase que llame a un constructor con
 * argumentos. El contexto es el mecanismo que MapStruct sí ofrece para esto, y de paso deja
 * la dependencia explícita en cada llamada en vez de escondida en el objeto.</p>
 */
@Mapper(componentModel = "spring")
public interface GymMemberMapper {

    /** Zona del negocio: "hoy" se decide en hora argentina, nunca en UTC. */
    java.time.ZoneId BUSINESS_ZONE = java.time.ZoneId.of("America/Argentina/Buenos_Aires");

    @Mapping(target = "dni", source = "document")
    @Mapping(target = "fullName", expression = "java(buildFullName(entity))")
    GymMemberDTO toDto(GymMember entity, @Context MemberAccessPolicy policy);

    List<GymMemberDTO> toDtoList(List<GymMember> entities, @Context MemberAccessPolicy policy);

    /**
     * Adjunta la situación de la cuota, resuelta por la ÚNICA fuente de verdad.
     *
     * <p>Es la misma clase que decide qué ve el socio cuando escanea el QR y qué se le avisa
     * al mostrador. Un socio no puede deber dos cantidades distintas de días según qué
     * pantalla se mire.</p>
     */
    @AfterMapping
    default void agregarSituacion(GymMember entity, @MappingTarget GymMemberDTO dto,
                                  @Context MemberAccessPolicy policy) {
        if (entity == null || dto == null || policy == null) return;
        MemberAccessPolicy.Verdict v = policy.evaluate(entity, LocalDateTime.now(BUSINESS_ZONE));
        dto.setSituacion(v.status().name());
        dto.setDiasVencido(v.diasVencido());
        dto.setDiasRestantes(v.diasRestantes());
        dto.setClasesRestantes(v.clasesRestantes());
    }

    /** Nombre para mostrar: "Nombre Apellido", tolerante a nulos. */
    default String buildFullName(GymMember entity) {
        String fn = entity.getFirstName() != null ? entity.getFirstName() : "";
        String ln = entity.getLastName() != null ? entity.getLastName() : "";
        return (fn + " " + ln).trim();
    }
}
