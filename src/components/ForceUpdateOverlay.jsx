// ============================================
// VELTRONIK - FORCE UPDATE OVERLAY
// ============================================
// 
// Componente que verifica la versión actual contra
// la última versión publicada en GitHub Releases.
// Si la versión es vieja, BLOQUEA la app y obliga
// al usuario a actualizar.
//
// Funciona tanto en Electron (NSIS con auto-updater)
// como en versiones Portable (muestra link de descarga).

import { useState, useEffect, useCallback } from 'react';

const GITHUB_OWNER = 'gustavobenitez0800';
const GITHUB_REPO = 'Gimnasios-Veltronik';
const CHECK_INTERVAL = 10 * 60 * 1000; // Verificar cada 10 minutos

/**
 * Comparar versiones semver simples (e.g. "1.0.21" vs "1.0.22")
 * Retorna: -1 si a < b, 0 si iguales, 1 si a > b
 */
function compareVersions(a, b) {
    const pa = a.replace(/^v/, '').split('.').map(Number);
    const pb = b.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na < nb) return -1;
        if (na > nb) return 1;
    }
    return 0;
}

/**
 * Formatear bytes a human readable
 */
function formatBytes(bytes) {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
}

export default function ForceUpdateOverlay() {
    const [currentVersion, setCurrentVersion] = useState(null);
    const [latestVersion, setLatestVersion] = useState(null);
    const [downloadUrl, setDownloadUrl] = useState(null);
    const [downloadSize, setDownloadSize] = useState(null);
    const [releaseDate, setReleaseDate] = useState(null);
    const [releaseNotes, setReleaseNotes] = useState('');
    const [needsUpdate, setNeedsUpdate] = useState(false);
    const [isElectron, setIsElectron] = useState(false);
    const [autoUpdateInProgress, setAutoUpdateInProgress] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(null);
    const [updateDownloaded, setUpdateDownloaded] = useState(false);
    const [checkError, setCheckError] = useState(null);

    // Obtener la versión actual de la app
    const getCurrentVersion = useCallback(async () => {
        try {
            if (window.electronAPI?.getAppVersion) {
                const version = await window.electronAPI.getAppVersion();
                setIsElectron(true);
                return version;
            }
        } catch (e) {
            console.warn('No Electron API:', e);
        }
        // Fallback: no estamos en Electron (web o portable sin preload)
        setIsElectron(false);
        return null;
    }, []);

    // Verificar la última versión en GitHub
    const checkLatestVersion = useCallback(async () => {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
                {
                    headers: { 'Accept': 'application/vnd.github.v3+json' },
                    cache: 'no-store'
                }
            );

            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status}`);
            }

            const release = await response.json();
            const latest = release.tag_name.replace(/^v/, '');

            // Buscar el .exe de Windows
            const exeAsset = release.assets?.find(a =>
                a.name.endsWith('.exe') && !a.name.endsWith('.blockmap') && a.name.includes('Setup')
            );

            setLatestVersion(latest);
            setDownloadUrl(exeAsset?.browser_download_url || release.html_url);
            setDownloadSize(exeAsset?.size || null);
            setReleaseDate(release.published_at);
            setReleaseNotes(release.body || '');
            setCheckError(null);

            return latest;
        } catch (error) {
            console.error('Error checking latest version:', error);
            setCheckError(error.message);
            return null;
        }
    }, []);

    // Check principal
    const performCheck = useCallback(async () => {
        const current = await getCurrentVersion();
        if (!current) return; // No estamos en Electron, no bloqueamos

        setCurrentVersion(current);

        const latest = await checkLatestVersion();
        if (!latest) return; // Error de red, no bloqueamos

        const comparison = compareVersions(current, latest);
        if (comparison < 0) {
            // La versión actual es MENOR que la última
            console.warn(`[ForceUpdate] Versión desactualizada: ${current} < ${latest}`);
            setNeedsUpdate(true);
        } else {
            setNeedsUpdate(false);
        }
    }, [getCurrentVersion, checkLatestVersion]);

    // Escuchar eventos de auto-update desde Electron
    useEffect(() => {
        if (!window.electronAPI) return;

        if (window.electronAPI.onUpdateAvailable) {
            window.electronAPI.onUpdateAvailable((info) => {
                setAutoUpdateInProgress(true);
                setLatestVersion(info.version);
            });
        }

        if (window.electronAPI.onDownloadProgress) {
            window.electronAPI.onDownloadProgress((progress) => {
                setDownloadProgress(progress.percent);
            });
        }

        if (window.electronAPI.onUpdateDownloaded) {
            window.electronAPI.onUpdateDownloaded((info) => {
                setUpdateDownloaded(true);
                setAutoUpdateInProgress(false);
                setDownloadProgress(100);
            });
        }
    }, []);

    // Verificar al montar y periódicamente
    useEffect(() => {
        performCheck();
        const interval = setInterval(performCheck, CHECK_INTERVAL);
        return () => clearInterval(interval);
    }, [performCheck]);

    // Si no necesita update, no renderizar nada
    if (!needsUpdate) return null;

    // Acciones
    const handleRestart = () => {
        if (window.electronAPI?.restartForUpdate) {
            window.electronAPI.restartForUpdate();
        }
    };

    const handleForceRestart = async () => {
        try {
            if (window.electronAPI) {
                // Intentar via el IPC específico
                const { ipcRenderer } = window.require?.('electron') || {};
                if (ipcRenderer) {
                    ipcRenderer.invoke('force-update-restart');
                } else if (window.electronAPI.restartForUpdate) {
                    window.electronAPI.restartForUpdate();
                }
            }
        } catch (e) {
            console.error('Error forcing restart:', e);
        }
    };

    const handleDownload = () => {
        if (downloadUrl) {
            window.open(downloadUrl, '_blank');
        }
    };

    return (
        <div className="force-update-overlay" id="force-update-overlay">
            <div className="force-update-container">
                {/* Animated background */}
                <div className="force-update-bg-effect" />

                {/* Icon */}
                <div className="force-update-icon">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                </div>

                {/* Content */}
                <h1 className="force-update-title">Actualización Requerida</h1>

                <p className="force-update-description">
                    Hay una nueva versión de Veltronik disponible con mejoras importantes
                    y correcciones de errores. Es necesario actualizar para continuar.
                </p>

                {/* Version info */}
                <div className="force-update-versions">
                    <div className="force-update-version-box force-update-version-old">
                        <span className="force-update-version-label">Tu versión</span>
                        <span className="force-update-version-number">{currentVersion}</span>
                    </div>
                    <div className="force-update-arrow">→</div>
                    <div className="force-update-version-box force-update-version-new">
                        <span className="force-update-version-label">Última versión</span>
                        <span className="force-update-version-number">{latestVersion}</span>
                    </div>
                </div>

                {/* Progress bar if auto-updating */}
                {autoUpdateInProgress && downloadProgress !== null && (
                    <div className="force-update-progress-section">
                        <p className="force-update-progress-text">
                            Descargando actualización... {downloadProgress.toFixed(0)}%
                        </p>
                        <div className="force-update-progress-bar">
                            <div
                                className="force-update-progress-fill"
                                style={{ width: `${downloadProgress}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="force-update-actions">
                    {updateDownloaded ? (
                        <button
                            className="btn btn-primary btn-lg force-update-btn-main"
                            onClick={handleRestart}
                        >
                            🔄 Reiniciar e Instalar Ahora
                        </button>
                    ) : autoUpdateInProgress ? (
                        <button className="btn btn-primary btn-lg force-update-btn-main" disabled>
                            <span className="spinner" /> Descargando...
                        </button>
                    ) : (
                        <>
                            {isElectron && (
                                <button
                                    className="btn btn-primary btn-lg force-update-btn-main"
                                    onClick={handleForceRestart}
                                >
                                    🔄 Verificar Actualización
                                </button>
                            )}
                            <button
                                className="btn btn-secondary btn-lg force-update-btn-download"
                                onClick={handleDownload}
                            >
                                📥 Descargar Instalador
                                {downloadSize && <span className="force-update-size">({formatBytes(downloadSize)})</span>}
                            </button>
                        </>
                    )}
                </div>

                {/* Release date */}
                {releaseDate && (
                    <p className="force-update-date">
                        Publicada el {new Date(releaseDate).toLocaleDateString('es-AR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                        })}
                    </p>
                )}
            </div>
        </div>
    );
}
