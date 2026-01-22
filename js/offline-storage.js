// ============================================
// GIMNASIO VELTRONIK - OFFLINE STORAGE
// ============================================
// Sistema de almacenamiento local usando IndexedDB
// Permite funcionamiento sin conexión a internet

const OfflineStorage = (function () {
    const DB_NAME = 'veltronik_offline_db';
    const DB_VERSION = 1;
    let db = null;

    // Stores (tablas) que necesitamos
    const STORES = {
        MEMBERS: 'members',
        MEMBER_PAYMENTS: 'member_payments',
        CLASSES: 'classes',
        CLASS_BOOKINGS: 'class_bookings',
        ACCESS_LOGS: 'access_logs',
        SYNC_QUEUE: 'sync_queue',  // Cola de operaciones pendientes
        CACHE_META: 'cache_meta'   // Metadata de caché
    };

    // ============================================
    // INICIALIZACIÓN DE LA BASE DE DATOS
    // ============================================

    /**
     * Inicializa la base de datos IndexedDB
     * @returns {Promise<IDBDatabase>}
     */
    async function initDB() {
        if (db) return db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('[OfflineStorage] Error abriendo IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                db = request.result;
                console.log('[OfflineStorage] Base de datos inicializada');
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                console.log('[OfflineStorage] Creando/actualizando esquema...');

                // Members store
                if (!database.objectStoreNames.contains(STORES.MEMBERS)) {
                    const membersStore = database.createObjectStore(STORES.MEMBERS, { keyPath: 'id' });
                    membersStore.createIndex('gym_id', 'gym_id', { unique: false });
                    membersStore.createIndex('dni', 'dni', { unique: false });
                    membersStore.createIndex('status', 'status', { unique: false });
                    membersStore.createIndex('updated_at', 'updated_at', { unique: false });
                }

                // Member Payments store
                if (!database.objectStoreNames.contains(STORES.MEMBER_PAYMENTS)) {
                    const paymentsStore = database.createObjectStore(STORES.MEMBER_PAYMENTS, { keyPath: 'id' });
                    paymentsStore.createIndex('gym_id', 'gym_id', { unique: false });
                    paymentsStore.createIndex('member_id', 'member_id', { unique: false });
                    paymentsStore.createIndex('payment_date', 'payment_date', { unique: false });
                }

                // Classes store
                if (!database.objectStoreNames.contains(STORES.CLASSES)) {
                    const classesStore = database.createObjectStore(STORES.CLASSES, { keyPath: 'id' });
                    classesStore.createIndex('gym_id', 'gym_id', { unique: false });
                    classesStore.createIndex('day_of_week', 'day_of_week', { unique: false });
                }

                // Class Bookings store
                if (!database.objectStoreNames.contains(STORES.CLASS_BOOKINGS)) {
                    const bookingsStore = database.createObjectStore(STORES.CLASS_BOOKINGS, { keyPath: 'id' });
                    bookingsStore.createIndex('gym_id', 'gym_id', { unique: false });
                    bookingsStore.createIndex('class_id', 'class_id', { unique: false });
                    bookingsStore.createIndex('booking_date', 'booking_date', { unique: false });
                }

                // Access Logs store
                if (!database.objectStoreNames.contains(STORES.ACCESS_LOGS)) {
                    const logsStore = database.createObjectStore(STORES.ACCESS_LOGS, { keyPath: 'id' });
                    logsStore.createIndex('gym_id', 'gym_id', { unique: false });
                    logsStore.createIndex('member_id', 'member_id', { unique: false });
                    logsStore.createIndex('check_in_at', 'check_in_at', { unique: false });
                }

                // Sync Queue store - para operaciones pendientes
                if (!database.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                    const queueStore = database.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
                    queueStore.createIndex('table', 'table', { unique: false });
                    queueStore.createIndex('operation', 'operation', { unique: false });
                    queueStore.createIndex('created_at', 'created_at', { unique: false });
                    queueStore.createIndex('status', 'status', { unique: false });
                }

                // Cache Meta store - para tracking de sincronización
                if (!database.objectStoreNames.contains(STORES.CACHE_META)) {
                    database.createObjectStore(STORES.CACHE_META, { keyPath: 'key' });
                }

                console.log('[OfflineStorage] Esquema creado correctamente');
            };
        });
    }

    // ============================================
    // OPERACIONES GENÉRICAS DE BASE DE DATOS
    // ============================================

    /**
     * Obtiene un registro por ID
     */
    async function getById(storeName, id) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Obtiene todos los registros de un store
     */
    async function getAll(storeName) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Obtiene registros por índice
     */
    async function getByIndex(storeName, indexName, value) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Inserta o actualiza un registro
     */
    async function put(storeName, data) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Inserta o actualiza múltiples registros
     */
    async function putMany(storeName, dataArray) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);

            let completed = 0;
            dataArray.forEach(item => {
                const request = store.put(item);
                request.onsuccess = () => {
                    completed++;
                    if (completed === dataArray.length) resolve(completed);
                };
                request.onerror = () => reject(request.error);
            });

            if (dataArray.length === 0) resolve(0);
        });
    }

    /**
     * Elimina un registro por ID
     */
    async function deleteById(storeName, id) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Limpia todos los registros de un store
     */
    async function clearStore(storeName) {
        await initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    // ============================================
    // OPERACIONES ESPECÍFICAS - MEMBERS
    // ============================================

    async function getAllMembers() {
        return await getAll(STORES.MEMBERS);
    }

    async function getMemberById(id) {
        return await getById(STORES.MEMBERS, id);
    }

    async function saveMember(member) {
        // Agregar timestamp de modificación local
        member._localUpdatedAt = new Date().toISOString();
        return await put(STORES.MEMBERS, member);
    }

    async function saveMembers(members) {
        const timestamp = new Date().toISOString();
        const membersWithTimestamp = members.map(m => ({
            ...m,
            _localUpdatedAt: timestamp
        }));
        return await putMany(STORES.MEMBERS, membersWithTimestamp);
    }

    async function deleteMemberLocal(id) {
        return await deleteById(STORES.MEMBERS, id);
    }

    // ============================================
    // OPERACIONES ESPECÍFICAS - MEMBER PAYMENTS
    // ============================================

    async function getAllPayments() {
        return await getAll(STORES.MEMBER_PAYMENTS);
    }

    async function getPaymentById(id) {
        return await getById(STORES.MEMBER_PAYMENTS, id);
    }

    async function getPaymentsByMember(memberId) {
        return await getByIndex(STORES.MEMBER_PAYMENTS, 'member_id', memberId);
    }

    async function savePayment(payment) {
        payment._localUpdatedAt = new Date().toISOString();
        return await put(STORES.MEMBER_PAYMENTS, payment);
    }

    async function savePayments(payments) {
        const timestamp = new Date().toISOString();
        const paymentsWithTimestamp = payments.map(p => ({
            ...p,
            _localUpdatedAt: timestamp
        }));
        return await putMany(STORES.MEMBER_PAYMENTS, paymentsWithTimestamp);
    }

    async function deletePaymentLocal(id) {
        return await deleteById(STORES.MEMBER_PAYMENTS, id);
    }

    // ============================================
    // OPERACIONES ESPECÍFICAS - CLASSES
    // ============================================

    async function getAllClasses() {
        return await getAll(STORES.CLASSES);
    }

    async function getClassById(id) {
        return await getById(STORES.CLASSES, id);
    }

    async function saveClass(classData) {
        classData._localUpdatedAt = new Date().toISOString();
        return await put(STORES.CLASSES, classData);
    }

    async function saveClasses(classes) {
        const timestamp = new Date().toISOString();
        const classesWithTimestamp = classes.map(c => ({
            ...c,
            _localUpdatedAt: timestamp
        }));
        return await putMany(STORES.CLASSES, classesWithTimestamp);
    }

    async function deleteClassLocal(id) {
        return await deleteById(STORES.CLASSES, id);
    }

    // ============================================
    // OPERACIONES ESPECÍFICAS - CLASS BOOKINGS
    // ============================================

    async function getAllBookings() {
        return await getAll(STORES.CLASS_BOOKINGS);
    }

    async function getBookingsByDate(date) {
        return await getByIndex(STORES.CLASS_BOOKINGS, 'booking_date', date);
    }

    async function getBookingsForClass(classId) {
        return await getByIndex(STORES.CLASS_BOOKINGS, 'class_id', classId);
    }

    async function saveBooking(booking) {
        booking._localUpdatedAt = new Date().toISOString();
        return await put(STORES.CLASS_BOOKINGS, booking);
    }

    async function saveBookings(bookings) {
        const timestamp = new Date().toISOString();
        const bookingsWithTimestamp = bookings.map(b => ({
            ...b,
            _localUpdatedAt: timestamp
        }));
        return await putMany(STORES.CLASS_BOOKINGS, bookingsWithTimestamp);
    }

    // ============================================
    // OPERACIONES ESPECÍFICAS - ACCESS LOGS
    // ============================================

    async function getAllAccessLogs() {
        return await getAll(STORES.ACCESS_LOGS);
    }

    async function getAccessLogById(id) {
        return await getById(STORES.ACCESS_LOGS, id);
    }

    async function getTodayAccessLogs() {
        const today = new Date().toISOString().split('T')[0];
        const logs = await getAll(STORES.ACCESS_LOGS);
        return logs.filter(log => log.check_in_at && log.check_in_at.startsWith(today));
    }

    async function saveAccessLog(log) {
        log._localUpdatedAt = new Date().toISOString();
        return await put(STORES.ACCESS_LOGS, log);
    }

    async function saveAccessLogs(logs) {
        const timestamp = new Date().toISOString();
        const logsWithTimestamp = logs.map(l => ({
            ...l,
            _localUpdatedAt: timestamp
        }));
        return await putMany(STORES.ACCESS_LOGS, logsWithTimestamp);
    }

    // ============================================
    // COLA DE SINCRONIZACIÓN
    // ============================================

    /**
     * Agrega una operación a la cola de sincronización
     * @param {string} table - Nombre de la tabla
     * @param {string} operation - 'create', 'update', 'delete'
     * @param {object} data - Datos de la operación
     * @param {string} recordId - ID del registro afectado
     */
    async function addToSyncQueue(table, operation, data, recordId) {
        const queueItem = {
            table,
            operation,
            data,
            record_id: recordId,
            created_at: new Date().toISOString(),
            status: 'pending',
            attempts: 0,
            last_error: null
        };
        return await put(STORES.SYNC_QUEUE, queueItem);
    }

    /**
     * Obtiene todas las operaciones pendientes
     */
    async function getPendingSyncOperations() {
        const all = await getAll(STORES.SYNC_QUEUE);
        return all.filter(item => item.status === 'pending');
    }

    /**
     * Obtiene el conteo de operaciones pendientes
     */
    async function getPendingSyncCount() {
        const pending = await getPendingSyncOperations();
        return pending.length;
    }

    /**
     * Marca una operación como completada
     */
    async function markSyncCompleted(id) {
        const item = await getById(STORES.SYNC_QUEUE, id);
        if (item) {
            item.status = 'completed';
            item.completed_at = new Date().toISOString();
            await put(STORES.SYNC_QUEUE, item);
        }
        // Limpiar operaciones completadas
        await cleanupCompletedSync();
    }

    /**
     * Marca una operación como fallida
     */
    async function markSyncFailed(id, error) {
        const item = await getById(STORES.SYNC_QUEUE, id);
        if (item) {
            item.attempts++;
            item.last_error = error;
            if (item.attempts >= 5) {
                item.status = 'failed';
            }
            await put(STORES.SYNC_QUEUE, item);
        }
    }

    /**
     * Limpia operaciones completadas (más de 1 hora)
     */
    async function cleanupCompletedSync() {
        const all = await getAll(STORES.SYNC_QUEUE);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        for (const item of all) {
            if (item.status === 'completed' && item.completed_at < oneHourAgo) {
                await deleteById(STORES.SYNC_QUEUE, item.id);
            }
        }
    }

    // ============================================
    // METADATA DE CACHÉ
    // ============================================

    /**
     * Guarda metadata de sincronización
     */
    async function setMeta(key, value) {
        return await put(STORES.CACHE_META, { key, value, updated_at: new Date().toISOString() });
    }

    /**
     * Obtiene metadata de sincronización
     */
    async function getMeta(key) {
        const result = await getById(STORES.CACHE_META, key);
        return result ? result.value : null;
    }

    /**
     * Obtiene la última vez que se sincronizó una tabla
     */
    async function getLastSyncTime(table) {
        return await getMeta(`last_sync_${table}`);
    }

    /**
     * Guarda la última vez que se sincronizó una tabla
     */
    async function setLastSyncTime(table) {
        return await setMeta(`last_sync_${table}`, new Date().toISOString());
    }

    // ============================================
    // UTILIDADES
    // ============================================

    /**
     * Genera un UUID temporal para registros offline
     */
    function generateTempId() {
        return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Verifica si un ID es temporal (creado offline)
     */
    function isTempId(id) {
        return typeof id === 'string' && id.startsWith('temp_');
    }

    /**
     * Limpia toda la base de datos (usar con cuidado)
     */
    async function clearAllData() {
        await clearStore(STORES.MEMBERS);
        await clearStore(STORES.MEMBER_PAYMENTS);
        await clearStore(STORES.CLASSES);
        await clearStore(STORES.CLASS_BOOKINGS);
        await clearStore(STORES.ACCESS_LOGS);
        await clearStore(STORES.SYNC_QUEUE);
        await clearStore(STORES.CACHE_META);
        console.log('[OfflineStorage] Todos los datos locales eliminados');
    }

    /**
     * Obtiene estadísticas del almacenamiento
     */
    async function getStorageStats() {
        const members = await getAll(STORES.MEMBERS);
        const payments = await getAll(STORES.MEMBER_PAYMENTS);
        const classes = await getAll(STORES.CLASSES);
        const bookings = await getAll(STORES.CLASS_BOOKINGS);
        const accessLogs = await getAll(STORES.ACCESS_LOGS);
        const pending = await getPendingSyncCount();

        return {
            members: members.length,
            payments: payments.length,
            classes: classes.length,
            bookings: bookings.length,
            accessLogs: accessLogs.length,
            pendingSync: pending
        };
    }

    // ============================================
    // API PÚBLICA
    // ============================================

    return {
        // Inicialización
        init: initDB,
        STORES,

        // Members
        getAllMembers,
        getMemberById,
        saveMember,
        saveMembers,
        deleteMemberLocal,

        // Payments
        getAllPayments,
        getPaymentById,
        getPaymentsByMember,
        savePayment,
        savePayments,
        deletePaymentLocal,

        // Classes
        getAllClasses,
        getClassById,
        saveClass,
        saveClasses,
        deleteClassLocal,

        // Bookings
        getAllBookings,
        getBookingsByDate,
        getBookingsForClass,
        saveBooking,
        saveBookings,

        // Access Logs
        getAllAccessLogs,
        getAccessLogById,
        getTodayAccessLogs,
        saveAccessLog,
        saveAccessLogs,

        // Sync Queue
        addToSyncQueue,
        getPendingSyncOperations,
        getPendingSyncCount,
        markSyncCompleted,
        markSyncFailed,

        // Meta
        getMeta,
        setMeta,
        getLastSyncTime,
        setLastSyncTime,

        // Utils
        generateTempId,
        isTempId,
        clearAllData,
        getStorageStats
    };
})();

// Auto-inicializar cuando se carga
if (typeof window !== 'undefined') {
    OfflineStorage.init().catch(err => {
        console.error('[OfflineStorage] Error en inicialización:', err);
    });
}
