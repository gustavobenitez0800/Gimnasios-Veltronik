# 🚀 Guía de Instaladores - Gimnasio Veltronik

Esta guía explica paso a paso cómo crear instaladores para **Windows**, **macOS** y **Linux**.

---

## 📋 Requisitos Previos

### Software Necesario

| Plataforma | Requisito |
|------------|-----------|
| **Todas** | Node.js v18.0.0 o superior |
| **Todas** | npm (incluido con Node.js) |
| **Windows** | Windows 10/11 |
| **macOS** | macOS 10.14+ y Xcode Command Line Tools |
| **Linux** | Ubuntu 18.04+ o equivalente |

### Verificar Instalación

```bash
node --version   # Debe mostrar v18.x.x o superior
npm --version    # Debe mostrar 9.x.x o superior
```

---

## 📦 Paso 1: Preparar el Proyecto

### 1.1 Clonar o Descargar el Proyecto

```bash
git clone https://github.com/gustavobenitez0800/gimnasios-veltronik.git
cd gimnasios-veltronik
```

### 1.2 Instalar Dependencias

```bash
npm install
```

> ⏱️ Este proceso puede tardar unos minutos la primera vez.

### 1.3 Verificar que Todo Funciona

```bash
npm start
```

Si la aplicación se abre correctamente, estás listo para crear los instaladores.

---

## 🪟 Paso 2: Crear Instalador para Windows

### Opción A: Desde Windows (Recomendado)

```bash
npm run build:win
```

### Opción B: Desde macOS/Linux (Cross-compile)

```bash
npm run build:win
```

> ⚠️ El cross-compile puede requerir herramientas adicionales como Wine.

### Archivos Generados

Los instaladores se crearán en la carpeta `dist/`:

| Archivo | Descripción |
|---------|-------------|
| `Gimnasio-Veltronik-1.0.0-portable.exe` | Ejecutable portable (no requiere instalación) |

### Para Configurar Firma Digital (Recomendado)
Para eliminar advertencias de antivirus y pantallas de "Editor Desconocido", consulta la guía detallada de seguridad:
👉 **[Guía de Seguridad y Firma Digital](docs/SECURITY_AND_SIGNING.md)**

La configuración ya está lista en `electron-builder.yml`. Solo necesitas las variables de entorno `CSC_LINK` y `CSC_KEY_PASSWORD` cuando tengas tu certificado.

### Personalización del Instalador
El instalador ahora es un asistente profesional (Wizard) gracias a la configuración `nsis` en `electron-builder.yml`.
- Muestra licencia (`LICENSE.md`)
- Permite elegir carpeta de instalación
- Crea accesos directos


Luego ejecutar:

```bash
npm run build:win
```

---

## 🍎 Paso 3: Crear Instalador para macOS

### Requisitos Específicos para macOS

1. **Xcode Command Line Tools**:
   ```bash
   xcode-select --install
   ```

2. **(Opcional) Certificado de Desarrollador Apple** para firmar la app.

### Crear el DMG

```bash
npm run build:mac
```

### Archivos Generados

| Archivo | Descripción |
|---------|-------------|
| `Gimnasio-Veltronik-1.0.0-x64.dmg` | Instalador para Intel Macs |
| `Gimnasio-Veltronik-1.0.0-arm64.dmg` | Instalador para Apple Silicon (M1/M2/M3) |

### ⚠️ Nota sobre Firma de Código

Sin un certificado de desarrollador Apple, los usuarios verán una advertencia de "desarrollador no identificado". Para firmar:

1. Obtener una cuenta de Apple Developer ($99/año)
2. Crear un certificado de Developer ID
3. Agregar en `electron-builder.yml`:

```yaml
mac:
  identity: "Developer ID Application: Tu Nombre (XXXXXXXXXX)"
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
```

---

## 🐧 Paso 4: Crear Instalador para Linux

### Requisitos Específicos

Para crear paquetes `.deb`:
```bash
sudo apt-get install dpkg fakeroot
```

### Crear los Paquetes

```bash
npm run build:linux
```

### Archivos Generados

| Archivo | Descripción |
|---------|-------------|
| `Gimnasio-Veltronik-1.0.0.AppImage` | Imagen universal (funciona en cualquier distro) |
| `Gimnasio-Veltronik-1.0.0.deb` | Paquete para Ubuntu/Debian |

### Instalar en Ubuntu/Debian

```bash
sudo dpkg -i Gimnasio-Veltronik-1.0.0.deb
sudo apt-get install -f  # Instalar dependencias faltantes
```

### Ejecutar AppImage

```bash
chmod +x Gimnasio-Veltronik-1.0.0.AppImage
./Gimnasio-Veltronik-1.0.0.AppImage
```

---

## 🌐 Paso 5: Crear Todos los Instaladores a la Vez

### Desde macOS (Puede crear los 3)

```bash
npm run build:all
```

> ⚠️ Solo macOS puede crear instaladores nativos para las 3 plataformas sin problemas.

### Desde Windows

```bash
npm run build:win
npm run build:linux
```

> ⚠️ Windows no puede crear DMGs para macOS.

### Desde Linux

```bash
npm run build:linux
npm run build:win
```

> ⚠️ Linux no puede crear DMGs para macOS.

---

## 📤 Paso 6: Publicar en GitHub Releases

### Configurar GitHub Token

1. Ir a [GitHub Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens)
2. Crear un nuevo token con permiso `repo`
3. Configurar la variable de entorno:

**Windows (PowerShell):**
```powershell
$env:GH_TOKEN = "tu_token_aqui"
```

**macOS/Linux:**
```bash
export GH_TOKEN="tu_token_aqui"
```

### Publicar Automáticamente

```bash
npm run publish
```

O para una plataforma específica:

```bash
npm run publish:win   # Solo Windows
```

Esto:
1. Compila la aplicación
2. Crea un nuevo release en GitHub
3. Sube los instaladores automáticamente

---

## 📁 Estructura de Carpetas Después del Build

```
gimnasios-veltronik/
├── dist/
│   ├── Gimnasio-Veltronik-1.0.0-portable.exe    # Windows
│   ├── Gimnasio-Veltronik-1.0.0-x64.dmg         # macOS Intel
│   ├── Gimnasio-Veltronik-1.0.0-arm64.dmg       # macOS Apple Silicon
│   ├── Gimnasio-Veltronik-1.0.0.AppImage        # Linux Universal
│   └── Gimnasio-Veltronik-1.0.0.deb             # Linux Debian/Ubuntu
└── ...
```

---

## 🔄 Sistema de Auto-Actualización

La aplicación tiene auto-actualización integrada via GitHub Releases:

1. Cuando publicas una nueva versión en GitHub con `npm run publish`
2. La app detecta automáticamente la nueva versión al iniciar
3. Descarga e instala la actualización

### Verificar Configuración

En `electron-builder.yml`:

```yaml
publish:
  provider: github
  owner: gustavobenitez0800
  repo: gimnasios-veltronik
  releaseType: release
```

---

## 🛠️ Solución de Problemas

### Error: "electron-builder: command not found"

```bash
npm install electron-builder --save-dev
```

### Error: "Cannot find module 'electron'"

```bash
npm install electron --save-dev
```

### Error en macOS: "The application is not signed"

La app funcionará pero mostrará advertencias. Solución completa requiere certificado Apple.

### Error en Windows: "EPERM: operation not permitted"

Cerrar cualquier instancia de la app abierta y reintentar.

### Error en Linux: "AppImage won't start"

```bash
chmod +x Gimnasio-Veltronik-1.0.0.AppImage
```

---

## 📊 Comandos Resumen

| Comando | Descripción |
|---------|-------------|
| `npm install` | Instalar dependencias |
| `npm start` | Ejecutar en modo desarrollo |
| `npm run build:win` | Crear instalador Windows |
| `npm run build:mac` | Crear instalador macOS |
| `npm run build:linux` | Crear instalador Linux |
| `npm run build:all` | Crear todos los instaladores |
| `npm run publish` | Publicar en GitHub Releases |

---

## 📞 Soporte

- **Email:** veltronikcompany@gmail.com
- **Web:** https://gimnasio-veltronik.vercel.app
- **GitHub:** https://github.com/gustavobenitez0800/gimnasios-veltronik

---

© 2026 Veltronik. Todos los derechos reservados.
