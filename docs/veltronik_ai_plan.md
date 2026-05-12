# Veltronik AI Assistant - Plan de Implementación Estratégica

## Visión General
Transformar Veltronik de un "Software de Gestión" pasivo a un "Empleado Digital 24/7" activo. 
El objetivo es integrar Inteligencia Artificial conversacional directamente en canales como WhatsApp e Instagram, permitiendo que el sistema dialogue con clientes, consulte disponibilidad y agende turnos de manera 100% autónoma.

## 🛠️ Stack Tecnológico Requerido

1. **Canales de Comunicación:** Meta for Developers (WhatsApp Cloud API / Instagram Graph API).
2. **Cerebro (LLM):** OpenAI API (Assistants API con soporte para *Function Calling*).
3. **Backend / Middleware:** Vercel Serverless Functions (`/api/webhook`) o Supabase Edge Functions.
4. **Base de Datos:** Supabase PostgreSQL (lectura y escritura directa de turnos/clientes).

---

## 🗺️ Fases de Implementación (Hoja de Ruta)

### Fase 1: Infraestructura y Conexión Base (El Puente)
*Objetivo: Lograr que la plataforma reciba y responda mensajes de WhatsApp.*
1. Crear una cuenta de desarrollador en **Meta for Developers**.
2. Configurar una app de "WhatsApp Business API" y obtener un token temporal/permanente.
3. Crear un **Webhook** en el código de Veltronik (ej. `api/webhook.js` para Vercel o una *Edge Function* en Supabase).
4. Verificar el Webhook con Meta.
5. Programar la lógica básica para recibir el *payload* de un mensaje entrante y responder un "Hola Mundo" hardcodeado para validar la conexión.

### Fase 2: Inteligencia y Conversación (El Cerebro)
*Objetivo: Que el bot entienda el lenguaje natural y responda con contexto.*
1. Integrar el SDK de **OpenAI** en el entorno de backend (Node.js/Deno).
2. Crear un *System Prompt* robusto. Ejemplo: *"Sos Veltronik Bot. Sos el recepcionista virtual. Debes ser amable, usar emojis y guiar al cliente para concretar una reserva."*
3. Conectar el Webhook (Fase 1) con OpenAI: Cuando llega un mensaje de WhatsApp, se envía el texto a OpenAI, se espera la respuesta generada, y se reenvía por WhatsApp al cliente.
4. Implementar manejo de **estado/sesión** temporal (recordar de qué venía hablando el cliente en los últimos 5 mensajes).

### Fase 3: Autonomía Operativa (Las Manos - Function Calling)
*Objetivo: Que la IA pueda accionar sobre la base de datos de Veltronik.*
1. Definir herramientas (*Tools*) en OpenAI. Ejemplos de esquemas JSON a definir:
   - `consultar_disponibilidad(fecha)`
   - `reservar_turno(nombre, telefono, fecha, hora, id_servicio)`
2. Modificar el backend para **interceptar** las llamadas a funciones de OpenAI.
3. Cuando OpenAI solicite `consultar_disponibilidad`, el backend ejecuta un `SELECT` en la tabla `salon_appointments` de Supabase y le devuelve la lista de horas libres a OpenAI.
4. OpenAI procesa esa info y le responde al cliente por WhatsApp (ej. *"Tengo a las 15:00 o a las 18:00"*).
5. Cuando el cliente confirma, OpenAI dispara `reservar_turno`. El backend ejecuta el `INSERT` en Supabase.
6. Notificar (opcional) en el frontend (WebSocket/Realtime) para que el cuadro del turno aparezca en la pantalla de la PC del dueño sin necesidad de recargar la página.

---

## 🚀 Impacto en Verticales Existentes

*   **Peluquerías y Salones (`SALON`):** Lectura de grilla por estilista, toma de turnos, recordatorios automáticos (ej. mandar mensaje a los 30 días para volver a cortar).
*   **Pilates y Yoga (`PILATES`):** Reserva de cupos, cancelaciones automáticas y reasignación a listas de espera.
*   **Restaurantes (`RESTO`):** Recepción de pedidos para Take Away o Delivery, cálculo de total leyendo `menu_items`, e inyección directa en `KitchenPage`.
*   **Gimnasios (`GYM`):** Respuestas a FAQs (horarios, cuotas) y notificaciones de deudas vencidas con links de pago.

---

## 💼 Análisis de Negocio y Posicionamiento

*   **Problema que Resuelve:** Los dueños de PyMEs en LATAM pierden horas al día gestionando consultas manuales por WhatsApp, o pagan sueldos altos por tareas administrativas repetitivas.
*   **Ventaja Competitiva:** Los bots tradicionales ("Apretá 1") generan fricción. Un bot con IA conversacional integrado *nativamente* al sistema de gestión es un producto premium casi sin competencia directa en el nicho B2B local.
*   **Estrategia de Pricing:** 
    *   Plan Base (Software actual): $25.000 ARS/mes.
    *   **Plan Veltronik AI (Software + Recepcionista Virtual):** $60.000 - $80.000 ARS/mes.
*   **Canal de Crecimiento (Viralidad):** El sistema B2B se vuelve B2B2C. Miles de consumidores finales usarán el bot de Veltronik para agendar sus turnos. Muchos de ellos son dueños de otros negocios, generando un loop de adquisición orgánica masivo.
