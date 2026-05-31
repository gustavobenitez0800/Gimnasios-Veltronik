package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.GymMemberDTO;
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
 * Devuelve SIEMPRE {@link GymMemberDTO} (nunca la entidad JPA cruda). El frontend
 * solo dibuja el contrato que define este DTO.
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

    @GetMapping("/{id}")
    public ResponseEntity<GymMemberDTO> getMemberById(@PathVariable UUID id) {
        return ResponseEntity.ok(memberMapper.toDto(memberService.findByIdAndVerifyOwnership(id)));
    }

    @PostMapping
    public ResponseEntity<GymMemberDTO> createMember(@RequestBody GymMember member) {
        return ResponseEntity.ok(memberMapper.toDto(memberService.saveForCurrentTenant(member)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GymMemberDTO> updateMember(@PathVariable UUID id, @RequestBody GymMember updatedMember) {
        GymMember existingMember = memberService.findByIdAndVerifyOwnership(id);
        
        if (updatedMember.getFirstName() != null) existingMember.setFirstName(updatedMember.getFirstName());
        if (updatedMember.getLastName() != null) existingMember.setLastName(updatedMember.getLastName());
        if (updatedMember.getEmail() != null) existingMember.setEmail(updatedMember.getEmail());
        if (updatedMember.getPhone() != null) existingMember.setPhone(updatedMember.getPhone());
        if (updatedMember.getDocument() != null) existingMember.setDocument(updatedMember.getDocument());
        existingMember.setActive(updatedMember.isActive());
        
        if (updatedMember.getMembershipStart() != null) existingMember.setMembershipStart(updatedMember.getMembershipStart());
        if (updatedMember.getMembershipEnd() != null) existingMember.setMembershipEnd(updatedMember.getMembershipEnd());
        
        if (updatedMember.getAttendanceDays() != null) existingMember.setAttendanceDays(updatedMember.getAttendanceDays());
        if (updatedMember.getNotes() != null) existingMember.setNotes(updatedMember.getNotes());
        if (updatedMember.getBirthDate() != null) existingMember.setBirthDate(updatedMember.getBirthDate());
        if (updatedMember.getAddress() != null) existingMember.setAddress(updatedMember.getAddress());
        if (updatedMember.getEmergencyContact() != null) existingMember.setEmergencyContact(updatedMember.getEmergencyContact());
        if (updatedMember.getEmergencyPhone() != null) existingMember.setEmergencyPhone(updatedMember.getEmergencyPhone());
        if (updatedMember.getGender() != null) existingMember.setGender(updatedMember.getGender());
        if (updatedMember.getObjectives() != null) existingMember.setObjectives(updatedMember.getObjectives());
        if (updatedMember.getPhotoUrl() != null) existingMember.setPhotoUrl(updatedMember.getPhotoUrl());

        return ResponseEntity.ok(memberMapper.toDto(memberService.saveForCurrentTenant(existingMember)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteMember(@PathVariable UUID id) {
        memberService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }
}
