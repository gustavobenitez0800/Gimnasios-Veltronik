package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.AppUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.assertj.core.api.Assertions.assertThat;

/** Identidad de fundador (ladrillo 7): quién ve Mission Control y publica el rollout. */
class FounderPolicyTest {

    private final FounderPolicy policy = new FounderPolicy("founder@x.com, boss@y.com");

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private void loginAs(String email) {
        AppUser user = new AppUser();
        user.setEmail(email);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user, null));
    }

    @Test
    @DisplayName("un email de la lista es fundador (case-insensitive)")
    void founder_reconocido() {
        loginAs("Founder@X.com");
        assertThat(policy.isFounder()).isTrue();
    }

    @Test
    @DisplayName("un email fuera de la lista no es fundador")
    void no_founder() {
        loginAs("cualquiera@z.com");
        assertThat(policy.isFounder()).isFalse();
    }

    @Test
    @DisplayName("sin sesión, no es fundador")
    void sin_sesion() {
        assertThat(policy.isFounder()).isFalse();
    }
}
