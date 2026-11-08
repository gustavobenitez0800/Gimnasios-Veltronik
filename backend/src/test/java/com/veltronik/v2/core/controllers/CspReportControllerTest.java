package com.veltronik.v2.core.controllers;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * El buzón de la política de seguridad: una línea por cada cosa que la política hubiera frenado,
 * sin anotar ruido de extensiones, sin anotar los códigos de los correos y con techo.
 */
@ExtendWith(OutputCaptureExtension.class)
class CspReportControllerTest {

    private final CspReportController buzon = new CspReportController(new ObjectMapper());

    private long lineas(CapturedOutput salida) {
        return salida.getOut().lines().filter(l -> l.contains(CspReportController.MARCA)).count();
    }

    @Test
    @DisplayName("⭐ el formato de report-uri deja la línea con la directiva y lo bloqueado")
    void formatoViejo(CapturedOutput salida) {
        var r = buzon.reportar("""
                {"csp-report": {"document-uri": "https://veltronik-v2.vercel.app/", "effective-directive": "connect-src",
                 "blocked-uri": "https://secure-fields.mercadopago.com/", "source-file": "https://sdk.mercadopago.com/js/v2"}}""");

        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(salida.getOut()).contains(CspReportController.MARCA)
                .contains("directiva=connect-src")
                .contains("bloqueado=https://secure-fields.mercadopago.com/");
    }

    @Test
    @DisplayName("el formato de la Reporting API (lista de csp-violation) también")
    void formatoNuevo(CapturedOutput salida) {
        buzon.reportar("""
                [{"type": "csp-violation", "body": {"documentURL": "https://veltronik-v2.vercel.app/", "effectiveDirective": "script-src-elem",
                  "blockedURL": "https://otro.example/x.js"}},
                 {"type": "deprecation", "body": {"id": "algo"}}]""");

        assertThat(lineas(salida)).isEqualTo(1);
        assertThat(salida.getOut()).contains("directiva=script-src-elem").contains("bloqueado=https://otro.example/x.js");
    }

    @Test
    @DisplayName("🔴 el código de un solo uso de los correos no llega al registro")
    void sinCodigos(CapturedOutput salida) {
        buzon.reportar("""
                {"csp-report": {"document-uri": "https://veltronik-v2.vercel.app/?token_hash=SECRETO123&type=recovery#/reset-password",
                 "effective-directive": "img-src", "blocked-uri": "https://x.example/a.png?code=OTRO456"}}""");

        assertThat(salida.getOut()).contains(CspReportController.MARCA).doesNotContain("SECRETO123").doesNotContain("OTRO456");
    }

    @Test
    @DisplayName("lo que bloquean las extensiones del navegador no es nuestro: no se anota")
    void sinExtensiones(CapturedOutput salida) {
        buzon.reportar("""
                {"csp-report": {"document-uri": "https://veltronik-v2.vercel.app/", "effective-directive": "script-src",
                 "blocked-uri": "chrome-extension://abcdef/inject.js"}}""");

        assertThat(lineas(salida)).isZero();
    }

    @Test
    @DisplayName("un cuerpo roto o vacío contesta 204 y no anota nada")
    void basura(CapturedOutput salida) {
        assertThat(buzon.reportar("esto no es json").getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(buzon.reportar("").getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(buzon.reportar(null).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(lineas(salida)).isZero();
    }

    @Test
    @DisplayName("🔴 es una puerta pública: con techo por minuto, lo que sobra se descarta")
    void conTecho(CapturedOutput salida) {
        String aviso = """
                {"csp-report": {"effective-directive": "img-src", "blocked-uri": "https://x.example/a.png"}}""";
        for (int i = 0; i < CspReportController.REPORTES_POR_MINUTO + 25; i++) buzon.reportar(aviso);

        assertThat(lineas(salida)).isEqualTo(CspReportController.REPORTES_POR_MINUTO);
    }

    @Test
    @DisplayName("⭐ el pedido como lo manda el navegador (application/csp-report) entra y contesta 204")
    void comoElNavegador(CapturedOutput salida) throws Exception {
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders
                .standaloneSetup(new CspReportController(new ObjectMapper())).build();

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/public/csp-report")
                        .contentType("application/csp-report")
                        .content("{\"csp-report\": {\"effective-directive\": \"frame-src\", \"blocked-uri\": \"https://x.example/\"}}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNoContent());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/public/csp-report")
                        .contentType("application/reports+json")
                        .content("[{\"type\": \"csp-violation\", \"body\": {\"effectiveDirective\": \"img-src\", \"blockedURL\": \"https://y.example/\"}}]"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNoContent());

        assertThat(lineas(salida)).isEqualTo(2);
    }

    @Test
    @DisplayName("sinConsulta corta en ? y en #")
    void corta() {
        assertThat(CspReportController.sinConsulta("https://a.b/x?y=1#z")).isEqualTo("https://a.b/x");
        assertThat(CspReportController.sinConsulta("https://a.b/#/reset?t=1")).isEqualTo("https://a.b/");
        assertThat(CspReportController.sinConsulta(null)).isNull();
    }
}
