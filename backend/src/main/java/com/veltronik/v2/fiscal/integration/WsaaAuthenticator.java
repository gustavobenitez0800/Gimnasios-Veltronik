package com.veltronik.v2.fiscal.integration;

import com.veltronik.v2.fiscal.entities.FiscalEnvironment;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Autenticación contra WSAA: arma un Ticket de Requerimiento de Acceso (TRA), lo firma en CMS
 * con el certificado del tenant, lo manda a WSAA y obtiene el token+sign.
 *
 * <p><b>Cache por tenant (obligatorio):</b> el TA dura ~12 h y WSAA <i>rechaza</i> pedir uno nuevo
 * si ya hay uno vigente. Por eso se cachea por CUIT y se reutiliza hasta poco antes de vencer.</p>
 *
 * <p>Responsabilidad única: solo autenticación. No sabe de facturas (eso es de {@link ArcaSoapClient}).</p>
 */
@Component
public class WsaaAuthenticator {

    private static final String SERVICE = "wsfe";
    private static final String WSAA_NS = "http://wsaa.view.sua.dvadac.desein.afip.gov";
    private static final long REFRESH_MARGIN_SECONDS = 600; // renueva 10 min antes de vencer

    private final CmsSigner cmsSigner;
    private final SoapHttp soapHttp;
    private final ConcurrentHashMap<Long, AccessTicket> cache = new ConcurrentHashMap<>();

    public WsaaAuthenticator(CmsSigner cmsSigner, SoapHttp soapHttp) {
        this.cmsSigner = cmsSigner;
        this.soapHttp = soapHttp;
    }

    /** Devuelve un TA válido para el tenant: del cache si sigue vigente, o uno nuevo. */
    public AccessTicket getTicket(FiscalCredentials credentials) {
        Instant safeNow = Instant.now().plusSeconds(REFRESH_MARGIN_SECONDS);
        AccessTicket cached = cache.get(credentials.cuit());
        if (cached != null && cached.isValidAt(safeNow)) {
            return cached;
        }
        AccessTicket fresh = login(credentials);
        cache.put(credentials.cuit(), fresh);
        return fresh;
    }

    private AccessTicket login(FiscalCredentials credentials) {
        String tra = buildTra();
        String cms = cmsSigner.signToBase64Der(tra, credentials.certificatePem(), credentials.privateKeyPem());
        String soap = "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:wsaa=\""
                + WSAA_NS + "\"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>"
                + cms + "</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>";

        String responseBody = soapHttp.post(endpoint(credentials.environment()), "", soap);

        Document outer = SoapXml.parse(responseBody);
        String inner = SoapXml.firstText(outer, "loginCmsReturn");
        if (inner == null) {
            String fault = SoapXml.firstText(outer, "faultstring");
            throw new ArcaException("WSAA no devolvió ticket. " + (fault != null ? fault : "Respuesta inesperada."));
        }
        Document ticket = SoapXml.parse(inner);
        String token = SoapXml.firstText(ticket, "token");
        String sign = SoapXml.firstText(ticket, "sign");
        String expirationTime = SoapXml.firstText(ticket, "expirationTime");
        if (token == null || sign == null) {
            throw new ArcaException("WSAA devolvió un ticket sin token/sign.");
        }
        Instant expiration = parseExpiration(expirationTime);
        return new AccessTicket(token, sign, expiration);
    }

    private String buildTra() {
        long uniqueId = Instant.now().getEpochSecond();
        String generationTime = Instant.now().minusSeconds(600).truncatedTo(ChronoUnit.SECONDS).toString();
        String expirationTime = Instant.now().plusSeconds(600).truncatedTo(ChronoUnit.SECONDS).toString();
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<loginTicketRequest version=\"1.0\">"
                + "<header>"
                + "<uniqueId>" + uniqueId + "</uniqueId>"
                + "<generationTime>" + generationTime + "</generationTime>"
                + "<expirationTime>" + expirationTime + "</expirationTime>"
                + "</header>"
                + "<service>" + SERVICE + "</service>"
                + "</loginTicketRequest>";
    }

    private Instant parseExpiration(String value) {
        try {
            return OffsetDateTime.parse(value).toInstant();
        } catch (Exception e) {
            // Si no se pudo parsear, tratamos el TA como de vida corta para forzar el refresh.
            return Instant.now().plusSeconds(3600);
        }
    }

    private String endpoint(FiscalEnvironment environment) {
        return environment == FiscalEnvironment.PRODUCCION
                ? "https://wsaa.afip.gob.ar/ws/services/LoginCms"
                : "https://wsaahomo.afip.gob.ar/ws/services/LoginCms";
    }
}
