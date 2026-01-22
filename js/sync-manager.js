// ============================================
// GIMNASIO VELTRONIK - SYNC MANAGER
// ============================================
// Gestor de sincronización de datos
// Maneja la sincronización bidireccional offline/online

const SyncManager = (function () {
    let isSyncing = false;
    let syncListeners = [];
    let autoSyncInterval = null;

    // Configuración
    const SYNC_INTERVAL = 30000;  // 30 segundos
    const MAX_RETRY_ATTEMPTS = 5;
    const RETRY_DELAY_BASE = 1000;  // 1 segundo base, exponencial

    // ============================================
    // SINCRONIZACIÓN DESDE SERVIDOR (PULL)
    // ============================================

    /**
     * Descarga y cachea todos los miembros desde Supabase
     */
    async function syncMembersFromServer() {
        try {
            const client = getSupabase();
            if (!client) return { success: false, error: 'No Supabase client' };

            const { data, error } = await client
                .from('members')
                .select('*')
                .order('updated_at', { ascending: false });

            if (error) throw error;

            if (data && data.length > 0) {
                await OfflineStorage.saveMembers(data);
                await OfflineStorage.setLastSyncTime('members');
                console.log(`[SyncManager] Sincronizados ${data.length} miembros desde servidor`);
            }

            return { success: true, count: data?.length || 0 };
        } catch (error) {
            console.error('[SyncManager] Error sincronizando miembros:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Descarga y cachea todos los pagos desde Supabase
     */
    async function syncPaymentsFromServer() {
        try {
            const client = getSupabase();
            if (!client) return { success: false, error: 'No Supabase client' };

            const { data, error } = await client
                .from('member_payments')
                .select('*, member:members(full_name, dni)')
                .order('payment_date', { ascending: false });

            if (error) throw error;

            if (data && data.length > 0) {
                await OfflineStorage.savePayments(data);
                await OfflineStorage.setLastSyncTime('member_payments');
                console.log(`[SyncManager] Sincronizados ${data.length} pagos desde servidor`);
            }

            return { success: true, count: data?.length || 0 };
        } catch (error) {
            console.error('[SyncManager] Error sincronizando pagos:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Descarga y cachea todas las clases desde Supabase
     */
    async function syncClassesFromServer() {
        try {
            const client = getSupabase();
            if (!client) return { success: false, error: 'No Supabase client' };

            const { data, error } = await client
                .from('classes')
                .select('*')
                .order('day_of_week', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                await OfflineStorage.saveClasses(data);
                await OfflineStorage.setLastSyncTime('classes');
                console.log(`[SyncManager] Sincronizadas ${data.length} clases desde servidor`);
            }

            return { success: true, count: data?.length || 0 };
        } catch (error) {
            console.error('[SyncManager] Error sincronizando clases:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Sincroniza todos los datos desde el servidor
     */
    async function syncFromServer() {
        if (!ConnectionMonitor.isOnline()) {
            console.log('[SyncManager] Sin conexión, saltando sync desde servidor');
            return { success: false, error: 'Offline' };
        }

        console.log('[SyncManager] Iniciando sincronización desde servidor...');

        const results = {
            members: await syncMembersFromServer(),
            payments: await syncPaymentsFromServer(),
            classes: await syncClassesFromServer()
        };

        console.log('[SyncManager] Sincronización desde servidor completada:', results);
        return results;
    }

    // ============================================
    // SINCRONIZACIÓN HACIA SERVIDOR (PUSH)
    // ============================================

    /**
     * Procesa una operación de la cola de sincronización
     */
    async function processQueueItem(item) {
        const client = getSupabase();
        if (!client) throw new Error('No Supabase client');

        const { table, operation, data, record_id } = item;

        switch (operation) {
            case 'create':
                return await processCreate(client, table, data);
            case 'update':
                return await processUpdate(client, table, record_id, data);
            case 'delete':
                return await processDelete(client, table, record_id);
            default:
                throw new Error(`Operación desconocida: ${operation}`);
        }
    }

    /**
     * Procesa una operación CREATE
     */
    async function processCreate(client, table, data) {
        // Remover campos locales temporales
        const cleanData = { ...data };
        delete cleanData._localUpdatedAt;
        delete cleanData._isOffline;

        // Si tiene ID temporal, removerlo para que Supabase genere uno real
        const tempId = cleanData.id;
        if (OfflineStorage.isTempId(tempId)) {
            delete cleanData.id;
        }

        const { data: result, error } = await client
            .from(table)
            .insert(cleanData)
            .select()
            .single();

        if (error) throw error;

        // Si tenía ID temporal, actualizar el registro local con el ID real
        if (OfflineStorage.isTempId(tempId)) {
            await updateLocalIdAfterSync(table, tempId, result.id, result);
        }

        return result;
    }

    /**
     * Procesa una operación UPDATE
     */
    async function processUpdate(client, table, recordId, data) {
        // Remover campos locales
        const cleanData = { ...data };
        delete cleanData._localUpdatedAt;
        delete cleanData._isOffline;
        delete cleanData.id;  // No actualizar el ID

        const { data: result, error } = await client
            .from(table)
            .update(cleanData)
            .eq('id', recordId)
            .select()
            .single();

        if (error) throw error;

        // Actualizar el registro local con los datos del servidor
        await updateLocalRecord(table, recordId, result);

        return result;
    }

    /**
     * Procesa una operación DELETE
     */
    async function processDelete(client, table, recordId) {
        const { error } = await client
            .from(table)
            .delete()
            .eq('id', recordId);

        if (error) throw error;
        return { deleted: true };
    }

    /**
     * Actualiza el ID local después de sincronizar un registro temporal
     */
    async function updateLocalIdAfterSync(table, tempId, realId, newData) {
        switch (table) {
            case 'members':
                await OfflineStorage.deleteMemberLocal(tempId);
                await OfflineStorage.saveMember(newData);
                break;
            case 'member_payments':
                await OfflineStorage.deletePaymentLocal(tempId);
                await OfflineStorage.savePayment(newData);
                break;
            case 'classes':
                await OfflineStorage.deleteClassLocal(tempId);
                await OfflineStorage.saveClass(newData);
                break;
        }
    }

    /**
     * Actualiza un registro local con datos frescos del servidor
     */
    async function updateLocalRecord(table, id, data) {
        switch (table) {
            case 'members':
                await OfflineStorage.saveMember(data);
                break;
            case 'member_payments':
                await OfflineStorage.savePayment(data);
                break;
            case 'classes':
                await OfflineStorage.saveClass(data);
                break;
            case 'access_logs':
                await OfflineStorage.saveAccessLog(data);
                break;
        }
    }

    /**
     * Procesa toda la cola de sincronización
     */
    async function syncToServer() {
        if (!ConnectionMonitor.isOnline()) {
            console.log('[SyncManager] Sin conexión, saltando sync hacia servidor');
            return { success: false, error: 'Offline' };
        }

        const pendingItems = await OfflineStorage.getPendingSyncOperations();

        if (pendingItems.length === 0) {
            console.log('[SyncManager] No hay operaciones pendientes');
            return { success: true, processed: 0 };
        }

        console.log(`[SyncManager] Procesando ${pendingItems.length} operaciones pendientes...`);

        let processed = 0;
        let failed = 0;

        for (const item of pendingItems) {
            try {
                await processQueueItem(item);
                await OfflineStorage.markSyncCompleted(item.id);
                processed++;
                console.log(`[SyncManager] Operación ${item.id} completada: ${item.operation} en ${item.table}`);
            } catch (error) {
                console.error(`[SyncManager] Error en operación ${item.id}:`, error);
                await OfflineStorage.markSyncFailed(item.id, error.message);
                failed++;
            }
        }

        console.log(`[SyncManager] Sincronización completada: ${processed} exitosas, ${failed} fallidas`);
        return { success: true, processed, failed };
    }

    // ============================================
    // SINCRONIZACIÓN COMPLETA
    // ============================================

    /**
     * Ejecuta sincronización completa (push + pull)
     */
    async function sync() {
        if (isSyncing) {
            console.log('[SyncManager] Sincronización ya en progreso, saltando...');
            return { success: false, error: 'Already syncing' };
        }

        if (!ConnectionMonitor.isOnline()) {
            console.log('[SyncManager] Sin conexión, no se puede sincronizar');
            return { success: false, error: 'Offline' };
        }

        isSyncing = true;
        notifySyncListeners('start');

        try {
            console.log('[SyncManager] ========== INICIANDO SINCRONIZACIÓN ==========');

            // Primero enviar cambios locales (push)
            const pushResult = await syncToServer();

            // Luego descargar datos frescos (pull)
            const pullResult = await syncFromServer();

            console.log('[SyncManager] ========== SINCRONIZACIÓN COMPLETADA ==========');

            notifySyncListeners('complete', { push: pushResult, pull: pullResult });

            return { success: true, push: pushResult, pull: pullResult };
        } catch (error) {
            console.error('[SyncManager] Error en sincronización:', error);
            notifySyncListeners('error', error);
            return { success: false, error: error.message };
        } finally {
            isSyncing = false;
        }
    }

    // ============================================
    // AUTO-SYNC
    // ============================================

    /**
     * Inicia sincronización automática periódica
     */
    function startAutoSync() {
        if (autoSyncInterval) return;

        autoSyncInterval = setInterval(async () => {
            if (ConnectionMonitor.isOnline()) {
                await sync();
            }
        }, SYNC_INTERVAL);

        console.log(`[SyncManager] Auto-sync iniciado (cada ${SYNC_INTERVAL / 1000}s)`);
    }

    /**
     * Detiene sincronización automática
     */
    function stopAutoSync() {
        if (autoSyncInterval) {
            clearInterval(autoSyncInterval);
            autoSyncInterval = null;
            console.log('[SyncManager] Auto-sync detenido');
        }
    }

    // ============================================
    // LISTENERS
    // ============================================

    /**
     * Registra un listener para eventos de sincronización
     */
    function onSync(callback) {
        syncListeners.push(callback);
        return () => {
            syncListeners = syncListeners.filter(cb => cb !== callback);
        };
    }

    /**
     * Notifica a todos los listeners
     */
    function notifySyncListeners(event, data = null) {
        syncListeners.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('[SyncManager] Error en listener:', error);
            }
        });

        // Disparar evento custom
        window.dispatchEvent(new CustomEvent('sync-status', {
            detail: { event, data, timestamp: new Date() }
        }));
    }

    // ============================================
    // ESTADO
    // ============================================

    /**
     * Obtiene el estado actual de sincronización
     */
    async function getStatus() {
        const pendingCount = await OfflineStorage.getPendingSyncCount();
        const lastSyncMembers = await OfflineStorage.getLastSyncTime('members');
        const lastSyncPayments = await OfflineStorage.getLastSyncTime('member_payments');

        return {
            isSyncing,
            pendingOperations: pendingCount,
            lastSync: {
                members: lastSyncMembers,
                payments: lastSyncPayments
            },
            autoSyncActive: autoSyncInterval !== null
        };
    }

    /**
     * Verifica si hay operaciones pendientes
     */
    async function hasPendingSync() {
        const count = await OfflineStorage.getPendingSyncCount();
        return count > 0;
    }

    // ============================================
    // INICIALIZACIÓN
    // ============================================

    /**
     * Inicializa el sync manager
     */
    async function init() {
        // Escuchar cambios de conexión
        ConnectionMonitor.onStatusChange(async (online) => {
            if (online) {
                console.log('[SyncManager] Conexión recuperada, iniciando sincronización...');
                // Pequeño delay para asegurar que la conexión esté estable
                setTimeout(() => sync(), 2000);
            }
        });

        // Iniciar auto-sync
        startAutoSync();

        // Sincronizar al inicio si hay conexión
        if (ConnectionMonitor.isOnline()) {
            setTimeout(() => sync(), 3000);
        }

        console.log('[SyncManager] Inicializado');
    }

    // Auto-inicializar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Delay para asegurar que otros módulos estén listos
        setTimeout(init, 1000);
    }

    return {
        // Sincronización
        sync,
        syncFromServer,
        syncToServer,

        // Auto-sync
        startAutoSync,
        stopAutoSync,

        // Estado
        getStatus,
        hasPendingSync,
        isSyncing: () => isSyncing,

        // Listeners
        onSync
    };
})();
