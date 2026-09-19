package com.veltronik.v2.gym.services;

/**
 * Qué cuenta como "el mismo documento". Una sola definición para todo el sistema.
 *
 * <p>La usan el check-in por QR (el socio escribe su DNI) y el importador (el archivo trae el
 * DNI de cada uno). Si cada uno limpiara el documento a su manera, un socio podría entrar por
 * la puerta y al mismo tiempo duplicarse en una importación — o al revés.</p>
 *
 * <p>La regla: solo letras y números, en mayúsculas. Un DNI es un número; los puntos son
 * adorno de impresión. {@code 30.111.222}, {@code 30111222} y {@code " 30111222 "} son la misma
 * persona. Del lado de la base, {@code GymMemberRepository.findByDocumentoNormalizado} aplica
 * exactamente la misma limpieza con {@code regexp_replace}.</p>
 */
public final class Documento {

    private Documento() {
    }

    public static String normalizar(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("[^0-9A-Za-z]", "").toUpperCase();
    }
}
