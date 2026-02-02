# 🛡️ Seguridad, Antivirus y Firma Digital

Esta guía explica cómo profesionalizar tu aplicación, eliminar advertencias de "Editor Desconocido" y minimizar falsos positivos de antivirus.

---

## 🚫 El Problema: "Editor Desconocido" y SmartScreen

Cuando un usuario descarga instalar tu aplicación, Windows muestra una advertencia azul intimidante (SmartScreen) diciendo que "Protegió su PC".

**¿Por qué sucede esto?**
Porque tu aplicación **no tiene una Firma Digital (Code Signing Certificate)**.
Para Windows y los Antivirus, un ejecutable sin firmar que se descarta de internet es indistinguible de un malware.

**Impacto:**
1.  **Desconfianza**: Los clientes ven "Editor: Desconocido".
2.  **Falsos Positivos**: Los antivirus (Avast, Defender, McAfee) son mucho más agresivos con apps sin firmar.
3.  **Bloqueos**: En entornos corporativos, a veces ni siquiera se permite ejecutar.

---

## 🔑 La Solución: Certificado de Firma de Código

La **única** forma garantizada de eliminar esto es comprar un certificado .

### Tipos de Certificados
| Tipo | Costo Aprox. | Ventajas | SmartScreen |
|------|-------------|----------|-------------|
| **OV (Organization Validation)** | ~$300 / año | Muestra tu nombre de empresa. | Elimina la advertencia *gradualmente* (con descargas acumuladas). |
| **EV (Extended Validation)** | ~$500 / año | Máxima reputación inmediata. Requiere hardware key (USB). | **Elimina SmartScreen INMEDIATAMENTE.** |

### Dónde Comprar (Autoridades de Confianza)
*   **Sectigo (Comodo)**: Opción popular y económica.
*   **DigiCert**: Líder del mercado, soporte excelente, más caro.
*   **GlobalSign**

> 💡 **Recomendación**: Para empezar, un certificado OV es suficiente, pero tardará un tiempo en ganar reputación. Si el presupuesto lo permite, EV es la solución definitiva.

---

## 🛠️ Cómo Configurar la Firma (Cuando tengas el certificado)

Veltronik Gym ya está configurado para firmar automáticamente si detecta el certificado.

### Paso 1: Exportar a PFX
Si compras un certificado OV, recibirás instrucciones para exportarlo. Necesitas un archivo `.pfx` (o `.p12`).

### Paso 2: Configurar Variables de Entorno
**NUNCA** guardes el archivo del certificado ni su contraseña en el código fuente (GitHub). Usa variables de entorno en tu máquina de compilación.

**En Windows (PowerShell):**
```powershell
$env:CSC_LINK = "C:\Ruta\Segura\a\tu\certificado.pfx"
$env:CSC_KEY_PASSWORD = "tu_contraseña_del_certificado"
```

**En GitHub Actions (si automatizas el deploy):**
Agrega `CSC_LINK` (contenido base64 del archivo) y `CSC_KEY_PASSWORD` en los Secrets del repositorio.

### Paso 3: Compilar
Simplemente ejecuta el comando de build normal. `electron-builder` detectará las variables y firmará el ejecutable.
```bash
npm run build:win
```

---

## 🦠 Reportar Falsos Positivos (Whitelisting)

Incluso sin certificado, o mientras ganas reputación, puedes enviar tu instalador a los laboratorios antivirus para que lo analicen y lo marquen como limpio.

**Formularios de Envío:**
1.  **Microsoft Defender**: [Submit a file for analysis](https://www.microsoft.com/en-us/wdsi/filesubmission) (Selecciona "Software Developer").
2.  **Avast/AVG**: [Whitelist Request](https://www.avast.com/false-positive-file-form.php)
3.  **Kaspersky**: [Virus Desk](https://virusdesk.kaspersky.com/)
4.  **Bitdefender**: [Submit False Positive](https://www.bitdefender.com/consumer/support/answer/29358/)

**Tips para reducir detecciones heurísticas:**
*   Firma tu código (Crítico).
*   Evita solicitar permisos de Administrador si no son necesarios (ya configurado en `electron-builder.yml`).
*   Usa un instalador estándar (NSIS) en lugar de ejecutables comprimidos extraños.

---

## 📝 Resumen del Estado Actual
✅ **Instalador Profesional**: Configurado como asistente (Wizard) con licencia y selección de ruta.
✅ **Metadata**: El ejecutable ahora tiene "Veltronik" como autor internamente.
✅ **Preparado para Firma**: La configuración espera por las variables de entorno.
❌ **Sin Firma**: Seguirán apareciendo advertencias hasta adquirir el certificado.
