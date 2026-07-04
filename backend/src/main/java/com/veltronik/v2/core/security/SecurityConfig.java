package com.veltronik.v2.core.security;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@Profile("!local")   // el cerebro local usa LocalSecurityConfig (sin Supabase/JWKS). La nube, esta.
@EnableWebSecurity
@EnableMethodSecurity   // habilita @PreAuthorize para control de acceso por rol a nivel de método
@RequiredArgsConstructor
public class SecurityConfig {

    private final TenantContextFilter tenantContextFilter;
    private final KillSwitchFilter killSwitchFilter;
    private final DeviceCredentialFilter deviceCredentialFilter;
    private final Environment environment;

    @Value("${veltronik.jwt.jwks-uri}")
    private String jwksUri;

    @Value("${FRONTEND_URL:http://localhost:5173}")
    private String allowedOrigins;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(AbstractHttpConfigurer::disable)
            .authorizeHttpRequests(auth -> {
                auth.requestMatchers("/api/webhooks/**").permitAll()
                    .requestMatchers("/api/public/**").permitAll() // reservas online (sin login; tenant por token)
                    // Sync headless (ladrillo 4) y consultas de update (ladrillo 7): permitAll a
                    // nivel Security porque la puerta REAL es DeviceCredentialFilter (fail-closed:
                    // sin X-Device-Key válida → 401).
                    .requestMatchers("/api/sync/**").permitAll()
                    .requestMatchers("/api/updates/**").permitAll()
                    .requestMatchers("/actuator/health").permitAll();
                // SOLO en modo local (ADR-009): Electron apaga el backend embebido con
                // POST /actuator/shutdown para que zonky detenga Postgres prolijamente.
                // Seguro: en local el server escucha solo en 127.0.0.1. En la nube este
                // matcher no existe y el endpoint además está deshabilitado.
                if (environment.acceptsProfiles(Profiles.of("local"))) {
                    auth.requestMatchers("/actuator/shutdown").permitAll();
                }
                auth.anyRequest().authenticated();
            })
            .sessionManagement(sess -> sess
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.decoder(jwtDecoder()))
            )
            // Credencial de equipo ANTES del BearerTokenFilter: /api/sync/** no trae JWT
            .addFilterBefore(deviceCredentialFilter, BearerTokenAuthenticationFilter.class)
            // Agregar nuestro filtro de Tenant DESPUES del BearerTokenFilter (que valida el JWT)
            .addFilterAfter(tenantContextFilter, BearerTokenAuthenticationFilter.class)
            // Agregar el KillSwitch DESPUES del TenantFilter
            .addFilterAfter(killSwitchFilter, TenantContextFilter.class);

        return http.build();
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        return NimbusJwtDecoder.withJwkSetUri(jwksUri)
                .jwsAlgorithm(SignatureAlgorithm.ES256)
                .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        // Usamos OriginPatterns para que el comodín '*' sea legal junto a las credenciales
        configuration.setAllowedOriginPatterns(Arrays.asList(allowedOrigins.split(",")));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        // X-Device-Id: DNI de equipo (ADR-002). X-App-Version: versión de la app (señal de
        // vida / rollout por anillos). OJO ORDEN DE DEPLOY: el backend debe permitir cada
        // header ANTES de que un frontend lo empiece a mandar, o el preflight CORS rechaza
        // todas las requests de la web ("el nuevo se adapta al viejo", contrato de compatibilidad).
        configuration.setAllowedHeaders(Arrays.asList("Authorization", "Content-Type", "X-Requested-With", "Accept", "X-Tenant-ID", "X-Device-Id", "X-App-Version"));
        configuration.setExposedHeaders(List.of("Authorization", "X-Tenant-ID"));
        // Autenticación por Bearer token (no cookies) → NO necesitamos credenciales CORS.
        // Mantenerlo en false evita reflejar cualquier origin con Access-Control-Allow-Credentials,
        // y permite que la app Electron (Origin: null) siga funcionando sin abrir un hueco CSRF.
        configuration.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
