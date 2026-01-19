// ============================================
// GIMNASIO VELTRONIK - EMAIL SERVICE
// Sistema de Notificaciones por Email con EmailJS
// ============================================

/**
 * EmailJS Configuration
 * Para usar este servicio:
 * 1. Crear cuenta en https://www.emailjs.com
 * 2. Configurar un servicio de email (Gmail, Outlook, etc)
 * 3. Crear las plantillas mencionadas abajo
 * 4. Copiar los IDs al CONFIG
 */

const EMAIL_CONFIG = {
    // Estos valores deben configurarse en emailjs.com
    PUBLIC_KEY: '', // Tu public key de EmailJS
    SERVICE_ID: '', // ID del servicio de email
    TEMPLATES: {
        PAYMENT_REMINDER: '', // Template para recordatorio de pago
        MEMBERSHIP_EXPIRING: '', // Template para membresía por vencer
        WELCOME: '', // Template de bienvenida
        BIRTHDAY: '' // Template de cumpleaños
    }
};

// Verificar si EmailJS está configurado
function isEmailJSConfigured() {
    return EMAIL_CONFIG.PUBLIC_KEY && EMAIL_CONFIG.SERVICE_ID;
}

/**
 * Inicializar EmailJS
 */
function initEmailJS() {
    if (!isEmailJSConfigured()) {
        console.warn('EmailJS no está configurado. Las notificaciones por email no funcionarán.');
        return false;
    }

    if (typeof emailjs !== 'undefined') {
        emailjs.init(EMAIL_CONFIG.PUBLIC_KEY);
        return true;
    }

    console.warn('EmailJS library not loaded');
    return false;
}

/**
 * Enviar email usando EmailJS
 */
async function sendEmail(templateId, templateParams) {
    if (!isEmailJSConfigured()) {
        console.warn('EmailJS no configurado. Simulando envío de email:', templateParams);
        return { success: true, simulated: true };
    }

    try {
        const response = await emailjs.send(
            EMAIL_CONFIG.SERVICE_ID,
            templateId,
            templateParams
        );
        log('Email enviado:', response);
        return { success: true, response };
    } catch (error) {
        console.error('Error enviando email:', error);
        throw error;
    }
}

/**
 * Enviar recordatorio de pago
 */
async function sendPaymentReminder(member, dueDate, amount) {
    const templateParams = {
        to_name: member.full_name,
        to_email: member.email,
        due_date: new Date(dueDate).toLocaleDateString('es-AR'),
        amount: formatCurrency(amount),
        gym_name: 'Tu Gimnasio' // Se puede obtener del gym actual
    };

    return sendEmail(EMAIL_CONFIG.TEMPLATES.PAYMENT_REMINDER, templateParams);
}

/**
 * Enviar aviso de membresía por vencer
 */
async function sendMembershipExpiringNotice(member, expirationDate, daysRemaining) {
    const templateParams = {
        to_name: member.full_name,
        to_email: member.email,
        expiration_date: new Date(expirationDate).toLocaleDateString('es-AR'),
        days_remaining: daysRemaining,
        gym_name: 'Tu Gimnasio'
    };

    return sendEmail(EMAIL_CONFIG.TEMPLATES.MEMBERSHIP_EXPIRING, templateParams);
}

/**
 * Enviar email de bienvenida
 */
async function sendWelcomeEmail(member) {
    const templateParams = {
        to_name: member.full_name,
        to_email: member.email,
        gym_name: 'Tu Gimnasio'
    };

    return sendEmail(EMAIL_CONFIG.TEMPLATES.WELCOME, templateParams);
}

/**
 * Enviar saludo de cumpleaños
 */
async function sendBirthdayGreeting(member) {
    const templateParams = {
        to_name: member.full_name,
        to_email: member.email,
        gym_name: 'Tu Gimnasio'
    };

    return sendEmail(EMAIL_CONFIG.TEMPLATES.BIRTHDAY, templateParams);
}

// ============================================
// SISTEMA DE NOTIFICACIONES IN-APP
// ============================================

// Almacén de notificaciones (en memoria, puede conectarse a Supabase)
let notifications = [];

/**
 * Tipos de notificaciones
 */
const NOTIFICATION_TYPES = {
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error',
    PAYMENT: 'payment',
    MEMBER: 'member',
    SYSTEM: 'system'
};

/**
 * Crear una notificación
 */
function createNotification(title, message, type = 'info', data = {}) {
    const notification = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        title,
        message,
        type,
        data,
        read: false,
        createdAt: new Date().toISOString()
    };

    notifications.unshift(notification);

    // Mantener máximo 50 notificaciones
    if (notifications.length > 50) {
        notifications = notifications.slice(0, 50);
    }

    // Guardar en localStorage
    saveNotificationsToStorage();

    // Disparar evento para actualizar UI
    dispatchNotificationEvent('new', notification);

    return notification;
}

/**
 * Marcar notificación como leída
 */
function markNotificationAsRead(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
        notification.read = true;
        saveNotificationsToStorage();
        dispatchNotificationEvent('read', notification);
    }
}

/**
 * Marcar todas como leídas
 */
function markAllNotificationsAsRead() {
    notifications.forEach(n => n.read = true);
    saveNotificationsToStorage();
    dispatchNotificationEvent('readAll');
}

/**
 * Eliminar notificación
 */
function deleteNotification(notificationId) {
    notifications = notifications.filter(n => n.id !== notificationId);
    saveNotificationsToStorage();
    dispatchNotificationEvent('delete', { id: notificationId });
}

/**
 * Obtener notificaciones no leídas
 */
function getUnreadNotifications() {
    return notifications.filter(n => !n.read);
}

/**
 * Obtener todas las notificaciones
 */
function getAllNotifications() {
    return notifications;
}

/**
 * Guardar en localStorage
 */
function saveNotificationsToStorage() {
    try {
        localStorage.setItem('veltronik_notifications', JSON.stringify(notifications));
    } catch (e) {
        console.warn('Error guardando notificaciones:', e);
    }
}

/**
 * Cargar de localStorage
 */
function loadNotificationsFromStorage() {
    try {
        const stored = localStorage.getItem('veltronik_notifications');
        if (stored) {
            notifications = JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Error cargando notificaciones:', e);
        notifications = [];
    }
}

/**
 * Disparar evento de notificación
 */
function dispatchNotificationEvent(action, data = {}) {
    const event = new CustomEvent('veltronik:notification', {
        detail: { action, data, unreadCount: getUnreadNotifications().length }
    });
    document.dispatchEvent(event);
}

// ============================================
// AUTOMATIZACIONES
// ============================================

/**
 * Verificar membresías próximas a vencer y crear notificaciones
 */
async function checkExpiringMemberships(members, daysThreshold = 7) {
    const today = new Date();
    const expiringMembers = [];

    members.forEach(member => {
        if (!member.membership_end || member.status !== 'active') return;

        const endDate = new Date(member.membership_end);
        const diffTime = endDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 0 && diffDays <= daysThreshold) {
            expiringMembers.push({
                member,
                daysRemaining: diffDays,
                expirationDate: member.membership_end
            });

            // Crear notificación in-app
            createNotification(
                '⏰ Membresía por Vencer',
                `${member.full_name} - Vence en ${diffDays} día(s)`,
                NOTIFICATION_TYPES.WARNING,
                { memberId: member.id, daysRemaining: diffDays }
            );
        }
    });

    return expiringMembers;
}

/**
 * Verificar pagos pendientes/vencidos
 */
async function checkPendingPayments(members, payments) {
    const today = new Date();
    const pendingAlerts = [];

    payments.forEach(payment => {
        if (payment.status !== 'pending' && payment.status !== 'overdue') return;

        const dueDate = new Date(payment.due_date);
        const isOverdue = dueDate < today;

        if (isOverdue) {
            const member = members.find(m => m.id === payment.member_id);
            if (member) {
                pendingAlerts.push({
                    payment,
                    member,
                    isOverdue: true
                });
            }
        }
    });

    return pendingAlerts;
}

/**
 * Verificar cumpleaños del día
 */
function checkBirthdays(members) {
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    const birthdayMembers = members.filter(member => {
        if (!member.birth_date) return false;
        const birthDate = new Date(member.birth_date);
        return birthDate.getMonth() + 1 === todayMonth && birthDate.getDate() === todayDay;
    });

    birthdayMembers.forEach(member => {
        createNotification(
            '🎂 ¡Cumpleaños!',
            `¡Hoy es el cumpleaños de ${member.full_name}!`,
            NOTIFICATION_TYPES.INFO,
            { memberId: member.id, type: 'birthday' }
        );
    });

    return birthdayMembers;
}

/**
 * Ejecutar todas las verificaciones automáticas
 */
async function runAutomatedChecks(members, payments = []) {
    // Solo ejecutar una vez por día
    const lastCheck = localStorage.getItem('veltronik_last_auto_check');
    const today = new Date().toISOString().split('T')[0];

    if (lastCheck === today) {
        log('Verificaciones automáticas ya ejecutadas hoy');
        return;
    }

    log('Ejecutando verificaciones automáticas...');

    // Verificar membresías
    await checkExpiringMemberships(members, 7);

    // Verificar cumpleaños
    checkBirthdays(members);

    // Verificar pagos
    if (payments.length > 0) {
        await checkPendingPayments(members, payments);
    }

    // Marcar como ejecutado
    localStorage.setItem('veltronik_last_auto_check', today);

    log('Verificaciones automáticas completadas');
}

// Inicializar al cargar
document.addEventListener('DOMContentLoaded', () => {
    loadNotificationsFromStorage();
    initEmailJS();
});

// Exportar para uso global
window.VeltronikNotifications = {
    create: createNotification,
    markAsRead: markNotificationAsRead,
    markAllAsRead: markAllNotificationsAsRead,
    delete: deleteNotification,
    getUnread: getUnreadNotifications,
    getAll: getAllNotifications,
    TYPES: NOTIFICATION_TYPES,
    runChecks: runAutomatedChecks,
    sendPaymentReminder,
    sendMembershipExpiringNotice,
    sendWelcomeEmail,
    sendBirthdayGreeting
};
