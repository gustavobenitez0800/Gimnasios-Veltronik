---
description: How to release a new version that auto-updates desktop clients and deploys web
---

# Release Workflow

## Prerequisites

1. **GitHub Pages** must be enabled in your repo settings:
   - Go to `Settings → Pages → Source → GitHub Actions`

2. **Vercel** should be connected to this repo for API deploys:
   - It auto-deploys on every push to `main`

## How to Release

// turbo-all

### 1. Bump the version in `package.json`

```bash
npm version patch
```
This creates a git commit AND a `v1.0.15` tag automatically.

### 2. Push with tags

```bash
git push origin main --tags
```

### 3. What happens automatically

The GitHub Actions workflow (`build.yml`) triggers on `v*` tags and does:

| Job | Platform | Result |
|-----|----------|--------|
| `deploy-web` | Ubuntu | Deploys web app to **GitHub Pages** |
| `create-release` | Ubuntu | Creates a **GitHub Release** with auto-generated notes |
| `build-windows` | Windows | Builds `Veltronik-Setup-X.X.X.exe` and uploads to release |
| `build-linux` | Ubuntu | Builds `.AppImage` + `.deb` and uploads to release |
| `build-macos` | macOS | Builds `.dmg` + `.zip` and uploads to release |

### 4. Auto-update for existing desktop clients

- `electron-updater` checks GitHub Releases every 4 hours
- When a new release is found, it downloads automatically
- User gets a native notification: "Actualización disponible"
- Install happens on next app close

## Where Your App Lives

| Platform | URL |
|----------|-----|
| **Vercel** (API + Web) | https://gimnasio-veltronik.vercel.app |
| **GitHub Pages** (Web) | https://gustavobenitez0800.github.io/gimnasios-veltronik |
| **GitHub Releases** (Desktop) | https://github.com/gustavobenitez0800/gimnasios-veltronik/releases |

## Manual Commands (optional)

```bash
# Build web only
npm run build

# Build Windows installer locally
npm run build && npm run build:win

# Deploy API to Vercel manually
npm run deploy-api
```
