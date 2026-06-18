package com.veltronik.v2.fiscal.integration;

import com.veltronik.v2.fiscal.entities.FiscalEnvironment;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Adaptador nativo de WSFEv1 (el {@link ArcaClient}). Usa {@link WsaaAuthenticator} para el token
 * y arma los SOAP de {@code FECompUltimoAutorizado} y {@code FECAESolicitar} — réplica exacta de los
 * requests que ARCA homologación aceptó en el smoke-test.
 *
 * <p><b>Alcance actual:</b> Factura C (Monotributo, sin discriminar IVA) — el caso del kiosco.
 * Para Factura A/B (RI) falta agregar el array {@code <Iva>}; queda como extensión cuando una
 * vertical RI lo necesite (el {@code VoucherTypeResolver} hoy solo deriva C para Monotributo).</p>
 */
@Component
public class ArcaSoapClient implements ArcaClient {

    private static final String FEV1_NS = "http://ar.gov.afip.dif.FEV1/";
    private static final DateTimeFormatter CBTE_FCH = DateTimeFormatter.BASIC_ISO_DATE; // yyyyMMdd

    private final WsaaAuthenticator wsaa;
    private final SoapHttp soapHttp;

    public ArcaSoapClient(WsaaAuthenticator wsaa, SoapHttp soapHttp) {
        this.wsaa = wsaa;
        this.soapHttp = soapHttp;
    }

    @Override
    public long getLastAuthorizedNumber(FiscalCredentials credentials, int pointOfSale, int voucherTypeCode) {
        AccessTicket ticket = wsaa.getTicket(credentials);
        String soap = "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:ar=\""
                + FEV1_NS + "\"><soapenv:Body><ar:FECompUltimoAutorizado>"
                + authXml(ticket, credentials.cuit())
                + "<ar:PtoVta>" + pointOfSale + "</ar:PtoVta>"
                + "<ar:CbteTipo>" + voucherTypeCode + "</ar:CbteTipo>"
                + "</ar:FECompUltimoAutorizado></soapenv:Body></soapenv:Envelope>";

        String body = soapHttp.post(endpoint(credentials.environment()),
                FEV1_NS + "FECompUltimoAutorizado", soap);
        Document doc = SoapXml.parse(body);
        failIfErrors(doc);
        String cbteNro = SoapXml.firstText(doc, "CbteNro");
        if (cbteNro == null) {
            throw new ArcaException("WSFE no devolvió el último número autorizado.");
        }
        return Long.parseLong(cbteNro.trim());
    }

    @Override
    public CaeResult requestCae(FiscalCredentials credentials, CaeRequest req) {
        AccessTicket ticket = wsaa.getTicket(credentials);
        String soap = buildCaeSolicitar(ticket, credentials.cuit(), req);

        String body = soapHttp.post(endpoint(credentials.environment()),
                FEV1_NS + "FECAESolicitar", soap);
        Document doc = SoapXml.parse(body);

        String resultado = SoapXml.firstText(doc, "Resultado");
        String observations = String.join(" | ", SoapXml.allText(doc, "Msg"));
        if (resultado == null) {
            // Sin Resultado y con errores → no pudimos determinar el resultado (falla de protocolo).
            throw new ArcaException("WSFE no devolvió Resultado. " + observations);
        }
        String cae = SoapXml.firstText(doc, "CAE");
        LocalDate caeVto = parseDate(SoapXml.firstText(doc, "CAEFchVto"));
        long number = parseLong(SoapXml.firstText(doc, "CbteDesde"), req.number());
        return new CaeResult(resultado.trim(), blankToNull(cae), caeVto, number, observations.isBlank() ? null : observations);
    }

    private String buildCaeSolicitar(AccessTicket ticket, long cuit, CaeRequest r) {
        return "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:ar=\""
                + FEV1_NS + "\"><soapenv:Body><ar:FECAESolicitar>"
                + authXml(ticket, cuit)
                + "<ar:FeCAEReq>"
                + "<ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>" + r.pointOfSale()
                + "</ar:PtoVta><ar:CbteTipo>" + r.voucherTypeCode() + "</ar:CbteTipo></ar:FeCabReq>"
                + "<ar:FeDetReq><ar:FECAEDetRequest>"
                + "<ar:Concepto>" + r.concepto() + "</ar:Concepto>"
                + "<ar:DocTipo>" + r.docTipo() + "</ar:DocTipo>"
                + "<ar:DocNro>" + r.docNro() + "</ar:DocNro>"
                + "<ar:CbteDesde>" + r.number() + "</ar:CbteDesde>"
                + "<ar:CbteHasta>" + r.number() + "</ar:CbteHasta>"
                + "<ar:CbteFch>" + r.date().format(CBTE_FCH) + "</ar:CbteFch>"
                + "<ar:ImpTotal>" + money(r.totalAmount()) + "</ar:ImpTotal>"
                + "<ar:ImpTotConc>0.00</ar:ImpTotConc>"
                + "<ar:ImpNeto>" + money(r.netAmount()) + "</ar:ImpNeto>"
                + "<ar:ImpOpEx>0.00</ar:ImpOpEx>"
                + "<ar:ImpTrib>0.00</ar:ImpTrib>"
                + "<ar:ImpIVA>" + money(r.ivaAmount()) + "</ar:ImpIVA>"
                + "<ar:MonId>PES</ar:MonId>"
                + "<ar:MonCotiz>1</ar:MonCotiz>"
                + "<ar:CondicionIVAReceptorId>" + r.condicionIvaReceptorId() + "</ar:CondicionIVAReceptorId>"
                + "</ar:FECAEDetRequest></ar:FeDetReq>"
                + "</ar:FeCAEReq></ar:FECAESolicitar></soapenv:Body></soapenv:Envelope>";
    }

    private String authXml(AccessTicket ticket, long cuit) {
        return "<ar:Auth><ar:Token>" + ticket.token() + "</ar:Token><ar:Sign>" + ticket.sign()
                + "</ar:Sign><ar:Cuit>" + cuit + "</ar:Cuit></ar:Auth>";
    }

    /** Errores de protocolo a nivel raíz (&lt;Errors&gt;&lt;Err&gt;): falla, no resultado de negocio. */
    private void failIfErrors(Document doc) {
        List<String> codes = SoapXml.allText(doc, "Code");
        if (!codes.isEmpty() && SoapXml.firstText(doc, "Resultado") == null) {
            throw new ArcaException("WSFE devolvió errores: " + String.join(" | ", SoapXml.allText(doc, "Msg")));
        }
    }

    private static String money(BigDecimal v) {
        return (v == null ? BigDecimal.ZERO : v).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private static LocalDate parseDate(String yyyymmdd) {
        if (yyyymmdd == null || yyyymmdd.isBlank()) return null;
        try {
            return LocalDate.parse(yyyymmdd.trim(), CBTE_FCH);
        } catch (Exception e) {
            return null;
        }
    }

    private static long parseLong(String s, long fallback) {
        try {
            return s != null ? Long.parseLong(s.trim()) : fallback;
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private String endpoint(FiscalEnvironment environment) {
        return environment == FiscalEnvironment.PRODUCCION
                ? "https://servicios1.afip.gob.ar/wsfev1/service.asmx"
                : "https://wswhomo.afip.gob.ar/wsfev1/service.asmx";
    }
}
