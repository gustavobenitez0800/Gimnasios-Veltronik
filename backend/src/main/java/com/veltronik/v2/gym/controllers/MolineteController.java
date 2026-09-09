package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.config.PlanFeature;
import com.veltronik.v2.core.security.PlanPolicy;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.services.MolineteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

/**
 * Lo que el <b>escritorio</b> le pregunta a Veltronik para mantenerle la lista al día al
 * molinete. A diferencia del aviso de entrada —que llega del aparato y va por
 * {@code /api/public}— esto lo pide la app con la sesión del gimnasio puesta.
 *
 * <p><b>El candado del plan vive acá y no en la pantalla.</b> El control de acceso es la
 * función premium por excelencia: viene con hardware que el gimnasio compra igual. Un
 * {@code if} en el navegador esconde el botón pero no saca la función —alcanza con abrir la
 * consola— y con el SDK de Mercado Pago ya salió caro aprenderlo. Sin padrón no hay socios en
 * el equipo, así que este es el candado real.</p>
 *
 * <p><b>El aviso de entrada NO se gatea.</b> Si un gimnasio baja de plan, el equipo va a seguir
 * mandando lo que reconoce y esas entradas se siguen anotando: son datos del gimnasio y tirarlos
 * en silencio sería peor que inútil. Lo que se apaga es la sincronización, y sin ella la lista
 * del equipo se congela: la función deja de funcionar sola, sin perder nada de lo ya ocurrido.</p>
 */
@RestController
@RequestMapping("/api/gym/molinete")
@RequiredArgsConstructor
public class MolineteController {

    private final MolineteService molineteService;
    private final PlanPolicy planPolicy;

    /**
     * La lista de socios con el veredicto ya resuelto: quién es cada uno y si hoy puede pasar.
     *
     * <p>Es liviana a propósito —id, nombre y un sí/no— porque el escritorio la pide cada
     * varios minutos y la compara contra lo último que le aplicó al equipo.</p>
     */
    @GetMapping("/padron")
    public ResponseEntity<List<MolineteService.SocioDelPadron>> padron() {
        UUID tenantId = TenantContextHolder.getTenantId();
        if (!planPolicy.hasFeature(tenantId, PlanFeature.CONTROL_DE_ACCESO)) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                    "El control de acceso no está incluido en el plan de este gimnasio.");
        }
        return ResponseEntity.ok(molineteService.padron(tenantId));
    }
}
