package com.veltronik.v2.core.config;

import com.veltronik.v2.core.security.DeviceContextHolder;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.core.services.DeviceRegistryService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.UUID;

/**
 * Dispara la señal de vida del equipo (Fase 1, ladrillo 1).
 *
 * <p><b>Por qué un {@link HandlerInterceptor} y no un filtro:</b> los interceptors de MVC
 * corren DESPUÉS de toda la cadena de filtros — JWT validado, {@code TenantContextHolder}
 * con el tenant YA VERIFICADO por membership, y {@code DeviceContextHolder} poblado. Un
 * filtro más habría dependido del orden relativo entre filtros (ruleta) y habría registrado
 * tenants sin validar.</p>
 */
@Component
@RequiredArgsConstructor
public class DeviceHeartbeatInterceptor implements HandlerInterceptor {

    private final DeviceRegistryService deviceRegistryService;

    @Override
    public boolean preHandle(@NonNull HttpServletRequest request,
                             @NonNull HttpServletResponse response,
                             @NonNull Object handler) {
        final UUID deviceId = DeviceContextHolder.getDeviceId();
        if (deviceId != null) {
            deviceRegistryService.heartbeat(
                    deviceId,
                    TenantContextHolder.getTenantId(),
                    request.getHeader("X-App-Version"));
        }
        return true; // la telemetría jamás corta la request
    }
}
