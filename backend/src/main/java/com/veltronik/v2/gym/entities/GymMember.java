package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "gym_members")
@Getter
@Setter
public class GymMember extends TenantAwareEntity {

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name", nullable = false)
    private String lastName;

    @Column(nullable = false)
    private String email;

    private String phone;
    
    private String document; // DNI, Passport

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;
    
    @Column(name = "membership_start")
    private LocalDateTime membershipStart;
    
    @Column(name = "membership_end")
    private LocalDateTime membershipEnd;

    @Column(name = "attendance_days", columnDefinition = "text")
    private String attendanceDays;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "birth_date", columnDefinition = "text")
    private String birthDate;

    private String address;
    
    @Column(name = "emergency_contact")
    private String emergencyContact;
    
    @Column(name = "emergency_phone", length = 50)
    private String emergencyPhone;
    
    @Column(length = 50)
    private String gender;
    
    @Column(columnDefinition = "text")
    private String objectives;
    
    @Column(name = "photo_url", length = 500)
    private String photoUrl;
    
    @Column(name = "user_id")
    private java.util.UUID userId;

    // Helpers de display. Antes tenían @JsonGetter (cuando la entidad se serializaba cruda como
    // member anidado en AccessLog/GymPayment). Ahora esos endpoints usan DTOs, así que ya no se
    // serializa esta entidad; se conservan los métodos por si algún servicio los usa.
    public String getFullName() {
        String fn = firstName != null ? firstName : "";
        String ln = lastName != null ? lastName : "";
        return (fn + " " + ln).trim();
    }

    public String getDni() {
        return document;
    }
}
