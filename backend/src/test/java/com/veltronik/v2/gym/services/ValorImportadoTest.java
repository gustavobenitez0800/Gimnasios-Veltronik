package com.veltronik.v2.gym.services;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Cómo se lee cada celda de un archivo de socios. Cada caso de acá apareció, o puede
 * aparecer, en un export real de otro sistema.
 */
@DisplayName("Lectura de celdas del importador")
class ValorImportadoTest {

    private static final LocalDate HOY = LocalDate.of(2026, 9, 19);

    @Nested
    @DisplayName("fechas")
    class Fechas {

        @ParameterizedTest(name = "«{0}» → {1}")
        @CsvSource({
                "30/09/2026, 2026-09-30",
                "3/4/2026, 2026-04-03",          // día/mes: es el 3 de abril, nunca el 4 de marzo
                "30-09-2026, 2026-09-30",
                "30.09.2026, 2026-09-30",
                "30/09/26, 2026-09-30",          // año de dos cifras hacia adelante
                "15/03/85, 1985-03-15",          // y hacia atrás, para los nacimientos
                "2026-09-30, 2026-09-30",
                "2026-09-30 00:00:00, 2026-09-30", // lo que deja Excel al exportar con hora
                "2026-09-30T00:00, 2026-09-30",
                "'  30/09/2026 ', 2026-09-30",
                "46295, 2026-09-30",             // número de serie de Excel
                "29/02/2028, 2028-02-29",        // bisiesto
        })
        void seLeen(String crudo, LocalDate esperado) {
            ValorImportado.Fecha f = ValorImportado.fecha(crudo, HOY);
            assertThat(f.error()).isNull();
            assertThat(f.valor()).isEqualTo(esperado);
        }

        @Test
        @DisplayName("vacía no es error")
        void vacia() {
            assertThat(ValorImportado.fecha(null, HOY).vacia()).isTrue();
            assertThat(ValorImportado.fecha("   ", HOY).vacia()).isTrue();
        }

        @ParameterizedTest(name = "«{0}» no existe")
        @ValueSource(strings = {"31/02/2026", "29/02/2026", "31/04/2026", "0/05/2026", "32/01/2026"})
        void noExisten(String crudo) {
            ValorImportado.Fecha f = ValorImportado.fecha(crudo, HOY);
            assertThat(f.valor()).isNull();
            assertThat(f.error()).contains("no existe");
        }

        @Test
        @DisplayName("⭐ mes/día al revés: lo dice")
        void formatoYanqui() {
            // 09/30/2026 es un export en formato de Estados Unidos. El error tiene que decir por qué.
            ValorImportado.Fecha f = ValorImportado.fecha("09/30/2026", HOY);
            assertThat(f.valor()).isNull();
            assertThat(f.error()).contains("el mes 30 no existe").contains("día/mes/año");
        }

        @ParameterizedTest(name = "«{0}» no es una fecha")
        @ValueSource(strings = {"mañana", "sept 2026", "30/09", "2026", "12345678"})
        void noSonFechas(String crudo) {
            ValorImportado.Fecha f = ValorImportado.fecha(crudo, HOY);
            assertThat(f.valor()).isNull();
            assertThat(f.error()).isNotBlank();
        }
    }

    @Nested
    @DisplayName("estado")
    class Estado {

        @ParameterizedTest(name = "«{0}» es socio activo")
        @ValueSource(strings = {"Activo", "ACTIVA", "sí", "Si", "1", "Al día", "vigente", "Vencido"})
        void activos(String crudo) {
            // "Vencido" es activo a propósito: no se dio de baja, debe una cuota. Eso lo dice el
            // vencimiento, no el estado.
            assertThat(ValorImportado.estado(crudo).activo()).isTrue();
        }

        @ParameterizedTest(name = "«{0}» es baja")
        @ValueSource(strings = {"Baja", "dado de baja", "Inactivo", "NO", "0", "suspendida"})
        void bajas(String crudo) {
            assertThat(ValorImportado.estado(crudo).activo()).isFalse();
        }

        @Test
        @DisplayName("lo que no se entiende no se adivina")
        void desconocido() {
            ValorImportado.Estado e = ValorImportado.estado("congelado temporalmente");
            assertThat(e.reconocido()).isFalse();
            assertThat(e.activo()).isNull();
        }
    }

    @Nested
    @DisplayName("documento")
    class Documentos {

        @ParameterizedTest(name = "«{0}» → {1}")
        @CsvSource({
                "30.111.222, 30111222",
                "' 30111222 ', 30111222",
                "30-111-222, 30111222",
                "30111222.0, 30111222",   // pasó por una planilla y volvió con decimales
                "aa123456, AA123456",     // pasaporte
        })
        void seLimpian(String crudo, String esperado) {
            assertThat(ValorImportado.documento(crudo)).isEqualTo(esperado);
        }

        @Test
        @DisplayName("⭐ la notación científica se detecta: Excel ya perdió dígitos")
        void notacionCientifica() {
            assertThat(ValorImportado.esNotacionCientifica("3.0111222E7")).isTrue();
            assertThat(ValorImportado.esNotacionCientifica("2,0301E+10")).isTrue();
            assertThat(ValorImportado.esNotacionCientifica("30111222")).isFalse();
        }
    }

    @Test
    @DisplayName("los aranceles se comparan sin mayúsculas ni acentos")
    void claveDeArancel() {
        assertThat(ValorImportado.clave("  Musculación  "))
                .isEqualTo(ValorImportado.clave("MUSCULACION"))
                .isEqualTo("musculacion");
    }

    @Test
    @DisplayName("el teléfono se compara por sus dígitos")
    void telefono() {
        assertThat(ValorImportado.digitos("3756-41 7238")).isEqualTo(ValorImportado.digitos("3756417238"));
    }
}
