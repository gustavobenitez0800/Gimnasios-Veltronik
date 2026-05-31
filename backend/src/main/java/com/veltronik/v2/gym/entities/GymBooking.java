package com.veltronik.v2.gym.entities;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;

@Entity
@Table(name = "class_booking", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"class_id", "member_id", "booking_date"})
})
@Getter
@Setter
public class GymBooking extends TenantAwareEntity {

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "class_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private GymClass gymClass;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "member_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "payments"})
    private GymMember member;

    @Column(name = "booking_date", nullable = false)
    private LocalDate bookingDate;

    // e.g. "CONFIRMED", "CANCELLED", "ATTENDED"
    @Column(nullable = false, length = 20)
    private String status = "CONFIRMED";
}
