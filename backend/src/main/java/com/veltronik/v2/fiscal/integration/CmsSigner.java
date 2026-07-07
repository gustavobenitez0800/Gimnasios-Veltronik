package com.veltronik.v2.fiscal.integration;

import org.bouncycastle.asn1.pkcs.PrivateKeyInfo;
import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.CMSTypedData;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.openssl.PEMKeyPair;
import org.bouncycastle.openssl.PEMParser;
import org.bouncycastle.openssl.jcajce.JcaPEMKeyConverter;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.security.PrivateKey;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.List;

/**
 * Firma el Login Ticket de WSAA en formato CMS/PKCS#7 (DER, base64) con el certificado del tenant.
 *
 * <p>Réplica exacta de lo que {@code openssl cms -sign -outform DER -nodetach} produjo en el
 * smoke-test que ARCA aceptó: SHA256withRSA, contenido encapsulado, certificado del firmante
 * incluido. Pieza pura y cohesiva (solo cripto), sin saber de HTTP ni de WSAA.</p>
 */
@Component
public class CmsSigner {

    /** Firma {@code content} y devuelve el CMS en base64 (DER), listo para el {@code in0} de WSAA. */
    public String signToBase64Der(String content, String certificatePem, String privateKeyPem) {
        try {
            X509Certificate certificate = parseCertificate(certificatePem);
            PrivateKey privateKey = parsePrivateKey(privateKeyPem);

            ContentSigner signer = new JcaContentSignerBuilder("SHA256withRSA").build(privateKey);
            CMSSignedDataGenerator generator = new CMSSignedDataGenerator();
            generator.addSignerInfoGenerator(
                    new JcaSignerInfoGeneratorBuilder(new JcaDigestCalculatorProviderBuilder().build())
                            .build(signer, certificate));
            generator.addCertificates(new JcaCertStore(List.of(certificate)));

            CMSTypedData typedData = new CMSProcessableByteArray(content.getBytes(StandardCharsets.UTF_8));
            CMSSignedData signedData = generator.generate(typedData, true); // true = encapsular contenido
            return java.util.Base64.getEncoder().encodeToString(signedData.getEncoded());
        } catch (Exception e) {
            throw new ArcaException("No se pudo firmar el ticket de acceso (CMS) para ARCA: " + e.getMessage(), e);
        }
    }

    /**
     * Valida el par certificado + clave ANTES de guardarlo (onboarding de ARCA): PEM parseable,
     * certificado vigente y clave privada que corresponde al certificado. Sin esto, un archivo
     * equivocado se guardaba en silencio y el dueño se enteraba recién cuando la emisión fallaba
     * con un error SOAP indescifrable.
     *
     * @throws IllegalArgumentException con mensaje apto para mostrarle al dueño.
     */
    public void validatePair(String certificatePem, String privateKeyPem) {
        X509Certificate certificate;
        try {
            certificate = parseCertificate(certificatePem);
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "El certificado no es válido. Subí el archivo .crt/.pem que descargaste de ARCA.");
        }
        try {
            certificate.checkValidity();
        } catch (java.security.cert.CertificateExpiredException e) {
            throw new IllegalArgumentException(
                    "El certificado está VENCIDO. Generá uno nuevo en el sitio de ARCA y volvé a subirlo.");
        } catch (java.security.cert.CertificateNotYetValidException e) {
            throw new IllegalArgumentException("El certificado todavía no entró en vigencia. Revisá la fecha de emisión.");
        }
        PrivateKey privateKey;
        try {
            privateKey = parsePrivateKey(privateKeyPem);
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "La clave privada no es válida. Subí el archivo .key que generaste junto con el pedido del certificado.");
        }
        // La clave debe ser LA PAREJA del certificado (mismo módulo RSA). Si el dueño mezcla
        // archivos de dos trámites distintos, ARCA rechazaría todo después — mejor avisarle ya.
        if (certificate.getPublicKey() instanceof java.security.interfaces.RSAPublicKey pub
                && privateKey instanceof java.security.interfaces.RSAPrivateKey priv) {
            if (!pub.getModulus().equals(priv.getModulus())) {
                throw new IllegalArgumentException(
                        "La clave privada NO corresponde a este certificado. Revisá que ambos archivos sean del mismo trámite de ARCA.");
            }
        }
    }

    private X509Certificate parseCertificate(String pem) throws Exception {
        CertificateFactory factory = CertificateFactory.getInstance("X.509");
        return (X509Certificate) factory.generateCertificate(
                new ByteArrayInputStream(pem.getBytes(StandardCharsets.UTF_8)));
    }

    /** Acepta clave PKCS#8 ("PRIVATE KEY") o PKCS#1 ("RSA PRIVATE KEY"). */
    private PrivateKey parsePrivateKey(String pem) throws Exception {
        try (PEMParser parser = new PEMParser(new StringReader(pem))) {
            Object object = parser.readObject();
            JcaPEMKeyConverter converter = new JcaPEMKeyConverter();
            if (object instanceof PEMKeyPair keyPair) {
                return converter.getKeyPair(keyPair).getPrivate();
            }
            if (object instanceof PrivateKeyInfo keyInfo) {
                return converter.getPrivateKey(keyInfo);
            }
            throw new ArcaException("Formato de clave privada no soportado");
        }
    }
}
