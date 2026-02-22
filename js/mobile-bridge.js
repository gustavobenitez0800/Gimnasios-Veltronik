/**
 * ============================================
 * VELTRONIK - MOBILE BRIDGE (HARDWARE ABSTRACTION)
 * ============================================
 * Unifica la API de hardware para Electron (PC) y Capacitor (Móvil).
 * 
 * Uso:
 * await MobileBridge.scanQR();
 * await MobileBridge.vibrate();
 */

const MobileBridge = (function () {

    // Detect environment
    const isElectron = !!(window && window.electronAPI);
    const isCapacitor = !!(window && window.Capacitor && window.Capacitor.isNativePlatform());
    const isWeb = !isElectron && !isCapacitor;

    log(`[MobileBridge] Environment: ${isElectron ? 'ELECTRON' : isCapacitor ? 'MOBILE' : 'WEB'}`);

    return {
        // ============================================
        // QR & BARCODE SCANNING
        // ============================================

        async scanQR() {
            if (isElectron) {
                // En PC, usamos la webcam USB o esperamos input de teclado (lector físico)
                log('[MobileBridge] PC: Esperando lector físico o webcam USB...');
                // Aquí podríamos integrar una librería JS de QR para webcam
                alert('En PC: Usa el lector de código de barras físico o la webcam (No implementado visualmente aún).');
                return { success: false, method: 'electron' };
            }

            if (isCapacitor) {
                // En Móvil, usamos el plugin nativo de Cámara
                try {
                    // Import dinámico para no romper en PC si no existe
                    // const { BarcodeScanner } = await import('@capacitor-community/barcode-scanner');
                    // Simulación por ahora hasta tener el plugin instalado
                    log('[MobileBridge] Mobile: Abriendo cámara nativa...');
                    return new Promise((resolve) => {
                        // Mock de respuesta para pruebas
                        setTimeout(() => {
                            resolve({ success: true, content: '12345678', format: 'QR_CODE' });
                        }, 2000);
                    });
                } catch (e) {
                    console.error('[MobileBridge] Error scanning:', e);
                    return { success: false, error: e };
                }
            }

            // Web Fallback
            alert('Versión Web: No se admite escaneo nativo.');
            return { success: false, error: 'not_implemented' };
        },

        // ============================================
        // HAPTICS & FEEDBACK
        // ============================================

        async vibrate(duration = 200) {
            if (isCapacitor) {
                try {
                    // const { Haptics } = await import('@capacitor/haptics');
                    // await Haptics.vibrate({ duration });
                    if (navigator.vibrate) navigator.vibrate(duration);
                } catch (e) { console.error(e); }
            } else if (isElectron) {
                // No hay vibración en PC, quizás un sonido
                this.playSound('beep');
            }
        },

        playSound(type = 'success') {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'success') {
                osc.frequency.setValueAtTime(523.25, ctx.currentTime);
                osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
            } else {
                osc.frequency.setValueAtTime(150, ctx.currentTime);
                osc.type = 'sawtooth';
            }

            gain.gain.value = 0.1;
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
        },

        // ============================================
        // GEO-LOCATION
        // ============================================

        async getLocation() {
            return new Promise((resolve, reject) => {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => resolve({
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude
                        }),
                        (err) => reject(err)
                    );
                } else {
                    reject('Geolocation not supported');
                }
            });
        },

        // ============================================
        // INFO DEL DISPOSITIVO
        // ============================================

        async getDeviceInfo() {
            if (isCapacitor) {
                // const { Device } = await import('@capacitor/device');
                // return await Device.getInfo();
                return { platform: 'android', model: 'Generic Android' };
            }
            return { platform: isElectron ? 'windows' : 'web', model: navigator.userAgent };
        },

        // Environment Checkers
        isMobile: () => isCapacitor,
        isDesktop: () => isElectron,
        isWeb: () => isWeb
    };

})();

// Export globally
window.MobileBridge = MobileBridge;
