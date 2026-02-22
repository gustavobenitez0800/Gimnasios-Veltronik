/**
 * ============================================
 * VELTRONIK - CLIENTE BIOMÉTRICO
 * ============================================
 * 
 * Módulo JavaScript del lado del cliente que provee
 * una interfaz unificada para interactuar con dispositivos
 * biométricos (huella, facial, RFID) a través de Electron.
 * 
 * Soporta:
 * - Lectores RFID/Código de barras (modo teclado)
 * - Lectores USB HID directos
 * - Integración con Supabase para persistencia
 */

(function () {
    'use strict';

    // ============================================
    // CLASE PRINCIPAL
    // ============================================

    class BiometricsClient {
        constructor() {
            this.isElectron = this._checkElectron();
            this.isCapturing = false;
            this.captureCallback = null;
            this.accessCallback = null;
            this.keyboardBuffer = '';
            this.keyboardTimeout = null;

            // Configuración para detección de códigos
            this.config = {
                KEYBOARD_TIMEOUT: 150,  // ms entre teclas
                MIN_CODE_LENGTH: 4,
                MAX_CODE_LENGTH: 20
            };

            // Si estamos en Electron, configurar listeners
            if (this.isElectron) {
                this._setupElectronListeners();
            }

            // Siempre configurar listener de teclado para modo web
            this._setupKeyboardListener();

            log('[BiometricsClient] Inicializado. Electron:', this.isElectron);
        }

        // ============================================
        // VERIFICACIÓN DE ENTORNO
        // ============================================

        _checkElectron() {
            return !!(window.electronAPI && window.electronAPI.biometrics);
        }

        /**
         * Verificar si biométricos está disponible
         * @returns {boolean}
         */
        isAvailable() {
            // En Electron siempre disponible
            // En web, solo modo "teclado" (lectores que emulan teclado)
            return true;
        }

        // ============================================
        // GESTIÓN DE DISPOSITIVOS
        // ============================================

        /**
         * Obtener dispositivos biométricos disponibles
         * @returns {Promise<Array>}
         */
        async getDevices() {
            if (this.isElectron) {
                return await window.electronAPI.biometrics.getDevices();
            }

            // En modo web, solo reportar modo teclado
            return [{
                id: 'web-keyboard-mode',
                name: 'Lector RFID/Código de Barras',
                type: 'rfid_card',
                mode: 'keyboard',
                status: 'ready',
                description: 'Lectores que emulan teclado (disponible en web)'
            }];
        }

        /**
         * Obtener estado del módulo biométrico
         * @returns {Promise<Object>}
         */
        async getStatus() {
            if (this.isElectron) {
                return await window.electronAPI.biometrics.getStatus();
            }

            return {
                isCapturing: this.isCapturing,
                captureMode: 'keyboard',
                devices: await this.getDevices()
            };
        }

        // ============================================
        // CAPTURA DE DATOS
        // ============================================

        /**
         * Iniciar captura biométrica
         * @param {Object} options - { mode: 'keyboard' }
         * @param {Function} callback - Función a llamar cuando se capture un código
         * @returns {Promise<{success: boolean, mode?: string, error?: string}>}
         */
        async startCapture(options = {}, callback) {
            if (this.isCapturing) {
                return { success: false, error: 'Ya hay una captura en progreso' };
            }

            this.captureCallback = callback;
            this.isCapturing = true;

            const mode = options.mode || 'keyboard';

            if (this.isElectron) {
                const result = await window.electronAPI.biometrics.startCapture({ mode });
                if (!result.success) {
                    this.isCapturing = false;
                    this.captureCallback = null;
                }
                return result;
            }

            log('[BiometricsClient] Captura iniciada (modo web)');
            return { success: true, mode };
        }

        /**
         * Detener captura biométrica
         * @returns {Promise<{success: boolean}>}
         */
        async stopCapture() {
            this.captureCallback = null;
            this.isCapturing = false;
            this.keyboardBuffer = '';

            if (this.keyboardTimeout) {
                clearTimeout(this.keyboardTimeout);
                this.keyboardTimeout = null;
            }

            if (this.isElectron) {
                return await window.electronAPI.biometrics.stopCapture();
            }

            log('[BiometricsClient] Captura detenida');
            return { success: true };
        }

        /**
         * Iniciar modo de acceso continuo (para control de acceso)
         * @param {Function} callback - Se llama cuando se detecta un código
         */
        async startAccessMode(callback) {
            this.accessCallback = callback;
            return await this.startCapture({ mode: 'keyboard' }, (data) => {
                if (this.accessCallback) {
                    this.accessCallback(data);
                }
            });
        }

        /**
         * Detener modo de acceso continuo
         */
        async stopAccessMode() {
            this.accessCallback = null;
            return await this.stopCapture();
        }

        // ============================================
        // LISTENERS
        // ============================================

        /**
         * Configurar listeners de Electron
         */
        _setupElectronListeners() {
            window.electronAPI.biometrics.onDataCaptured((data) => {
                log('[BiometricsClient] Datos capturados:', data);
                if (this.captureCallback) {
                    this.captureCallback(data);
                }
            });

            window.electronAPI.biometrics.onDevicesUpdated((devices) => {
                log('[BiometricsClient] Dispositivos actualizados:', devices);
            });

            window.electronAPI.biometrics.onInvalidCode((data) => {
                log('[BiometricsClient] Código inválido:', data.code);
            });
        }

        /**
         * Configurar listener de teclado para modo web
         * Detecta entradas rápidas de lectores RFID
         */
        _setupKeyboardListener() {
            document.addEventListener('keydown', (event) => {
                // Solo procesar si estamos capturando y no estamos en un input
                if (!this.isCapturing) return;

                const activeElement = document.activeElement;
                const isInputField = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    activeElement.isContentEditable
                );

                // Si estamos en un campo de entrada, no interceptar
                // a menos que sea un campo especialmente marcado para biométricos
                if (isInputField && !activeElement.dataset.biometricInput) {
                    return;
                }

                // Limpiar timeout anterior
                if (this.keyboardTimeout) {
                    clearTimeout(this.keyboardTimeout);
                }

                // Enter = fin de código
                if (event.key === 'Enter') {
                    if (this.keyboardBuffer.length >= this.config.MIN_CODE_LENGTH) {
                        this._processCode(this.keyboardBuffer);
                    }
                    this.keyboardBuffer = '';
                    event.preventDefault();
                    return;
                }

                // Agregar al buffer si es carácter válido
                if (/^[a-zA-Z0-9]$/.test(event.key)) {
                    this.keyboardBuffer += event.key;
                    event.preventDefault();
                }

                // Timeout - si no hay más input, procesar lo que tenemos
                this.keyboardTimeout = setTimeout(() => {
                    if (this.keyboardBuffer.length >= this.config.MIN_CODE_LENGTH) {
                        this._processCode(this.keyboardBuffer);
                    }
                    this.keyboardBuffer = '';
                }, this.config.KEYBOARD_TIMEOUT);
            });
        }

        /**
         * Procesar un código capturado
         * @param {string} code
         */
        _processCode(code) {
            if (!code || code.length < this.config.MIN_CODE_LENGTH) {
                return;
            }

            if (code.length > this.config.MAX_CODE_LENGTH) {
                code = code.substring(0, this.config.MAX_CODE_LENGTH);
            }

            // Validar formato
            const validPatterns = [
                /^[0-9]{4,20}$/,           // Solo números
                /^[A-F0-9]{8,16}$/i,       // Hexadecimal
                /^[A-Z0-9]{4,20}$/i        // Alfanumérico
            ];

            const isValid = validPatterns.some(pattern => pattern.test(code));

            if (!isValid) {
                log('[BiometricsClient] Código inválido:', code);
                return;
            }

            log('[BiometricsClient] Código procesado:', code);

            // Generar hash simple del código
            const hash = this._simpleHash(code);

            const data = {
                type: 'rfid_card',
                code: code,
                hash: hash,
                timestamp: new Date().toISOString(),
                mode: 'keyboard'
            };

            if (this.captureCallback) {
                this.captureCallback(data);
            }
        }

        /**
         * Hash simple para códigos
         * @param {string} str
         * @returns {string}
         */
        _simpleHash(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return 'CARD_' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
        }

        // ============================================
        // INTEGRACIÓN CON BASE DE DATOS
        // ============================================

        /**
         * Registrar tarjeta RFID a un socio
         * @param {string} memberId - ID del socio
         * @param {string} cardCode - Código de la tarjeta
         * @param {string} gymId - ID del gimnasio
         * @returns {Promise<Object>}
         */
        async registerCard(memberId, cardCode, gymId) {
            const hash = this._simpleHash(cardCode);

            const { data, error } = await window.supabase
                .from('member_biometrics')
                .upsert({
                    gym_id: gymId,
                    member_id: memberId,
                    biometric_type: 'rfid_card',
                    card_code: cardCode,
                    template_hash: hash,
                    status: 'active',
                    enrolled_at: new Date().toISOString()
                }, {
                    onConflict: 'member_id,biometric_type,template_hash',
                    ignoreDuplicates: false
                })
                .select();

            if (error) throw error;
            return data;
        }

        /**
         * Eliminar biométrico de un socio
         * @param {string} memberId
         * @param {string} biometricType
         * @returns {Promise<Object>}
         */
        async removeBiometric(memberId, biometricType) {
            const { data, error } = await window.supabase
                .from('member_biometrics')
                .update({ status: 'revoked' })
                .eq('member_id', memberId)
                .eq('biometric_type', biometricType)
                .eq('status', 'active')
                .select();

            if (error) throw error;
            return data;
        }

        /**
         * Obtener biométricos registrados de un socio
         * @param {string} memberId
         * @returns {Promise<Array>}
         */
        async getMemberBiometrics(memberId) {
            const { data, error } = await window.supabase
                .from('member_biometrics')
                .select('*')
                .eq('member_id', memberId)
                .eq('status', 'active');

            if (error) throw error;
            return data || [];
        }

        /**
         * Buscar socio por código de tarjeta RFID
         * @param {string} cardCode - Código de la tarjeta
         * @param {string} gymId - ID del gimnasio
         * @returns {Promise<Object|null>}
         */
        async findMemberByCard(cardCode, gymId) {
            const { data, error } = await window.supabase
                .rpc('get_member_by_card', {
                    p_card_code: cardCode,
                    p_gym_id: gymId
                });

            if (error) {
                console.error('[BiometricsClient] Error buscando socio:', error);
                return null;
            }

            return data && data.length > 0 ? data[0] : null;
        }

        /**
         * Buscar socio por código QR
         * @param {string} qrCode
         * @param {string} gymId
         * @returns {Promise<Object|null>}
         */
        async findMemberByQR(qrCode, gymId) {
            const { data, error } = await window.supabase
                .rpc('get_member_by_qr', {
                    p_qr_code: qrCode,
                    p_gym_id: gymId
                });

            if (error) {
                console.error('[BiometricsClient] Error buscando socio por QR:', error);
                return null;
            }

            return data && data.length > 0 ? data[0] : null;
        }

        /**
         * Generar código QR para un socio
         * @param {string} memberId
         * @param {string} gymId
         * @param {number} expiresInDays - Opcional, días hasta expiración
         * @returns {Promise<string>} - Código QR generado
         */
        async generateMemberQR(memberId, gymId, expiresInDays = null) {
            const { data, error } = await window.supabase
                .rpc('generate_member_qr', {
                    p_member_id: memberId,
                    p_gym_id: gymId,
                    p_expires_in_days: expiresInDays
                });

            if (error) throw error;
            return data;
        }

        // ============================================
        // INTEGRACIÓN CON CONTROL DE ACCESO FÍSICO
        // ============================================

        /**
         * Activar dispositivo de acceso físico (molinete/puerta)
         * @param {Object} options - { duration?: number }
         * @returns {Promise<{success: boolean}>}
         */
        async triggerAccessGrant(options = {}) {
            if (this.isElectron && window.electronAPI.accessControl) {
                return await window.electronAPI.accessControl.grantAccess(options);
            }
            // En web, solo registrar en consola
            log('[BiometricsClient] Acceso otorgado (sin hardware)');
            return { success: true };
        }

        /**
         * Denegar acceso con feedback
         * @param {string} reason - Motivo de la denegación
         * @returns {Promise<{success: boolean}>}
         */
        async triggerAccessDeny(reason = 'Sin autorización') {
            if (this.isElectron && window.electronAPI.accessControl) {
                return await window.electronAPI.accessControl.denyAccess({ reason });
            }
            log('[BiometricsClient] Acceso denegado:', reason);
            return { success: true };
        }

        /**
         * Obtener estado del controlador de acceso físico
         * @returns {Promise<Object>}
         */
        async getAccessControlStatus() {
            if (this.isElectron && window.electronAPI.accessControl) {
                return await window.electronAPI.accessControl.getStatus();
            }
            return { enabled: false, deviceType: 'none' };
        }

        /**
         * Obtener dispositivos de acceso disponibles
         * @returns {Promise<Array>}
         */
        async getAccessDevices() {
            if (this.isElectron && window.electronAPI.accessControl) {
                return await window.electronAPI.accessControl.getDevices();
            }
            return [];
        }

        /**
         * Configurar dispositivo de acceso
         * @param {Object} config - Configuración del dispositivo
         * @returns {Promise<{success: boolean, config?: Object, error?: string}>}
         */
        async configureAccessDevice(config) {
            if (this.isElectron && window.electronAPI.accessControl) {
                return await window.electronAPI.accessControl.configure(config);
            }
            return { success: false, error: 'Solo disponible en Electron' };
        }

        /**
         * Probar conexión con dispositivo de acceso
         * @returns {Promise<{success: boolean, message?: string, error?: string}>}
         */
        async testAccessConnection() {
            if (this.isElectron && window.electronAPI.accessControl) {
                return await window.electronAPI.accessControl.testConnection();
            }
            return { success: false, error: 'Solo disponible en Electron' };
        }

        /**
         * Configurar listener de eventos de acceso
         */
        setupAccessControlListeners() {
            if (this.isElectron && window.electronAPI.accessControl) {
                window.electronAPI.accessControl.onOpened((data) => {
                    log('[BiometricsClient] Acceso abierto:', data);
                    this._onAccessOpened(data);
                });

                window.electronAPI.accessControl.onClosed((data) => {
                    log('[BiometricsClient] Acceso cerrado:', data);
                    this._onAccessClosed(data);
                });

                window.electronAPI.accessControl.onDenied((data) => {
                    log('[BiometricsClient] Acceso denegado:', data);
                    this._onAccessDenied(data);
                });

                window.electronAPI.accessControl.onFeedback((data) => {
                    // Reproducir sonido de feedback
                    this._playAccessFeedback(data.type);
                });
            }
        }

        // Callbacks para eventos de acceso (pueden ser sobrescritos)
        _onAccessOpened(data) { }
        _onAccessClosed(data) { }
        _onAccessDenied(data) { }

        /**
         * Reproducir sonido de feedback de acceso
         * @param {string} type - 'success' o 'error'
         */
        _playAccessFeedback(type) {
            if (!window.AudioContext && !window.webkitAudioContext) return;

            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(audioCtx.destination);

                if (type === 'success') {
                    // Melodía de éxito: Do-Mi
                    oscillator.frequency.value = 523.25; // Do5
                    oscillator.type = 'sine';
                    gainNode.gain.value = 0.3;
                    oscillator.start(audioCtx.currentTime);
                    oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.15); // Mi5
                    oscillator.stop(audioCtx.currentTime + 0.3);
                } else {
                    // Sonido de error: tono bajo
                    oscillator.frequency.value = 200;
                    oscillator.type = 'square';
                    gainNode.gain.value = 0.2;
                    oscillator.start(audioCtx.currentTime);
                    oscillator.stop(audioCtx.currentTime + 0.5);
                }
            } catch (e) {
                // Ignorar errores de audio
            }
        }
    }

    // ============================================
    // EXPORTAR INSTANCIA GLOBAL
    // ============================================

    // Crear instancia global
    window.biometricsClient = new BiometricsClient();

    // Configurar listeners de control de acceso
    if (window.biometricsClient.isElectron) {
        window.biometricsClient.setupAccessControlListeners();
    }

    // También exportar la clase por si se necesita crear múltiples instancias
    window.BiometricsClient = BiometricsClient;

})();
