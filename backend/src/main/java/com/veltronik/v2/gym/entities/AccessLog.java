package com.veltronik.v2.gym.entities;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "access_log")
public class AccessLog extends TenantAwareEntity {

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "member_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private GymMember member;

    @Column(name = "check_in_at", nullable = false)
    private LocalDateTime checkInAt;

    @Column(name = "check_out_at")
    private LocalDateTime checkOutAt;

    @Column(name = "access_method", length = 50)
    private String accessMethod = "MANUAL";

    @Column(columnDefinition = "text")
    private String notes;
}
