package com.veltronik.v2.core.security;

import com.veltronik.v2.core.repositories.CashierRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Lee el header {@code X-Cashier-Id} — quién está en el turno — y lo deja en
 * {@link CashierContextHolder} para que cada registro que se inserte quede firmado.
 *
 * <p><b>Valida, pero no rechaza.</b> Un id que no exista, que esté inactivo o que sea de
 * otra sucursal se ignora: el registro queda sin firma y la operación sigue. Es la misma
 * regla que rige la procedencia de equipo — un dato de trazabilidad NUNCA puede impedir
 * que un gimnasio cobre una cuota. El precio de ser estricto acá sería un mostrador
 * parado; el de ser laxo, un registro sin nombre.</p>
 *
 * <p><b>Por qué se valida entonces.</b> Para que el dato sirva: sin el chequeo, cualquier
 * cliente podría mandar un id inventado y ensuciar la autoría con nombres que no existen o
 * que son de otro gimnasio. Lo que el chequeo NO evita es que alguien mande el id de un
 * compañero de la misma sucursal — esa es la limitación inherente del PIN, y está asumida:
 * esto da responsabilidad, no seguridad.</p>
 */
@Component
@RequiredArgsConstructor
public class CashierContextFilter extends OncePerRequestFilter {

    private final CashierRepository cashierRepository;
    private final CashierContextCache cache;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {

        try {
            resolveCashier(request).ifPresent(CashierContextHolder::setCashierId);
            filterChain.doFilter(request, response);
        } finally {
            // Siempre: un hilo del pool que quede con el cajero de la request anterior
            // firmaría los movimientos de otra persona.
            CashierContextHolder.clear();
        }
    }

    private java.util.Optional<UUID> resolveCashier(HttpServletRequest request) {
        final String header = request.getHeader("X-Cashier-Id");
        if (header == null || header.isBlank()) return java.util.Optional.empty();

        final UUID tenantId = TenantContextHolder.getTenantId();
        if (tenantId == null) return java.util.Optional.empty(); // sin sucursal no hay a quién validar

        final UUID cashierId;
        try {
            cashierId = UUID.fromString(header.trim());
        } catch (IllegalArgumentException e) {
            return java.util.Optional.empty(); // header malformado: se ignora, no es un error
        }

        try {
            Boolean cached = cache.get(cashierId, tenantId);
            if (cached == null) {
                cached = cashierRepository.existsByIdAndTenantIdAndActiveTrue(cashierId, tenantId);
                cache.put(cashierId, tenantId, cached);
            }
            return cached ? java.util.Optional.of(cashierId) : java.util.Optional.empty();
        } catch (Exception e) {
            // La base no responde: se pierde la firma de esta operación, no la operación.
            logger.warn("No se pudo validar el cajero " + cashierId + ": " + e.getMessage());
            return java.util.Optional.empty();
        }
    }
}
