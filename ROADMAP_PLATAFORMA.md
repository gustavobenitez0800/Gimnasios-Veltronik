 t# 🚀 Veltronik Universal Platform - Roadmap

Este documento detalla la estrategia técnica para transformar el actual sistema "Gimnasio Veltronik" en la **Plataforma Veltronik**, una "Super App" capaz de gestionar múltiples tipos de negocios (Gimnasios, Restaurantes, Kioscos) desde una única instalación, funcionando nativamente en Escritorio (Windows/Mac) y Móvil (Android/iOS).

## 1. La Visión: "Una App para todo"

En lugar de crear y mantener 10 aplicaciones distintas (`Veltronik Gym`, `Veltronik Resto`, `Veltronik Vet`), crearemos **Veltronik Manager**.

*   **Usuario Nuevo**: Descarga "Veltronik", se loguea, y la app descarga el módulo que necesita (ej: "Gimnasio").
*   **Usuario Existente (PC)**: Su aplicación actual se actualiza automáticamente y se convierte en la Plataforma, manteniendo sus datos.

---

## 2. Arquitectura Universal

El código será **90% compartido** entre todas las plataformas.

```mermaid
graph TD
    User[Usuario] --> Launcher[Veltronik Launcher]
    Launcher --> Auth[Módulo de Autenticación Supabase]
    
    Auth --> Check{¿Qué licencia tiene?}
    Check -->|Gimnasio| Gym[Módulo Gimnasio]
    Check -->|Kiosco| Shop[Módulo Kiosco]
    Check -->|Restaurante| Resto[Módulo Restaurante]
    
    subgraph "Adaptadores de Hardware (Capa Nativa)"
        Gym & Shop & Resto --> NativeBridge
        NativeBridge -->|Escritorio| Electron[Electron API (USB/Serial)]
        NativeBridge -->|Móvil| Mobile[Capacitor API (Cámara/NFC/Bluetooth)]
        NativeBridge -->|Web| Browser[Browser API]
    end
```

### Tecnologías
*   **Core**: JavaScript/HTML/CSS (Lo que ya tienes).
*   **Escritorio**: Electron (Mantiene lo actual).
*   **Móvil**: CapacitorJS (Envuelve tu código web en una App Nativa Android/iOS).
*   **Backend**: Supabase (Ya centralizado en la nube).

---

## 3. Estrategia de Auto-Update (Migración de Clientes)

Tu mayor preocupación: **¿Qué pasa con los clientes que ya tienen "Gimnasio Veltronik" instalado?**

No te preocupes, la transición será automática si seguimos estos pasos:

1.  **Mantenemos el ID**: En `electron-builder.yml`, no cambiaremos el `appId: com.veltronik.gimnasio` inmediatamente. Esto permite que el actualizador reconozca la nueva versión como legítima.
2.  **La "Gran Actualización" (v2.0)**:
    *   Lanzaremos una actualización que internamente cambia la estructura.
    *   Al abrirse, la app detectará: *"Soy la versión 2.0. El usuario Gustavo ya estaba logueado"*.
    *   Automáticamente cargará la interfaz de **Gimnasio** para que el usuario no se pierda.
    *   Agregaremos un botón nuevo en el menú: **"Volver al Inicio / Cambiar Sistema"**.
3.  **Resultado**: El cliente abre su "Gimnasio", se actualiza sola, y al reiniciar tiene la nueva Plataforma, pero entra directo a su gimnasio como siempre. No pierde datos porque todo está en Supabase.

---

## 4. Pasos de Ejecución

### Fase A: Preparación del Núcleo (Core)
- [ ] **Estandarizar Base de Datos**: Agregar campo `organization_type` a la tabla `organizations` para distinguir si es un Gimnasio o un Restaurante.
- [ ] **Crear el "Lobby"**: Diseñar la pantalla de selección de sistema ("Hola Gustavo, ¿a dónde quieres entrar hoy?").
- [ ] **Abstraer Hardware**: Crear un archivo `hardware-manager.js` que detecte si estamos en PC o Celular.
    *   *Ejemplo*: Si pide "Escanear QR":
        *   En PC: Abre webcam USB o espera ingreso por teclado.
        *   En Celular: Abre la cámara nativa con flash.

### Fase B: Conquista Móvil (Android)
- [ ] **Instalar Capacitor**: Integrar CapacitorJS al proyecto actual. con `npm install @capacitor/core`.
- [ ] **Configurar Android**: Generar la carpeta `/android`.
- [ ] **Adaptar Navegación**: Asegurar que los botones no queden muy chicos para el dedo o muy ocultos.
- [ ] **Compilar APK**: Generar el primer instalable de prueba (`.apk`).

### Fase C: Expansión (Nuevos Sistemas)
- [ ] **Crear "Veltronik Kiosco"**: Un módulo simple (Punto de Venta) para probar que conviva con el Gimnasio en la misma app.
- [ ] **Prueba de Fuego**: Loguearse con un usuario que tenga AMBOS negocios y cambiar de uno a otro sin cerrar la app.

---

## 5. Próximos Pasos Inmediatos
1.  Instalar **CapacitorJS** en tu proyecto actual.
2.  Configurar las credenciales de Supabase para soportar Login Multi-App.
