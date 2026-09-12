package com.veltronik.v2.gym.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.Column;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "gym_member")
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
    
    /**
     * El arancel que paga este socio.
     *
     * <p>Antes el arancel era del PAGO y quien atendía lo elegía en cada cobro, de memoria.
     * Eso es al revés de como funciona un gimnasio: el socio <i>es</i> de Pase Libre, y eso
     * no cambia mes a mes. Con el arancel en la ficha, cobrar deja de ser una decisión.</p>
     *
     * <p>LAZY porque el listado de socios no lo necesita casi nunca; cuando hace falta lo
     * trae el mapper. NULL = sin arancel, y se cobra un importe a mano como siempre.</p>
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "plan_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private GymPlan plan;

    @Column(name = "membership_end")
    private LocalDateTime membershipEnd;

    // Array JSON de índices de día (0 = domingo). La columna es `jsonb` desde la V79, pero
    // el campo sigue siendo String: el backend nunca lee este dato, solo lo guarda y lo
    // devuelve, así que deserializarlo a una lista sería trabajo en cada fila del padrón
    // para nada. `SqlTypes.JSON` es lo que le dice a Hibernate que escriba el texto COMO
    // json y no como un string dentro de un json.
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "attendance_days")
    private String attendanceDays;

    @Column(columnDefinition = "text")
    private String notes;

    // Fecha de verdad desde la V78. Era `text`, y por eso buscar cumpleaños obligaba a
    // recortar el string por posición. El DTO sigue exponiéndola como String ISO
    // ("2005-02-07"), así que el JSON que ve el cliente no cambió.
    @Column(name = "birth_date")
    private java.time.LocalDate birthDate;

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

    /**
     * Papelera (V80). Con fecha, el socio no existe para ninguna pantalla — pero la fila y
     * toda su historia de visitas y cobros quedan enteras, y se recupera poniendo esto en
     * NULL.
     *
     * <p><b>No confundir con {@link #isActive}.</b> {@code isActive} es un estado de negocio
     * de un socio que SÍ existe (dejó de venir, congeló la cuota): se ve en el padrón y se
     * puede reactivar. {@code deletedAt} es "esto no tendría que estar": se cargó por error,
     * se duplicó, o pidió que lo borren.</p>
     *
     * <p>El filtro NO es automático: los métodos del repositorio dicen
     * {@code ...AndDeletedAtIsNull} en el nombre, para que el compilador encuentre a
     * cualquiera que se olvide. Ver el comentario largo de la V80.</p>
     */
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    /** Un socio en la papelera no se muestra, no suma y no entra por la puerta. */
    public boolean estaBorrado() {
        return deletedAt != null;
    }

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
