package com.veltronik.v2.gym.services;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

/** Cómo se leen el monto, la hora y el medio de pago de un historial de caja. */
@DisplayName("Los valores de un historial de caja")
class ImportacionCajaValoresTest {

    @ParameterizedTest(name = "«{0}» = {1}")
    @CsvSource(delimiter = ';', value = {
            "29000;29000",
            "-3500;-3500",
            "$ 29.000;29000",
            "$29.000,50;29000.50",
            "29000.5;29000.5",
            "29,000.50;29000.50",
            "1.234.567;1234567",
            "(3.500);-3500",
            "3500-;-3500",
            "10,5;10.5",
    })
    @DisplayName("el monto, como lo escribe la gente en Argentina")
    void monto(String crudo, String esperado) {
        assertThat(ImportacionCajaService.monto(crudo)).isEqualByComparingTo(esperado);
    }

    @ParameterizedTest
    @ValueSource(strings = {"veinte mil", "$", "-", "12a"})
    @DisplayName("lo que no es un monto, no se adivina")
    void montoInvalido(String crudo) {
        assertThat(ImportacionCajaService.monto(crudo)).isNull();
    }

    @ParameterizedTest(name = "«{0}» = {1}")
    @CsvSource(delimiter = ';', value = {
            "07:17;07:17",
            "7:17;07:17",
            "21:32:10;21:32:10",
            "7.17;07:17",
            "7:17 p. m.;19:17",
            "12:05 a.m.;00:05",
            "0.5;12:00",
    })
    @DisplayName("la hora, incluida la fracción de día que deja Excel")
    void hora(String crudo, String esperada) {
        assertThat(ImportacionCajaService.hora(crudo)).isEqualTo(LocalTime.parse(esperada));
    }

    @Test
    @DisplayName("una hora imposible no se corrige")
    void horaInvalida() {
        assertThat(ImportacionCajaService.hora("25:00")).isNull();
        assertThat(ImportacionCajaService.hora("mediodía")).isNull();
    }

    @ParameterizedTest(name = "«{0}» = {1}")
    @CsvSource(delimiter = ';', value = {
            "Efectivo;CASH",
            "EFECTIVO;CASH",
            "Transferencia;TRANSFER",
            "Transf.;TRANSFER",
            "Mercado Pago;MERCADOPAGO",
            "MP;MERCADOPAGO",
            "Tarjeta de Débito;CARD",
            "Tarjeta de crédito;CARD",
            "Débito;CARD",
    })
    @DisplayName("los medios de pago de ControlFit y los de siempre")
    void metodo(String crudo, String esperado) {
        assertThat(ImportacionCajaService.metodo(crudo)).isEqualTo(esperado);
    }

    @Test
    @DisplayName("un medio que no se conoce no cae en «otros» en silencio")
    void metodoDesconocido() {
        assertThat(ImportacionCajaService.metodo("Cheque")).isNull();
        assertThat(ImportacionCajaService.metodo("")).isNull();
    }
}
