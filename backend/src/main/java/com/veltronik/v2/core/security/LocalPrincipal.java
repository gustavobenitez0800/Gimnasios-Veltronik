package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.Cashier;

import java.util.UUID;

/**
 * El "usuario" de una sesión LOCAL (ladrillo 6): un cajero que entró por PIN contra el
 * cerebro embebido, sin Google ni internet. Es el principal que queda en el
 * SecurityContext en modo {@code local} — el equivalente offline del JWT de Supabase.
 */
public record LocalPrincipal(UUID cashierId, UUID tenantId, Cashier.Role role, String name) {
}
