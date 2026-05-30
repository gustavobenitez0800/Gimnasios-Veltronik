// ============================================
// VELTRONIK - THEME CONTEXT
// ============================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'veltronik-theme';
const THEMES = { LIGHT: 'light', DARK: 'dark', SYSTEM: 'system' };

function getEffectiveTheme(saved) {
  if (saved === THEMES.SYSTEM) {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? THEMES.DARK
      : THEMES.LIGHT;
  }
  return saved || THEMES.DARK;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY) || THEMES.DARK;
    return getEffectiveTheme(saved);
  });

  const [preference, setPreference] = useState(
    () => localStorage.getItem(STORAGE_KEY) || THEMES.DARK
  );

  const applyTheme = useCallback((effectiveTheme) => {
    document.documentElement.setAttribute('data-theme', effectiveTheme);
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${effectiveTheme}`);
  }, []);

  const setTheme = useCallback(
    (newPreference) => {
      localStorage.setItem(STORAGE_KEY, newPreference);
      setPreference(newPreference);
      const effective = getEffectiveTheme(newPreference);
      setThemeState(effective);
      applyTheme(effective);
    },
    [applyTheme]
  );

  const toggleTheme = useCallback(() => {
    const newTheme = theme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
    setTheme(newTheme);
    return newTheme;
  }, [theme, setTheme]);

  // Apply on mount
  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;

    const handler = () => {
      if (preference === THEMES.SYSTEM) {
        const effective = getEffectiveTheme(THEMES.SYSTEM);
        setThemeState(effective);
        applyTheme(effective);
      }
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preference, applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, preference, setTheme, toggleTheme, THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}
