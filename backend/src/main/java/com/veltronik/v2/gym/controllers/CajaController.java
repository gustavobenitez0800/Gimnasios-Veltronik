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
     * Lo que lleva el período abierto, CON importes.
     *
     * <p>Era solo del dueño mientras el cierre fue un arqueo a ciegas: quien iba a contar no
     * podía ver el número que tenía que adivinar. Sin conteo declarado (2026-09-02), estos
     * totales SON el cierre — mostrárselos a quien cierra es todo el punto del cambio.</p>
     */
    @GetMapping("/abierto")
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
        java.math.BigDecimal fondo = cajaService.fondoActual();
        body.put("fondo", fondo);
        body.put("esperadoEnElCajon", r.enElCajon(fondo));
        // Transferencias y Mercado Pago juntos: es lo que se mira de una sola vez.
        body.put("digital", r.digital());
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

    /**
     * ⛔ LA APERTURA DE CAJA YA NO EXISTE (2026-09-02).
     *
     * <p>El fondo del cajón lo dice el cierre anterior: lo que se decide dejar al cerrar es
     * el cambio con el que arranca el día siguiente. Nadie tiene que recordarlo a la mañana.</p>
     *
     * <p><b>El endpoint se deja en pie a propósito</b>, contestando esto. Los escritorios ya
     * instalados (2.6.29 y anteriores) siguen pidiendo abrir la caja, y un 404 les mostraría
     * un error técnico que nadie puede interpretar en un mostrador. Así, quien esté en una
     * versión vieja lee qué le pasa y qué hacer. Se puede borrar cuando no quede ninguna.</p>
     */
    @PostMapping("/abrir")
    public ResponseEntity<Map<String, Object>> abrirYaNoVa() {
        throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT,
                "Esta versión de la aplicación quedó vieja: ya no hace falta abrir la caja. "
                        + "Actualizá Veltronik y cerrá el día desde la pantalla nueva.");
    }

    /**
     * Los cobros que forman el número: socio, monto, método y cuándo.
     *
     * <p>Hasta el 2026-09-02 era SOLO DUEÑO, y por un motivo concreto: con el arqueo a
     * ciegas, quien iba a contar no podía ver los montos o sumaba la lista y escribía ese
     * número. Al darse de baja el conteo declarado, ese motivo desapareció — y la lista pasó
     * a ser lo primero que hay que ver para cerrar: es la pantalla del cierre diario.</p>
     */
    @GetMapping("/movimientos")
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
     * Cierra el día.
     *
     * <p>Lo único que viaja es cuánto efectivo se retira del cajón: los totales por forma de
     * pago los tiene el sistema. Lo puede hacer recepción, que es quien tiene el cajón
     * adelante y quien cierra al terminar el turno.</p>
     */
    @PostMapping("/cierre")
    public ResponseEntity<CajaCierre> cerrar(@RequestBody CierreInput input) {
        return ResponseEntity.ok(cajaService.cerrar(
                input.getRetiroEfectivo(),
                input.getNota(),
                input.getCerradoPor()));
    }

    /**
     * Balance de ingresos de hoy o del mes en curso.
     *
     * <p>Es la respuesta a "¿cómo viene el día?" y "¿cómo viene el mes?", que no es lo mismo
     * que "¿qué hay sin cerrar?" — si nadie cerró ayer, el período abierto arrastra dos días
     * y esto sigue diciendo lo de hoy.</p>
     */
    @GetMapping("/balance")
    public ResponseEntity<Map<String, Object>> balance(@RequestParam(defaultValue = "hoy") String periodo) {
        CajaService.Resumen r = cajaService.balance("mes".equalsIgnoreCase(periodo));
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("periodo", "mes".equalsIgnoreCase(periodo) ? "mes" : "hoy");
        body.put("desde", r.desde());
        body.put("hasta", r.hasta());
        body.put("efectivo", r.efectivo());
        body.put("transferencia", r.transferencia());
        body.put("mercadopago", r.mercadopago());
        body.put("tarjeta", r.tarjeta());
        body.put("otros", r.otros());
        body.put("digital", r.digital());
        body.put("cantidadCobros", r.cantidadCobros());
        body.put("egresos", r.egresosEfectivo());
        body.put("ingresosManuales", r.ingresosEfectivo());
        body.put("total", r.efectivo().add(r.digital()).add(r.tarjeta()).add(r.otros()));
        return ResponseEntity.ok(body);
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
    public static class CierreInput {
        /**
         * Cuánto efectivo se lleva del cajón. NULL o 0 = no se retira nada.
         *
         * <p>Es el único número que escribe una persona en el cierre. Lo que entró por
         * efectivo y por transferencia lo sabe el sistema: cada cobro tiene su forma de pago
         * y sumarlo a mano era rehacer una cuenta ya hecha.</p>
         */
        private BigDecimal retiroEfectivo;
        private String nota;
        /** Quién cerró, para congelar el nombre en el registro. */
        private String cerradoPor;

        public BigDecimal getRetiroEfectivo() { return retiroEfectivo; }
        public void setRetiroEfectivo(BigDecimal v) { this.retiroEfectivo = v; }
        public String getNota() { return nota; }
        public void setNota(String v) { this.nota = v; }
        public String getCerradoPor() { return cerradoPor; }
        public void setCerradoPor(String v) { this.cerradoPor = v; }
    }
}
