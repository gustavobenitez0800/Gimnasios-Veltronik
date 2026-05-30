package com.veltronik.v2.core.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class MemberDTO {
    private UUID id;
    private UUID tenantId;
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    private String document;
    private boolean isActive;
    private String businessType;
    private LocalDateTime membershipStart;
    private LocalDateTime membershipEnd;
    private LocalDateTime lastVisit;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
