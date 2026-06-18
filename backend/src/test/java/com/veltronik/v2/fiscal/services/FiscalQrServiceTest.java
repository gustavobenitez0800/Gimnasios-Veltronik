package com.veltronik.v2.fiscal.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

/** Tests del armado del QR de ARCA: la URL debe contener el JSON correcto en base64. */
class FiscalQrServiceTest {

    private final FiscalQrService qr = new FiscalQrService();
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    @DisplayName("buildQrUrl arma la URL de ARCA con el payload correcto")
    void buildsValidQr() throws Exception {
        String url = qr.buildQrUrl(20460764484L, LocalDate.of(2026, 6, 17), 1, 11, 1,
                new BigDecimal("100.00"), 99, 0, "86240272753567");

        assertTrue(url.startsWith("https://www.afip.gob.ar/fe/qr/?p="), url);

        String b64 = url.substring(url.indexOf("?p=") + 3);
        String json = new String(Base64.getDecoder().decode(b64), StandardCharsets.UTF_8);
        JsonNode n = mapper.readTree(json);

        assertEquals(1, n.get("ver").asInt());
        assertEquals("2026-06-17", n.get("fecha").asText());
        assertEquals(20460764484L, n.get("cuit").asLong());
        assertEquals(1, n.get("ptoVta").asInt());
        assertEquals(11, n.get("tipoCmp").asInt());
        assertEquals(1, n.get("nroCmp").asLong());
        assertEquals(0, new BigDecimal("100.00").compareTo(n.get("importe").decimalValue()));
        assertEquals("PES", n.get("moneda").asText());
        assertEquals(99, n.get("tipoDocRec").asInt());
        assertEquals("E", n.get("tipoCodAut").asText());
        assertEquals(86240272753567L, n.get("codAut").asLong());
    }
}
