/**
 * ============================================
 * VELTRONIK - UI DE CONFIGURACIÓN DE DISPOSITIVOS
 * ============================================
 * 
 * Componente de interfaz para gestionar dispositivos
 * de acceso de forma plug & play.
 * 
 * Funcionalidades:
 * - Detección automática de dispositivos
 * - Agregar/editar/eliminar dispositivos
 * - Panel de estado en tiempo real
 * - Prueba de conexión
 * - Configuración avanzada (horarios, antipassback, capacidad)
 */

class DeviceConfigUI {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        this.devices = [];
        this.presets = [];
        this.detectedDevices = [];
        this.selectedDeviceId = null;

        if (!this.container) {
            console.warn('[DeviceConfigUI] Contenedor no encontrado:', containerSelector);
        }
    }

    // ============================================
    // INICIALIZACIÓN
    // ============================================

    async init() {
        // Cargar presets y dispositivos
        await this.refresh();

        // Escuchar cambios de estado
        if (window.electronAPI && window.electronAPI.accessControl) {
            window.electronAPI.accessControl.onDeviceStatusChanged((data) => {
                this._updateDeviceStatusBadge(data.deviceId, data.status);
            });
        }

        // Renderizar
        this.render();
    }

    async refresh() {
        try {
            if (window.electronAPI && window.electronAPI.accessControl) {
                this.devices = await window.electronAPI.accessControl.listDevices() || [];
                this.presets = await window.electronAPI.accessControl.getPresets() || [];
            }
        } catch (e) {
            console.warn('[DeviceConfigUI] Error cargando dispositivos:', e);
            this.devices = [];
            this.presets = [];
        }
    }

    // ============================================
    // RENDER PRINCIPAL
    // ============================================

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="device-config-panel">
                <!-- Header -->
                <div class="device-panel-header">
                    <div class="device-panel-title">
                        <i class="fas fa-microchip"></i>
                        <h3>Dispositivos de Acceso</h3>
                        <span class="device-count-badge">${this.devices.length}</span>
                    </div>
                    <div class="device-panel-actions">
                        <button class="btn-detect" onclick="deviceConfigUI.detectDevices()" title="Detectar dispositivos automáticamente">
                            <i class="fas fa-search-plus"></i> Detectar
                        </button>
                        <button class="btn-add-device" onclick="deviceConfigUI.showAddModal()">
                            <i class="fas fa-plus"></i> Agregar
                        </button>
                    </div>
                </div>

                <!-- Lista de dispositivos -->
                <div class="device-list" id="deviceList">
                    ${this.devices.length === 0
                ? this._renderEmptyState()
                : this.devices.map(d => this._renderDeviceCard(d)).join('')
            }
                </div>

                <!-- Status bar -->
                <div class="device-status-bar">
                    <span class="status-item">
                        <span class="status-dot ${this.devices.some(d => d.isConnected) ? 'online' : 'offline'}"></span>
                        ${this.devices.filter(d => d.isConnected).length}/${this.devices.length} conectados
                    </span>
                    <span class="status-item webhook-info" id="webhookInfo"></span>
                </div>
            </div>
        `;
    }

    _renderEmptyState() {
        return `
            <div class="device-empty-state">
                <i class="fas fa-plug"></i>
                <p>No hay dispositivos configurados</p>
                <p class="hint">Haz clic en <strong>Detectar</strong> para buscar dispositivos conectados o <strong>Agregar</strong> para configurar manualmente.</p>
            </div>
        `;
    }

    _renderDeviceCard(device) {
        const statusClass = device.isConnected ? 'connected' : (device.status === 'error' ? 'error' : 'disconnected');
        const statusText = device.isConnected ? 'Conectado' : (device.status === 'error' ? 'Error' : 'Desconectado');
        const typeIcon = this._getDeviceIcon(device.type);
        const connectionIcon = this._getConnectionIcon(device.connection);

        return `
            <div class="device-card ${statusClass}" data-device-id="${device.id}">
                <div class="device-card-header">
                    <div class="device-info">
                        <span class="device-icon">${typeIcon}</span>
                        <div>
                            <h4 class="device-name">${this._escapeHtml(device.name)}</h4>
                            <span class="device-type">
                                ${connectionIcon} ${this._getConnectionLabel(device.connection)}
                                ${device.serialPath ? ` · ${device.serialPath}` : ''}
                                ${device.host ? ` · ${device.host}:${device.port}` : ''}
                            </span>
                        </div>
                    </div>
                    <div class="device-status">
                        <span class="status-badge ${statusClass}" id="status-${device.id}">
                            <span class="status-dot ${statusClass}"></span>
                            ${statusText}
                        </span>
                    </div>
                </div>
                
                <div class="device-card-body">
                    <div class="device-features">
                        ${device.antipassbackEnabled ? '<span class="feature-tag"><i class="fas fa-clock"></i> Antipassback</span>' : ''}
                        ${device.maxCapacity ? `<span class="feature-tag"><i class="fas fa-users"></i> Máx ${device.maxCapacity}</span>` : ''}
                        ${device.schedule ? '<span class="feature-tag"><i class="fas fa-calendar-alt"></i> Horario</span>' : ''}
                        ${device.invertedLogic ? '<span class="feature-tag"><i class="fas fa-exchange-alt"></i> Invertido</span>' : ''}
                        ${(device.supportedCredentials || []).map(c =>
            `<span class="credential-tag">${this._getCredentialIcon(c)} ${c.toUpperCase()}</span>`
        ).join('')}
                    </div>
                </div>
                
                <div class="device-card-actions">
                    <button class="btn-device-action btn-test" onclick="deviceConfigUI.testDevice('${device.id}')" title="Probar conexión">
                        <i class="fas fa-bolt"></i> Probar
                    </button>
                    <button class="btn-device-action btn-edit" onclick="deviceConfigUI.showEditModal('${device.id}')" title="Editar configuración">
                        <i class="fas fa-cog"></i> Config
                    </button>
                    <button class="btn-device-action btn-delete" onclick="deviceConfigUI.removeDevice('${device.id}')" title="Eliminar dispositivo">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    // ============================================
    // DETECCIÓN AUTOMÁTICA
    // ============================================

    async detectDevices() {
        const btn = this.container.querySelector('.btn-detect');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
            btn.disabled = true;
        }

        try {
            if (window.electronAPI && window.electronAPI.accessControl) {
                this.detectedDevices = await window.electronAPI.accessControl.detectDevices() || [];
            }

            // Filtrar los que ya están registrados
            const registeredIds = new Set(this.devices.map(d => d.id));
            const newDevices = this.detectedDevices.filter(d => !registeredIds.has(d.id));

            if (newDevices.length > 0) {
                this._showDetectedDevicesModal(newDevices);
            } else {
                this._showNotification('No se encontraron dispositivos nuevos', 'info');
            }
        } catch (e) {
            this._showNotification('Error detectando dispositivos: ' + e.message, 'error');
        } finally {
            if (btn) {
                btn.innerHTML = '<i class="fas fa-search-plus"></i> Detectar';
                btn.disabled = false;
            }
        }
    }

    _showDetectedDevicesModal(devices) {
        const modal = this._createModal('detected-devices-modal', `
            <div class="modal-header">
                <h3><i class="fas fa-search-plus"></i> Dispositivos Detectados</h3>
                <button class="modal-close" onclick="deviceConfigUI.closeModal('detected-devices-modal')">&times;</button>
            </div>
            <div class="modal-body">
                <p class="modal-subtitle">Se encontraron ${devices.length} dispositivo(s). Selecciona los que quieras agregar:</p>
                <div class="detected-devices-list">
                    ${devices.map(d => `
                        <div class="detected-device-item" data-detected-id="${d.id}">
                            <label>
                                <input type="checkbox" value="${d.id}" checked>
                                <div class="detected-device-info">
                                    <span class="detected-icon">${this._getDeviceIcon(d.type || d.connection)}</span>
                                    <div>
                                        <strong>${this._escapeHtml(d.name)}</strong>
                                        <span class="detected-description">${this._escapeHtml(d.description || '')}</span>
                                    </div>
                                </div>
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel" onclick="deviceConfigUI.closeModal('detected-devices-modal')">Cancelar</button>
                <button class="btn-primary" onclick="deviceConfigUI.addDetectedDevices()">
                    <i class="fas fa-plus"></i> Agregar Seleccionados
                </button>
            </div>
        `);

        document.body.appendChild(modal);
    }

    async addDetectedDevices() {
        const modal = document.getElementById('detected-devices-modal');
        const checkboxes = modal.querySelectorAll('input[type="checkbox"]:checked');

        for (const cb of checkboxes) {
            const deviceData = this.detectedDevices.find(d => d.id === cb.value);
            if (deviceData && window.electronAPI) {
                await window.electronAPI.accessControl.registerDevice({
                    name: deviceData.name,
                    type: deviceData.type || 'relay',
                    connection: deviceData.connection || 'simulation',
                    host: deviceData.host,
                    port: deviceData.port,
                    serialPath: deviceData.port, // for serial devices
                    vendorId: deviceData.vendorId,
                    productId: deviceData.productId,
                    supportedCredentials: deviceData.supportedCredentials || ['rfid', 'qr']
                });
            }
        }

        this.closeModal('detected-devices-modal');
        await this.refresh();
        this.render();
        this._showNotification(`${checkboxes.length} dispositivo(s) agregados`, 'success');
    }

    // ============================================
    // AGREGAR / EDITAR DISPOSITIVO
    // ============================================

    showAddModal() {
        this._showDeviceFormModal(null);
    }

    showEditModal(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (device) {
            this._showDeviceFormModal(device);
        }
    }

    _showDeviceFormModal(device) {
        const isEdit = !!device;
        const title = isEdit ? 'Editar Dispositivo' : 'Nuevo Dispositivo';

        const modal = this._createModal('device-form-modal', `
            <div class="modal-header">
                <h3><i class="fas fa-${isEdit ? 'edit' : 'plus-circle'}"></i> ${title}</h3>
                <button class="modal-close" onclick="deviceConfigUI.closeModal('device-form-modal')">&times;</button>
            </div>
            <div class="modal-body">
                <!-- Presets (solo en nuevo) -->
                ${!isEdit ? `
                <div class="form-group">
                    <label>Preset de Dispositivo</label>
                    <select id="devicePreset" onchange="deviceConfigUI.applyPreset(this.value)">
                        <option value="">-- Seleccionar preset --</option>
                        ${this.presets.map(p => `
                            <option value="${p.id}">${p.name} - ${p.description}</option>
                        `).join('')}
                    </select>
                </div>
                <hr>
                ` : ''}

                <div class="form-grid">
                    <div class="form-group">
                        <label>Nombre del Dispositivo *</label>
                        <input type="text" id="deviceName" placeholder="Ej: Molinete Entrada" 
                               value="${this._escapeHtml(device?.name || '')}">
                    </div>

                    <div class="form-group">
                        <label>Tipo</label>
                        <select id="deviceType">
                            <option value="turnstile" ${device?.type === 'turnstile' ? 'selected' : ''}>Molinete</option>
                            <option value="electric_door" ${device?.type === 'electric_door' ? 'selected' : ''}>Puerta Eléctrica</option>
                            <option value="external_controller" ${device?.type === 'external_controller' ? 'selected' : ''}>Controladora Externa</option>
                            <option value="standalone_reader" ${device?.type === 'standalone_reader' ? 'selected' : ''}>Lector Independiente</option>
                            <option value="relay" ${(!device || device?.type === 'relay') ? 'selected' : ''}>Relay Genérico</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Conexión</label>
                        <select id="deviceConnection" onchange="deviceConfigUI.toggleConnectionFields(this.value)">
                            <option value="simulation" ${device?.connection === 'simulation' ? 'selected' : ''}>Simulación</option>
                            <option value="serial" ${device?.connection === 'serial' ? 'selected' : ''}>Serial / COM</option>
                            <option value="usb_hid" ${device?.connection === 'usb_hid' ? 'selected' : ''}>USB HID</option>
                            <option value="tcp_ip" ${device?.connection === 'tcp_ip' ? 'selected' : ''}>TCP / IP</option>
                            <option value="api_rest" ${device?.connection === 'api_rest' ? 'selected' : ''}>API REST / Webhooks</option>
                            <option value="sdk" ${device?.connection === 'sdk' ? 'selected' : ''}>SDK del Fabricante</option>
                        </select>
                    </div>
                </div>

                <!-- Campos de conexión (dinámicos) -->
                <div id="connectionFields">
                    ${this._renderConnectionFields(device?.connection || 'simulation', device)}
                </div>

                <hr>

                <!-- Configuración de apertura -->
                <h4><i class="fas fa-door-open"></i> Apertura</h4>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Duración apertura (ms)</label>
                        <input type="number" id="deviceOpenDuration" value="${device?.openDuration || 3000}" min="500" max="30000">
                    </div>
                    <div class="form-group form-check-inline">
                        <label><input type="checkbox" id="deviceAutoClose" ${device?.autoClose !== false ? 'checked' : ''}> Cierre automático</label>
                    </div>
                    <div class="form-group form-check-inline">
                        <label><input type="checkbox" id="deviceInverted" ${device?.invertedLogic ? 'checked' : ''}> Lógica invertida (NC)</label>
                    </div>
                    <div class="form-group form-check-inline">
                        <label><input type="checkbox" id="deviceFeedback" ${device?.feedbackEnabled !== false ? 'checked' : ''}> Feedback sonoro</label>
                    </div>
                </div>

                <hr>

                <!-- Reglas de acceso -->
                <h4><i class="fas fa-shield-alt"></i> Reglas de Acceso</h4>
                <div class="form-grid">
                    <div class="form-group form-check-inline">
                        <label><input type="checkbox" id="deviceAntipassback" ${device?.antipassbackEnabled ? 'checked' : ''}
                            onchange="document.getElementById('antipassbackMinutes').disabled = !this.checked"> Antipassback</label>
                    </div>
                    <div class="form-group">
                        <label>Minutos entre accesos</label>
                        <input type="number" id="antipassbackMinutes" value="${device?.antipassbackMinutes || 30}" min="1" max="1440"
                            ${!device?.antipassbackEnabled ? 'disabled' : ''}>
                    </div>
                    <div class="form-group">
                        <label>Capacidad máxima (vacío = sin límite)</label>
                        <input type="number" id="deviceCapacity" value="${device?.maxCapacity || ''}" min="1" placeholder="Sin límite">
                    </div>
                </div>

                <!-- Credenciales soportadas -->
                <div class="form-group">
                    <label>Credenciales Soportadas</label>
                    <div class="credentials-checkboxes">
                        ${['rfid', 'nfc', 'qr', 'fingerprint', 'facial', 'pin'].map(c => `
                            <label class="credential-check">
                                <input type="checkbox" name="credentials" value="${c}"
                                    ${(device?.supportedCredentials || ['rfid', 'qr']).includes(c) ? 'checked' : ''}>
                                ${this._getCredentialIcon(c)} ${c.toUpperCase()}
                            </label>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel" onclick="deviceConfigUI.closeModal('device-form-modal')">Cancelar</button>
                <button class="btn-primary" onclick="deviceConfigUI.saveDevice(${isEdit ? `'${device.id}'` : 'null'})">
                    <i class="fas fa-save"></i> ${isEdit ? 'Guardar Cambios' : 'Agregar Dispositivo'}
                </button>
            </div>
        `);

        document.body.appendChild(modal);
        this.toggleConnectionFields(device?.connection || 'simulation');
    }

    _renderConnectionFields(connection, device) {
        switch (connection) {
            case 'serial':
                return `
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Puerto Serial</label>
                            <select id="deviceSerialPath">
                                <option value="">Cargando...</option>
                            </select>
                            <button class="btn-refresh-ports" onclick="deviceConfigUI.refreshSerialPorts()">
                                <i class="fas fa-sync"></i>
                            </button>
                        </div>
                        <div class="form-group">
                            <label>Baud Rate</label>
                            <select id="deviceBaudRate">
                                ${[9600, 19200, 38400, 57600, 115200].map(r =>
                    `<option value="${r}" ${device?.baudRate == r ? 'selected' : ''}>${r}</option>`
                ).join('')}
                            </select>
                        </div>
                    </div>
                `;
            case 'tcp_ip':
                return `
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Dirección IP</label>
                            <input type="text" id="deviceHost" placeholder="192.168.1.100" value="${device?.host || ''}">
                        </div>
                        <div class="form-group">
                            <label>Puerto</label>
                            <input type="number" id="devicePort" placeholder="4370" value="${device?.port || 4370}">
                        </div>
                    </div>
                `;
            case 'usb_hid':
                return `
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Vendor ID</label>
                            <input type="text" id="deviceVendorId" placeholder="0x16c0" value="${device?.vendorId || ''}">
                        </div>
                        <div class="form-group">
                            <label>Product ID</label>
                            <input type="text" id="deviceProductId" placeholder="0x27db" value="${device?.productId || ''}">
                        </div>
                    </div>
                `;
            case 'api_rest':
                return `
                    <div class="form-group">
                        <label>Webhook Path</label>
                        <input type="text" id="deviceWebhookPath" placeholder="/api/access/webhook/device-1" value="${device?.webhookPath || ''}">
                        <span class="form-hint">Endpoint local donde el dispositivo envía eventos. Servidor en puerto 8089.</span>
                    </div>
                `;
            case 'sdk':
                return `
                    <div class="form-group">
                        <label>Tipo de SDK</label>
                        <select id="deviceSdkType">
                            <option value="zkteco" ${device?.sdkType === 'zkteco' ? 'selected' : ''}>ZKTeco</option>
                            <option value="hikvision" ${device?.sdkType === 'hikvision' ? 'selected' : ''}>Hikvision</option>
                            <option value="dahua" ${device?.sdkType === 'dahua' ? 'selected' : ''}>Dahua</option>
                        </select>
                    </div>
                `;
            default: // simulation
                return `
                    <div class="form-hint-block">
                        <i class="fas fa-info-circle"></i>
                        Modo simulación: no se requiere hardware. Los accesos se registran normalmente pero la apertura física es simulada.
                    </div>
                `;
        }
    }

    toggleConnectionFields(connection) {
        const container = document.getElementById('connectionFields');
        if (container) {
            container.innerHTML = this._renderConnectionFields(connection, null);

            // Cargar puertos seriales si es serial
            if (connection === 'serial') {
                this.refreshSerialPorts();
            }
        }
    }

    async refreshSerialPorts() {
        if (window.electronAPI && window.electronAPI.accessControl) {
            const ports = await window.electronAPI.accessControl.listSerialPorts();
            const select = document.getElementById('deviceSerialPath');
            if (select) {
                select.innerHTML = ports.length > 0
                    ? ports.map(p => `<option value="${p.path}">${p.path} ${p.manufacturer ? `(${p.manufacturer})` : ''}</option>`).join('')
                    : '<option value="">No se encontraron puertos</option>';
            }
        }
    }

    applyPreset(presetId) {
        const preset = this.presets.find(p => p.id === presetId);
        if (!preset) return;

        // Aplicar valores del preset
        const nameInput = document.getElementById('deviceName');
        const typeSelect = document.getElementById('deviceType');
        const connSelect = document.getElementById('deviceConnection');

        if (nameInput && !nameInput.value) nameInput.value = preset.name;
        if (typeSelect) typeSelect.value = preset.type || 'relay';
        if (connSelect) {
            connSelect.value = preset.connection || 'simulation';
            this.toggleConnectionFields(preset.connection || 'simulation');
        }

        if (preset.openDuration) document.getElementById('deviceOpenDuration').value = preset.openDuration;
        if (preset.invertedLogic) document.getElementById('deviceInverted').checked = true;
        if (preset.baudRate) {
            const baudSelect = document.getElementById('deviceBaudRate');
            if (baudSelect) baudSelect.value = preset.baudRate;
        }
    }

    // ============================================
    // GUARDAR DISPOSITIVO
    // ============================================

    async saveDevice(editId) {
        const name = document.getElementById('deviceName')?.value?.trim();
        const type = document.getElementById('deviceType')?.value;
        const connection = document.getElementById('deviceConnection')?.value;

        if (!name) {
            this._showNotification('El nombre del dispositivo es obligatorio', 'error');
            return;
        }

        // Recoger credenciales seleccionadas
        const credentialChecks = document.querySelectorAll('input[name="credentials"]:checked');
        const supportedCredentials = Array.from(credentialChecks).map(cb => cb.value);

        const config = {
            name,
            type,
            connection,
            openDuration: parseInt(document.getElementById('deviceOpenDuration')?.value) || 3000,
            autoClose: document.getElementById('deviceAutoClose')?.checked !== false,
            invertedLogic: document.getElementById('deviceInverted')?.checked || false,
            feedbackEnabled: document.getElementById('deviceFeedback')?.checked !== false,
            antipassbackEnabled: document.getElementById('deviceAntipassback')?.checked || false,
            antipassbackMinutes: parseInt(document.getElementById('antipassbackMinutes')?.value) || 30,
            maxCapacity: parseInt(document.getElementById('deviceCapacity')?.value) || null,
            supportedCredentials,

            // Campos de conexión específicos
            serialPath: document.getElementById('deviceSerialPath')?.value || null,
            baudRate: parseInt(document.getElementById('deviceBaudRate')?.value) || 9600,
            host: document.getElementById('deviceHost')?.value || null,
            port: parseInt(document.getElementById('devicePort')?.value) || null,
            vendorId: document.getElementById('deviceVendorId')?.value || null,
            productId: document.getElementById('deviceProductId')?.value || null,
            webhookPath: document.getElementById('deviceWebhookPath')?.value || null,
            sdkType: document.getElementById('deviceSdkType')?.value || null
        };

        try {
            if (window.electronAPI && window.electronAPI.accessControl) {
                let result;
                if (editId) {
                    result = await window.electronAPI.accessControl.updateDevice(editId, config);
                } else {
                    result = await window.electronAPI.accessControl.registerDevice(config);
                }

                if (result.success) {
                    this.closeModal('device-form-modal');
                    await this.refresh();
                    this.render();
                    this._showNotification(editId ? 'Dispositivo actualizado' : 'Dispositivo agregado', 'success');
                } else {
                    this._showNotification('Error: ' + (result.error || 'Desconocido'), 'error');
                }
            }
        } catch (e) {
            this._showNotification('Error guardando dispositivo: ' + e.message, 'error');
        }
    }

    // ============================================
    // ACCIONES DE DISPOSITIVO
    // ============================================

    async testDevice(deviceId) {
        const card = this.container.querySelector(`[data-device-id="${deviceId}"]`);
        const testBtn = card?.querySelector('.btn-test');

        if (testBtn) {
            testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            testBtn.disabled = true;
        }

        try {
            if (window.electronAPI && window.electronAPI.accessControl) {
                const result = await window.electronAPI.accessControl.testDevice(deviceId);
                this._showNotification(
                    result.success ? (result.message || 'Prueba exitosa') : (result.error || 'Prueba fallida'),
                    result.success ? 'success' : 'error'
                );
            }
        } catch (e) {
            this._showNotification('Error: ' + e.message, 'error');
        } finally {
            if (testBtn) {
                testBtn.innerHTML = '<i class="fas fa-bolt"></i> Probar';
                testBtn.disabled = false;
            }
            await this.refresh();
            this.render();
        }
    }

    async removeDevice(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!confirm(`¿Eliminar el dispositivo "${device?.name}"?`)) return;

        try {
            if (window.electronAPI && window.electronAPI.accessControl) {
                await window.electronAPI.accessControl.removeDevice(deviceId);
                await this.refresh();
                this.render();
                this._showNotification('Dispositivo eliminado', 'success');
            }
        } catch (e) {
            this._showNotification('Error eliminando: ' + e.message, 'error');
        }
    }

    // ============================================
    // STATUS BADGES
    // ============================================

    _updateDeviceStatusBadge(deviceId, status) {
        const badge = document.getElementById(`status-${deviceId}`);
        if (badge) {
            const statusClass = status === 'connected' ? 'connected' : (status === 'error' ? 'error' : 'disconnected');
            const statusText = status === 'connected' ? 'Conectado' : (status === 'error' ? 'Error' : 'Desconectado');
            badge.className = `status-badge ${statusClass}`;
            badge.innerHTML = `<span class="status-dot ${statusClass}"></span> ${statusText}`;
        }

        // Actualizar card
        const card = this.container?.querySelector(`[data-device-id="${deviceId}"]`);
        if (card) {
            card.className = `device-card ${status === 'connected' ? 'connected' : status}`;
        }
    }

    // ============================================
    // UTILIDADES DE UI
    // ============================================

    _createModal(id, content) {
        // Remover modal existente si hay
        const existing = document.getElementById(id);
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'device-modal-overlay';
        modal.innerHTML = `<div class="device-modal">${content}</div>`;

        // Cerrar con Escape
        const handler = (e) => {
            if (e.key === 'Escape') {
                this.closeModal(id);
                document.removeEventListener('keydown', handler);
            }
        };
        document.addEventListener('keydown', handler);

        // Cerrar al click fuera
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal(id);
        });

        return modal;
    }

    closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('closing');
            setTimeout(() => modal.remove(), 200);
        }
    }

    _showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `device-notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        // Animate in
        requestAnimationFrame(() => notification.classList.add('show'));

        // Auto-remove
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3500);
    }

    _getDeviceIcon(type) {
        const icons = {
            turnstile: '<i class="fas fa-door-open"></i>',
            electric_door: '<i class="fas fa-dungeon"></i>',
            external_controller: '<i class="fas fa-server"></i>',
            standalone_reader: '<i class="fas fa-id-card-alt"></i>',
            relay: '<i class="fas fa-toggle-on"></i>',
            simulation: '<i class="fas fa-laptop-code"></i>'
        };
        return icons[type] || '<i class="fas fa-microchip"></i>';
    }

    _getConnectionIcon(connection) {
        const icons = {
            serial: '<i class="fas fa-plug"></i>',
            usb_hid: '<i class="fab fa-usb"></i>',
            tcp_ip: '<i class="fas fa-network-wired"></i>',
            api_rest: '<i class="fas fa-globe"></i>',
            sdk: '<i class="fas fa-code"></i>',
            simulation: '<i class="fas fa-laptop-code"></i>'
        };
        return icons[connection] || '';
    }

    _getConnectionLabel(connection) {
        const labels = {
            serial: 'Serial',
            usb_hid: 'USB',
            tcp_ip: 'TCP/IP',
            api_rest: 'API/Webhook',
            sdk: 'SDK',
            simulation: 'Simulación'
        };
        return labels[connection] || connection;
    }

    _getCredentialIcon(credential) {
        const icons = {
            rfid: '<i class="fas fa-id-card"></i>',
            nfc: '<i class="fas fa-wifi"></i>',
            qr: '<i class="fas fa-qrcode"></i>',
            fingerprint: '<i class="fas fa-fingerprint"></i>',
            facial: '<i class="fas fa-user-circle"></i>',
            pin: '<i class="fas fa-keyboard"></i>'
        };
        return icons[credential] || '';
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export global
window.DeviceConfigUI = DeviceConfigUI;
