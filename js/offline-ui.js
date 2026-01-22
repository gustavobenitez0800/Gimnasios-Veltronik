// ============================================
// GIMNASIO VELTRONIK - OFFLINE UI
// ============================================
// Componente de UI para mostrar estado de conexión
// y sincronización pendiente

const OfflineUI = (function () {
    let offlineBanner = null;
    let connectionIndicator = null;
    let syncBadge = null;
    let isInitialized = false;

    // ============================================
    // CREAR ELEMENTOS DE UI
    // ============================================

    /**
     * Crea el banner de estado offline
     */
    function createOfflineBanner() {
        offlineBanner = document.createElement('div');
        offlineBanner.className = 'offline-banner';
        offlineBanner.id = 'offlineBanner';
        offlineBanner.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
            </svg>
            <span>Modo sin conexión - Los cambios se sincronizarán cuando vuelva internet</span>
        `;
        document.body.insertBefore(offlineBanner, document.body.firstChild);
    }

    /**
     * Crea el indicador de conexión para el header
     */
    function createConnectionIndicator() {
        connectionIndicator = document.createElement('div');
        connectionIndicator.className = 'connection-status online';
        connectionIndicator.id = 'connectionStatus';
        connectionIndicator.innerHTML = `
            <span class="connection-status-dot"></span>
            <span>En línea</span>
        `;

        // Insertar en el header
        const headerRight = document.querySelector('.header-right');
        if (headerRight) {
            headerRight.insertBefore(connectionIndicator, headerRight.firstChild);
        }
    }

    /**
     * Crea el badge de sincronización pendiente
     */
    function createSyncBadge() {
        syncBadge = document.createElement('div');
        syncBadge.className = 'sync-pending-badge';
        syncBadge.id = 'syncPendingBadge';
        syncBadge.style.display = 'none';
        syncBadge.innerHTML = `
            <svg class="sync-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 4v6h-6M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <span id="syncCount">0</span> pendientes
        `;

        const headerRight = document.querySelector('.header-right');
        if (headerRight && connectionIndicator) {
            headerRight.insertBefore(syncBadge, connectionIndicator.nextSibling);
        }
    }

    /**
     * Crea indicador en la barra lateral
     */
    function createSidebarIndicator() {
        const sidebarNav = document.querySelector('.sidebar-nav');
        if (!sidebarNav) return;

        const sidebarConnection = document.createElement('div');
        sidebarConnection.className = 'sidebar-connection online';
        sidebarConnection.id = 'sidebarConnection';
        sidebarConnection.innerHTML = `
            <span class="connection-status-dot"></span>
            <span>Conectado</span>
        `;

        // Insertar al inicio del nav
        sidebarNav.insertBefore(sidebarConnection, sidebarNav.firstChild);
    }

    // ============================================
    // ACTUALIZAR UI
    // ============================================

    /**
     * Actualiza la UI según el estado de conexión
     */
    function updateConnectionStatus(online) {
        // Banner offline
        if (offlineBanner) {
            if (online) {
                offlineBanner.classList.remove('show');
                document.body.classList.remove('offline-mode');
            } else {
                offlineBanner.classList.add('show');
                document.body.classList.add('offline-mode');
            }
        }

        // Indicador del header
        if (connectionIndicator) {
            connectionIndicator.className = `connection-status ${online ? 'online' : 'offline'}`;
            connectionIndicator.innerHTML = `
                <span class="connection-status-dot"></span>
                <span>${online ? 'En línea' : 'Sin conexión'}</span>
            `;
        }

        // Indicador del sidebar
        const sidebarConnection = document.getElementById('sidebarConnection');
        if (sidebarConnection) {
            sidebarConnection.className = `sidebar-connection ${online ? 'online' : 'offline'}`;
            sidebarConnection.innerHTML = `
                <span class="connection-status-dot"></span>
                <span>${online ? 'Conectado' : 'Sin conexión'}</span>
            `;
        }

        // Notificar al usuario si reconectó
        if (online && typeof showToast === 'function') {
            // Verificar si hay operaciones pendientes
            checkPendingSync();
        }
    }

    /**
     * Actualiza el badge de sincronización pendiente
     */
    async function updateSyncBadge() {
        if (!syncBadge || typeof OfflineStorage === 'undefined') return;

        try {
            const pendingCount = await OfflineStorage.getPendingSyncCount();
            const countEl = document.getElementById('syncCount');

            if (pendingCount > 0) {
                syncBadge.style.display = 'flex';
                if (countEl) countEl.textContent = pendingCount;
            } else {
                syncBadge.style.display = 'none';
            }
        } catch (error) {
            console.error('[OfflineUI] Error actualizando sync badge:', error);
        }
    }

    /**
     * Muestra estado de sincronización en progreso
     */
    function showSyncing(show) {
        if (!syncBadge) return;

        if (show) {
            syncBadge.classList.add('syncing');
            syncBadge.innerHTML = `
                <svg class="sync-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 4v6h-6M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
                <span>Sincronizando...</span>
            `;
            syncBadge.style.display = 'flex';
        } else {
            syncBadge.classList.remove('syncing');
            updateSyncBadge();
        }
    }

    /**
     * Verificar y notificar sobre sync pendiente
     */
    async function checkPendingSync() {
        if (typeof OfflineStorage === 'undefined') return;

        const pendingCount = await OfflineStorage.getPendingSyncCount();
        if (pendingCount > 0 && typeof showToast === 'function') {
            showToast(`Sincronizando ${pendingCount} cambios...`, 'info');
        }
    }

    // ============================================
    // INICIALIZACIÓN
    // ============================================

    /**
     * Inicializa todos los componentes de UI offline
     */
    function init() {
        if (isInitialized) return;

        // Solo inicializar si el modo offline está habilitado
        if (typeof CONFIG === 'undefined' || !CONFIG.OFFLINE?.ENABLED) {
            console.log('[OfflineUI] Modo offline deshabilitado');
            return;
        }

        console.log('[OfflineUI] Inicializando componentes de UI...');

        // Crear elementos
        createOfflineBanner();
        createConnectionIndicator();
        createSyncBadge();
        createSidebarIndicator();

        // Escuchar cambios de conexión
        if (typeof ConnectionMonitor !== 'undefined') {
            ConnectionMonitor.onStatusChange(updateConnectionStatus);

            // Estado inicial
            updateConnectionStatus(ConnectionMonitor.isOnline());
        }

        // Escuchar eventos de sincronización
        if (typeof SyncManager !== 'undefined') {
            SyncManager.onSync((event, data) => {
                switch (event) {
                    case 'start':
                        showSyncing(true);
                        break;
                    case 'complete':
                        showSyncing(false);
                        // Solo mostrar notificación si realmente se sincronizaron cambios
                        if (data?.push?.processed > 0 && typeof showToast === 'function') {
                            showToast(`${data.push.processed} cambios sincronizados`, 'success');
                        }
                        break;
                    case 'error':
                        showSyncing(false);
                        if (typeof showToast === 'function') {
                            showToast('Error de sincronización', 'error');
                        }
                        break;
                }
            });
        }

        // Actualizar badge periódicamente
        setInterval(updateSyncBadge, 10000);
        updateSyncBadge();

        isInitialized = true;
        console.log('[OfflineUI] Componentes de UI inicializados');
    }

    // Auto-inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            // Pequeño delay para asegurar que otros scripts estén listos
            setTimeout(init, 500);
        });
    } else {
        setTimeout(init, 500);
    }

    return {
        init,
        updateConnectionStatus,
        updateSyncBadge,
        showSyncing
    };
})();
