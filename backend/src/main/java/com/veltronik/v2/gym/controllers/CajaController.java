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
        // ⚠️ FALTABA, y la pantalla lo muestra igual: el renglón "Mercado Pago" del dueño
        // venía vacío desde que se agregó (V58). El servicio lo calculaba, la pantalla lo
        // pedía, y en el medio nadie lo mandaba — un gimnasio que cobra por MP veía un cero.
        body.put("mercadopago", r.mercadopago());
        body.put("tarjeta", r.tarjeta());
        body.put("otros", r.otros());
        body.put("cantidadCobros", r.cantidadCobros());
        // Lo que salió del cajón, que es lo que hay que mirar cuando la caja cuadra demasiado
        // bien: un egreso inventado la hace cuadrar exacto.
        body.put("egresos", r.egresosEfectivo());
        body.put("ingresosManuales", r.ingresosEfectivo());
        body.put("cantidadMovimientos", r.cantidadMovimientos());
        // La cuenta completa, calculada en UN solo lugar (Resumen.enElCajon): fondo + cobrado
        // en efectivo + ingresos manuales - egresos. Repetirla en la pantalla es garantizar
        // que en algún lado quede mal.
        body.put("esperadoEnElCajon", r.enElCajon(
                cajaService.sesionAbierta()
                        .map(com.veltronik.v2.gym.entities.CajaSesion::getFondoInicial)
                        .orElse(java.math.BigDecimal.ZERO)));
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
     * ¿Hay una caja abierta? Desde cuándo, quién la abrió y con cuánto cambio.
     *
     * <p>Lo puede ver cualquiera: son datos de operación, no importes de cobros. El fondo sí
     * es un monto, pero es el que declaró quien abrió — no dice nada de lo que se cobró.</p>
     */
    @GetMapping("/estado")
    public ResponseEntity<Map<String, Object>> estado() {
        Map<String, Object> body = new java.util.HashMap<>();
        var abierta = cajaService.sesionAbierta();
        body.put("abierta", abierta.isPresent());
        abierta.ifPresent(s -> {
            body.put("desde", s.getAbiertaAt());
            body.put("abiertaPor", s.getAbiertaPorNombre());
            body.put("fondoInicial", s.getFondoInicial());
        });
        body.put("cantidadCobros", cajaService.resumenAbierto().cantidadCobros());
        return ResponseEntity.ok(body);
    }

    /** Abre la caja con el cambio que ya había en el cajón. */
    @PostMapping("/abrir")
    public ResponseEntity<com.veltronik.v2.gym.entities.CajaSesion> abrir(@RequestBody AperturaInput input) {
        return ResponseEntity.ok(cajaService.abrir(input.getFondoInicial(), input.getAbiertaPor()));
    }

    /**
     * Los cobros que forman el número: socio, monto, método y cuándo.
     *
     * <p>⚠️ SOLO DUEÑO, y no es un detalle de permisos: si quien va a contar ve los montos,
     * suma la lista y escribe ese número. El arqueo deja de medir nada.</p>
     */
    @GetMapping("/movimientos")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<List<Map<String, Object>>> movimientos() {
        List<Map<String, Object>> salida = new java.util.ArrayList<>();
        for (var p : cajaService.movimientosDelPeriodo()) {
            Map<String, Object> m = new java.util.HashMap<>();
            m.put("id", p.getId());
            m.put("monto", p.getAmount());
            m.put("metodo", p.getPaymentMethod());
            m.put("fecha", p.getPaymentDate());
            m.put("socio", p.getMember() == null ? null
                    : (nvl(p.getMember().getFirstName()) + " " + nvl(p.getMember().getLastName())).trim());
            salida.add(m);
        }
        return ResponseEntity.ok(salida);
    }

    private static String nvl(String s) { return s == null ? "" : s; }

    // ─────────────────────────────────────────────────────────────────────────
    // Movimientos de caja: los gastos y las entradas que no son cobros
    //
    // ⚠️ La ruta se llama `movimientos-de-caja` y no `movimientos` porque ese nombre ya está
    // tomado por los COBROS del período (arriba), y son escritorios instalados los que lo
    // consumen: renombrarlo dejaría sin pantalla a los clientes que todavía no actualizaron.
    // Un nombre largo es más barato que una versión rota.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Anota un gasto o una entrada de plata que no es un cobro de socio.
     *
     * <p><b>Lo puede hacer recepción</b>, que es quien tiene el cajón adelante. Si solo pudiera
     * el dueño, cada gasto del día esperaría a que él lo cargue — y mientras tanto esa plata
     * aparecería como FALTANTE, echándole la culpa a quien atendió.</p>
     *
     * <p>⚠️ <b>Esto no cierra el agujero del egreso inventado, y hay que decirlo:</b> se escribe
     * "Proveedor $20.000", se guarda la plata, y el cajón cuadra exacto. Ningún software puede
     * impedirlo, porque la plata sale igual. Lo que se hace es dejarlo A LA VISTA: firmado, con
     * detalle obligatorio, y congelado en el cierre para que aparezca al lado de la diferencia.
     * El control es que el dueño lo mire; para eso primero tiene que existir el renglón.</p>
     */
    @PostMapping("/movimientos-de-caja")
    public ResponseEntity<com.veltronik.v2.gym.entities.CajaMovimiento> registrarMovimiento(
            @RequestBody MovimientoInput input) {
        return ResponseEntity.ok(cajaService.registrar(
                input.getTipo(), input.getCategoria(), input.getDetalle(),
                input.getMonto(), input.getMetodo(), input.getHechoPor()));
    }

    /**
     * Los movimientos del período, anulados incluidos (tachados).
     *
     * <p>A diferencia de los cobros, <b>esto lo ve cualquiera</b>. No rompe el conteo a ciegas:
     * quien cuenta ya sabe cuánto sacó del cajón —lo sacó ella— y sabiendo el fondo y los
     * egresos todavía le falta el número grande, que es lo cobrado en efectivo. Y necesita
     * verlo para no cargar dos veces el mismo gasto.</p>
     */
    @GetMapping("/movimientos-de-caja")
    public ResponseEntity<List<com.veltronik.v2.gym.entities.CajaMovimiento>> movimientosDeCaja() {
        return ResponseEntity.ok(cajaService.movimientosDeCaja());
    }

    /** Anula un movimiento. No lo borra: borrarlo sería poder borrar la prueba. */
    @PostMapping("/movimientos-de-caja/{id}/anular")
    public ResponseEntity<com.veltronik.v2.gym.entities.CajaMovimiento> anularMovimiento(
            @PathVariable java.util.UUID id, @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(cajaService.anular(id, body.get("motivo"), body.get("anuladoPor")));
    }

    /** Lo que manda la pantalla al anotar un movimiento. */
    public static class MovimientoInput {
        /** INGRESO o EGRESO. Decide el signo. */
        private String tipo;
        /** Limpieza, adelanto, proveedor… */
        private String categoria;
        /** Obligatorio en los egresos: es lo que hace la lista revisable. */
        private String detalle;
        private BigDecimal monto;
        /** CASH por defecto. Solo el efectivo mueve el arqueo. */
        private String metodo;
        /** Quién lo hizo, para congelar el nombre. */
        private String hechoPor;

        public String getTipo() { return tipo; }
        public void setTipo(String v) { this.tipo = v; }
        public String getCategoria() { return categoria; }
        public void setCategoria(String v) { this.categoria = v; }
        public String getDetalle() { return detalle; }
        public void setDetalle(String v) { this.detalle = v; }
        public BigDecimal getMonto() { return monto; }
        public void setMonto(BigDecimal v) { this.monto = v; }
        public String getMetodo() { return metodo; }
        public void setMetodo(String v) { this.metodo = v; }
        public String getHechoPor() { return hechoPor; }
        public void setHechoPor(String v) { this.hechoPor = v; }
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
    /** Lo que hace falta para abrir. */
    public static class AperturaInput {
        /** El cambio que ya estaba en el cajón. */
        private BigDecimal fondoInicial;
        private String abiertaPor;

        public BigDecimal getFondoInicial() { return fondoInicial; }
        public void setFondoInicial(BigDecimal v) { this.fondoInicial = v; }
        public String getAbiertaPor() { return abiertaPor; }
        public void setAbiertaPor(String v) { this.abiertaPor = v; }
    }

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
