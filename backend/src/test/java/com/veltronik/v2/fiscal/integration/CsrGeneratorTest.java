package com.veltronik.v2.fiscal.integration;

import org.bouncycastle.operator.jcajce.JcaContentVerifierProviderBuilder;
import org.bouncycastle.pkcs.PKCS10CertificationRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Verifica que el CSR generado sea válido y lleve el CUIT en el {@code serialNumber} — el campo que
 * ARCA usa para atar el certificado al CUIT. Sin esto, un CSR mal armado se descubriría recién al
 * tramitarlo en ARCA.
 */
class CsrGeneratorTest {

    private final CsrGenerator generator = new CsrGenerator();

    @Test
    @DisplayName("genera un CSR válido, firmado, con el CUIT en el serialNumber y el CN pedido")
    void generatesValidSignedCsrWithCuit() throws Exception {
        CsrGenerator.GeneratedCsr g = generator.generate(20123456786L, "Kiosco Don Pepe", "mi-kiosco");

        assertTrue(g.csrPem().contains("BEGIN CERTIFICATE REQUEST"));
        assertTrue(g.privateKeyPem().contains("BEGIN PRIVATE KEY"));

        byte[] der = Base64.getMimeDecoder().decode(
                g.csrPem().replace("-----BEGIN CERTIFICATE REQUEST-----", "")
                          .replace("-----END CERTIFICATE REQUEST-----", "").trim());
        PKCS10CertificationRequest csr = new PKCS10CertificationRequest(der);

        String subject = csr.getSubject().toString();
        assertTrue(subject.contains("20123456786"), "El CSR debe llevar el CUIT: " + subject);
        assertTrue(subject.toLowerCase().contains("mi-kiosco"), "El CSR debe llevar el CN: " + subject);

        // La firma del CSR debe validar contra su propia clave pública → lo firmó la clave generada.
        assertTrue(csr.isSignatureValid(
                new JcaContentVerifierProviderBuilder().build(csr.getSubjectPublicKeyInfo())));
    }
}
