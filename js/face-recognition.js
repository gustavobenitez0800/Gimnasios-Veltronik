/**
 * ============================================
 * VELTRONIK - RECONOCIMIENTO FACIAL
 * ============================================
 * 
 * Módulo profesional de reconocimiento facial que soporta:
 * - Cámara web integrada (PC/notebook)
 * - Cámaras USB externas
 * - Hardware especializado (ZKTeco, Hikvision, etc.)
 * 
 * Usa face-api.js para detección y comparación facial
 * 100% en el navegador, no requiere servidor
 */

(function () {
    'use strict';

    // ============================================
    // CONFIGURACIÓN
    // ============================================

    const CONFIG = {
        // Umbral de similitud para considerar un match (0-1)
        MATCH_THRESHOLD: 0.55,

        // Tamaño mínimo de rostro para captura (px) - reducido para baja resolución
        MIN_FACE_SIZE: 60,

        // Intervalo de detección en ms (aumentado para mejor rendimiento)
        DETECTION_INTERVAL: 300,

        // Número de frames a promediar para estabilidad (reducido)
        FRAMES_TO_AVERAGE: 2,

        // Tiempo máximo de escaneo antes de timeout (ms)
        SCAN_TIMEOUT: 30000,

        // Calidad mínima requerida para el rostro (reducido para TinyFace)
        MIN_DETECTION_CONFIDENCE: 0.6,

        // Tamaño del descriptor facial
        DESCRIPTOR_SIZE: 128,

        // URL de los modelos de face-api.js
        MODELS_URL: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/',

        // Modo lite para PCs de bajo rendimiento
        LITE_MODE: true,

        // Resolución de video (reducida para mejor rendimiento)
        VIDEO_WIDTH: 320,
        VIDEO_HEIGHT: 240,

        // Opciones del TinyFaceDetector
        TINY_OPTIONS: {
            inputSize: 160,  // 128, 160, 224, 320, 416, 512, 608
            scoreThreshold: 0.5
        }
    };

    // ============================================
    // ESTADO DEL MÓDULO
    // ============================================

    let isInitialized = false;
    let isScanning = false;
    let videoStream = null;
    let detectionInterval = null;
    let scanTimeout = null;
    let currentDescriptors = []; // Para promediar múltiples frames
    let registeredFaces = []; // Cache de rostros registrados

    // Referencias a elementos DOM
    let videoElement = null;
    let canvasElement = null;
    let overlayCanvas = null;

    // Callbacks
    let onFaceDetected = null;
    let onFaceMatched = null;
    let onNoMatch = null;
    let onError = null;
    let onQualityUpdate = null;

    // ============================================
    // CLASE PRINCIPAL
    // ============================================

    class FaceRecognition {
        constructor() {
            this.isElectron = this._checkElectron();
        }

        _checkElectron() {
            return typeof window !== 'undefined' &&
                window.electronAPI !== undefined;
        }

        // ============================================
        // INICIALIZACIÓN
        // ============================================

        /**
         * Inicializar el módulo de reconocimiento facial
         * Carga los modelos de face-api.js
         * @returns {Promise<{success: boolean, error?: string}>}
         */
        async initialize() {
            if (isInitialized) {
                return { success: true };
            }

            try {
                // Verificar que face-api.js esté disponible
                if (typeof faceapi === 'undefined') {
                    throw new Error('face-api.js no está cargado. Agregá el script al HTML.');
                }

                // Cargar modelos livianos (TinyFaceDetector en lugar de SSD MobileNet)
                log('[FaceRecognition] Cargando modelos livianos...');

                await Promise.all([
                    // TinyFaceDetector es ~10x más rápido que SSD MobileNet
                    faceapi.nets.tinyFaceDetector.loadFromUri(CONFIG.MODELS_URL),
                    faceapi.nets.faceLandmark68TinyNet.loadFromUri(CONFIG.MODELS_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(CONFIG.MODELS_URL)
                    // Removido: faceExpressionNet (innecesario para control de acceso)
                ]);

                isInitialized = true;
                log('[FaceRecognition] Modelos cargados correctamente');

                return { success: true };
            } catch (error) {
                console.error('[FaceRecognition] Error inicializando:', error);
                return { success: false, error: error.message };
            }
        }

        /**
         * Verificar si el módulo está inicializado
         * @returns {boolean}
         */
        isReady() {
            return isInitialized;
        }

        // ============================================
        // GESTIÓN DE CÁMARA
        // ============================================

        /**
         * Obtener lista de cámaras disponibles
         * @returns {Promise<Array<{deviceId: string, label: string}>>}
         */
        async getCameras() {
            try {
                // Solicitar permiso primero para obtener labels
                await navigator.mediaDevices.getUserMedia({ video: true });

                const devices = await navigator.mediaDevices.enumerateDevices();
                const cameras = devices
                    .filter(device => device.kind === 'videoinput')
                    .map((device, index) => ({
                        deviceId: device.deviceId,
                        label: device.label || `Cámara ${index + 1}`
                    }));

                return cameras;
            } catch (error) {
                console.error('[FaceRecognition] Error obteniendo cámaras:', error);
                return [];
            }
        }

        /**
         * Iniciar la cámara
         * @param {HTMLVideoElement} video - Elemento de video donde mostrar
         * @param {string} deviceId - ID del dispositivo (opcional)
         * @returns {Promise<{success: boolean, error?: string}>}
         */
        async startCamera(video, deviceId = null) {
            try {
                // Detener stream anterior si existe
                this.stopCamera();

                const constraints = {
                    video: {
                        width: { ideal: CONFIG.VIDEO_WIDTH },
                        height: { ideal: CONFIG.VIDEO_HEIGHT },
                        facingMode: 'user',
                        frameRate: { ideal: 15, max: 20 } // Limitado para mejor rendimiento
                    }
                };

                // Si se especifica un dispositivo, usarlo
                if (deviceId) {
                    constraints.video.deviceId = { exact: deviceId };
                }

                videoStream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = videoStream;
                videoElement = video;

                // Esperar a que el video esté listo
                await new Promise((resolve) => {
                    video.onloadedmetadata = () => {
                        video.play();
                        resolve();
                    };
                });

                log('[FaceRecognition] Cámara iniciada');
                return { success: true };
            } catch (error) {
                console.error('[FaceRecognition] Error iniciando cámara:', error);
                let errorMsg = 'Error al acceder a la cámara';

                if (error.name === 'NotAllowedError') {
                    errorMsg = 'Permiso de cámara denegado. Por favor, permitir acceso.';
                } else if (error.name === 'NotFoundError') {
                    errorMsg = 'No se encontró ninguna cámara conectada.';
                } else if (error.name === 'NotReadableError') {
                    errorMsg = 'La cámara está siendo usada por otra aplicación.';
                }

                return { success: false, error: errorMsg };
            }
        }

        /**
         * Detener la cámara
         */
        stopCamera() {
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
                videoStream = null;
            }
            if (videoElement) {
                videoElement.srcObject = null;
            }
            this.stopScanning();
        }

        // ============================================
        // DETECCIÓN Y CAPTURA
        // ============================================

        /**
         * Iniciar escaneo de rostros
         * @param {Object} options - Opciones
         * @param {HTMLCanvasElement} options.overlay - Canvas para dibujar overlay
         * @param {Function} options.onDetected - Callback cuando se detecta un rostro
         * @param {Function} options.onMatched - Callback cuando hay match con DB
         * @param {Function} options.onNoMatch - Callback cuando no hay match
         * @param {Function} options.onQuality - Callback para actualizar calidad
         * @param {Function} options.onError - Callback de error
         */
        async startScanning(options = {}) {
            if (!isInitialized) {
                const init = await this.initialize();
                if (!init.success) {
                    if (options.onError) options.onError(init.error);
                    return { success: false, error: init.error };
                }
            }

            if (!videoElement || !videoStream) {
                const error = 'Cámara no iniciada';
                if (options.onError) options.onError(error);
                return { success: false, error };
            }

            if (isScanning) {
                return { success: true };
            }

            overlayCanvas = options.overlay;
            onFaceDetected = options.onDetected;
            onFaceMatched = options.onMatched;
            onNoMatch = options.onNoMatch;
            onQualityUpdate = options.onQuality;
            onError = options.onError;

            isScanning = true;
            currentDescriptors = [];

            // Iniciar loop de detección
            detectionInterval = setInterval(() => {
                this._detectFrame();
            }, CONFIG.DETECTION_INTERVAL);

            // Timeout de escaneo
            scanTimeout = setTimeout(() => {
                if (isScanning && onNoMatch) {
                    onNoMatch({ reason: 'timeout', message: 'Tiempo de escaneo agotado' });
                }
                this.stopScanning();
            }, CONFIG.SCAN_TIMEOUT);

            log('[FaceRecognition] Escaneo iniciado');
            return { success: true };
        }

        /**
         * Detener escaneo
         */
        stopScanning() {
            isScanning = false;
            currentDescriptors = [];

            if (detectionInterval) {
                clearInterval(detectionInterval);
                detectionInterval = null;
            }

            if (scanTimeout) {
                clearTimeout(scanTimeout);
                scanTimeout = null;
            }

            // Limpiar overlay
            if (overlayCanvas) {
                const ctx = overlayCanvas.getContext('2d');
                ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            }

            log('[FaceRecognition] Escaneo detenido');
        }

        /**
         * Procesar un frame de video
         * @private
         */
        async _detectFrame() {
            if (!isScanning || !videoElement) return;

            try {
                // Usar TinyFaceDetector para mejor rendimiento
                const options = new faceapi.TinyFaceDetectorOptions(CONFIG.TINY_OPTIONS);

                const detections = await faceapi
                    .detectAllFaces(videoElement, options)
                    .withFaceLandmarks(true) // true = usar TinyLandmarks
                    .withFaceDescriptors();

                // Dibujar overlay
                this._drawOverlay(detections);

                if (detections.length === 0) {
                    if (onQualityUpdate) {
                        onQualityUpdate({
                            detected: false,
                            quality: 0,
                            message: 'No se detecta rostro'
                        });
                    }
                    return;
                }

                // Tomar el rostro más grande (más cercano)
                const detection = detections.reduce((prev, curr) =>
                    curr.detection.box.area > prev.detection.box.area ? curr : prev
                );

                const box = detection.detection.box;
                const confidence = detection.detection.score;

                // Verificar tamaño mínimo
                if (box.width < CONFIG.MIN_FACE_SIZE || box.height < CONFIG.MIN_FACE_SIZE) {
                    if (onQualityUpdate) {
                        onQualityUpdate({
                            detected: true,
                            quality: 0.3,
                            message: 'Acercate más a la cámara'
                        });
                    }
                    return;
                }

                // Verificar confianza
                if (confidence < CONFIG.MIN_DETECTION_CONFIDENCE) {
                    if (onQualityUpdate) {
                        onQualityUpdate({
                            detected: true,
                            quality: confidence,
                            message: 'Mejorá la iluminación'
                        });
                    }
                    return;
                }

                // Calidad OK
                if (onQualityUpdate) {
                    onQualityUpdate({
                        detected: true,
                        quality: confidence,
                        message: 'Rostro detectado correctamente',
                        box: box
                    });
                }

                // Callback de detección
                if (onFaceDetected) {
                    onFaceDetected({
                        box: box,
                        confidence: confidence,
                        descriptor: Array.from(detection.descriptor)
                    });
                }

                // Acumular descriptores para promediar
                currentDescriptors.push(detection.descriptor);

                // Si tenemos suficientes frames, intentar match
                if (currentDescriptors.length >= CONFIG.FRAMES_TO_AVERAGE) {
                    await this._tryMatch();
                }

            } catch (error) {
                console.error('[FaceRecognition] Error en detección:', error);
            }
        }

        /**
         * Dibujar overlay en el canvas
         * @private
         */
        _drawOverlay(detections) {
            if (!overlayCanvas || !videoElement) return;

            const ctx = overlayCanvas.getContext('2d');

            // Ajustar canvas al video
            overlayCanvas.width = videoElement.videoWidth;
            overlayCanvas.height = videoElement.videoHeight;

            // Limpiar
            ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            // Dibujar cada detección
            detections.forEach(detection => {
                const box = detection.detection.box;
                const confidence = detection.detection.score;

                // Color según calidad
                let color = '#ef4444'; // Rojo
                if (confidence > CONFIG.MIN_DETECTION_CONFIDENCE &&
                    box.width >= CONFIG.MIN_FACE_SIZE) {
                    color = '#22c55e'; // Verde
                } else if (confidence > 0.6) {
                    color = '#f59e0b'; // Amarillo
                }

                // Dibujar recuadro
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                // Esquinas decorativas
                const cornerLength = 20;
                ctx.lineWidth = 4;

                // Esquina superior izquierda
                ctx.beginPath();
                ctx.moveTo(box.x, box.y + cornerLength);
                ctx.lineTo(box.x, box.y);
                ctx.lineTo(box.x + cornerLength, box.y);
                ctx.stroke();

                // Esquina superior derecha
                ctx.beginPath();
                ctx.moveTo(box.x + box.width - cornerLength, box.y);
                ctx.lineTo(box.x + box.width, box.y);
                ctx.lineTo(box.x + box.width, box.y + cornerLength);
                ctx.stroke();

                // Esquina inferior izquierda
                ctx.beginPath();
                ctx.moveTo(box.x, box.y + box.height - cornerLength);
                ctx.lineTo(box.x, box.y + box.height);
                ctx.lineTo(box.x + cornerLength, box.y + box.height);
                ctx.stroke();

                // Esquina inferior derecha
                ctx.beginPath();
                ctx.moveTo(box.x + box.width - cornerLength, box.y + box.height);
                ctx.lineTo(box.x + box.width, box.y + box.height);
                ctx.lineTo(box.x + box.width, box.y + box.height - cornerLength);
                ctx.stroke();

                // Línea de escaneo animada
                const time = Date.now() % 2000;
                const scanY = box.y + (box.height * (time / 2000));

                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.5;
                ctx.beginPath();
                ctx.moveTo(box.x + 10, scanY);
                ctx.lineTo(box.x + box.width - 10, scanY);
                ctx.stroke();
                ctx.globalAlpha = 1;
            });
        }

        /**
         * Intentar match con la base de datos
         * @private
         */
        async _tryMatch() {
            if (currentDescriptors.length === 0) return;

            // Promediar descriptores para mayor precisión
            const avgDescriptor = this._averageDescriptors(currentDescriptors);
            currentDescriptors = []; // Resetear

            // Buscar en rostros registrados
            let bestMatch = null;
            let bestDistance = Infinity;

            for (const registered of registeredFaces) {
                const distance = faceapi.euclideanDistance(
                    avgDescriptor,
                    new Float32Array(registered.descriptor)
                );

                if (distance < bestDistance && distance < (1 - CONFIG.MATCH_THRESHOLD)) {
                    bestDistance = distance;
                    bestMatch = registered;
                }
            }

            if (bestMatch) {
                const similarity = 1 - bestDistance;
                log(`[FaceRecognition] Match encontrado: ${bestMatch.memberName} (${(similarity * 100).toFixed(1)}%)`);

                if (onFaceMatched) {
                    this.stopScanning();
                    onFaceMatched({
                        member: bestMatch,
                        similarity: similarity,
                        descriptor: Array.from(avgDescriptor)
                    });
                }
            }
        }

        /**
         * Promediar múltiples descriptores
         * @private
         */
        _averageDescriptors(descriptors) {
            if (descriptors.length === 0) return null;
            if (descriptors.length === 1) return descriptors[0];

            const avg = new Float32Array(CONFIG.DESCRIPTOR_SIZE);

            for (let i = 0; i < CONFIG.DESCRIPTOR_SIZE; i++) {
                let sum = 0;
                for (const desc of descriptors) {
                    sum += desc[i];
                }
                avg[i] = sum / descriptors.length;
            }

            return avg;
        }

        // ============================================
        // REGISTRO DE ROSTROS
        // ============================================

        /**
         * Capturar rostro para registro
         * @returns {Promise<{success: boolean, descriptor?: Array, image?: string, error?: string}>}
         */
        async captureForRegistration() {
            if (!isInitialized) {
                await this.initialize();
            }

            if (!videoElement || !videoStream) {
                return { success: false, error: 'Cámara no iniciada' };
            }

            try {
                // Detectar rostro con TinyFaceDetector (más liviano)
                const options = new faceapi.TinyFaceDetectorOptions(CONFIG.TINY_OPTIONS);

                const detections = await faceapi
                    .detectSingleFace(videoElement, options)
                    .withFaceLandmarks(true) // true = TinyLandmarks
                    .withFaceDescriptor();

                if (!detections) {
                    return { success: false, error: 'No se detectó ningún rostro' };
                }

                const confidence = detections.detection.score;
                const box = detections.detection.box;

                if (confidence < CONFIG.MIN_DETECTION_CONFIDENCE) {
                    return { success: false, error: 'Calidad del rostro insuficiente. Mejorá la iluminación.' };
                }

                if (box.width < CONFIG.MIN_FACE_SIZE) {
                    return { success: false, error: 'Rostro muy pequeño. Acercate más a la cámara.' };
                }

                // Capturar imagen del rostro
                const canvas = document.createElement('canvas');
                const padding = 50;
                canvas.width = box.width + padding * 2;
                canvas.height = box.height + padding * 2;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(
                    videoElement,
                    box.x - padding, box.y - padding, canvas.width, canvas.height,
                    0, 0, canvas.width, canvas.height
                );

                const imageData = canvas.toDataURL('image/jpeg', 0.8);

                return {
                    success: true,
                    descriptor: Array.from(detections.descriptor),
                    image: imageData,
                    confidence: confidence
                };

            } catch (error) {
                console.error('[FaceRecognition] Error capturando:', error);
                return { success: false, error: error.message };
            }
        }

        // ============================================
        // GESTIÓN DE ROSTROS REGISTRADOS
        // ============================================

        /**
         * Cargar rostros registrados desde la base de datos
         * @param {Array} faces - Array de {memberId, memberName, descriptor}
         */
        loadRegisteredFaces(faces) {
            registeredFaces = faces.map(face => ({
                memberId: face.memberId,
                memberName: face.memberName,
                memberStatus: face.memberStatus,
                membershipEnd: face.membershipEnd,
                descriptor: face.descriptor
            }));
            log(`[FaceRecognition] ${registeredFaces.length} rostros cargados`);
        }

        /**
         * Agregar un rostro a la cache
         * @param {Object} face - {memberId, memberName, descriptor}
         */
        addRegisteredFace(face) {
            // Remover si ya existe
            registeredFaces = registeredFaces.filter(f => f.memberId !== face.memberId);

            registeredFaces.push({
                memberId: face.memberId,
                memberName: face.memberName,
                memberStatus: face.memberStatus,
                membershipEnd: face.membershipEnd,
                descriptor: face.descriptor
            });
        }

        /**
         * Remover un rostro de la cache
         * @param {string} memberId
         */
        removeRegisteredFace(memberId) {
            registeredFaces = registeredFaces.filter(f => f.memberId !== memberId);
        }

        /**
         * Obtener cantidad de rostros registrados
         * @returns {number}
         */
        getRegisteredCount() {
            return registeredFaces.length;
        }

        // ============================================
        // INTEGRACIÓN CON BASE DE DATOS
        // ============================================

        /**
         * Registrar rostro de un socio en Supabase
         * @param {string} memberId
         * @param {string} gymId
         * @param {Array} descriptor - Array de 128 floats
         * @returns {Promise<{success: boolean, error?: string}>}
         */
        async registerFaceInDB(memberId, gymId, descriptor) {
            if (!window.supabase) {
                return { success: false, error: 'Supabase no disponible' };
            }

            try {
                // Convertir descriptor a hash para almacenar
                const descriptorHash = this._descriptorToHash(descriptor);

                const { data, error } = await window.supabase
                    .from('member_biometrics')
                    .upsert({
                        gym_id: gymId,
                        member_id: memberId,
                        biometric_type: 'facial',
                        template_hash: descriptorHash,
                        status: 'active',
                        enrolled_at: new Date().toISOString()
                    }, {
                        onConflict: 'member_id,biometric_type,template_hash',
                        ignoreDuplicates: false
                    })
                    .select();

                if (error) throw error;

                // Guardar descriptor completo en una tabla separada o localStorage
                // (El descriptor es demasiado grande para template_hash)
                await this._storeDescriptor(memberId, gymId, descriptor);

                return { success: true, data };
            } catch (error) {
                console.error('[FaceRecognition] Error registrando:', error);
                return { success: false, error: error.message };
            }
        }

        /**
         * Cargar todos los rostros registrados del gimnasio
         * @param {string} gymId
         * @returns {Promise<Array>}
         */
        async loadFacesFromDB(gymId) {
            if (!window.supabase) {
                return [];
            }

            try {
                // Obtener registros faciales activos
                const { data: biometrics, error } = await window.supabase
                    .from('member_biometrics')
                    .select(`
                        member_id,
                        template_hash,
                        members!inner(
                            id,
                            full_name,
                            status,
                            membership_end
                        )
                    `)
                    .eq('gym_id', gymId)
                    .eq('biometric_type', 'facial')
                    .eq('status', 'active');

                if (error) throw error;

                // Cargar descriptores completos
                const faces = [];
                for (const bio of biometrics || []) {
                    const descriptor = await this._loadDescriptor(bio.member_id, gymId);
                    if (descriptor) {
                        faces.push({
                            memberId: bio.member_id,
                            memberName: bio.members.full_name,
                            memberStatus: bio.members.status,
                            membershipEnd: bio.members.membership_end,
                            descriptor: descriptor
                        });
                    }
                }

                this.loadRegisteredFaces(faces);
                return faces;
            } catch (error) {
                console.error('[FaceRecognition] Error cargando rostros:', error);
                return [];
            }
        }

        /**
         * Almacenar descriptor facial (en Supabase storage o localStorage)
         * @private
         */
        async _storeDescriptor(memberId, gymId, descriptor) {
            // Por ahora usar localStorage como cache
            // En producción, considerar usar Supabase Storage
            const key = `face_descriptor_${gymId}_${memberId}`;
            localStorage.setItem(key, JSON.stringify(descriptor));
        }

        /**
         * Cargar descriptor facial
         * @private
         */
        async _loadDescriptor(memberId, gymId) {
            const key = `face_descriptor_${gymId}_${memberId}`;
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : null;
        }

        /**
         * Generar hash del descriptor para almacenar en DB
         * @private
         */
        _descriptorToHash(descriptor) {
            // Hash simple para identificación
            let hash = 0;
            const str = descriptor.slice(0, 10).map(n => n.toFixed(4)).join(',');
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return 'FACE_' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
        }

        // ============================================
        // VERIFICACIÓN MANUAL
        // ============================================

        /**
         * Comparar descriptor contra uno específico
         * @param {Array} descriptor1
         * @param {Array} descriptor2
         * @returns {number} Similitud entre 0 y 1
         */
        compareFaces(descriptor1, descriptor2) {
            if (!descriptor1 || !descriptor2) return 0;

            const d1 = new Float32Array(descriptor1);
            const d2 = new Float32Array(descriptor2);
            const distance = faceapi.euclideanDistance(d1, d2);

            return Math.max(0, 1 - distance);
        }

        // ============================================
        // HARDWARE ESPECIALIZADO
        // ============================================

        /**
         * Detectar hardware de reconocimiento facial especializado
         * @returns {Promise<Array>}
         */
        async detectHardware() {
            const hardware = [];

            // Siempre incluir cámara web si hay
            const cameras = await this.getCameras();
            if (cameras.length > 0) {
                hardware.push({
                    id: 'webcam',
                    type: 'camera',
                    name: 'Cámara Web',
                    cameras: cameras,
                    status: 'ready'
                });
            }

            // En Electron, intentar detectar hardware USB
            if (this.isElectron && window.electronAPI.biometrics) {
                try {
                    const devices = await window.electronAPI.biometrics.getDevices();
                    const facialDevices = devices.filter(d =>
                        d.type === 'facial' || d.type === 'fingerprint'
                    );
                    hardware.push(...facialDevices);
                } catch (e) {
                    log('[FaceRecognition] No se detectó hardware USB:', e);
                }
            }

            return hardware;
        }
    }

    // ============================================
    // EXPORTAR INSTANCIA GLOBAL
    // ============================================

    window.faceRecognition = new FaceRecognition();
    window.FaceRecognition = FaceRecognition;

    log('[FaceRecognition] Módulo cargado');

})();
