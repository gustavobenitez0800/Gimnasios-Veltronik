package com.veltronik.v2.kiosk.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.kiosk.dto.KioskCashCloseInputDTO;
import com.veltronik.v2.kiosk.dto.KioskCashOpenInputDTO;
import com.veltronik.v2.kiosk.entities.KioskCashSession;
import com.veltronik.v2.kiosk.entities.KioskCashSessionStatus;
import com.veltronik.v2.kiosk.repositories.KioskCashSessionRepository;
import com.veltronik.v2.kiosk.repositories.KioskSaleRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Caja / arqueo del kiosco.
 *
 * <p><b>Invariante dura:</b> a lo sumo UNA sesión {@code OPEN} por tenant. Defendida en dos
 * capas, igual que el anti doble-reserva de canchas: (1) chequeo previo con mensaje claro,
 * (2) índice único parcial {@code ux_kiosk_cash_session_open} que decide cualquier carrera
 * (la transacción perdedora recibe la violación → 409).</p>
 */
@Service
public class KioskCashService {

    private static final String ALREADY_OPEN = "Ya hay una caja abierta. Cerrá la actual antes de abrir otra.";

    private final KioskCashSessionRepository cashRepository;
    private final KioskSaleRepository saleRepository;

    public KioskCashService(KioskCashSessionRepository cashRepository,
                            KioskSaleRepository saleRepository) {
        this.cashRepository = cashRepository;
        this.saleRepository = saleRepository;
    }

    public Optional<KioskCashSession> findCurrentOpen() {
        return cashRepository.findByTenantIdAndStatus(TenantContextHolder.getTenantId(), KioskCashSessionStatus.OPEN);
    }

    /** La caja abierta o 409 si no hay ninguna. La usa el motor de ventas. */
    public KioskCashSession requireOpenSession() {
        return findCurrentOpen().orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                "No hay una caja abierta. Abrí la caja para empezar a vender."));
    }

    public List<KioskCashSession> historyForCurrentTenant() {
        return cashRepository.findTop30ByTenantIdOrderByOpenedAtDesc(TenantContextHolder.getTenantId());
    }

    @Transactional
    public KioskCashSession open(KioskCashOpenInputDTO in) {
        UUID tenantId = TenantContextHolder.getTenantId();
        if (findCurrentOpen().isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, ALREADY_OPEN);
        }
        KioskCashSession session = new KioskCashSession();
        Tenant tenant = new Tenant();
        tenant.setId(tenantId);
        session.setTenant(tenant);
        session.setStatus(KioskCashSessionStatus.OPEN);
        session.setOpeningAmount(in.getOpeningAmount());
        session.setOpenedAt(LocalDateTime.now());
        session.setOpenedBy(SecurityUtils.getCurrentUserId());
        try {
            return cashRepository.saveAndFlush(session);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, ALREADY_OPEN);
        }
    }

    /** Cierra la caja abierta: esperado = fondo + Σ ventas en efectivo; diferencia = contado − esperado. */
    @Transactional
    public KioskCashSession close(KioskCashCloseInputDTO in) {
        KioskCashSession session = requireOpenSession();
        BigDecimal cashSales = saleRepository.sumCashPaymentsBySession(session.getId());
        if (cashSales == null) cashSales = BigDecimal.ZERO;

        BigDecimal expected = session.getOpeningAmount().add(cashSales);
        session.setClosingExpected(expected);
        session.setClosingDeclared(in.getClosingDeclared());
        session.setDifference(in.getClosingDeclared().subtract(expected));
        session.setStatus(KioskCashSessionStatus.CLOSED);
        session.setClosedAt(LocalDateTime.now());
        session.setClosedBy(SecurityUtils.getCurrentUserId());
        return cashRepository.save(session);
    }
}
