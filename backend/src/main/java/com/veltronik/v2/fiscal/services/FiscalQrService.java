package com.veltronik.v2.fiscal.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Base64;

/**
 * Arma el código QR obligatorio del comprobante (RG 4892). Es una URL de ARCA con un JSON
 * codificado en base64 que cualquiera puede escanear para verificar el comprobante.
 *
 * <p>Formato: {@code https://www.afip.gob.ar/fe/qr/?p=<base64(json)>}.</p>
 */
@Component
public class FiscalQrService {

    private static final String BASE_URL = "https://www.afip.gob.ar/fe/qr/?p=";
    private final ObjectMapper mapper = new ObjectMapper();

    public String buildQrUrl(long cuit, LocalDate fecha, int ptoVta, int tipoCmp, long nroCmp,
                             BigDecimal importe, int tipoDocRec, long nroDocRec, String cae) {
        try {
            ObjectNode node = mapper.createObjectNode();
            node.put("ver", 1);
            node.put("fecha", fecha.toString());            // yyyy-MM-dd
            node.put("cuit", cuit);
            node.put("ptoVta", ptoVta);
            node.put("tipoCmp", tipoCmp);
            node.put("nroCmp", nroCmp);
            node.put("importe", importe.setScale(2, RoundingMode.HALF_UP));
            node.put("moneda", "PES");
            node.put("ctz", 1);
            node.put("tipoDocRec", tipoDocRec);
            node.put("nroDocRec", nroDocRec);
            node.put("tipoCodAut", "E");                    // E = CAE
            node.put("codAut", Long.parseLong(cae));
            String json = mapper.writeValueAsString(node);
            String base64 = Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8));
            return BASE_URL + base64;
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo armar el QR del comprobante", e);
        }
    }
}
