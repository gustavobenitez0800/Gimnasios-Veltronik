package com.veltronik.v2.core.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Tope de tamaño para lo que entra por las puertas SIN sesión: el check-in por QR, el aviso del
 * molinete, el webhook de Mercado Pago y la consulta de actualizaciones.
 *
 * <p><b>Por qué hace falta.</b> Esas rutas las puede llamar cualquiera, sin cuenta. Tomcat no le
 * pone techo a un cuerpo JSON y Cloud Run deja pasar hasta 32 MB por pedido: con unos pocos
 * pedidos gordos en paralelo, alguien sin ninguna credencial llenaba la memoria de una copia del
 * backend (1 GB) y la volteaba. Lo legítimo que entra por acá pesa unos cientos de bytes, así que
 * 1 MB es más de mil veces lo necesario y sigue siendo una pared.</p>
 *
 * <p>Corre antes que la seguridad (justo después del sello del pedido): un pedido que no puede ser
 * bueno se corta antes de leer el token, tocar la base o escribir un registro.</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class LimiteDeCuerpoFilter extends OncePerRequestFilter {

    static final long MAX_BYTES = 1024L * 1024L;

    private static final List<String> PUERTAS_SIN_SESION =
            List.of("/api/public/", "/api/webhooks/", "/api/updates/");

    @Override
    protected boolean shouldNotFilter(@NonNull HttpServletRequest request) {
        String uri = request.getRequestURI();
        return PUERTAS_SIN_SESION.stream().noneMatch(uri::startsWith);
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain chain) throws ServletException, IOException {
        long declarado = request.getContentLengthLong();
        if (declarado > MAX_BYTES) {
            response.setStatus(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"PAYLOAD_TOO_LARGE\",\"message\":\"El pedido es demasiado grande.\"}");
            return;
        }
        // Sin largo declarado (envío "en pedazos") no hay número que mirar: se cuenta al leer.
        chain.doFilter(declarado >= 0 ? request : new CuerpoConTope(request), response);
    }

    /** Deja leer el cuerpo hasta {@link #MAX_BYTES}; pasado eso, la lectura falla. */
    static final class CuerpoConTope extends HttpServletRequestWrapper {

        CuerpoConTope(HttpServletRequest request) {
            super(request);
        }

        @Override
        public ServletInputStream getInputStream() throws IOException {
            ServletInputStream original = super.getInputStream();
            return new ServletInputStream() {
                private long leidos;

                @Override
                public int read() throws IOException {
                    int b = original.read();
                    if (b >= 0) contar(1);
                    return b;
                }

                @Override
                public int read(byte[] buffer, int desde, int largo) throws IOException {
                    int n = original.read(buffer, desde, largo);
                    if (n > 0) contar(n);
                    return n;
                }

                private void contar(int n) throws IOException {
                    leidos += n;
                    if (leidos > MAX_BYTES) throw new IOException("El cuerpo del pedido pasa el tope de " + MAX_BYTES + " bytes");
                }

                @Override
                public boolean isFinished() {
                    return original.isFinished();
                }

                @Override
                public boolean isReady() {
                    return original.isReady();
                }

                @Override
                public void setReadListener(ReadListener listener) {
                    original.setReadListener(listener);
                }
            };
        }

        @Override
        public BufferedReader getReader() throws IOException {
            return new BufferedReader(new InputStreamReader(getInputStream(), charset(getCharacterEncoding())));
        }

        /**
         * El juego de caracteres lo declara el que llama: uno inventado no puede terminar en un 500
         * (que además dispararía la alerta de "error no controlado" por mail).
         */
        static Charset charset(String declarada) {
            if (declarada == null) return StandardCharsets.UTF_8;
            try {
                return Charset.forName(declarada);
            } catch (RuntimeException e) {
                return StandardCharsets.UTF_8;
            }
        }
    }
}
