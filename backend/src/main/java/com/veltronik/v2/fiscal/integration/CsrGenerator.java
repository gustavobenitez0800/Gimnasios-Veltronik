package com.veltronik.v2.fiscal.integration;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x500.X500NameBuilder;
import org.bouncycastle.asn1.x500.style.BCStyle;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.pkcs.PKCS10CertificationRequest;
import org.bouncycastle.pkcs.jcajce.JcaPKCS10CertificationRequestBuilder;
import org.springframework.stereotype.Component;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.Base64;

/**
 * Genera, del lado del servidor, el par de claves + el CSR (PKCS#10) para tramitar el certificado
 * de ARCA. Así el cliente NUNCA maneja openssl ni la clave privada: pide el certificado con este
 * CSR, y solo pega el certificado que ARCA le devuelve.
 *
 * <p>La clave privada se genera acá y la guarda CIFRADA {@code FiscalConfigService}; nunca sale
 * del servidor. Réplica de:
 * {@code openssl req -new -key priv.key -subj "/C=AR/O=<razon>/CN=<cn>/serialNumber=CUIT <cuit>"}.
 * El campo {@code serialNumber=CUIT <cuit>} es el que ARCA usa para atar el certificado al CUIT.</p>
 */
@Component
public class CsrGenerator {

    /** El CSR (para descargar y subir a ARCA) y la clave privada (para guardar CIFRADA). PEM. */
    public record GeneratedCsr(String csrPem, String privateKeyPem) {}

    public GeneratedCsr generate(long cuit, String razonSocial, String commonName) {
        try {
            KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
            kpg.initialize(2048);
            KeyPair kp = kpg.generateKeyPair();

            // BC escapa por sí solo comas/caracteres especiales del valor (ej. razón social con coma).
            X500Name subject = new X500NameBuilder(BCStyle.INSTANCE)
                    .addRDN(BCStyle.C, "AR")
                    .addRDN(BCStyle.O, razonSocial)
                    .addRDN(BCStyle.CN, commonName)
                    .addRDN(BCStyle.SERIALNUMBER, "CUIT " + cuit)
                    .build();

            ContentSigner signer = new JcaContentSignerBuilder("SHA256withRSA").build(kp.getPrivate());
            PKCS10CertificationRequest csr =
                    new JcaPKCS10CertificationRequestBuilder(subject, kp.getPublic()).build(signer);

            return new GeneratedCsr(
                    pem("CERTIFICATE REQUEST", csr.getEncoded()),
                    pem("PRIVATE KEY", kp.getPrivate().getEncoded())); // getEncoded() = PKCS#8 DER
        } catch (Exception e) {
            throw new ArcaException("No se pudo generar el pedido de certificado (CSR): " + e.getMessage(), e);
        }
    }

    private static String pem(String type, byte[] der) {
        String body = Base64.getMimeEncoder(64, new byte[]{'\n'}).encodeToString(der);
        return "-----BEGIN " + type + "-----\n" + body + "\n-----END " + type + "-----\n";
    }
}
