// ============================================
// GIMNASIO VELTRONIK - NOTIFICATIONS
// ============================================

/**
 * Toast notification container ID
 */
const TOAST_CONTAINER_ID = 'toast-container';

/**
 * Create toast container if it doesn't exist
 */
function ensureToastContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);

    if (!container) {
        container = document.createElement('div');
        container.id = TOAST_CONTAINER_ID;
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    return container;
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in milliseconds
 */
function showToast(message, type = 'info', duration = 5000) {
    const container = ensureToastContainer();

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    // Icon based on type
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('toast-show');
    });

    // Auto remove after duration
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
}

/**
 * Show a confirmation modal
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {object} options - Button options
 * @returns {Promise<boolean>} - True if confirmed, false if cancelled
 */
function showConfirm(title, message, options = {}) {
    return new Promise((resolve) => {
        const {
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            confirmClass = 'btn-danger',
            icon = '⚠️'
        } = options;

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        overlay.innerHTML = `
            <div class="modal-container confirm-modal">
                <div class="modal-icon">${icon}</div>
                <h2 class="modal-title">${title}</h2>
                <p class="modal-message">${message}</p>
                <div class="modal-actions">
                    <button class="btn btn-secondary" data-action="cancel">${cancelText}</button>
                    <button class="btn ${confirmClass}" data-action="confirm">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Animate in
        requestAnimationFrame(() => {
            overlay.classList.add('modal-show');
        });

        // Handle clicks
        overlay.addEventListener('click', (e) => {
            const action = e.target.dataset.action;

            if (action === 'confirm') {
                closeModal(overlay);
                resolve(true);
            } else if (action === 'cancel' || e.target === overlay) {
                closeModal(overlay);
                resolve(false);
            }
        });

        // Handle escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal(overlay);
                resolve(false);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

/**
 * Show an alert modal
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {object} options - Options
 * @returns {Promise<void>}
 */
function showAlert(title, message, options = {}) {
    return new Promise((resolve) => {
        const {
            buttonText = 'Aceptar',
            icon = 'ℹ️',
            type = 'info'
        } = options;

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        overlay.innerHTML = `
            <div class="modal-container alert-modal alert-${type}">
                <div class="modal-icon">${icon}</div>
                <h2 class="modal-title">${title}</h2>
                <p class="modal-message">${message}</p>
                <div class="modal-actions">
                    <button class="btn btn-primary" data-action="close">${buttonText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Animate in
        requestAnimationFrame(() => {
            overlay.classList.add('modal-show');
        });

        // Handle clicks
        overlay.addEventListener('click', (e) => {
            if (e.target.dataset.action === 'close' || e.target === overlay) {
                closeModal(overlay);
                resolve();
            }
        });

        // Handle escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal(overlay);
                resolve();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

/**
 * Close and remove a modal
 */
function closeModal(overlay) {
    overlay.classList.remove('modal-show');
    overlay.classList.add('modal-hide');
    setTimeout(() => overlay.remove(), 300);
}

/**
 * Show loading overlay
 * @param {string} message - Loading message
 * @returns {function} - Function to hide the loading overlay
 */
function showLoading(message = 'Cargando...') {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <p class="loading-message">${message}</p>
        </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.classList.add('loading-show');
    });

    // Return function to hide
    return () => {
        overlay.classList.remove('loading-show');
        setTimeout(() => overlay.remove(), 300);
    };
}
