---
description: Despliega una nueva versión en GitHub Releases y Vercel
---

Este workflow automatiza la subida de una nueva versión de Veltronik. Genera el tag para GitHub Releases (que compila los binarios de Electron) y ejecuta el despliegue a Vercel.

Sigue estos pasos estrictamente:

// turbo-all
1. Lee el `package.json` para obtener la versión actual del proyecto (ej: "1.0.23").
2. Revisa si hay cambios pendientes por guardar. De haberlos, ejecuta `git add .` y `git commit -m "chore: preparativos para release v[VERSION]"`.
3. Crea un tag en git con la versión obtenida: `git tag v[VERSION]`.
4. Sube los commits locales y el tag nuevo al repositorio remoto: `git push origin main` y luego `git push origin v[VERSION]`. Esto disparará automáticamente la acción en `.github/workflows/build.yml` que creará el instalador de Electron y lo pondrá en GitHub Releases.
5. Despliega la aplicación web directamente a producción en Vercel ejecutando: `npm run deploy-api` --yes.
6. Espera a que el comando de Vercel finalice y notifica al usuario que el despliegue tanto en Desktop como en Web ha comenzado.
