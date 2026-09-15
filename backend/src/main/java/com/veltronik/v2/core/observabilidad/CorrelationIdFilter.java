package com.veltronik.v2.core.observabilidad;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Le pone un identificador a cada pedido y lo deja en TODAS las líneas de log que ese
 * pedido escriba.
 *
 * <p><b>El problema que resuelve.</b> Cuando un gimnasio avisa que «algo no anda», hoy hay
 * que buscar en los logs por hora aproximada y adivinar cuáles de las líneas mezcladas de
 * todos los clientes corresponden a ese pedido. Con esto, cada línea lleva su sello: se
 * filtra por uno y sale la historia completa de esa operación, de punta a punta.</p>
 *
 * <p><b>El identificador viaja.</b> Si el escritorio manda {@code X-Correlation-Id}, se
 * respeta — así una operación que nace en el mostrador y termina en la base se sigue con
 * el mismo sello en los dos lados. Si no lo manda, se genera acá. En los dos casos vuelve
 * en la respuesta, para que quien reporta un problema pueda decir exactamente cuál fue.</p>
 *
 * <p><b>Por qué se sanea lo que llega.</b> El valor entra al log, y un log es algo que
 * después alguien lee, parsea o indexa. Un identificador con saltos de línea puede inyectar
 * líneas falsas en el registro (log forging), así que solo se aceptan caracteres inofensivos
 * y un largo acotado; cualquier otra cosa se descarta y se genera uno limpio.</p>
 *
 * <p><b>Va primero de todo</b> ({@link Ordered#HIGHEST_PRECEDENCE}): si fallara la
 * autenticación, el tenant o el plan, esas líneas de log también tienen que llevar el
 * sello — justamente los errores son los que más se buscan.</p>
 *
 * <p><b>El {@code finally} no es decorativo.</b> El MDC vive en el hilo, y los hilos se
 * reutilizan entre pedidos: sin limpiarlo, el sello de un gimnasio aparecería pegado a las
 * líneas del siguiente, que es peor que no tener sello.</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationIdFilter extends OncePerRequestFilter {

    /** Nombre del encabezado, de ida y de vuelta. */
    public static final String HEADER = "X-Correlation-Id";

    /** La clave con la que el patrón de log lo imprime. */
    public static final String MDC_KEY = "corrId";

    /** Letras, números, guiones y puntos. Nada que pueda romper una línea de log. */
    private static final Pattern ACEPTABLE = Pattern.compile("[A-Za-z0-9._-]{1,64}");

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String id = saneado(request.getHeader(HEADER));
        MDC.put(MDC_KEY, id);
        response.setHeader(HEADER, id);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }

    /**
     * Devuelve el identificador recibido si es inofensivo, o uno nuevo.
     *
     * <p>Corto a propósito: ocho caracteres alcanzan para separar pedidos dentro de una
     * ventana de logs y son legibles cuando alguien tiene que dictarlos por teléfono.</p>
     */
    private String saneado(String recibido) {
        if (recibido != null && ACEPTABLE.matcher(recibido).matches()) {
            return recibido;
        }
        return UUID.randomUUID().toString().substring(0, 8);
    }
}
