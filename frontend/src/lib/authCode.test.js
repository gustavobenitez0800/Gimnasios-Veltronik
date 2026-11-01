// ============================================
// EL token_hash DEL LINK DE RECUPERACIÓN (lib/authCode → readRecoveryTokenHash)
// ============================================

import { describe, it, expect } from 'vitest';
import { readRecoveryTokenHash } from './authCode';

describe('readRecoveryTokenHash', () => {
  it('⭐ lo saca del search real, como lo arma la plantilla del correo', () => {
    expect(readRecoveryTokenHash('https://veltronik-v2.vercel.app/?token_hash=abc&type=recovery#/reset-password')).toBe('abc');
  });

  it('también si quedó adentro del hash', () => {
    expect(readRecoveryTokenHash('https://veltronik-v2.vercel.app/#/reset-password?token_hash=abc&type=recovery')).toBe('abc');
  });

  it('solo el de recuperación: el del alta (type=email) es de otra pantalla', () => {
    expect(readRecoveryTokenHash('https://veltronik-v2.vercel.app/?alta=1&token_hash=abc&type=email')).toBeNull();
  });

  it('sin token, o con una URL rara, no hay nada', () => {
    expect(readRecoveryTokenHash('https://veltronik-v2.vercel.app/?code=xyz#/reset-password')).toBeNull();
    expect(readRecoveryTokenHash('no es una url')).toBeNull();
    expect(readRecoveryTokenHash('')).toBeNull();
  });
});
