// ============================================
// VELTRONIK - useConfirmDialog Hook
// ============================================
// Hook para diálogos de confirmación (eliminar, etc.)
// ============================================

import { useState, useCallback } from 'react';

/**
 * @returns {object} — { isOpen, itemId, itemName, open, close, confirm }
 */
export function useConfirmDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [itemId, setItemId] = useState(null);
  const [itemName, setItemName] = useState('');

  const open = useCallback((id, name = '') => {
    setItemId(id);
    setItemName(name);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setItemId(null);
    setItemName('');
    setIsOpen(false);
  }, []);

  /**
   * Ejecutar callback de confirmación y cerrar.
   * @param {Function} onConfirm — Async function que recibe el itemId
   */
  const confirm = useCallback(async (onConfirm) => {
    if (itemId && onConfirm) {
      await onConfirm(itemId);
    }
    close();
  }, [itemId, close]);

  return { isOpen, itemId, itemName, open, close, confirm };
}
