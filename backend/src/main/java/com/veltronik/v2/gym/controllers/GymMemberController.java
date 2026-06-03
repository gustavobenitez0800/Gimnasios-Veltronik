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

    public GymMemberController(GymMemberService memberService, GymMemberMapper memberMapper) {
        this.memberService = memberService;
        this.memberMapper = memberMapper;
    }

    @GetMapping
    public ResponseEntity<List<GymMemberDTO>> getAllMembers() {
        return ResponseEntity.ok(memberMapper.toDtoList(memberService.findAllForCurrentTenant()));
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
        var result = memberService.findPageForCurrentTenant(search, pageable).map(memberMapper::toDto);
        return ResponseEntity.ok(com.veltronik.v2.core.dto.PageResponse.of(result));
    }

    @GetMapping("/{id}")
    public ResponseEntity<GymMemberDTO> getMemberById(@PathVariable UUID id) {
        return ResponseEntity.ok(memberMapper.toDto(memberService.findByIdAndVerifyOwnership(id)));
    }

    @PostMapping
    public ResponseEntity<GymMemberDTO> createMember(@RequestBody GymMemberInputDTO input) {
        GymMember member = new GymMember();
        applyEditableFields(member, input);
        return ResponseEntity.ok(memberMapper.toDto(memberService.saveForCurrentTenant(member)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GymMemberDTO> updateMember(@PathVariable UUID id, @RequestBody GymMemberInputDTO input) {
        GymMember existingMember = memberService.findByIdAndVerifyOwnership(id);
        applyEditableFields(existingMember, input);
        return ResponseEntity.ok(memberMapper.toDto(memberService.saveForCurrentTenant(existingMember)));
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
        if (in.getBirthDate() != null) m.setBirthDate(in.getBirthDate());
        if (in.getAddress() != null) m.setAddress(in.getAddress());
        if (in.getEmergencyContact() != null) m.setEmergencyContact(in.getEmergencyContact());
        if (in.getEmergencyPhone() != null) m.setEmergencyPhone(in.getEmergencyPhone());
        if (in.getGender() != null) m.setGender(in.getGender());
        if (in.getObjectives() != null) m.setObjectives(in.getObjectives());
        if (in.getPhotoUrl() != null) m.setPhotoUrl(in.getPhotoUrl());
    }
}
