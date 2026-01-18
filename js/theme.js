/**
 * ============================================
 * VELTRONIK - THEME MANAGER
 * ============================================
 * 
 * Sistema de gestión de temas claro/oscuro.
 * Guarda preferencia en localStorage.
 */

const ThemeManager = {
    STORAGE_KEY: 'veltronik-theme',
    THEMES: {
        LIGHT: 'light',
        DARK: 'dark',
        SYSTEM: 'system'
    },

    /**
     * Inicializar el sistema de temas
     * Debe llamarse cuando se carga cada página
     */
    init() {
        // Aplicar tema guardado o detectar preferencia del sistema
        this.applyTheme(this.getSavedTheme());

        // Escuchar cambios en preferencia del sistema
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)')
                .addEventListener('change', (e) => {
                    if (this.getSavedTheme() === this.THEMES.SYSTEM) {
                        this.applyTheme(this.THEMES.SYSTEM);
                    }
                });
        }
    },

    /**
     * Obtener tema guardado
     * @returns {string} 'light', 'dark', o 'system'
     */
    getSavedTheme() {
        return localStorage.getItem(this.STORAGE_KEY) || this.THEMES.DARK;
    },

    /**
     * Guardar preferencia de tema
     * @param {string} theme 
     */
    saveTheme(theme) {
        localStorage.setItem(this.STORAGE_KEY, theme);
    },

    /**
     * Obtener tema efectivo (resolviendo 'system')
     * @returns {string} 'light' o 'dark'
     */
    getEffectiveTheme() {
        const savedTheme = this.getSavedTheme();

        if (savedTheme === this.THEMES.SYSTEM) {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
                ? this.THEMES.DARK
                : this.THEMES.LIGHT;
        }

        return savedTheme;
    },

    /**
     * Aplicar tema al documento
     * @param {string} theme 
     */
    applyTheme(theme) {
        this.saveTheme(theme);

        const effectiveTheme = theme === this.THEMES.SYSTEM
            ? this.getEffectiveTheme()
            : theme;

        // Aplicar atributo data-theme al html
        document.documentElement.setAttribute('data-theme', effectiveTheme);

        // También agregar/remover clase para compatibilidad
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add(`theme-${effectiveTheme}`);

        // Disparar evento personalizado
        window.dispatchEvent(new CustomEvent('themechange', {
            detail: { theme: effectiveTheme }
        }));
    },

    /**
     * Alternar entre light y dark
     */
    toggle() {
        const current = this.getEffectiveTheme();
        const newTheme = current === this.THEMES.DARK
            ? this.THEMES.LIGHT
            : this.THEMES.DARK;

        this.applyTheme(newTheme);
        return newTheme;
    },

    /**
     * Establecer tema específico
     * @param {string} theme 
     */
    setTheme(theme) {
        if (Object.values(this.THEMES).includes(theme)) {
            this.applyTheme(theme);
        }
    }
};

// Inicializar inmediatamente para evitar flash
(function () {
    // Aplicar tema antes de que se renderice la página
    const savedTheme = localStorage.getItem('veltronik-theme') || 'dark';
    const effectiveTheme = savedTheme === 'system'
        ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : savedTheme;
    document.documentElement.setAttribute('data-theme', effectiveTheme);
})();

// Inicializar sistema completo cuando DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
});
