---
description: Cómo deployar actualizaciones a producción (Vercel + GitHub)
---

# Deploy a Producción

Este workflow despliega las actualizaciones del proyecto a producción.
La app web y API se despliegan automáticamente a **Vercel** cuando se hace push a `main`.

## Pasos

// turbo-all

1. Ver qué archivos cambiaron:
```powershell
git status
```

2. Agregar todos los cambios:
```powershell
git add -A
```

3. Crear el commit con un mensaje descriptivo:
```powershell
git commit -m "descripción del cambio"
```

4. Pushear a producción (Vercel despliega automáticamente):
```powershell
git push origin main
```

5. Verificar el deploy en https://gimnasio-veltronik.vercel.app

## Notas
- El deploy a Vercel es automático al pushear a `main`
- Los cambios en `api/` se despliegan como Serverless Functions
- Los cambios en HTML/JS/CSS se despliegan como archivos estáticos
- Para el instalador de Electron, usar `npm run build:win` por separado
