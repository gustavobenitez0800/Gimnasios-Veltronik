package com.veltronik.v2.core.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Seguridad del CEREBRO LOCAL (ladrillo 6): reemplaza a {@link SecurityConfig} bajo el
 * perfil {@code local}. Diferencias con la nube:
 *
 * <ul>
 *   <li><b>Sin oauth2/Supabase:</b> no hay JWKS que resolver (estaría offline). La auth
 *       es por token de sesión local ({@link LocalSessionFilter}).</li>
 *   <li><b>Sin kill switch ni filtro de tenant por header:</b> el tenant sale del token;
 *       y el cobro local jamás se bloquea por facturación (ADR-003: nunca perder una venta).</li>
 *   <li><b>El sync</b> conserva su puerta ({@link DeviceCredentialFilter}).</li>
 * </ul>
 *
 * <p>CORS permisivo a propósito: el backend local solo escucha en {@code 127.0.0.1}
 * (application-local.properties), y el renderer de Electron lo llama con Origin nulo.</p>
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@Profile("local")
@RequiredArgsConstructor
public class LocalSecurityConfig {

    private final LocalSessionFilter localSessionFilter;
    private final DeviceCredentialFilter deviceCredentialFilter;

    @Bean
    public SecurityFilterChain localSecurityFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(localCorsConfigurationSource()))
            .csrf(AbstractHttpConfigurer::disable)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/local/login", "/api/local/status").permitAll()
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/api/webhooks/**").permitAll()
                .requestMatchers("/api/sync/**").permitAll()   // puerta real: DeviceCredentialFilter
                .requestMatchers("/actuator/**").permitAll()   // health + shutdown, solo 127.0.0.1
                .anyRequest().authenticated())
            .sessionManagement(sess -> sess.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // API stateless: sin token válido → 401 (no el 403 por defecto), para distinguir
            // "no autenticado" de "autenticado pero sin permiso".
            .exceptionHandling(ex -> ex.authenticationEntryPoint(
                    (request, response, authEx) -> response.sendError(401, "No autenticado")))
            // El sync trae X-Device-Key; el resto, el token de sesión local. Ambos antes
            // del punto donde Spring esperaría un usuario/clave.
            .addFilterBefore(deviceCredentialFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(localSessionFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    private CorsConfigurationSource localCorsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(List.of("*"));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
