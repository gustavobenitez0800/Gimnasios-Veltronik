/**
 * ============================================
 * VELTRONIK - MOTOR DE CONTROL DE ACCESOS
 * ============================================
 * 
 * Motor de validación de acceso del lado del cliente.
 * Coordina la interfaz entre dispositivos físicos,
 * biometría, base de datos y reglas de negocio.
 * 
 * Flujo principal:
 * 1. Credencial recibida (RFID/QR/facial/huella/manual)
 * 2. Identificación del socio (Supabase o caché offline)
 * 3. Validación de autorización (membresía, horario, antipassback, capacidad)
 * 4. Activación del dispositivo (grant/deny)
 * 5. Registro del evento (log + sync)
 * 
 * Diseñado para funcionar tanto online como offline.
 */

class AccessControlEngine {
    constructor() {
        // Dependencias (se inyectan al inicializar)
        this.supabase = null;
        this.gymId = null;
        this.offlineStorage = null;
        this.syncManager = null;

        // Estado
        this.isInitialized = false;
        this.isOnline = navigator.onLine;
        this.activeDeviceId = null; // Dispositivo principal de acceso
        this.authorizedMembersCache = new Map(); // member credential -> member data
        this.accessHistory = []; // Últimos 50 accesos
        this.currentOccupancy = 0;

        // Callbacks
        this.onAccessGranted = null;
        this.onAccessDenied = null;
        this.onMemberIdentified = null;
        this.onError = null;
        this.onStatusUpdate = null;

        // Config
        this.config = {
            antipassbackMinutes: 30,
            maxCapacity: null,
            offlineMode: true,
            cacheRefreshInterval: 5 * 60 * 1000, // 5 minutos
            autoGrantOnMatch: true, // Abrir automáticamente al match
        };

        // Timers
        this._cacheTimer = null;
        this._onlineChecker = null;
    }

    // ============================================
    // INICIALIZACIÓN
    // ============================================

    async init(options = {}) {
        const { supabase, gymId, offlineStorage, syncManager, config } = options;

        this.supabase = supabase;
        this.gymId = gymId;
        this.offlineStorage = offlineStorage;
        this.syncManager = syncManager;

        if (config) {
            Object.assign(this.config, config);
        }

        // Monitorear conectividad
        window.addEventListener('online', () => {
            this.isOnline = true;
            this._refreshCache();
            this._emitStatus('online');
        });
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this._emitStatus('offline');
        });

        // Cargar caché de socios autorizados
        await this._refreshCache();

        // Auto-refresh del caché
        this._cacheTimer = setInterval(() => {
            this._refreshCache();
        }, this.config.cacheRefreshInterval);

        // Calcular ocupación actual
        await this._calculateOccupancy();

        // Escuchar credenciales desde dispositivos (Electron)
        this._listenForDeviceCredentials();

        this.isInitialized = true;
        log('[AccessEngine] Motor inicializado. Socios en caché:', this.authorizedMembersCache.size);

        return this;
    }

    // ============================================
    // FLUJO PRINCIPAL DE ACCESO
    // ============================================

    /**
     * Procesar un intento de acceso completo.
     * Este es el método principal que orquesta todo el flujo.
     * 
     * @param {Object} params
     * @param {string} params.credentialType - 'rfid' | 'nfc' | 'qr' | 'fingerprint' | 'facial' | 'manual' | 'pin'
     * @param {string} params.credentialValue - Código de la credencial
     * @param {string} [params.deviceId] - ID del dispositivo que originó el evento
     * @param {string} [params.direction] - 'in' o 'out'
     * @param {Object} [params.memberData] - Datos del socio (si ya se identificó, ej: facial)
     * @returns {Object} { authorized, result, member, reason }
     */
    async processAccess(params) {
        const { credentialType, credentialValue, deviceId, direction = 'in', memberData } = params;
        const startTime = Date.now();

        log(`[AccessEngine] Procesando acceso: ${credentialType} = ${credentialValue?.substring(0, 8)}...`);

        try {
            // ── PASO 1: Identificar socio ──
            let member = memberData || null;

            if (!member) {
                member = await this.identifyMember(credentialType, credentialValue);
            }

            if (!member) {
                const result = {
                    authorized: false,
                    result: 'denied_no_credential',
                    reason: 'Credencial no reconocida',
                    credentialType,
                    credentialValue
                };
                await this._handleDenied(result, deviceId);
                return result;
            }

            // Callback de identificación
            if (this.onMemberIdentified) {
                this.onMemberIdentified(member, credentialType);
            }

            // ── PASO 2: Validar autorización ──
            const validation = await this.validateAccess(member, deviceId, credentialType);

            if (!validation.authorized) {
                const result = {
                    ...validation,
                    member,
                    credentialType,
                    credentialValue
                };
                await this._handleDenied(result, deviceId);
                return result;
            }

            // ── PASO 3: Otorgar acceso ──
            const grantResult = await this._handleGranted(member, credentialType, credentialValue, deviceId, direction);

            const elapsed = Date.now() - startTime;
            log(`[AccessEngine] Acceso procesado en ${elapsed}ms: ${grantResult.result} para ${member.full_name || member.member_name}`);

            return grantResult;

        } catch (error) {
            console.error('[AccessEngine] Error procesando acceso:', error);
            if (this.onError) this.onError(error);

            return {
                authorized: false,
                result: 'denied_unknown',
                reason: `Error: ${error.message}`,
                credentialType,
                credentialValue
            };
        }
    }

    // ============================================
    // IDENTIFICACIÓN
    // ============================================

    /**
     * Identificar un socio por su credencial
     */
    async identifyMember(credentialType, credentialValue) {
        if (!credentialValue) return null;

        // 1. Buscar en caché local primero (rápido)
        const cacheKey = `${credentialType}:${credentialValue}`;
        const cached = this.authorizedMembersCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        // 2. Si estamos online, buscar en Supabase
        if (this.isOnline && this.supabase) {
            try {
                const { data, error } = await this.supabase.rpc('find_member_by_credential', {
                    p_gym_id: this.gymId,
                    p_credential_type: credentialType,
                    p_credential_value: credentialValue
                });

                if (data && !error) {
                    // Guardar en caché
                    this.authorizedMembersCache.set(cacheKey, data);
                    return data;
                }
            } catch (e) {
                console.warn('[AccessEngine] Error buscando en Supabase:', e.message);
            }
        }

        // 3. Buscar en almacenamiento offline
        if (this.offlineStorage) {
            try {
                const offlineMember = await this._findInOfflineStorage(credentialType, credentialValue);
                if (offlineMember) return offlineMember;
            } catch (e) {
                console.warn('[AccessEngine] Error buscando offline:', e.message);
            }
        }

        // 4. Para acceso manual, buscar por DNI o nombre
        if (credentialType === 'manual') {
            return await this._findByManualSearch(credentialValue);
        }

        return null;
    }

    /**
     * Buscar en almacenamiento offline por credencial
     */
    async _findInOfflineStorage(credentialType, credentialValue) {
        if (!this.offlineStorage) return null;

        try {
            const members = await this.offlineStorage.getAll('members');

            for (const member of members) {
                // El caché offline incluye credenciales en los datos del socio
                if (credentialType === 'rfid' || credentialType === 'nfc') {
                    if (member.card_codes && member.card_codes.includes(credentialValue)) {
                        return this._formatMemberData(member);
                    }
                } else if (credentialType === 'qr') {
                    if (member.qr_codes && member.qr_codes.includes(credentialValue)) {
                        return this._formatMemberData(member);
                    }
                } else if (credentialType === 'fingerprint') {
                    if (member.fingerprint_hashes && member.fingerprint_hashes.includes(credentialValue)) {
                        return this._formatMemberData(member);
                    }
                }
            }
        } catch (e) {
            console.warn('[AccessEngine] Error en búsqueda offline:', e.message);
        }

        return null;
    }

    /**
     * Búsqueda manual por DNI o nombre
     */
    async _findByManualSearch(searchTerm) {
        if (this.isOnline && this.supabase) {
            const { data } = await this.supabase
                .from('members')
                .select('id, full_name, dni, status, membership_end, photo_url')
                .eq('gym_id', this.gymId)
                .or(`dni.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
                .limit(1)
                .single();

            if (data) {
                return {
                    member_id: data.id,
                    member_name: data.full_name,
                    member_status: data.status,
                    membership_end: data.membership_end,
                    photo_url: data.photo_url,
                    dni: data.dni
                };
            }
        }

        return null;
    }

    _formatMemberData(member) {
        return {
            member_id: member.id || member.member_id,
            member_name: member.full_name || member.member_name,
            member_status: member.status || member.member_status,
            membership_end: member.membership_end,
            photo_url: member.photo_url,
            dni: member.dni
        };
    }

    // ============================================
    // VALIDACIÓN
    // ============================================

    /**
     * Validar si un socio tiene autorización para ingresar.
     * Verifica: estado, vencimiento, horario, antipassback, capacidad.
     */
    async validateAccess(member, deviceId, credentialType) {
        const memberId = member.member_id || member.id;
        const memberName = member.member_name || member.full_name;

        // 1. Verificar estado del socio
        if (member.member_status === 'suspended' || member.status === 'suspended') {
            return {
                authorized: false,
                result: 'denied_suspended',
                reason: 'Socio suspendido',
                member_name: memberName
            };
        }

        if (member.member_status === 'inactive' || member.status === 'inactive') {
            return {
                authorized: false,
                result: 'denied_inactive',
                reason: 'Membresía inactiva',
                member_name: memberName
            };
        }

        // 2. Verificar vencimiento
        if (member.membership_end) {
            const endDate = new Date(member.membership_end);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (endDate < today) {
                return {
                    authorized: false,
                    result: 'denied_expired',
                    reason: `Membresía vencida desde ${this._formatDate(endDate)}`,
                    member_name: memberName,
                    expired_date: member.membership_end
                };
            }
        }

        // 3. Validar via RPC de Supabase si estamos online (incluye horario, antipassback, capacidad)
        if (this.isOnline && this.supabase) {
            try {
                const { data, error } = await this.supabase.rpc('validate_member_access', {
                    p_gym_id: this.gymId,
                    p_member_id: memberId,
                    p_device_id: deviceId || null,
                    p_credential_type: credentialType
                });

                if (data && !error) {
                    return data;
                }
            } catch (e) {
                console.warn('[AccessEngine] Validación RPC falló, usando validación local:', e.message);
            }
        }

        // 4. Validación local (offline o fallback)
        return this._validateLocally(member, deviceId);
    }

    /**
     * Validación local sin conexión a Supabase
     */
    _validateLocally(member, deviceId) {
        const memberName = member.member_name || member.full_name;
        const memberId = member.member_id || member.id;

        // Antipassback local
        const lastAccess = this.accessHistory.find(a =>
            a.memberId === memberId && a.result === 'granted'
        );

        if (lastAccess && this.config.antipassbackMinutes > 0) {
            const elapsed = (Date.now() - new Date(lastAccess.timestamp).getTime()) / 60000;
            if (elapsed < this.config.antipassbackMinutes) {
                const remaining = Math.ceil(this.config.antipassbackMinutes - elapsed);
                return {
                    authorized: false,
                    result: 'denied_antipassback',
                    reason: `Antipassback: esperar ${remaining} minutos`,
                    member_name: memberName
                };
            }
        }

        // Capacidad local
        if (this.config.maxCapacity && this.currentOccupancy >= this.config.maxCapacity) {
            return {
                authorized: false,
                result: 'denied_capacity',
                reason: `Capacidad máxima alcanzada (${this.currentOccupancy}/${this.config.maxCapacity})`,
                member_name: memberName
            };
        }

        return {
            authorized: true,
            result: 'granted',
            member_id: memberId,
            member_name: memberName,
            member_photo: member.photo_url,
            membership_end: member.membership_end,
            member_status: member.member_status || member.status
        };
    }

    // ============================================
    // HANDLERS DE RESULTADO
    // ============================================

    async _handleGranted(member, credentialType, credentialValue, deviceId, direction) {
        const memberId = member.member_id || member.id;
        const memberName = member.member_name || member.full_name;

        // 1. Activar dispositivo físico
        const grantDeviceId = deviceId || this.activeDeviceId;
        if (this.config.autoGrantOnMatch) {
            await this._triggerDeviceGrant(grantDeviceId);
        }

        // 2. Registrar evento
        await this._logAccessEvent({
            memberId,
            memberName,
            deviceId: grantDeviceId,
            result: 'granted',
            credentialType,
            credentialValue,
            direction,
            source: this.isOnline ? 'app' : 'offline'
        });

        // 3. Actualizar estado
        this.currentOccupancy++;

        // 4. Agregar al historial local
        this._addToHistory({
            memberId,
            memberName,
            result: 'granted',
            credentialType,
            direction,
            timestamp: new Date().toISOString()
        });

        // 5. Callback
        const result = {
            authorized: true,
            result: 'granted',
            member: {
                member_id: memberId,
                member_name: memberName,
                photo_url: member.photo_url || member.member_photo,
                membership_end: member.membership_end,
                status: member.member_status || member.status
            },
            credentialType,
            direction,
            timestamp: new Date().toISOString()
        };

        if (this.onAccessGranted) {
            this.onAccessGranted(result);
        }

        return result;
    }

    async _handleDenied(result, deviceId) {
        const memberId = result.member?.member_id || result.member?.id;
        const memberName = result.member?.member_name || result.member?.full_name || 'Desconocido';

        // 1. Audio/visual de denegación
        const denyDeviceId = deviceId || this.activeDeviceId;
        await this._triggerDeviceDeny(denyDeviceId, result.reason);

        // 2. Registrar evento
        await this._logAccessEvent({
            memberId,
            memberName,
            deviceId: denyDeviceId,
            result: result.result,
            credentialType: result.credentialType,
            credentialValue: result.credentialValue,
            direction: 'in',
            denialReason: result.reason,
            source: this.isOnline ? 'app' : 'offline'
        });

        // 3. Agregar al historial local
        this._addToHistory({
            memberId,
            memberName,
            result: result.result,
            reason: result.reason,
            credentialType: result.credentialType,
            timestamp: new Date().toISOString()
        });

        // 4. Callback
        if (this.onAccessDenied) {
            this.onAccessDenied(result);
        }
    }

    // ============================================
    // INTERACCIÓN CON DISPOSITIVOS
    // ============================================

    async _triggerDeviceGrant(deviceId) {
        try {
            // Electron
            if (window.electronAPI && window.electronAPI.accessControl) {
                await window.electronAPI.accessControl.grantAccess(deviceId);
            }
        } catch (e) {
            console.warn('[AccessEngine] Error activando dispositivo:', e.message);
        }
    }

    async _triggerDeviceDeny(deviceId, reason) {
        try {
            if (window.electronAPI && window.electronAPI.accessControl) {
                await window.electronAPI.accessControl.denyAccess(deviceId, { reason });
            }
        } catch (e) {
            console.warn('[AccessEngine] Error denegando dispositivo:', e.message);
        }
    }

    /**
     * Escuchar credenciales provenientes de dispositivos físicos (via Electron IPC)
     */
    _listenForDeviceCredentials() {
        if (window.electronAPI && window.electronAPI.accessControl) {
            window.electronAPI.accessControl.onCredentialReceived((data) => {
                log('[AccessEngine] Credencial del dispositivo:', data);

                // Auto-procesar
                this.processAccess({
                    credentialType: data.source === 'webhook' ? (data.eventType || 'rfid') : 'rfid',
                    credentialValue: data.data,
                    deviceId: data.deviceId,
                    direction: 'in'
                });
            });
        }
    }

    // ============================================
    // LOGGING
    // ============================================

    async _logAccessEvent(event) {
        const {
            memberId, memberName, deviceId, result,
            credentialType, credentialValue, direction,
            denialReason, source
        } = event;

        // 1. Log en Supabase (si online)
        if (this.isOnline && this.supabase) {
            try {
                await this.supabase.rpc('log_access_event', {
                    p_gym_id: this.gymId,
                    p_member_id: memberId || null,
                    p_device_id: deviceId || null,
                    p_authorization_result: result,
                    p_credential_type: credentialType || 'manual',
                    p_credential_id: credentialValue || null,
                    p_direction: direction || 'in',
                    p_denial_reason: denialReason || null,
                    p_source: source || 'app',
                    p_access_method: credentialType || 'manual'
                });
            } catch (e) {
                console.warn('[AccessEngine] Error loggeando en Supabase:', e.message);
                // Guardar offline para sincronizar después
                await this._logOffline(event);
            }
        } else {
            // Guardar offline
            await this._logOffline(event);
        }
    }

    async _logOffline(event) {
        if (!this.offlineStorage) return;

        try {
            await this.offlineStorage.add('pendingAccessLogs', {
                ...event,
                id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                timestamp: new Date().toISOString(),
                synced: false
            });
        } catch (e) {
            console.error('[AccessEngine] Error guardando log offline:', e.message);
        }
    }

    // ============================================
    // CACHÉ DE SOCIOS AUTORIZADOS
    // ============================================

    async _refreshCache() {
        if (!this.isOnline || !this.supabase) return;

        try {
            const { data, error } = await this.supabase.rpc('get_authorized_members_for_cache', {
                p_gym_id: this.gymId
            });

            if (data && !error) {
                this.authorizedMembersCache.clear();

                for (const member of data) {
                    const memberData = {
                        member_id: member.member_id,
                        member_name: member.full_name,
                        member_status: member.status,
                        membership_end: member.membership_end,
                        photo_url: member.photo_url,
                        dni: member.dni
                    };

                    // Indexar por cada credencial
                    if (member.card_codes) {
                        member.card_codes.forEach(code => {
                            this.authorizedMembersCache.set(`rfid:${code}`, memberData);
                            this.authorizedMembersCache.set(`nfc:${code}`, memberData);
                        });
                    }
                    if (member.qr_codes) {
                        member.qr_codes.forEach(code => {
                            this.authorizedMembersCache.set(`qr:${code}`, memberData);
                        });
                    }
                    if (member.fingerprint_hashes) {
                        member.fingerprint_hashes.forEach(hash => {
                            this.authorizedMembersCache.set(`fingerprint:${hash}`, memberData);
                        });
                    }
                }

                log(`[AccessEngine] Caché actualizado: ${this.authorizedMembersCache.size} credenciales de ${data.length} socios`);

                // Guardar también en offline storage para modo sin conexión
                if (this.offlineStorage) {
                    try {
                        await this.offlineStorage.clear('authorizedMembers');
                        for (const member of data) {
                            await this.offlineStorage.add('authorizedMembers', member);
                        }
                    } catch (e) {
                        console.warn('[AccessEngine] Error persistiendo caché offline:', e.message);
                    }
                }
            }
        } catch (e) {
            console.warn('[AccessEngine] Error refrescando caché:', e.message);
        }
    }

    // ============================================
    // OCUPACIÓN
    // ============================================

    async _calculateOccupancy() {
        if (this.isOnline && this.supabase) {
            try {
                const today = new Date().toISOString().split('T')[0];
                const { count } = await this.supabase
                    .from('access_logs')
                    .select('*', { count: 'exact', head: true })
                    .eq('gym_id', this.gymId)
                    .gte('check_in_at', today)
                    .is('check_out_at', null)
                    .eq('authorization_result', 'granted');

                this.currentOccupancy = count || 0;
            } catch (e) {
                this.currentOccupancy = 0;
            }
        }
    }

    // ============================================
    // HISTORIAL LOCAL
    // ============================================

    _addToHistory(entry) {
        this.accessHistory.unshift(entry);
        if (this.accessHistory.length > 50) {
            this.accessHistory.pop();
        }
    }

    getAccessHistory() {
        return [...this.accessHistory];
    }

    // ============================================
    // UTILIDADES
    // ============================================

    _formatDate(date) {
        return date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    _emitStatus(status) {
        if (this.onStatusUpdate) {
            this.onStatusUpdate({
                status,
                isOnline: this.isOnline,
                cachedMembers: this.authorizedMembersCache.size,
                occupancy: this.currentOccupancy,
                activeDevice: this.activeDeviceId
            });
        }
    }

    /**
     * Setear el dispositivo activo para grants/denies
     */
    setActiveDevice(deviceId) {
        this.activeDeviceId = deviceId;
        log(`[AccessEngine] Dispositivo activo: ${deviceId}`);
    }

    /**
     * Actualizar configuración en runtime
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
    }

    /**
     * Obtener estadísticas del día
     */
    async getDailyStats() {
        if (this.isOnline && this.supabase) {
            const today = new Date().toISOString().split('T')[0];

            const { data } = await this.supabase
                .from('access_logs')
                .select('authorization_result')
                .eq('gym_id', this.gymId)
                .gte('check_in_at', today);

            if (data) {
                return {
                    total: data.length,
                    granted: data.filter(r => r.authorization_result === 'granted').length,
                    denied: data.filter(r => r.authorization_result !== 'granted').length,
                    occupancy: this.currentOccupancy,
                    timestamp: new Date().toISOString()
                };
            }
        }

        // Offline stats desde historial local
        const granted = this.accessHistory.filter(a => a.result === 'granted').length;
        return {
            total: this.accessHistory.length,
            granted,
            denied: this.accessHistory.length - granted,
            occupancy: this.currentOccupancy,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Destruir y limpiar recursos
     */
    destroy() {
        if (this._cacheTimer) clearInterval(this._cacheTimer);
        if (this._onlineChecker) clearInterval(this._onlineChecker);
        this.authorizedMembersCache.clear();
        this.accessHistory = [];
    }
}

// Export global
window.AccessControlEngine = AccessControlEngine;
