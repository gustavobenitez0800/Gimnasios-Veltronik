package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.AccessCheckOutInputDTO;
import com.veltronik.v2.gym.dto.AccessLogDTO;
import com.veltronik.v2.gym.dto.AccessRegisterInputDTO;
import com.veltronik.v2.gym.mappers.AccessLogMapper;
import com.veltronik.v2.gym.services.AccessLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * API REST de control de acceso del gimnasio.
 *
 * Devuelve SIEMPRE {@link AccessLogDTO} (nunca la entidad {@code AccessLog} cruda) y
 * recibe {@link AccessRegisterInputDTO} (no un Map sin tipar). El frontend solo dibuja
 * el contrato del DTO.
 */
@RestController
@Slf4j
@RequestMapping("/api/gym/access")
public class GymAccessController {

    private final AccessLogService accessService;
    private final AccessLogMapper accessMapper;
    private final com.veltronik.v2.gym.services.MolineteService molineteService;
    private final com.veltronik.v2.gym.services.GymMemberService memberService;

    public GymAccessController(AccessLogService accessService, AccessLogMapper accessMapper,
                               com.veltronik.v2.gym.services.MolineteService molineteService,
                               com.veltronik.v2.gym.services.GymMemberService memberService) {
        this.accessService = accessService;
        this.accessMapper = accessMapper;
        this.molineteService = molineteService;
        this.memberService = memberService;
    }

    @GetMapping("/today")
    public ResponseEntity<List<AccessLogDTO>> getTodayAccesses() {
        return ResponseEntity.ok(accessMapper.toDtoList(accessService.getTodayAccesses()));
    }

    /**
     * Accesos en un rango de fechas (usado por Reportes: asistencia y resumen).
     * {@code GET /api/gym/access?start=YYYY-MM-DD&end=YYYY-MM-DD}.
     */
    @GetMapping
    public ResponseEntity<List<AccessLogDTO>> getAccessesByRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {
        return ResponseEntity.ok(accessMapper.toDtoList(accessService.getAccessesByDateRange(start, end)));
    }

    @GetMapping("/active")
    public ResponseEntity<List<AccessLogDTO>> getActiveAccesses() {
        return ResponseEntity.ok(accessMapper.toDtoList(accessService.getActiveAccesses()));
    }

    /**
     * TODO lo que la pantalla del mostrador necesita, en UN solo pedido.
     *
     * <p><b>Por qué existe.</b> Esa pantalla pedía tres cosas por separado —quién está
     * adentro, qué pasó hoy, y los avisos— y las repite cada quince segundos. Son tres viajes
     * de ida y vuelta cada vez, sobre la conexión de un gimnasio, para armar una sola vista.
     * Con internet regular eso se siente exactamente como lo que los dueños describen: lento.</p>
     *
     * <p>Los tres datos salen de la misma tabla y del mismo momento. Traerlos juntos además
     * los deja COHERENTES entre sí: antes podían llegar con segundos de diferencia y mostrar
     * a alguien en una lista y no en la otra.</p>
     */
    /** Cuántos accesos del día viajan. La pantalla muestra 30; el resto no lo mira nadie. */
    private static final int CUANTOS_DE_HOY = 60;

    /**
     * ⭐ LA FOTO DEL MOSTRADOR: si no cambió nada, no se vuelve a armar.
     *
     * <p><b>Qué pasó.</b> Cada terminal pide el mostrador cada quince segundos (cada tres con
     * la ventana adelante), y desde la 2.6.39 también minimizado. Armarlo es traer de Supabase
     * quién está adentro, las marcas del día y los avisos, cada fila con la ficha del socio.
     * En septiembre de 2026 eso fueron ~750 MB por día hábil para UN gimnasio, y el proyecto se
     * pasó del plan gratis en 12 días. Casi todos esos pedidos devolvían exactamente lo mismo
     * que el anterior.</p>
     *
     * <p><b>Cómo se sabe que no cambió nada.</b> Por una marca de tres partes, cada una una
     * sola fila: la de los accesos (la misma que {@code /novedades}), la de los rechazos del
     * molinete y la de las fichas de los socios —un cobro cambia el veredicto de un aviso sin
     * que pase nada en la puerta—. Más la fecha, para que a medianoche "hoy" sea otro día.</p>
     *
     * <p><b>Y aun sin cambios, la foto vence al minuto.</b> Hay cosas que cambian solas con el
     * reloj: un socio que se vence a media tarde, el ingreso por QR que sale de la ventana de
     * cinco minutos. Un minuto de atraso en eso no lo nota nadie.</p>
     *
     * <p>Cada instancia del servidor tiene su foto, y está bien: la marca se lee siempre de la
     * base, así que ninguna puede servir algo que otra ya cambió.</p>
     */
    static final long FOTO_VIGENTE_MS = 60_000;

    private record Foto(String marca, long vence, Map<String, Object> cuerpo) {}

    private final java.util.concurrent.ConcurrentHashMap<UUID, Foto> fotos =
            new java.util.concurrent.ConcurrentHashMap<>();

    /** El reloj de la foto. Los tests lo adelantan para no esperar un minuto. */
    java.util.function.LongSupplier reloj = System::currentTimeMillis;

    @GetMapping("/mostrador")
    public ResponseEntity<Map<String, Object>> mostrador() {
        UUID tenantId = com.veltronik.v2.core.security.TenantContextHolder.getTenantId();
        if (tenantId == null) return ResponseEntity.ok(armarMostrador());

        // La marca se lee ANTES de armar. Si algo cambia mientras se arma, la foto queda
        // guardada con la marca vieja y el próximo pedido la rehace. Al revés sería guardar
        // una foto vieja con la marca nueva, y servirla como si estuviera al día.
        String marca = accessService.marcaDeAccesos()
                + "|" + molineteService.marcaDeRechazos()
                + "|" + memberService.marcaDelGimnasio()
                + "|" + LocalDate.now(ZONA_DEL_NEGOCIO);
        long ahora = reloj.getAsLong();

        Foto foto = fotos.get(tenantId);
        if (foto != null && foto.marca().equals(marca) && ahora < foto.vence()) {
            return ResponseEntity.ok(foto.cuerpo());
        }

        Map<String, Object> cuerpo = armarMostrador();
        fotos.put(tenantId, new Foto(marca, ahora + FOTO_VIGENTE_MS,
                java.util.Collections.unmodifiableMap(cuerpo)));
        return ResponseEntity.ok(cuerpo);
    }

    private static final java.time.ZoneId ZONA_DEL_NEGOCIO =
            java.time.ZoneId.of("America/Argentina/Buenos_Aires");

    private Map<String, Object> armarMostrador() {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("adentro", accessMapper.toDtoList(accessService.getActiveAccesses()));

        // Los días de gracia, para que el terminal pueda contar solo cuando no haya internet.
        // Sin este número, los días restantes y la situación de cada socio quedan congelados
        // en el último refresco — y a los treinta días de corte eso deja de ser un dato viejo
        // para pasar a ser un dato equivocado con cara de correcto. Va acá, y no en la ficha
        // de cada socio, porque es UNO para todo el gimnasio.
        body.put("graceDays", accessService.getGraceDays());
        // ⚠️ La lista de hoy va RECORTADA. La pantalla muestra 30 filas; mandar las 250 de
        // un dia entero, cada una con la ficha completa del socio, es cientos de fichas
        // viajando por la conexion del gimnasio cada quince segundos para pintar 30 renglones
        // y dos numeros. Los dos numeros vienen calculados aparte, sobre el dia COMPLETO.
        //
        // 🔴 Y el recorte lo hace la BASE. Antes se traía el día entero y se cortaba acá, y lo
        // que Supabase cobra es lo que sale de la base, no lo que llega a la pantalla.
        AccessLogService.ResumenDelDia resumen = accessService.resumenDeHoy();
        body.put("hoy", accessMapper.toDtoList(accessService.ultimosDeHoy(CUANTOS_DE_HOY)));
        body.put("hoyTotal", resumen.total());
        body.put("hoyPromedioMin", resumen.promedioMin());

        // ⚠️ LOS AVISOS NO PUEDEN TUMBAR LA PANTALLA ENTERA.
        //
        // Son la parte accesoria —a quién hay que hablarle— y la más cara: recalculan el
        // veredicto de cada socio que entró hoy por QR. Las otras dos son las que la
        // recepcionista necesita para trabajar. Si esto falla y se lleva puesto el pedido
        // completo, el mostrador se queda sin saber quién está adentro por un dato que ni
        // siquiera es urgente.
        try {
            body.put("avisos", accessService.avisosPendientes());
        } catch (Exception e) {
            log.error("Los avisos del mostrador fallaron. La pantalla sigue funcionando sin ellos.", e);
            body.put("avisos", java.util.List.of());
        }
        // Los rechazados del molinete: a quién frenó la puerta hoy y nadie atendió todavía.
        // Mismo cuidado que los avisos: es la parte accesoria y la más cara (recalcula el
        // veredicto de cada uno), así que si falla no puede llevarse puesta la pantalla entera.
        try {
            body.put("rechazos", molineteService.rechazosPendientes());
        } catch (Exception e) {
            log.error("Los rechazos del molinete fallaron. La pantalla sigue funcionando sin ellos.", e);
            body.put("rechazos", java.util.List.of());
        }
        // Los pasos por QR de los últimos 5 minutos. La pantalla los convierte en el MISMO
        // cartel que aparece al registrar una entrada a mano, así el socio que escaneó ve en
        // el mostrador cuántos días le quedan.
        //
        // Sin esto, escanear el cartel no mostraba nada en la pantalla del gimnasio: la
        // confirmación aparece en el teléfono del socio y ahí moría. El único que se enteraba
        // era el que tenía un PROBLEMA (eso son los `avisos` de arriba); el que estaba al día
        // no tenía dónde mirar su vencimiento sin preguntarle a alguien.
        //
        // Estuvo dado de baja un tiempo —la pantalla que lo usaba se había revertido, y este
        // pedido se repite cada quince segundos— pero la ventana es de 5 minutos, así que
        // casi siempre viaja una lista vacía.
        body.put("ingresos", accessService.ingresosRecientes());
        return body;
    }

    /**
     * ¿Pasó algo en la puerta? Una marca que cambia con cada entrada, salida, aviso atendido o
     * rechazo del molinete.
     *
     * <p>⭐ Es lo que hace que el QR aparezca AL INSTANTE en el mostrador. El socio marca desde
     * su celular, así que la pantalla del gimnasio solo se entera preguntando. Preguntar el
     * mostrador entero cada dos segundos es traer la lista del día y recalcular avisos para, casi
     * siempre, nada; esto son dos cuentas sobre un índice. La pantalla la pregunta seguido y pide
     * el mostrador recién cuando la marca cambia.</p>
     */
    @GetMapping("/novedades")
    public ResponseEntity<Map<String, String>> novedades() {
        return ResponseEntity.ok(Map.of("marca", accessService.marcaDeAccesos() + "|" + molineteService.marcaDeRechazos()));
    }

    /**
     * Socios que entraron SOLOS por QR y necesitan que alguien les hable.
     *
     * <p>Es la otra punta del check-in: cuando un socio vencido escanea el cartel, el aviso
     * aparece en SU teléfono y ahí muere. Sin esto, la recepcionista se enteraría solo si
     * mirara la lista de accesos cruzando a mano el estado de cada uno — o sea, nunca.</p>
     *
     * <p>La consulta es liviana y la pantalla la repite cada pocos segundos, así que devuelve
     * lo mínimo: quién, qué le pasa y a qué hora entró.</p>
     */
    @GetMapping("/avisos")
    public ResponseEntity<List<AccessLogService.Aviso>> avisos() {
        return ResponseEntity.ok(accessService.avisosPendientes());
    }

    /** "Ya lo hablé con él": saca el aviso de la lista, en todas las terminales. */
    @PostMapping("/avisos/{id}/visto")
    public ResponseEntity<Void> marcarAvisoVisto(@PathVariable java.util.UUID id) {
        accessService.marcarAvisoVisto(id);
        return ResponseEntity.noContent().build();
    }

    /** Lo mismo para un rechazado del molinete: se saca de la lista en todas las terminales. */
    @PostMapping("/rechazos/{id}/visto")
    public ResponseEntity<Void> marcarRechazoVisto(@PathVariable java.util.UUID id) {
        molineteService.marcarRechazoVisto(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Marca el paso de un socio desde el mostrador.
     *
     * <p><b>Devuelve QUÉ se hizo, no solo el registro.</b> Este endpoint no siempre registra
     * una entrada: si el socio ya estaba adentro, graba la SALIDA — lo decide el servidor
     * mirando el estado, que es lo correcto. Pero el botón del mostrador decía siempre
     * "Registrar entrada" y el cartel de confirmación solo decía "Fulano registrado", así que
     * la recepcionista podía apretar "entrada", grabar una salida, y no enterarse nunca.</p>
     *
     * <p>Con la dirección en la respuesta, la pantalla puede decir la verdad de lo que pasó.</p>
     */
    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> registerAccess(@RequestBody AccessRegisterInputDTO input) {
        AccessLogService.ScanResult r = accessService.registerScan(
                input.getMemberId(), input.getMethod(), null, null,
                input.getClientRef(), input.getOcurridoEn());

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("acceso", accessMapper.toDto(r.log()));
        body.put("direccion", r.direction().name());
        // true cuando el socio había dejado una visita abierta de otro día: el mostrador tiene
        // que poder explicarle por qué le figura una entrada nueva y no una salida.
        body.put("recuperado", r.recuperado());
        return ResponseEntity.ok(body);
    }

    /**
     * Marca la salida de una visita.
     *
     * <p>El cuerpo es opcional a propósito. Con internet no viaja nada y el servidor sella con
     * su reloj; lo que llega de la cola de sin-conexión trae el momento en que la persona se
     * fue de verdad. Que sea opcional es lo que deja al camino online exactamente como estaba
     * —ni un campo nuevo que mandar— mientras el otro gana precisión.</p>
     */
    @PutMapping("/{id}/checkout")
    public ResponseEntity<AccessLogDTO> checkOut(@PathVariable UUID id,
                                                 @RequestBody(required = false) AccessCheckOutInputDTO input) {
        LocalDateTime ocurridoEn = input == null ? null : input.getOcurridoEn();
        return ResponseEntity.ok(accessMapper.toDto(accessService.checkOut(id, ocurridoEn)));
    }
}
