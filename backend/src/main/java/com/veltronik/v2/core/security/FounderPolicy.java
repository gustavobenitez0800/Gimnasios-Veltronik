package com.veltronik.v2.core.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Quién es "el fundador" — el único que ve Mission Control y publica el rollout (ladrillo 7).
 *
 * <p>Simple a propósito (equipo de una persona): la lista de emails de fundador viene de
 * config ({@code veltronik.founder-emails} / env {@code FOUNDER_EMAILS}). No es un rol de
 * tenant: es global, por encima de los negocios.</p>
 */
@Component
public class FounderPolicy {

    private final Set<String> founderEmails;

    public FounderPolicy(@Value("${veltronik.founder-emails:gustavobenitezlink@gmail.com}") String csv) {
        this.founderEmails = Arrays.stream(csv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> s.toLowerCase())
                .collect(Collectors.toSet());
    }

    /** ¿El usuario autenticado (JWT de Supabase) es fundador? */
    public boolean isFounder() {
        String email = SecurityUtils.getCurrentUserEmail();
        return email != null && founderEmails.contains(email.toLowerCase());
    }
}
