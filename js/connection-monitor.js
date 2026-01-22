// ============================================
// GIMNASIO VELTRONIK - CONNECTION MONITOR
// ============================================
// Monitor de estado de conexión a internet
// Detecta online/offline y notifica cambios

const ConnectionMonitor = (function () {
    let isOnlineStatus = navigator.onLine;
    let listeners = [];
    let pingInterval = null;
    let lastSuccessfulPing = null;

    // Configuración - Solo usar navigator.onLine para evitar errores 404
    const PING_INTERVAL = 30000;  // 30 segundos

    // ============================================
    // DETECCIÓN DE CONEXIÓN
    // ============================================

    /**
     * Verifica si hay conexión usando navigator.onLine
     * En Electron, esto es suficientemente confiable
     * @returns {boolean}
     */
    function checkConnection() {
        const online = navigator.onLine;
        if (online) {
            lastSuccessfulPing = new Date();
        }
        return online;
    }

    /**
     * Actualiza el estado de conexión y notifica cambios
     */
    function updateStatus() {
        const wasOnline = isOnlineStatus;
        isOnlineStatus = checkConnection();

        // Notificar si hubo cambio
        if (wasOnline !== isOnlineStatus) {
            console.log(`[ConnectionMonitor] Estado cambiado: ${isOnlineStatus ? 'ONLINE' : 'OFFLINE'}`);
            notifyListeners(isOnlineStatus);
        }
    }

    /**
     * Notifica a todos los listeners del cambio
     */
    function notifyListeners(online) {
        listeners.forEach(callback => {
            try {
                callback(online);
            } catch (error) {
                console.error('[ConnectionMonitor] Error en listener:', error);
            }
        });

        // Disparar evento custom
        window.dispatchEvent(new CustomEvent('connection-change', {
            detail: { online, timestamp: new Date() }
        }));
    }

    // ============================================
    // API PÚBLICA
    // ============================================

    /**
     * Inicializa el monitor de conexión
     */
    function init() {
        // Escuchar eventos nativos del navegador
        window.addEventListener('online', () => {
            console.log('[ConnectionMonitor] Evento: online');
            updateStatus();
        });

        window.addEventListener('offline', () => {
            console.log('[ConnectionMonitor] Evento: offline');
            isOnlineStatus = false;
            notifyListeners(false);
        });

        // Iniciar verificación periódica
        pingInterval = setInterval(updateStatus, PING_INTERVAL);

        // Verificar estado inicial
        updateStatus();

        console.log('[ConnectionMonitor] Inicializado');
    }

    /**
     * Retorna si estamos actualmente online
     * @returns {boolean}
     */
    function isOnline() {
        return isOnlineStatus;
    }

    /**
     * Verifica conexión activamente (no usa cache)
     * @returns {boolean}
     */
    function checkOnline() {
        updateStatus();
        return isOnlineStatus;
    }

    /**
     * Registra un listener para cambios de conexión
     * @param {function} callback - Función que recibe boolean (online)
     * @returns {function} Función para remover el listener
     */
    function onStatusChange(callback) {
        listeners.push(callback);

        // Retornar función para remover listener
        return () => {
            listeners = listeners.filter(cb => cb !== callback);
        };
    }

    /**
     * Obtiene el tiempo desde el último ping exitoso
     * @returns {number|null} Milisegundos o null si nunca
     */
    function getTimeSinceLastPing() {
        if (!lastSuccessfulPing) return null;
        return Date.now() - lastSuccessfulPing.getTime();
    }

    /**
     * Obtiene información del estado actual
     */
    function getStatus() {
        return {
            online: isOnlineStatus,
            browserOnline: navigator.onLine,
            lastPing: lastSuccessfulPing,
            timeSinceLastPing: getTimeSinceLastPing()
        };
    }

    /**
     * Detiene el monitor (usar al cerrar la app)
     */
    function stop() {
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
        listeners = [];
    }

    // ============================================
    // INICIALIZACIÓN AUTOMÁTICA
    // ============================================

    // Auto-inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        init,
        isOnline,
        checkOnline,
        onStatusChange,
        getStatus,
        getTimeSinceLastPing,
        stop
    };
})();
