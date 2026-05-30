package com.veltronik.v2.core.controllers;

import com.veltronik.v2.core.dto.TenantDTO;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.services.BaseService;
import com.veltronik.v2.core.services.TenantService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Controlador REST para la entidad {@link Tenant}.
 *
 * Expone automáticamente los 5 endpoints CRUD en {@code /api/tenants}
 * gracias a la herencia de {@link BaseController}:
 * <ul>
 *   <li>GET    /api/tenants       → Listar todos</li>
 *   <li>GET    /api/tenants/{id}  → Buscar por ID</li>
 *   <li>POST   /api/tenants       → Crear</li>
 *   <li>PUT    /api/tenants/{id}  → Actualizar</li>
 *   <li>DELETE /api/tenants/{id}  → Eliminar</li>
 * </ul>
 *
 * <p>El Junior solo necesita implementar {@link #getService()}. Todo lo demás
 * es heredado. Este es el equivalente moderno del patrón ManagedBean + Facade
 * del SIG JEE7.</p>
 */
@RestController
@RequestMapping("/api/tenants")
@RequiredArgsConstructor
public class TenantController extends BaseController<Tenant, TenantDTO, UUID> {

    private final TenantService tenantService;

    @Override
    protected BaseService<Tenant, TenantDTO, UUID> getService() {
        return tenantService;
    }
    
    @org.springframework.web.bind.annotation.GetMapping("/my")
    public org.springframework.http.ResponseEntity<java.util.List<TenantDTO>> getMyTenants() {
        return org.springframework.http.ResponseEntity.ok(tenantService.findMyTenants());
    }
}
