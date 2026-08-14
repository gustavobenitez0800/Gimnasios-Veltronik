// ============================================
// VELTRONIK - ¿ESTA SUCURSAL TIENE ACCESO?
// ============================================
// FUENTE ÚNICA del frontend para decidir si un negocio puede entrar al sistema.
//
// Por qué existe: había TRES respuestas distintas a la misma pregunta —el Lobby
// con esta lógica completa, `hasValidAccess` en AuthContext con otra copia, y un
// `isActiveSubscription` que miraba solo `status === 'active'` e ignoraba si el
// período pago ya había vencido—. La página de Planes usaba la última, así que el
// Lobby decía "Pago Rechazado" y Planes contestaba "estás al día" y mandaba al
// Dashboard: el cliente entraba SIN PAGAR. Una sola función, una sola respuesta.
//
// El frontend NUNCA otorga acceso: esto es UX. Quien corta de verdad es el
// KillSwitch del backend (SubscriptionAccessPolicy), que responde 402 a cada
// request de un tenant sin derecho. Si los dos difieren, manda el backend.
// ============================================

/** Días que le quedan de prueba (0 si no tiene o ya venció). */
export function getTrialDays(org) {
  if (!org?.trialEndsAt) return 0;
  const diff = new Date(org.trialEndsAt) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function isTrialActive(org) {
  if (!org?.trialEndsAt) return false;
  return new Date() < new Date(org.trialEndsAt);
}

/**
 * ¿Esta sucursal NUNCA tuvo un período de prueba real? Las sucursales adicionales (2ª en
 * adelante) no incluyen trial: el backend deja `trialEndsAt` en null (sucursales nuevas) o
 * vencido al instante de crearse (≈ createdAt, sucursales legacy). Una 1ª sucursal real tiene
 * `trialEndsAt` MUY posterior a su creación. Sirve para no mostrarle "prueba finalizada" a una
 * sucursal que jamás tuvo prueba.
 */
function neverHadRealTrial(org) {
  if (!org?.trialEndsAt) return true;
  if (!org?.createdAt) return false; // sin createdAt no podemos inferir → asumimos trial real
  return new Date(org.trialEndsAt) <= new Date(org.createdAt);
}

/**
 * Estado de acceso de una sucursal.
 * @returns {{canAccess:boolean, status:string, label:string, icon:string, color:string,
 *            blockReason?:string, sub:object|null, trialDays?:number, graceDays?:number}}
 */
export function computeAccess(org, sub) {
  // El DTO del backend manda camelCase (currentPeriodEnd, gracePeriodEndsAt).
  // Toleramos snake_case por compatibilidad con datos viejos. Sin esto, los campos
  // llegaban undefined y la lógica de período/gracia nunca evaluaba bien.
  const periodEndRaw = sub?.currentPeriodEnd ?? sub?.current_period_end;
  const graceEndRaw = sub?.gracePeriodEndsAt ?? sub?.grace_period_ends_at;
  const periodEnd = periodEndRaw ? new Date(periodEndRaw) : null;
  const graceEnd = graceEndRaw ? new Date(graceEndRaw) : null;
  const now = new Date();

  // 1. Active subscription → acceso SOLO si hay un período PAGO vigente (currentPeriodEnd futuro).
  //    Rigor tipo Netflix: 'active' SIN período real NO da acceso. Antes un período nulo
  //    (`!periodEnd`) habilitaba el sistema sin un cobro confirmado — agujero cerrado.
  if (sub?.status === 'active') {
    if (periodEnd && periodEnd > now) {
      return { canAccess: true, status: 'active', label: 'Activo', icon: 'checkCircle', color: '#22c55e', sub };
    }
    // Período vencido pese a status 'active' → bloquear (esperando renovación/pago).
    return {
      canAccess: false, status: 'expired', label: 'Pago vencido',
      icon: 'creditCard', color: '#ef4444', blockReason: 'past_due', sub,
    };
  }

  // 2. Trial active → access with countdown
  const trialDays = getTrialDays(org);
  if (isTrialActive(org)) {
    return {
      canAccess: true, status: 'trial', label: `${trialDays} días de prueba`,
      icon: 'sparkles', color: trialDays <= 7 ? '#f59e0b' : '#22c55e', sub, trialDays,
    };
  }

  // 3. Past due with grace period → access with warning
  if (sub?.status === 'past_due' && graceEnd && now < graceEnd) {
    const graceDays = Math.max(0, Math.ceil((graceEnd - now) / (1000 * 60 * 60 * 24)));
    return {
      canAccess: true, status: 'past_due_grace', label: `Pago rechazado (${graceDays}d gracia)`,
      icon: 'alertTriangle', color: '#f59e0b', sub, graceDays,
    };
  }

  // 4. Past due without grace or grace expired → blocked
  if (sub?.status === 'past_due') {
    return {
      canAccess: false, status: 'past_due', label: 'Pago rechazado',
      icon: 'creditCard', color: '#ef4444', blockReason: 'past_due', sub,
    };
  }

  // 5. Canceled → blocked (unless el período pago en curso no terminó)
  if (sub?.status === 'canceled') {
    if (periodEnd && now < periodEnd) {
      const daysLeft = Math.max(0, Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24)));
      return {
        canAccess: true, status: 'canceled_active', label: `Cancelada (${daysLeft}d rest.)`,
        icon: 'alertTriangle', color: '#f59e0b', sub,
      };
    }
    return {
      canAccess: false, status: 'canceled', label: 'Suscripción cancelada',
      icon: 'xCircle', color: '#64748b', blockReason: 'canceled', sub,
    };
  }

  // ¿El cliente YA fue cliente pago alguna vez? Si tiene una suscripción registrada
  // (cualquier estado), no está en "prueba": es una reactivación. El mensaje debe ser
  // premium, no de trial. (Distingue al cliente que pagó del que nunca pagó.)
  if (sub) {
    // 6. Vencido tras haber pagado → bloqueo PREMIUM de reactivación (no "prueba").
    return {
      canAccess: false, status: 'expired', label: 'Pago vencido',
      icon: 'creditCard', color: '#ef4444', blockReason: 'expired', sub,
    };
  }

  // 7. Sucursal adicional que nunca tuvo prueba real y nunca pagó → ACTIVACIÓN (no "prueba").
  //    Las sucursales 2ª+ no incluyen trial: deben activarse pagando.
  if (neverHadRealTrial(org)) {
    return {
      canAccess: false, status: 'needs_activation', label: 'Requiere activación',
      icon: 'creditCard', color: '#f59e0b', blockReason: 'additional_branch', sub,
    };
  }

  // 8. Trial real expirado y NUNCA pagó → mensaje de prueba finalizada.
  if (org?.trialEndsAt && new Date(org.trialEndsAt) < now) {
    return {
      canAccess: false, status: 'trial_expired', label: 'Prueba finalizada',
      icon: 'clock', color: '#3b82f6', blockReason: 'trial_expired', sub,
    };
  }

  // 9. Sin trial ni suscripción → bloqueado.
  return {
    canAccess: false, status: 'no_subscription', label: 'Sin suscripción',
    icon: 'lock', color: '#ef4444', blockReason: 'no_subscription', sub,
  };
}

/** Atajo booleano. Úsese SIEMPRE esto en vez de mirar `sub.status` a mano. */
export function hasAccess(org, sub) {
  return computeAccess(org, sub).canAccess;
}
