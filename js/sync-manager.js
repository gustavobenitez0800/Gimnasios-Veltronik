// ============================================
// GIMNASIO VELTRONIK - SYNC MANAGER
// ============================================
// Gestor de sincronización bidireccional offline/online

const SyncManager = (function () {
    let isSyncing = false;
    let syncListeners = [];
    let autoSyncInterval = null;

    const SYNC_INTERVAL = 30000;
    const MAX_RETRY_ATTEMPTS = 5;
    const RETRY_DELAY_BASE = 1000;

    // ============================================
    // PULL (servidor → local)
    // ============================================

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
                log(`[SyncManager] Sincronizados ${data.length} miembros`);
            }
            return { success: true, count: data?.length || 0 };
        } catch (error) {
            logWarn('[SyncManager] Error sincronizando miembros:', error);
            return { success: false, error: error.message };
        }
    }

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
                log(`[SyncManager] Sincronizados ${data.length} pagos`);
            }
            return { success: true, count: data?.length || 0 };
        } catch (error) {
            logWarn('[SyncManager] Error sincronizando pagos:', error);
            return { success: false, error: error.message };
        }
    }

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
                log(`[SyncManager] Sincronizadas ${data.length} clases`);
            }
            return { success: true, count: data?.length || 0 };
        } catch (error) {
            logWarn('[SyncManager] Error sincronizando clases:', error);
            return { success: false, error: error.message };
        }
    }

    async function syncFromServer() {
        if (!ConnectionMonitor.isOnline()) {
            log('[SyncManager] Sin conexión, saltando pull');
            return { success: false, error: 'Offline' };
        }

        log('[SyncManager] Iniciando pull desde servidor...');
        const results = {
            members: await syncMembersFromServer(),
            payments: await syncPaymentsFromServer(),
            classes: await syncClassesFromServer()
        };
        log('[SyncManager] Pull completado:', results);
        return results;
    }

    // ============================================
    // PUSH (local → servidor)
    // ============================================

    async function processQueueItem(item) {
        const client = getSupabase();
        if (!client) throw new Error('No Supabase client');

        const { table, operation, data, record_id } = item;

        switch (operation) {
            case 'create': return await processCreate(client, table, data);
            case 'update': return await processUpdate(client, table, record_id, data);
            case 'delete': return await processDelete(client, table, record_id);
            default: throw new Error(`Operación desconocida: ${operation}`);
        }
    }

    async function processCreate(client, table, data) {
        const cleanData = { ...data };
        delete cleanData._localUpdatedAt;
        delete cleanData._isOffline;

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

        if (OfflineStorage.isTempId(tempId)) {
            await updateLocalIdAfterSync(table, tempId, result.id, result);
        }
        return result;
    }

    async function processUpdate(client, table, recordId, data) {
        const cleanData = { ...data };
        delete cleanData._localUpdatedAt;
        delete cleanData._isOffline;
        delete cleanData.id;

        const { data: result, error } = await client
            .from(table)
            .update(cleanData)
            .eq('id', recordId)
            .select()
            .single();

        if (error) throw error;
        await updateLocalRecord(table, recordId, result);
        return result;
    }

    async function processDelete(client, table, recordId) {
        const { error } = await client
            .from(table)
            .delete()
            .eq('id', recordId);

        if (error) throw error;
        return { deleted: true };
    }

    async function updateLocalIdAfterSync(table, tempId, realId, newData) {
        const handlers = {
            members: ['deleteMemberLocal', 'saveMember'],
            member_payments: ['deletePaymentLocal', 'savePayment'],
            classes: ['deleteClassLocal', 'saveClass']
        };
        const h = handlers[table];
        if (h) {
            await OfflineStorage[h[0]](tempId);
            await OfflineStorage[h[1]](newData);
        }
    }

    async function updateLocalRecord(table, id, data) {
        const saveMap = {
            members: 'saveMember',
            member_payments: 'savePayment',
            classes: 'saveClass',
            access_logs: 'saveAccessLog'
        };
        const fn = saveMap[table];
        if (fn) await OfflineStorage[fn](data);
    }

    async function syncToServer() {
        if (!ConnectionMonitor.isOnline()) {
            log('[SyncManager] Sin conexión, saltando push');
            return { success: false, error: 'Offline' };
        }

        const pendingItems = await OfflineStorage.getPendingSyncOperations();
        if (pendingItems.length === 0) {
            log('[SyncManager] No hay operaciones pendientes');
            return { success: true, processed: 0 };
        }

        log(`[SyncManager] Procesando ${pendingItems.length} operaciones pendientes...`);
        let processed = 0;
        let failed = 0;

        for (const item of pendingItems) {
            try {
                await processQueueItem(item);
                await OfflineStorage.markSyncCompleted(item.id);
                processed++;
                log(`[SyncManager] Operación ${item.id} completada: ${item.operation} en ${item.table}`);
            } catch (error) {
                logWarn(`[SyncManager] Error en operación ${item.id}:`, error);
                await OfflineStorage.markSyncFailed(item.id, error.message);
                failed++;
            }
        }

        log(`[SyncManager] Push completado: ${processed} exitosas, ${failed} fallidas`);
        return { success: true, processed, failed };
    }

    // ============================================
    // SYNC COMPLETA
    // ============================================

    async function sync() {
        if (isSyncing) {
            log('[SyncManager] Sincronización ya en progreso, saltando...');
            return { success: false, error: 'Already syncing' };
        }

        if (!ConnectionMonitor.isOnline()) {
            log('[SyncManager] Sin conexión');
            return { success: false, error: 'Offline' };
        }

        isSyncing = true;
        notifySyncListeners('start');

        try {
            log('[SyncManager] === INICIANDO SYNC ===');
            const pushResult = await syncToServer();
            const pullResult = await syncFromServer();
            log('[SyncManager] === SYNC COMPLETADA ===');

            notifySyncListeners('complete', { push: pushResult, pull: pullResult });
            return { success: true, push: pushResult, pull: pullResult };
        } catch (error) {
            logWarn('[SyncManager] Error en sincronización:', error);
            notifySyncListeners('error', error);
            return { success: false, error: error.message };
        } finally {
            isSyncing = false;
        }
    }

    // ============================================
    // AUTO-SYNC
    // ============================================

    function startAutoSync() {
        if (autoSyncInterval) return;
        autoSyncInterval = setInterval(async () => {
            if (ConnectionMonitor.isOnline()) await sync();
        }, SYNC_INTERVAL);
        log(`[SyncManager] Auto-sync iniciado (cada ${SYNC_INTERVAL / 1000}s)`);
    }

    function stopAutoSync() {
        if (autoSyncInterval) {
            clearInterval(autoSyncInterval);
            autoSyncInterval = null;
            log('[SyncManager] Auto-sync detenido');
        }
    }

    // ============================================
    // LISTENERS
    // ============================================

    function onSync(callback) {
        syncListeners.push(callback);
        return () => { syncListeners = syncListeners.filter(cb => cb !== callback); };
    }

    function notifySyncListeners(event, data = null) {
        syncListeners.forEach(callback => {
            try { callback(event, data); }
            catch (error) { logWarn('[SyncManager] Error en listener:', error); }
        });
        window.dispatchEvent(new CustomEvent('sync-status', {
            detail: { event, data, timestamp: new Date() }
        }));
    }

    // ============================================
    // ESTADO
    // ============================================

    async function getStatus() {
        const pendingCount = await OfflineStorage.getPendingSyncCount();
        const lastSyncMembers = await OfflineStorage.getLastSyncTime('members');
        const lastSyncPayments = await OfflineStorage.getLastSyncTime('member_payments');

        return {
            isSyncing,
            pendingOperations: pendingCount,
            lastSync: { members: lastSyncMembers, payments: lastSyncPayments },
            autoSyncActive: autoSyncInterval !== null
        };
    }

    async function hasPendingSync() {
        return (await OfflineStorage.getPendingSyncCount()) > 0;
    }

    // ============================================
    // INIT
    // ============================================

    async function init() {
        ConnectionMonitor.onStatusChange(async (online) => {
            if (online) {
                log('[SyncManager] Conexión recuperada, sincronizando...');
                setTimeout(() => sync(), 2000);
            }
        });

        startAutoSync();
        if (ConnectionMonitor.isOnline()) {
            setTimeout(() => sync(), 3000);
        }
        log('[SyncManager] Inicializado');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }

    return {
        sync, syncFromServer, syncToServer,
        startAutoSync, stopAutoSync,
        getStatus, hasPendingSync, isSyncing: () => isSyncing,
        onSync
    };
})();
