package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.controllers.BaseController;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.services.GymMemberService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/gym/members")
public class GymMemberController {

    private final GymMemberService memberService;

    public GymMemberController(GymMemberService memberService) {
        this.memberService = memberService;
    }

    @GetMapping
    public ResponseEntity<List<GymMember>> getAllMembers() {
        return ResponseEntity.ok(memberService.findAllForCurrentTenant());
    }

    @GetMapping("/{id}")
    public ResponseEntity<GymMember> getMemberById(@PathVariable UUID id) {
        return ResponseEntity.ok(memberService.findByIdAndVerifyOwnership(id));
    }

    @PostMapping
    public ResponseEntity<GymMember> createMember(@RequestBody GymMember member) {
        return ResponseEntity.ok(memberService.saveForCurrentTenant(member));
    }

    @PutMapping("/{id}")
    public ResponseEntity<GymMember> updateMember(@PathVariable UUID id, @RequestBody GymMember updatedMember) {
        GymMember existingMember = memberService.findByIdAndVerifyOwnership(id);
        
        // Update fields
        if (updatedMember.getFirstName() != null) existingMember.setFirstName(updatedMember.getFirstName());
        if (updatedMember.getLastName() != null) existingMember.setLastName(updatedMember.getLastName());
        if (updatedMember.getEmail() != null) existingMember.setEmail(updatedMember.getEmail());
        if (updatedMember.getPhone() != null) existingMember.setPhone(updatedMember.getPhone());
        if (updatedMember.getDocument() != null) existingMember.setDocument(updatedMember.getDocument());
        existingMember.setActive(updatedMember.isActive());
        
        if (updatedMember.getMembershipStart() != null) existingMember.setMembershipStart(updatedMember.getMembershipStart());
        if (updatedMember.getMembershipEnd() != null) existingMember.setMembershipEnd(updatedMember.getMembershipEnd());

        return ResponseEntity.ok(memberService.saveForCurrentTenant(existingMember));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteMember(@PathVariable UUID id) {
        memberService.deleteAndVerifyOwnership(id);
        return ResponseEntity.noContent().build();
    }
}
