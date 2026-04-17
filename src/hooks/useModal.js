// ============================================
// VELTRONIK - useModal Hook
// ============================================
// Hook reutilizable para lógica de modales CRUD.
// Maneja: open/close, form state, editing ID, saving state.
// ============================================

import { useState, useCallback } from 'react';

/**
 * @param {object} initialForm — Estado inicial del formulario
 */
export function useModal(initialForm = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);

  /**
   * Abrir modal para crear (sin args) o editar (con item).
   * @param {object|null} item — Item a editar, null para crear nuevo
   * @param {Function} mapFn — Función que mapea el item a form fields
   */
  const open = useCallback((item = null, mapFn = null) => {
    if (item) {
      setEditingId(item.id);
      setForm(mapFn ? mapFn(item) : item);
    } else {
      setEditingId(null);
      setForm({ ...initialForm });
    }
    setIsOpen(true);
  }, [initialForm]);

  const close = useCallback(() => {
    setIsOpen(false);
    setEditingId(null);
    setForm({ ...initialForm });
    setSaving(false);
  }, [initialForm]);

  /**
   * Actualizar un campo del formulario.
   */
  const handleChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  /**
   * Actualizar múltiples campos del formulario.
   */
  const handleMultiChange = useCallback((updates) => {
    setForm((prev) => ({ ...prev, ...updates }));
  }, []);

  /**
   * Limpiar campos vacíos (string '' → null) para envío a DB.
   */
  const getCleanedData = useCallback(() => {
    const data = { ...form };
    Object.keys(data).forEach((k) => {
      if (data[k] === '') data[k] = null;
    });
    return data;
  }, [form]);

  return {
    isOpen,
    editingId,
    isEditing: editingId !== null,
    form,
    saving,
    open,
    close,
    handleChange,
    handleMultiChange,
    setSaving,
    setForm,
    getCleanedData,
  };
}
