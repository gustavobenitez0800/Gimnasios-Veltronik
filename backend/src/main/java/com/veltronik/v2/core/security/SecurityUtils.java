package com.veltronik.v2.core.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.UUID;

public class SecurityUtils {

    public static UUID getCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return null;
        }

        Object principal = auth.getPrincipal();
        if (principal instanceof Jwt) {
            Jwt jwt = (Jwt) principal;
            // The "sub" claim is the UUID in Supabase
            return UUID.fromString(jwt.getSubject());
        } else if (principal instanceof com.veltronik.v2.core.entities.AppUser) {
            return ((com.veltronik.v2.core.entities.AppUser) principal).getId();
        } else if (principal instanceof LocalPrincipal) {
            // Modo local (ladrillo 6): el "usuario" es el cajero que entró por PIN.
            return ((LocalPrincipal) principal).cashierId();
        }

        return null;
    }

    public static String getCurrentUserEmail() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return null;
        }

        Object principal = auth.getPrincipal();
        if (principal instanceof Jwt) {
            Jwt jwt = (Jwt) principal;
            // Supabase JWTs typically include the email claim
            return jwt.getClaimAsString("email");
        } else if (principal instanceof com.veltronik.v2.core.entities.AppUser) {
            return ((com.veltronik.v2.core.entities.AppUser) principal).getEmail();
        }
        
        return null;
    }
}
