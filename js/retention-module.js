// ============================================
// GIMNASIO VELTRONIK - MÓDULO DE RETENCIÓN
// Analiza riesgo de baja de socios sin modificar BD
// Módulo desacoplado - Solo lectura de datos
// ============================================

class RetentionService {
    constructor() {
        this.client = null;
        this.moduleEnabled = true; // Feature flag - puede desactivarse sin afectar el sistema
        this.lastAnalysis = null;
    }

    /**
     * Initialize the service
     */
    init() {
        if (typeof getSupabase === 'function') {
            this.client = getSupabase();
        } else {
            console.error('[Retention Module] Supabase client helper not found');
        }
    }

    /**
     * Toggle module status
     * Permite desactivar el módulo sin afectar el sistema
     */
    toggleModule(enabled) {
        this.moduleEnabled = enabled;
        console.log(`[Retention Module] Module ${enabled ? 'enabled' : 'disabled'}`);
        return this.moduleEnabled;
    }

    /**
     * Check if module is enabled
     */
    isEnabled() {
        return this.moduleEnabled;
    }

    /**
     * Fetch data and analyze risk
     * READ-ONLY operation - NO modifications to database
     */
    async analyzeRisk() {
        if (!this.moduleEnabled) {
            console.log('[Retention Module] Module is disabled');
            return [];
        }

        if (!this.client) this.init();

        if (!this.client) {
            console.error('[Retention Module] Could not initialize Supabase client');
            return [];
        }

        try {
            // 1. Get active members (READ-ONLY)
            const { data: members, error: membersError } = await this.client
                .from('members')
                .select('id, full_name, email, phone, status, membership_end, created_at')
                .eq('status', 'active');

            if (membersError) {
                console.error('[Retention Module] Error fetching members:', membersError);
                throw membersError;
            }

            if (!members || members.length === 0) {
                console.log('[Retention Module] No active members found');
                return [];
            }

            // 2. Get recent access logs (last 30 days) - READ-ONLY
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            let logs = [];
            try {
                const { data: accessLogs, error: logsError } = await this.client
                    .from('access_logs')
                    .select('member_id, check_in_at')
                    .gte('check_in_at', thirtyDaysAgo.toISOString())
                    .order('check_in_at', { ascending: false });

                if (logsError) {
                    // Access logs table might not exist or be empty - that's OK
                    console.warn('[Retention Module] Could not fetch access logs:', logsError.message);
                } else {
                    logs = accessLogs || [];
                }
            } catch (e) {
                console.warn('[Retention Module] Access logs not available:', e.message);
            }

            // 3. Process logs to find last access per member
            const lastAccessMap = {};
            logs.forEach(log => {
                if (log.member_id && !lastAccessMap[log.member_id]) {
                    lastAccessMap[log.member_id] = new Date(log.check_in_at);
                }
            });

            // 4. Calculate risk for each member
            const analyzedMembers = members.map(member => {
                const lastAccess = lastAccessMap[member.id] || null;
                return this.calculateMemberRisk(member, lastAccess);
            });

            // 5. Sort by risk (High > Medium > Low)
            const sortedMembers = analyzedMembers.sort((a, b) => {
                const riskScore = { 'high': 3, 'medium': 2, 'low': 1 };
                return riskScore[b.risk] - riskScore[a.risk];
            });

            // Store last analysis timestamp
            this.lastAnalysis = new Date();

            console.log(`[Retention Module] Analyzed ${sortedMembers.length} members`);
            return sortedMembers;

        } catch (error) {
            console.error('[Retention Module] Error analyzing retention risk:', error);
            return [];
        }
    }

    /**
     * Calculate risk score and reason for a single member
     * Returns: risk level, human-readable reason, and suggested action
     */
    calculateMemberRisk(member, lastAccess) {
        const now = new Date();
        const membershipEnd = member.membership_end ? new Date(member.membership_end) : null;

        let risk = 'low';
        let reason = 'Socio activo y asistiendo regularmente.';
        let suggestion = null;

        // Calculate days since last access
        let daysSinceLastAccess = Infinity;
        if (lastAccess) {
            const diffTime = Math.abs(now - lastAccess);
            daysSinceLastAccess = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        // Calculate days until membership expiry
        let daysUntilExpiry = Infinity;
        if (membershipEnd) {
            const diffTime = membershipEnd - now;
            daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        // Safe member name for messages
        const memberName = member.full_name || 'Socio';

        // --- RISK LOGIC ---
        // Higher scores = more urgent situations

        // HIGH RISK: Not seen in > 21 days OR expiring in < 3 days (or expired)
        if (daysSinceLastAccess > 21 || daysUntilExpiry < 3) {
            risk = 'high';
            if (daysUntilExpiry < 0) {
                const daysExpired = Math.abs(daysUntilExpiry);
                reason = `Membresía vencida hace ${daysExpired} día${daysExpired !== 1 ? 's' : ''}.`;
                suggestion = {
                    text: 'Sugerir renovación inmediata o promoción de retorno',
                    action: 'whatsapp',
                    message: `Hola ${memberName}, notamos que tu membresía venció. ¡Queremos verte de vuelta! Te ofrecemos un descuento especial si renuevas hoy.`
                };
            } else if (daysUntilExpiry < 3 && daysUntilExpiry >= 0) {
                reason = daysUntilExpiry === 0
                    ? 'Membresía vence HOY.'
                    : `Membresía vence en ${daysUntilExpiry} día${daysUntilExpiry !== 1 ? 's' : ''}.`;
                suggestion = {
                    text: 'Enviar recordatorio urgente de vencimiento',
                    action: 'whatsapp',
                    message: daysUntilExpiry === 0
                        ? `Hola ${memberName}, tu plan vence HOY. ¡No pierdas tu ritmo! Renueva ahora para seguir entrenando.`
                        : `Hola ${memberName}, tu plan vence en ${daysUntilExpiry} día${daysUntilExpiry !== 1 ? 's' : ''}. ¡No pierdas tu ritmo! Renueva hoy para seguir entrenando.`
                };
            } else {
                reason = daysSinceLastAccess === Infinity
                    ? 'Nunca ha registrado asistencia.'
                    : `No ha asistido en ${daysSinceLastAccess} días.`;
                suggestion = {
                    text: 'Contactar para saber por qué dejó de venir',
                    action: 'whatsapp',
                    message: daysSinceLastAccess === Infinity
                        ? `Hola ${memberName}, vimos que todavía no viniste al gimnasio. ¿Todo bien? ¡Te esperamos para tu primera sesión!`
                        : `Hola ${memberName}, te extrañamos en el gimnasio. Hace ${daysSinceLastAccess} días que no venís. ¿Todo bien? ¡Te esperamos para entrenar!`
                };
            }
        }
        // MEDIUM RISK: Not seen in > 14 days OR expiring in < 7 days
        else if (daysSinceLastAccess > 14 || daysUntilExpiry < 7) {
            risk = 'medium';
            if (daysUntilExpiry < 7) {
                reason = `Membresía vence pronto (${daysUntilExpiry} día${daysUntilExpiry !== 1 ? 's' : ''}).`;
                suggestion = {
                    text: 'Recordar vencimiento próximo',
                    action: 'whatsapp',
                    message: `Hola ${memberName}, te recordamos que tu plan vence en ${daysUntilExpiry} día${daysUntilExpiry !== 1 ? 's' : ''}. ¡Planificá tu renovación!`
                };
            } else {
                reason = `Ausente por ${daysSinceLastAccess} días.`;
                suggestion = {
                    text: 'Enviar mensaje de motivación',
                    action: 'whatsapp',
                    message: `Hola ${memberName}, hace ${daysSinceLastAccess} días que no te vemos. ¡No dejes que la pereza gane! Volvé a entrenar hoy.`
                };
            }
        }
        // LOW RISK
        else {
            risk = 'low';
            if (daysSinceLastAccess === Infinity) {
                reason = 'Sin registro de asistencia pero membresía vigente.';
            } else {
                reason = 'Asistencia regular y membresía al día.';
            }
            suggestion = null; // No suggestion needed for low risk
        }

        return {
            id: member.id,
            full_name: member.full_name,
            email: member.email,
            phone: member.phone,
            membership_end: member.membership_end,
            risk,
            riskReason: reason,
            suggestion,
            lastAccess,
            daysSinceLastAccess: daysSinceLastAccess === Infinity ? null : daysSinceLastAccess,
            daysUntilExpiry: daysUntilExpiry === Infinity ? null : daysUntilExpiry
        };
    }

    /**
     * Get summary stats for dashboard integration
     */
    async getSummaryStats() {
        const risks = await this.analyzeRisk();
        return {
            total: risks.length,
            high: risks.filter(r => r.risk === 'high').length,
            medium: risks.filter(r => r.risk === 'medium').length,
            low: risks.filter(r => r.risk === 'low').length,
            lastAnalysis: this.lastAnalysis
        };
    }

    /**
     * Render the UI
     */
    async render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('[Retention Module] Container not found:', containerId);
            return;
        }

        // Show loading state
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem;">
                <div class="loading-spinner"></div>
                <p class="text-center text-muted" style="margin-top: 1rem;">Analizando datos de retención...</p>
            </div>
        `;

        try {
            const risks = await this.analyzeRisk();

            if (risks.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"><i class="fa-solid fa-shield-halved" style="font-size: 3rem; color: var(--success-500);"></i></div>
                        <h3 class="empty-state-title">Todo en orden</h3>
                        <p class="empty-state-message">
                            ${this.moduleEnabled
                        ? 'No se encontraron socios activos para analizar.'
                        : 'El módulo de retención está desactivado.'}
                        </p>
                    </div>
                `;
                return;
            }

            // Calculate stats
            const highRisk = risks.filter(r => r.risk === 'high').length;
            const mediumRisk = risks.filter(r => r.risk === 'medium').length;
            const lowRisk = risks.filter(r => r.risk === 'low').length;

            // Generate HTML with Font Awesome icons instead of emojis
            let html = `
                <!-- Stats Grid -->
                <div class="dashboard-grid-3" style="margin-bottom: 2rem;">
                    <div class="stat-card">
                        <div class="stat-icon" style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.2)); color: var(--error-500);">
                            <i class="fa-solid fa-circle-exclamation" style="font-size: 1.5rem;"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-value">${highRisk}</div>
                            <div class="stat-label">Riesgo Alto</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(234, 179, 8, 0.2)); color: var(--warning-500);">
                            <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem;"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-value">${mediumRisk}</div>
                            <div class="stat-label">Riesgo Medio</div>
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon" style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(22, 163, 74, 0.2)); color: var(--success-500);">
                            <i class="fa-solid fa-shield-halved" style="font-size: 1.5rem;"></i>
                        </div>
                        <div class="stat-content">
                            <div class="stat-value">${lowRisk}</div>
                            <div class="stat-label">Riesgo Bajo</div>
                        </div>
                    </div>
                </div>

                <!-- Main Table Card -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">
                            <i class="fa-solid fa-user-clock" style="margin-right: 0.5rem; color: var(--warning-500);"></i> Socios en Riesgo
                        </h3>
                        <span class="badge badge-neutral" style="font-size: 0.75rem;">${highRisk + mediumRisk} requieren atención</span>
                    </div>
                    <div class="card-body" style="padding: 0;">
                        <div class="table-container">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Socio</th>
                                        <th>Nivel de Riesgo</th>
                                        <th>Motivo / Sugerencia</th>
                                        <th>Última Visita</th>
                                        <th class="text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
            `;

            // Only show High and Medium risk in the actionable list
            const actionableRisks = risks.filter(r => r.risk !== 'low');

            if (actionableRisks.length === 0) {
                html += `
                    <tr>
                        <td colspan="5" class="text-center text-muted" style="padding: 3rem;">
                            <i class="fa-solid fa-party-horn" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; color: var(--success-500);"></i>
                            ¡Excelente! No hay socios con riesgo alto o medio.
                        </td>
                    </tr>
                `;
            } else {
                actionableRisks.forEach(member => {
                    html += this.createMemberRow(member);
                });
            }

            html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- Info Note -->
                <div style="margin-top: 1.5rem; padding: 1rem; background: var(--bg-tertiary); border-radius: var(--border-radius-md); border-left: 3px solid var(--primary-500);">
                    <p style="font-size: var(--font-size-sm); color: var(--text-muted); margin: 0;">
                        <i class="fa-solid fa-lightbulb" style="color: var(--warning-500); margin-right: 0.5rem;"></i>
                        <strong style="color: var(--text-primary);">Nota:</strong> 
                        Este módulo solo sugiere acciones. Los mensajes no se envían automáticamente - 
                        usá los botones de acción para contactar manualmente a cada socio.
                    </p>
                </div>
            `;

            container.innerHTML = html;

        } catch (error) {
            console.error('[Retention Module] Error rendering:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fa-solid fa-circle-xmark" style="font-size: 3rem; color: var(--error-500);"></i></div>
                    <h3 class="empty-state-title">Error al cargar</h3>
                    <p class="empty-state-message">No se pudo analizar los datos de retención. Por favor, intentá de nuevo.</p>
                    <button class="btn btn-primary" onclick="retentionService.render('${containerId}')" style="margin-top: 1rem;">
                        <i class="fa-solid fa-rotate-right" style="margin-right: 0.5rem;"></i> Reintentar
                    </button>
                </div>
            `;
        }
    }

    /**
     * Create a table row for a member
     */
    createMemberRow(member) {
        const riskBadgeClass = member.risk === 'high' ? 'badge-error' : 'badge-warning';
        const riskIcon = member.risk === 'high'
            ? '<i class="fa-solid fa-circle-exclamation"></i>'
            : '<i class="fa-solid fa-triangle-exclamation"></i>';
        const riskLabel = member.risk === 'high' ? 'ALTO' : 'MEDIO';
        const suggestion = member.suggestion;

        // Initials for avatar
        const initials = (member.full_name || 'NN')
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();

        // Build action buttons with Font Awesome icons
        let actionButtons = '';
        if (suggestion) {
            // WhatsApp button - only if member has phone number
            if (member.phone) {
                // Clean phone number (remove non-digits)
                const cleanPhone = member.phone.replace(/\D/g, '');
                // Ensure it has country code (Argentina default)
                const phoneWithCode = cleanPhone.startsWith('54') || cleanPhone.length > 10
                    ? cleanPhone
                    : `54${cleanPhone}`;
                const whatsappUrl = `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(suggestion.message)}`;

                actionButtons += `
                    <a href="${whatsappUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-whatsapp-icon" title="Abrir WhatsApp con mensaje sugerido">
                        <i class="fa-brands fa-whatsapp"></i>
                    </a>
                `;
            }

            // Copy message button - always available
            const escapedMessage = suggestion.message.replace(/'/g, "\\'").replace(/"/g, '\\"');
            actionButtons += `
                <button class="btn btn-sm btn-secondary" onclick="retentionService.copyMessage('${escapedMessage}')" title="Copiar mensaje sugerido al portapapeles">
                    <i class="fa-solid fa-copy"></i>
                </button>
            `;
        } else {
            actionButtons = '<span class="text-muted" style="font-size: 0.75rem;">Sin acciones</span>';
        }

        // Format last access date
        const lastAccessText = member.lastAccess
            ? new Date(member.lastAccess).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Sin registros';

        return `
            <tr>
                <td data-label="Socio">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div class="avatar avatar-sm" style="background: linear-gradient(135deg, var(--primary-500), var(--accent-500)); color: white; font-weight: 600;">
                            ${initials}
                        </div>
                        <div style="min-width: 0;">
                            <div style="font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${member.full_name || 'Sin nombre'}</div>
                            <div style="font-size: var(--font-size-xs); color: var(--text-muted);">${member.email || member.phone || 'Sin contacto'}</div>
                        </div>
                    </div>
                </td>
                <td data-label="Riesgo">
                    <span class="badge ${riskBadgeClass}">${riskIcon} ${riskLabel}</span>
                </td>
                <td data-label="Motivo">
                    <div style="font-size: 0.875rem; color: var(--text-primary); margin-bottom: 0.25rem;">${member.riskReason}</div>
                    ${suggestion ? `<div style="font-size: 0.75rem; color: var(--primary-500); background: rgba(14, 165, 233, 0.1); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block;"><i class="fa-solid fa-lightbulb" style="margin-right: 0.25rem;"></i> ${suggestion.text}</div>` : ''}
                </td>
                <td data-label="Última Visita" style="color: var(--text-secondary);">
                    ${lastAccessText}
                </td>
                <td data-label="Acciones" class="text-right">
                    <div style="display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap;">
                        ${actionButtons}
                    </div>
                </td>
            </tr>
        `;
    }

    /**
     * Copy message to clipboard
     * Manual action - no automatic sending
     */
    copyMessage(text) {
        navigator.clipboard.writeText(text).then(() => {
            // Use the professional toast notification system
            if (typeof showToast === 'function') {
                showToast('Mensaje copiado al portapapeles', 'success');
            } else {
                // Fallback visual feedback
                console.log('[Retention Module] Message copied to clipboard');
            }
        }).catch(err => {
            console.error('[Retention Module] Error copying message:', err);
            if (typeof showToast === 'function') {
                showToast('Error al copiar mensaje', 'error');
            }
        });
    }
}

// Export singleton instance
const retentionService = new RetentionService();

// Expose for dashboard integration if needed
if (typeof window !== 'undefined') {
    window.retentionService = retentionService;
}
