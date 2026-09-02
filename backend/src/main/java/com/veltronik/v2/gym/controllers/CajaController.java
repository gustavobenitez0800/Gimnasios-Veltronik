package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.entities.CajaCierre;
import com.veltronik.v2.gym.services.CajaService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * El cierre de caja.
 *
 * <p><b>⭐ EL CONTEO A CIEGAS SE HACE VALER ACÁ, NO EN LA PANTALLA.</b> Si el monto esperado
 * solo estuviera escondido en la interfaz, alcanzaría con abrir la API desde el navegador
 * para verlo — y entonces declarar sería copiar un número en vez de contar la plata. Por eso
 * el resumen con importes es <b>solo para dueño/admin</b>, y quien atiende recibe un endpoint
 * distinto que dice que hay algo pendiente <b>sin decir cuánto</b>.</p>
 */
@RestController
@RequestMapping("/api/gym/caja")
public class CajaController {

    private final CajaService cajaService;

    public CajaController(CajaService cajaService) {
        this.cajaService = cajaService;
    }

    /**
     * Lo que lleva el período abierto, CON importes. Solo dueño/admin.
     *
     * <p>Es la vista del dueño: puede mirar cómo viene el día sin cerrar nada.</p>
     */
    @GetMapping("/abierto")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Map<String, Object>> abierto() {
        CajaService.Resumen r = cajaService.resumenAbierto();
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("desde", r.desde());
        body.put("hasta", r.hasta());
        body.put("efectivo", r.efectivo());
        body.put("transferencia", r.transferencia());
        body.put("tarjeta", r.tarjeta());
        body.put("otros", r.otros());
        body.put("cantidadCobros", r.cantidadCobros());
        body.put("ultimoCierre", cajaService.ultimo().map(CajaCierre::getHasta).orElse(null));
        // La otra mitad del arqueo: un cierre puede cuadrar y aun así haber algo raro, si
        // alguien bajó el monto de un cobro después de haberlo registrado.
        body.put("ajustes", cajaService.ajustesDelPeriodo());
        return ResponseEntity.ok(body);
    }

    /**
     * Lo mismo, pero SIN importes: para quien va a contar.
     *
     * <p>Dice desde cuándo cuenta el período y cuántos cobros hubo —para que sepa que hay
     * algo que cerrar y pueda ubicarse— pero no cuánta plata. Ese número es justamente el que
     * no puede ver antes de contar.</p>
     */
    @GetMapping("/pendiente")
    public ResponseEntity<Map<String, Object>> pendiente() {
        CajaService.Resumen r = cajaService.resumenAbierto();
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("desde", r.desde());
        body.put("hasta", r.hasta());
        body.put("cantidadCobros", r.cantidadCobros());
        return ResponseEntity.ok(body);
    }

    /**
     * Cierra el período y devuelve el resultado, con la diferencia ya revelada.
     *
     * <p>Es el único momento en que quien contó ve el número del sistema: después de haber
     * declarado, y sin poder volver atrás.</p>
     */
    @PostMapping("/cierre")
    public ResponseEntity<CajaCierre> cerrar(@RequestBody CierreInput input, Authentication auth) {
        boolean puedeCerrarSinContar = auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_OWNER".equals(a.getAuthority()) || "ROLE_ADMIN".equals(a.getAuthority()));

        return ResponseEntity.ok(cajaService.cerrar(
                input.getDeclaradoEfectivo(),
                input.getDeclaradoDigital(),
                input.getNota(),
                input.getCerradoPor(),
                puedeCerrarSinContar));
    }

    /**
     * Explica una diferencia. Se puede agregar una vez; no se reescribe.
     *
     * <p>Lo puede hacer cualquiera: quien contó es quien sabe qué pasó. Lo que NO se puede
     * es cambiar un número.</p>
     */
    @PatchMapping("/cierre/{id}/nota")
    public ResponseEntity<CajaCierre> explicar(@PathVariable java.util.UUID id, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(cajaService.explicar(id, body.get("nota")));
    }

    /** El historial. Solo dueño/admin: es donde se ve el patrón por persona. */
    @GetMapping("/historial")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<List<CajaCierre>> historial(@RequestParam(defaultValue = "60") int cuantos) {
        return ResponseEntity.ok(cajaService.historial(cuantos));
    }

    /** Cuándo se cerró por última vez. Sin importes: lo puede ver cualquiera. */
    @GetMapping("/ultimo")
    public ResponseEntity<Map<String, Object>> ultimo() {
        LocalDateTime hasta = cajaService.ultimo().map(CajaCierre::getHasta).orElse(null);
        return ResponseEntity.ok(java.util.Collections.singletonMap("hasta", hasta));
    }

    /** Lo que manda la pantalla al cerrar. */
    public static class CierreInput {
        /** El efectivo contado. NULL = corte sin conteo (solo dueño/admin). */
        private BigDecimal declaradoEfectivo;
        /** Lo que entró por transferencia y Mercado Pago, mirando el banco o la app. */
        private BigDecimal declaradoDigital;
        private String nota;
        /** Quién cerró, para congelar el nombre en el registro. */
        private String cerradoPor;

        public BigDecimal getDeclaradoEfectivo() { return declaradoEfectivo; }
        public void setDeclaradoEfectivo(BigDecimal v) { this.declaradoEfectivo = v; }
        public BigDecimal getDeclaradoDigital() { return declaradoDigital; }
        public void setDeclaradoDigital(BigDecimal v) { this.declaradoDigital = v; }
        public String getNota() { return nota; }
        public void setNota(String v) { this.nota = v; }
        public String getCerradoPor() { return cerradoPor; }
        public void setCerradoPor(String v) { this.cerradoPor = v; }
    }
}
