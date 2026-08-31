package com.veltronik.v2.gym.security;

import com.veltronik.v2.gym.entities.GymMember;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * La cuenta de días de la cuota, que ahora es la ÚNICA del sistema.
 *
 * <p><b>Por qué existe este test:</b> la misma cuenta estaba escrita en cinco lugares del
 * frontend y no daban lo mismo. Para el mismo socio, el aviso del mostrador decía "hace 2
 * días" y la lista decía "4d vencido". Dos errores que se sumaban: la lista recortaba la hora
 * del vencimiento, y un texto {@code "2026-08-27"} en JavaScript se lee como UTC — que en
 * Argentina son tres horas antes.</p>
 *
 * <p>Un socio no puede deber dos cantidades distintas de días según qué pantalla mire.</p>
 */
class MemberAccessPolicyTest {

    private static final int GRACIA = 3;
    private final MemberAccessPolicy policy = new MemberAccessPolicy(GRACIA);

    private static GymMember socio(LocalDateTime vence) {
        GymMember m = new GymMember();
        m.setActive(true);
        m.setMembershipEnd(vence);
        return m;
    }

    @Nested
    @DisplayName("el caso que rompió")
    class ElCasoReal {

        /**
         * Los números exactos del reporte: vencimiento 27/08 21:30, consultado el 30/08 21:18.
         * El backend decía 2 y la pantalla 4. El bueno es el 2.
         */
        @Test
        @DisplayName("27/08 21:30 mirado el 30/08 21:18 son 2 días, no 4")
        void dosDiasNoCuatro() {
            LocalDateTime vence = LocalDateTime.of(2026, 8, 27, 21, 30);
            LocalDateTime ahora = LocalDateTime.of(2026, 8, 30, 21, 18);

            var v = policy.evaluate(socio(vence), ahora);

            assertEquals(2, v.diasVencido(),
                    "son 2 días y 23 horas: hasta que no se cumplen 3 días completos, son 2");
        }

        @Test
        @DisplayName("la hora del vencimiento CUENTA: perderla era la mitad del bug")
        void laHoraImporta() {
            LocalDateTime ahora = LocalDateTime.of(2026, 8, 30, 21, 18);

            long conHora = policy.evaluate(socio(LocalDateTime.of(2026, 8, 27, 21, 30)), ahora).diasVencido();
            long sinHora = policy.evaluate(socio(LocalDateTime.of(2026, 8, 27, 0, 0)), ahora).diasVencido();

            assertEquals(2, conHora);
            assertEquals(3, sinHora);
            assertTrue(conHora != sinHora,
                    "recortar la hora del vencimiento CAMBIA el resultado: por eso no se puede recortar");
        }
    }

    @Nested
    @DisplayName("los bordes")
    class Bordes {

        @Test
        @DisplayName("un minuto antes de vencer todavía está al día")
        void unMinutoAntes() {
            LocalDateTime ahora = LocalDateTime.of(2026, 8, 30, 12, 0);
            var v = policy.evaluate(socio(ahora.plusMinutes(1)), ahora);

            assertEquals(MemberAccessPolicy.Status.AL_DIA, v.status());
            assertFalse(v.necesitaAviso());
        }

        @Test
        @DisplayName("al que le quedan horas le falta 1 día, no 0")
        void nuncaCeroDiasRestantes() {
            LocalDateTime ahora = LocalDateTime.of(2026, 8, 30, 12, 0);
            var v = policy.evaluate(socio(ahora.plusHours(5)), ahora);

            assertEquals(1, v.diasRestantes(),
                    "decirle '0 días' a alguien que todavía puede entrenar hoy es alarmarlo de más");
        }

        @Test
        @DisplayName("recién vencido cae en gracia, no en vencido")
        void recienVencidoEsGracia() {
            LocalDateTime ahora = LocalDateTime.of(2026, 8, 30, 12, 0);
            var v = policy.evaluate(socio(ahora.minusHours(2)), ahora);

            assertEquals(MemberAccessPolicy.Status.EN_GRACIA, v.status());
            assertEquals(0, v.diasVencido(), "dos horas todavía no es un día");
        }

        @Test
        @DisplayName("pasada la gracia sí es vencido")
        void pasadaLaGraciaEsVencido() {
            LocalDateTime ahora = LocalDateTime.of(2026, 8, 30, 12, 0);
            var v = policy.evaluate(socio(ahora.minusDays(GRACIA + 1)), ahora);

            assertEquals(MemberAccessPolicy.Status.VENCIDO, v.status());
            assertEquals(GRACIA + 1, v.diasVencido());
        }
    }

    @Nested
    @DisplayName("los que no son morosos")
    class NoSonMorosos {

        @Test
        @DisplayName("sin fecha cargada NO es deuda: es un dato que falta")
        void sinFechaNoEsDeuda() {
            var v = policy.evaluate(socio(null), LocalDateTime.now());

            assertEquals(MemberAccessPolicy.Status.SIN_DATOS, v.status());
            assertEquals(0, v.diasVencido(),
                    "cobrarle días a alguien sin fecha sería inventar una deuda");
        }

        @Test
        @DisplayName("el dado de baja no debe: ya no es socio")
        void elDeBajaNoDebe() {
            GymMember m = socio(LocalDateTime.now().minusDays(100));
            m.setActive(false);

            var v = policy.evaluate(m, LocalDateTime.now());

            assertEquals(MemberAccessPolicy.Status.INACTIVO, v.status());
            assertEquals(0, v.diasVencido());
        }
    }

    /**
     * El cupo de clases: la segunda moneda de cobertura.
     *
     * <p>La regla es que la cobertura se agota por <b>lo que pase primero</b>, la fecha o las
     * clases. Un abono de "1 mes / 12 clases" cubre un mes, o doce visitas.</p>
     */
    @Nested
    @DisplayName("cupo de clases")
    class Clases {

        private GymMember conClases(LocalDateTime vence, Integer clases) {
            GymMember m = socio(vence);
            m.setClassesRemaining(clases);
            return m;
        }

        /**
         * ⭐ EL TEST QUE PROTEGE A TODOS LOS DEMÁS GIMNASIOS.
         *
         * NULL significa "acá no se cuentan clases". Si alguna vez se confunde con 0, todos
         * los socios de todos los gimnasios que no usan esta función dejarían de poder entrar
         * de un día para el otro.
         */
        @Test
        @DisplayName("sin cupo (null) se comporta EXACTAMENTE como antes")
        void sinCupoNoCambiaNada() {
            LocalDateTime ahora = LocalDateTime.now();

            var alDia = policy.evaluate(conClases(ahora.plusDays(10), null), ahora);
            assertEquals(MemberAccessPolicy.Status.AL_DIA, alDia.status());
            assertNull(alDia.clasesRestantes());
            assertFalse(alDia.usaClases());

            var vencido = policy.evaluate(conClases(ahora.minusDays(30), null), ahora);
            assertEquals(MemberAccessPolicy.Status.VENCIDO, vencido.status());
        }

        @Test
        @DisplayName("con fecha vigente y clases, está al día")
        void conClasesEntra() {
            LocalDateTime ahora = LocalDateTime.now();
            var v = policy.evaluate(conClases(ahora.plusDays(10), 5), ahora);

            assertEquals(MemberAccessPolicy.Status.AL_DIA, v.status());
            assertEquals(5, v.clasesRestantes());
            assertTrue(v.usaClases());
        }

        /**
         * Es el socio que compró 12 visitas y vino 12 veces en tres semanas. La fecha todavía
         * le da, pero el cupo no — y es exactamente lo que el gimnasio cobra distinto.
         */
        @Test
        @DisplayName("sin clases pero con fecha vigente: SIN_CLASES, no VENCIDO")
        void sinClasesNoEsVencido() {
            LocalDateTime ahora = LocalDateTime.now();
            var v = policy.evaluate(conClases(ahora.plusDays(10), 0), ahora);

            // La distinción importa: este socio NO debe plata. Decirle "vencido" sería
            // mandarlo a discutir una deuda que no tiene.
            assertEquals(MemberAccessPolicy.Status.SIN_CLASES, v.status());
            assertEquals(0, v.clasesRestantes());
            assertTrue(v.necesitaAviso());
            // Conserva los días que le quedan del período: la información sigue siendo cierta.
            assertTrue(v.diasRestantes() > 0);
        }

        /**
         * ⭐ EL ERROR QUE COSTÓ UNA MIGRACIÓN.
         *
         * Al migrar el primer gimnasio se tomaron las clases sin usar como si fueran crédito
         * vigente, y se les extendió el vencimiento. Resultado: 153 socios que no pagaban
         * desde hacía meses aparecieron al día, algunos con 141 días de más.
         *
         * El contador de clases baja cuando el socio ASISTE. El que deja de venir se queda
         * con el número congelado: "30 clases" en la ficha de alguien que pagó en abril y no
         * volvió no significa que le queden 30 clases pagas, significa que no las usó.
         *
         * Las clases NO rescatan un período vencido.
         */
        @Test
        @DisplayName("las clases que sobran NO rescatan una fecha vencida")
        void lasClasesNoRescatanElVencimiento() {
            LocalDateTime ahora = LocalDateTime.now();
            var v = policy.evaluate(conClases(ahora.minusDays(100), 30), ahora);

            assertEquals(MemberAccessPolicy.Status.VENCIDO, v.status());
            assertEquals(100, v.diasVencido());
            // El dato del cupo sigue viajando: sirve para que el mostrador vea el contexto.
            assertEquals(30, v.clasesRestantes());
        }

        @Test
        @DisplayName("el dado de baja sigue siendo INACTIVO, tenga las clases que tenga")
        void laBajaMandaSobreElCupo() {
            GymMember m = conClases(LocalDateTime.now().plusDays(10), 20);
            m.setActive(false);

            var v = policy.evaluate(m, LocalDateTime.now());

            assertEquals(MemberAccessPolicy.Status.INACTIVO, v.status());
            assertEquals(20, v.clasesRestantes());
        }
    }
}
