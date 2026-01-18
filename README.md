# Gimnasio Veltronik

Sistema de gestión profesional para gimnasios - SaaS multiplataforma.

## Requisitos

- Node.js 18+
- npm o yarn

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm start
```

## Build

### Windows
```bash
npm run build:win
```

### macOS
```bash
npm run build:mac
```

### Linux
```bash
npm run build:linux
```

### Todas las plataformas
```bash
npm run build:all
```

## Publicar nueva versión

1. Actualizar versión en `package.json`
2. Commit y push a GitHub
3. Ejecutar: `npm run publish`

## Arquitectura

- **Frontend**: HTML/CSS/JS (Vanilla)
- **Backend API**: Vercel Serverless Functions
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **Pagos**: Mercado Pago (Suscripciones)
- **Desktop**: Electron con auto-updates

## Licencia

Propietario - Veltronik © 2026
