# Guía de Publicación y Auto-Updates de Gimnasio Veltronik

Para que las actualizaciones automáticas funcionen, el ciclo debe ser el siguiente:

## 1. Preparar la Nueva Versión
1. Haz tus cambios en el código.
2. Actualiza la versión en `package.json` (ejemplo: de `1.0.2` a `1.0.3`).
   - *Nota: La nueva versión DEBE ser mayor que la anterior.*

## 2. Generar el Instalador
Ejecuta el siguiente comando en tu terminal para crear los archivos de instalación y actualización:

```bash
npm run build:win
```

Esto generará una carpeta `dist/` con varios archivos. Los más importantes son:
- `Gimnasio-Veltronik-1.0.3-setup.exe` (El instalador para los usuarios)
- `latest.yml` (CRÍTICO: Este archivo le dice a la app qué versión es la más nueva)
- `Gimnasio-Veltronik-1.0.3-setup.exe.blockmap` (Ayuda a descargas más rápidas)

## 3. Publicar en GitHub Releases
1. Ve a tu repositorio en GitHub: [https://github.com/gustavobenitez0800/gimnasios-veltronik/releases](https://github.com/gustavobenitez0800/gimnasios-veltronik/releases)
2. Haz clic en "Draft a new release".
3. **Tag version**: Escribe `v1.0.3` (debe coincidir con la versión de tu package.json).
4. **Release title**: "Versión 1.0.3" (o lo que prefieras).
5. **Description**: Describe los cambios.
6. **Attach binaries**: Arrastra y suelta TODOS los archivos generados en `dist/` (excepto la carpeta `win-unpacked`).
   - Asegúrate de incluir `latest.yml`, el `.exe` y el `.blockmap`.
7. Haz clic en **Publish release**.

## Nota Importante para la Primera Vez
Como estabas usando la versión "Portable" (que no soporta auto-updates), **esta vez** tendrás que descargar e instalar el archivo `setup.exe` manualmente desde GitHub.

Una vez instalado este "Setup", las futuras versiones (1.0.4, etc.) se descargarán e instalarán solas automáticamente.
