package com.veltronik.v2.core.entities;

/**
 * Tipos de negocio (verticales) soportados por Veltronik.
 *
 * <p>Hoy hay UNO: el gimnasio. Es una decisión de producto tomada el 2026-07-27 —
 * Veltronik es un ecosistema para gimnasios y se profundiza en ese rubro en vez de
 * abrirse a varios. Antes hubo tres intentos de sumar rubros y los tres se dieron de
 * baja: Fútbol 5 (V40), Restaurante y Belleza (nunca llegaron a existir acá), y el
 * Kiosco (V41, este).</p>
 *
 * <p>La arquitectura sigue soportando verticales —el aislamiento por módulos y las
 * reglas de ArchUnit siguen en pie— así que sumar un rubro nuevo es agregar un valor
 * acá y un paquete propio. Pero <b>no se agrega un valor sin el módulo detrás</b>:
 * un enum con un rubro a medio construir es exactamente lo que dejó pantallas rotas
 * esperando clientes que nunca llegaron.</p>
 */
public enum BusinessType {
    GYM
}
