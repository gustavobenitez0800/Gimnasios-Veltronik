package com.veltronik.v2.gym.controllers;

import com.veltronik.v2.core.config.PlanFeature;
import com.veltronik.v2.core.exceptions.FeatureNotInPlanException;
import com.veltronik.v2.core.security.PlanPolicy;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.services.MolineteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
            // ⚠️ 403 con código, NUNCA 402. El frontend trata cualquier 402 como "sucursal
            // impaga" y muestra el muro de cobro: un gimnasio AL DÍA en plan básico veía
            // "Renová la suscripción" cada vez que el escritorio sincronizaba el equipo.
            throw new FeatureNotInPlanException(
                    "El control de acceso no está incluido en el plan de este gimnasio.");
        }
        return ResponseEntity.ok(molineteService.padron(tenantId));
    }

    /**
     * ¿Esta sucursal tiene el control de acceso en su plan? Lo pregunta el escritorio antes de
     * dejar que la cajita del molinete abra con un DNI.
     *
     * <p>Ahí no hay padrón que bajar: el veredicto de cada socio ya lo tiene el mostrador. Bajar
     * el padrón entero (miles de socios) solo para saber un sí o un no sería tráfico de Supabase
     * tirado. Un {@code false} no es un error: el escritorio lo dice en Ajustes y no abre.</p>
     *
     * <p><b>La prueba gratis lo incluye</b> (ver {@link PlanPolicy#enUso}): un gimnasio con molinete
     * lo prueba antes de pagar. Por eso la respuesta dice también si el sí viene de la prueba y
     * hasta cuándo, y Ajustes lo avisa: que el molinete deje de abrir el día que termina la prueba
     * no puede ser una sorpresa.</p>
     */
    @GetMapping("/habilitado")
    public ResponseEntity<java.util.Map<String, Object>> habilitado() {
        UUID tenantId = TenantContextHolder.getTenantId();
        PlanPolicy.PlanEnUso plan = planPolicy.enUso(tenantId);
        boolean habilitado = planPolicy.habilita(plan, PlanFeature.CONTROL_DE_ACCESO);
        boolean porLaPrueba = habilitado && plan.porLaPrueba();

        java.util.Map<String, Object> body = new java.util.HashMap<>();
        body.put("habilitado", habilitado);
        body.put("porLaPrueba", porLaPrueba);
        body.put("pruebaHasta", porLaPrueba ? plan.pruebaHasta() : null);
        return ResponseEntity.ok(body);
    }
}
