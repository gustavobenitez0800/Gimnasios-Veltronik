package com.veltronik.v2.kiosk.entities;

import com.veltronik.v2.core.entities.TenantAwareEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Venta (ticket). <b>Raíz de agregado</b> (DDD): los renglones ({@link KioskSaleItem}) y los
 * pagos ({@link KioskSalePayment}) son parte del mismo agregado y se persisten/borran en
 * cascada con la venta. Nada de afuera referencia un item o un pago sueltos: se accede siempre
 * a través de la venta. Alta cohesión, consistencia transaccional garantizada.
 *
 * <p>{@code clientUuid} lo genera el cliente (POS/Electron) y es único por tenant: habilita el
 * reenvío idempotente de la cola offline sin duplicar la venta.</p>
 */
@Entity
@Table(name = "kiosk_sale")
@Getter
@Setter
public class KioskSale extends TenantAwareEntity {

    /** Caja a la que pertenece la venta (siempre la sesión OPEN del momento). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cash_session_id", nullable = false)
    private KioskCashSession cashSession;

    /** Cliente de cuenta corriente (fiado), si la venta fue a cuenta. EAGER (open-in-view=false);
     *  KioskCustomer tiene @BatchSize para que el listado no caiga en N+1. */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "customer_id")
    private KioskCustomer customer;

    /** Idempotencia: UUID generado por el cliente. Único por tenant. */
    @Column(name = "client_uuid", nullable = false, updatable = false)
    private UUID clientUuid;

    @Column(nullable = false)
    private BigDecimal subtotal = BigDecimal.ZERO;

    /** Recargo por tarjeta (Fase 2). Hoy siempre 0. */
    @Column(nullable = false)
    private BigDecimal surcharge = BigDecimal.ZERO;

    @Column(nullable = false)
    private BigDecimal total = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private KioskSaleStatus status = KioskSaleStatus.COMPLETED;

    @Column(name = "sold_by")
    private UUID soldBy;

    @Column(columnDefinition = "text")
    private String notes;

    // Mapeo BIDIRECCIONAL: el hijo es dueño del FK (sale_id viaja en su INSERT). Evita el
    // INSERT-con-FK-null + UPDATE del @OneToMany unidireccional (que rompe con sale_id NOT NULL).
    // @BatchSize: al listar ventas del día, carga los hijos en lotes (evita N+1).
    @OneToMany(mappedBy = "sale", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @BatchSize(size = 64)
    private List<KioskSaleItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "sale", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @BatchSize(size = 64)
    private List<KioskSalePayment> payments = new ArrayList<>();

    /** Agrega un renglón cerrando el agregado (tenant + back-reference). */
    public void addItem(KioskSaleItem item) {
        item.setTenant(getTenant());
        item.setSale(this);
        items.add(item);
    }

    /** Agrega un pago cerrando el agregado (tenant + back-reference). */
    public void addPayment(KioskSalePayment payment) {
        payment.setTenant(getTenant());
        payment.setSale(this);
        payments.add(payment);
    }
}
