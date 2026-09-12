package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.GymMemberDTO;
import com.veltronik.v2.gym.dto.GymMemberInputDTO;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.mappers.GymMemberMapper;
import com.veltronik.v2.gym.services.GymMemberService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * API REST de socios del gimnasio.
 *
 * Devuelve SIEMPRE {@link GymMemberDTO} (nunca la entidad JPA cruda). El frontend solo
 * dibuja el contrato que define ese DTO. La ENTRADA tampoco es la entidad cruda: usa
 * {@link GymMemberInputDTO} para cerrar el mass-assignment (el cliente no puede inyectar
 * id, tenant, userId ni timestamps por el cuerpo del request).
 */
@RestController
@RequestMapping("/api/gym/members")
public class GymMemberController {

    private final GymMemberService memberService;
    private final GymMemberMapper memberMapper;
    private final com.veltronik.v2.gym.security.MemberAccessPolicy accessPolicy;

    private final com.veltronik.v2.gym.services.GymPlanService planService;

    public GymMemberController(GymMemberService memberService, GymMemberMapper memberMapper,
                               com.veltronik.v2.gym.security.MemberAccessPolicy accessPolicy,
                               com.veltronik.v2.gym.services.GymPlanService planService) {
        this.memberService = memberService;
        this.memberMapper = memberMapper;
        this.accessPolicy = accessPolicy;
        // Se resuelve el arancel por el servicio y no por el id crudo: así un socio no puede
        // quedar apuntando a un arancel de OTRO gimnasio si alguien manda un id ajeno.
        this.planService = planService;
    }

    @GetMapping
    public ResponseEntity<List<GymMemberDTO>> getAllMembers() {
        return ResponseEntity.ok(memberMapper.toDtoList(memberService.findAllForCurrentTenant(), accessPolicy));
    }

    /**
     * Lista paginada de socios (server-side). Evita traer los cientos de socios de una.
     * Params: page (0-based), size, search (opcional, busca en nombre/dni/email).
     */
    @GetMapping("/paged")
    public ResponseEntity<com.veltronik.v2.core.dto.PageResponse<GymMemberDTO>> getMembersPaged(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String search) {
        var pageable = org.springframework.data.domain.PageRequest.of(
                page, size, org.springframework.data.domain.Sort.by("firstName").ascending());
        var result = memberService.findPageForCurrentTenant(search, pageable).map(m -> memberMapper.toDto(m, accessPolicy));
        return ResponseEntity.ok(com.veltronik.v2.core.dto.PageResponse.of(result));
    }

    @GetMapping("/{id}")
    public ResponseEntity<GymMemberDTO> getMemberById(@PathVariable UUID id) {
        return ResponseEntity.ok(memberMapper.toDto(memberService.findByIdAndVerifyOwnership(id), accessPolicy));
    }

    /**
     * Da de alta un socio. El terminal puede traer el id, para poder hacerlo sin internet.
     *
     * <p><b>⭐ POR QUÉ EL ID PUEDE VENIR DE AFUERA.</b> En el mostrador se da de alta y se cobra
     * en el mismo acto. Sin conexión las dos cosas van a la cola, y el cobro tiene que poder
     * nombrar al socio: si el id lo inventara el servidor, el cobro encolado apuntaría a alguien
     * que todavía no existe. Con el id generado en el terminal, el alta y su cobro viajan
     * atados desde el principio.</p>
     *
     * <p><b>⚠️ Y POR ESO MISMO HAY QUE CUIDARLO.</b> Un id que viene del cliente es un id que
     * el cliente eligió. Sin la guarda de abajo, mandar el UUID de un socio de OTRO gimnasio
     * sobrescribiría su ficha y se la llevaría puesta a este tenant — el `save` de JPA con id
     * no nulo hace merge, no falla. La verificación no es opcional: es lo que separa "puedo
     * elegir mi id" de "puedo elegir el de cualquiera".</p>
     *
     * <p>Reintentar el alta devuelve el socio que ya está, sin pisarle nada: un alta que se
     * encoló y se mandó dos veces no puede volver a la ficha vieja lo que alguien editó
     * después.</p>
     */
    @PostMapping
    public ResponseEntity<GymMemberDTO> createMember(@RequestBody GymMemberInputDTO input) {
        if (input.getId() != null) {
            GymMember yaEstaba = memberService.buscarEnCualquierTenant(input.getId()).orElse(null);
            if (yaEstaba != null) {
                UUID mio = com.veltronik.v2.core.security.TenantContextHolder.getTenantId();
                if (yaEstaba.getTenant() == null || !mio.equals(yaEstaba.getTenant().getId())) {
                    throw new org.springframework.web.server.ResponseStatusException(
                            org.springframework.http.HttpStatus.CONFLICT,
                            "Ese identificador ya está en uso.");
                }
                // Es de este gimnasio: el alta ya entró. Se devuelve tal cual está.
                return ResponseEntity.ok(memberMapper.toDto(yaEstaba, accessPolicy));
            }
        }

        GymMember member = new GymMember();
        if (input.getId() != null) member.setId(input.getId());
        applyEditableFields(member, input);
        return ResponseEntity.ok(memberMapper.toDto(memberService.saveForCurrentTenant(member), accessPolicy));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GymMemberDTO> updateMember(@PathVariable UUID id, @RequestBody GymMemberInputDTO input) {
        GymMember existingMember = memberService.findByIdAndVerifyOwnership(id);
        applyEditableFields(existingMember, input);
        return ResponseEntity.ok(memberMapper.toDto(memberService.saveForCurrentTenant(existingMember), accessPolicy));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteMember(@PathVariable UUID id) {
        memberService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Copia SOLO los campos editables del DTO de entrada a la entidad. Nunca toca id, tenant,
     * userId ni timestamps → cierra el mass-assignment. Cada campo se aplica solo si vino en el
     * request (parche parcial), preservando el comportamiento del PUT previo.
     */
    private void applyEditableFields(GymMember m, GymMemberInputDTO in) {
        if (in.getFirstName() != null) m.setFirstName(in.getFirstName());
        if (in.getLastName() != null) m.setLastName(in.getLastName());
        if (in.getEmail() != null) m.setEmail(in.getEmail());
        if (in.getPhone() != null) m.setPhone(in.getPhone());
        String doc = in.resolveDocument();
        if (doc != null) m.setDocument(doc);
        if (in.getActive() != null) m.setActive(in.getActive());
        if (in.getMembershipStart() != null) m.setMembershipStart(in.getMembershipStart());
        if (in.getMembershipEnd() != null) m.setMembershipEnd(in.getMembershipEnd());
        if (in.getAttendanceDays() != null) m.setAttendanceDays(in.getAttendanceDays());
        if (in.getNotes() != null) m.setNotes(in.getNotes());
        if (in.getBirthDate() != null) m.setBirthDate(parsearFechaNacimiento(in.getBirthDate()));
        if (in.getAddress() != null) m.setAddress(in.getAddress());
        if (in.getEmergencyContact() != null) m.setEmergencyContact(in.getEmergencyContact());
        if (in.getEmergencyPhone() != null) m.setEmergencyPhone(in.getEmergencyPhone());
        if (in.getGender() != null) m.setGender(in.getGender());
        if (in.getObjectives() != null) m.setObjectives(in.getObjectives());
        if (in.getPhotoUrl() != null) m.setPhotoUrl(in.getPhotoUrl());

        // El arancel se distingue de los demás campos: "no vino" (no tocar) no es lo mismo
        // que "vino vacío" (sacárselo). Sin esa marca no habría forma de dejar a un socio
        // SIN arancel, porque un null se lee igual que un campo ausente.
        if (Boolean.TRUE.equals(in.getPlanIdPresente()) || in.getPlanId() != null) {
            m.setPlan(in.getPlanId() == null ? null : planService.findByIdAndVerifyOwnership(in.getPlanId()));
        }
    }

    /**
     * Le asigna el mismo arancel a muchos socios de una sola vez.
     *
     * <p>El gimnasio acaba de configurar sus aranceles y tiene cientos de socios sin
     * ninguno. Uno por uno son cientos de pedidos, más de un minuto de espera, y —lo grave—
     * cerrar la pestaña a la mitad deja la mitad hecha sin forma de saber cuál. Acá es UNA
     * operación.</p>
     *
     * <p>⚠️ Solo dueño/admin. Cambiar de golpe lo que se le cobra a doscientas personas no
     * es una operación de mostrador.</p>
     *
     * @return cuántos socios cambiaron. Puede ser menos que los pedidos: los ids que no son
     *         de este gimnasio simplemente no se tocan.
     */
    @PostMapping("/arancel-masivo")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<java.util.Map<String, Object>> asignarArancelMasivo(
            @RequestBody ArancelMasivoInput input) {
        int actualizados = memberService.asignarArancelMasivo(input.getMemberIds(), input.getPlanId());
        java.util.Map<String, Object> body = new java.util.HashMap<>();
        body.put("actualizados", actualizados);
        // Cuántos se pidieron, para que la pantalla pueda decir "38 de 40" en vez de dar por
        // hecho que se aplicaron todos.
        body.put("pedidos", input.getMemberIds() == null ? 0 : input.getMemberIds().size());
        return ResponseEntity.ok(body);
    }

    /**
     * Convierte la fecha de nacimiento que manda el cliente, sin romperle el alta.
     *
     * <p>Desde la V78 la columna es {@code date} y no {@code text}. El DTO sigue siendo
     * String —eso es contrato con los clientes 2.6.31 instalados— así que la conversión
     * pasa por acá, que es el único lugar donde se escribe el campo.</p>
     *
     * <p><b>Tolerante a propósito.</b> Un texto vacío o ilegible queda en NULL en vez de
     * tirar un 400: del otro lado hay un mostrador con alguien esperando, y perder el alta
     * entera de un socio por una fecha de nacimiento mal tipeada sería el peor cambio
     * posible. Lo que sí queda garantizado es que a la base no entra basura, que era el
     * problema real de guardarla como texto.</p>
     */
    private static java.time.LocalDate parsearFechaNacimiento(String valor) {
        if (valor == null || valor.isBlank()) return null;
        try {
            return java.time.LocalDate.parse(valor.trim());
        } catch (java.time.format.DateTimeParseException e) {
            return null;
        }
    }

    /** Lo que hace falta para la asignación masiva. */
    public static class ArancelMasivoInput {
        private List<UUID> memberIds;
        /** null = sacarles el arancel a todos. */
        private UUID planId;

        public List<UUID> getMemberIds() { return memberIds; }
        public void setMemberIds(List<UUID> v) { this.memberIds = v; }
        public UUID getPlanId() { return planId; }
        public void setPlanId(UUID v) { this.planId = v; }
    }
}
