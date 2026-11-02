package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.gym.dto.LlaveroDTO;
import com.veltronik.v2.gym.services.LlaveroService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Los llaveros de los socios (ADR-016).
 *
 * <p><b>Leer un llavero no pasa por acá.</b> Cuando un socio pasa el suyo, el mostrador lo busca
 * en su copia local —los llaveros viajan dentro de {@code GET /gym/members}— y anda sin
 * internet. Acá está lo que escribe: asignar, dar de baja y pasar los que vinieron en el DNI.</p>
 *
 * <p><b>Sin candado de plan.</b> El llavero identifica, como el DNI y el QR, y eso es de todos los
 * planes. Lo Premium es que el molinete abra solo, y ese candado ya está en la cajita
 * ({@code GET /gym/molinete/habilitado}).</p>
 *
 * <p><b>Asignar y dar de baja son del mostrador</b> —es ahí donde el socio trae el llavero o avisa
 * que lo perdió—. Pasar de golpe los llaveros que vinieron en el DNI es del dueño: cambia la forma
 * de entrar de decenas de socios a la vez, como el arancel masivo o la importación.</p>
 */
@RestController
@RequestMapping("/api/gym")
@RequiredArgsConstructor
public class LlaveroController {

    private final LlaveroService llaveroService;

    /** Lo que manda la pantalla al asignar. {@code hechoPor} es quien está en el turno. */
    public record AsignarInput(String codigo, Boolean reasignar, String hechoPor) {}

    /** Lo que manda la pantalla al dar de baja. */
    public record BajaInput(String motivo, String hechoPor) {}

    /** Los socios elegidos para pasar su DNI a llavero. */
    public record PasarInput(List<UUID> memberIds, String hechoPor) {}

    /** Lo que manda el mostrador para preguntar por un llavero. */
    public record ConsultaInput(String codigo) {}

    /**
     * De quién es un llavero que el mostrador no encontró en su copia local: si lo asignaron en
     * otra PC hace un rato, o si se dio de baja (y a quién se le perdió).
     *
     * <p>POST y no GET a propósito: el número viaja en el cuerpo y no en la dirección, que queda
     * escrita en los registros del servidor. Un llavero no es un secreto, pero tampoco hace falta
     * dejarlo anotado en cada pedido.</p>
     */
    @PostMapping("/llaveros/consulta")
    public ResponseEntity<Map<String, Object>> consultar(@RequestBody ConsultaInput input) {
        LlaveroService.Consulta c = llaveroService.consultar(input == null ? null : input.codigo());
        Map<String, Object> body = new HashMap<>();
        body.put("codigo", c.codigo());
        body.put("activo", c.activo() == null ? null : conSocio(c.activo(), c.dueno()));
        body.put("ultimaBaja", c.ultimaBaja() == null ? null : conSocio(c.ultimaBaja(), c.duenoAnterior()));
        return ResponseEntity.ok(body);
    }

    private static Map<String, Object> conSocio(com.veltronik.v2.gym.entities.MemberCredential llavero,
                                                com.veltronik.v2.gym.entities.GymMember socio) {
        Map<String, Object> m = new HashMap<>();
        m.put("llavero", LlaveroDTO.de(llavero));
        m.put("socio", socio == null ? null : Map.of("id", socio.getId(), "nombre", socio.getFullName()));
        return m;
    }

    /** Los llaveros de un socio, los activos primero. Es la sección de su ficha. */
    @GetMapping("/members/{id}/llaveros")
    public ResponseEntity<List<LlaveroDTO>> delSocio(@PathVariable UUID id) {
        return ResponseEntity.ok(llaveroService.delSocio(id).stream().map(LlaveroDTO::de).toList());
    }

    /**
     * Le asigna un llavero a un socio. 201 si es nuevo; 200 si ya era suyo (el lector leyó dos
     * veces); 409 con quién lo tiene si es de otro y no se pidió {@code reasignar}.
     */
    @PostMapping("/members/{id}/llaveros")
    public ResponseEntity<Map<String, Object>> asignar(@PathVariable UUID id, @RequestBody AsignarInput input) {
        LlaveroService.Asignacion a = llaveroService.asignar(id,
                input == null ? null : input.codigo(),
                input != null && Boolean.TRUE.equals(input.reasignar()),
                input == null ? null : input.hechoPor());
        Map<String, Object> body = new HashMap<>();
        body.put("llavero", LlaveroDTO.de(a.llavero()));
        body.put("nuevo", a.nuevo());
        // Para que la pantalla pueda decir «se lo sacamos a Juan Pérez» y no solo «listo».
        body.put("reasignadoDe", a.reasignadoDe());
        return ResponseEntity.status(a.nuevo() ? HttpStatus.CREATED : HttpStatus.OK).body(body);
    }

    /** Da de baja un llavero (lo perdió, se lo cambiaron). No lo borra: queda en su ficha. */
    @PostMapping("/llaveros/{id}/baja")
    public ResponseEntity<LlaveroDTO> darDeBaja(@PathVariable UUID id, @RequestBody(required = false) BajaInput input) {
        return ResponseEntity.ok(LlaveroDTO.de(llaveroService.darDeBaja(id,
                input == null ? null : input.motivo(),
                input == null ? null : input.hechoPor())));
    }

    /** ⭐ Los socios que tienen el número del llavero en el DNI, como los dejaba ControlFit. */
    @GetMapping("/llaveros/en-el-documento")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<List<LlaveroService.Candidato>> candidatos() {
        return ResponseEntity.ok(llaveroService.candidatosEnElDocumento());
    }

    /** Les pasa a llavero el número que tienen en el DNI. El documento no se toca. */
    @PostMapping("/llaveros/en-el-documento")
    @PreAuthorize("hasAnyRole('OWNER','ADMIN')")
    public ResponseEntity<Map<String, Object>> pasarDelDocumento(@RequestBody PasarInput input) {
        LlaveroService.PasoDelDocumento paso = llaveroService.pasarDelDocumento(
                input == null ? null : input.memberIds(),
                input == null ? null : input.hechoPor());
        Map<String, Object> body = new HashMap<>();
        body.put("pasados", paso.pasados());
        body.put("salteados", paso.salteados());
        return ResponseEntity.ok(body);
    }

    /**
     * El llavero es de otro socio: 409 con su nombre, para preguntar «¿Pasárselo a…?».
     *
     * <p>Con {@code message} como el resto de los errores (lo lee {@code errorService}) y además el
     * socio, que es lo que la pantalla necesita para armar la pregunta.</p>
     */
    @ExceptionHandler(LlaveroService.LlaveroDeOtroSocio.class)
    public ResponseEntity<Map<String, Object>> deOtroSocio(LlaveroService.LlaveroDeOtroSocio e) {
        Map<String, Object> body = new HashMap<>();
        body.put("message", e.getMessage());
        body.put("codigo", "LLAVERO_DE_OTRO_SOCIO");
        body.put("socio", Map.of("id", e.getSocioId(), "nombre", e.getNombre()));
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }
}
