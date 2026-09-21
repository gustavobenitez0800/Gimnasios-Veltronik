package com.veltronik.v2.gym.services;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.ImportacionSocios.Accion;
import com.veltronik.v2.gym.dto.ImportacionSocios.Analisis;
import com.veltronik.v2.gym.dto.ImportacionSocios.Fila;
import com.veltronik.v2.gym.dto.ImportacionSocios.FilaAnalizada;
import com.veltronik.v2.gym.dto.ImportacionSocios.Pedido;
import com.veltronik.v2.gym.dto.ImportacionSocios.Resultado;
import com.veltronik.v2.gym.dto.ImportacionSocios.Ultima;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.entities.GymMemberImport;
import com.veltronik.v2.gym.entities.GymMemberImportItem;
import com.veltronik.v2.gym.entities.GymPlan;
import com.veltronik.v2.gym.repositories.GymMemberImportItemRepository;
import com.veltronik.v2.gym.repositories.GymMemberImportRepository;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.gym.repositories.GymPlanRepository;
import jakarta.persistence.EntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Importar el padrón de socios desde un archivo, y poder deshacerlo.
 *
 * <h2>Por qué existe</h2>
 * <p>La migración del primer cliente (31/08, 385 socios desde AccesoGym) se hizo con nueve
 * scripts corridos a mano: altas de a una por HTTP, sin transacción, sin forma de volver
 * atrás. Llevó cinco horas y tres scripts de reparación. Cada gimnasio que se venda trae su
 * padrón de otro sistema, y la demo que más convierte es cargárselo delante del dueño.</p>
 *
 * <h2>Las garantías, una por una</h2>
 * <ol>
 *   <li><b>Primero se mira, después se escribe.</b> {@link #analizar} dice qué va a pasar con
 *       cada fila sin tocar nada. {@link #importar} vuelve a analizar desde cero —nunca le cree
 *       a la pantalla— y recién ahí escribe.</li>
 *   <li><b>Todo o nada.</b> Una fila con error frena la importación entera. Y la escritura es
 *       una sola transacción: si algo falla a mitad de camino, no queda nada a medio cargar.
 *       Es exactamente lo que pasó el 31/08.</li>
 *   <li><b>El mismo archivo dos veces no duplica.</b> Un socio se reconoce por su documento
 *       (con la misma vara que usa el check-in, {@link Documento}). La segunda vez da todo
 *       "sin cambios". Por eso el documento es obligatorio: sin él no hay forma de reconocer
 *       a nadie la próxima vez.</li>
 *   <li><b>Una celda vacía no borra nada.</b> Si el archivo no trae el teléfono, el teléfono
 *       que ya estaba en Veltronik se queda.</li>
 *   <li><b>El archivo no le gana a los cobros.</b> A un socio que ya cobra por Veltronik la
 *       importación no le mueve el vencimiento: desde el primer cobro, la fecha la corren los
 *       cobros. Es la otra trampa del 31/08 al revés: allá los pagos importados revivían
 *       socios; acá un archivo viejo no puede pisar lo que se cobró después.</li>
 *   <li><b>Se puede deshacer</b> la última, mientras nadie haya tocado lo que puso.</li>
 * </ol>
 *
 * <h2>Lo que NO importa, a propósito</h2>
 * <p>La historia de pagos. El vencimiento del archivo ya dice lo que importa —si está al día—,
 * y cargar pagos viejos es lo que el 31/08 reactivó ex-socios y corrió fechas que no había
 * que correr. El historial de caja tiene su propio importador ({@link ImportacionCajaService}),
 * que lo carga como HISTORIA: suma en los ingresos y no toca ningún vencimiento (ADR-014).</p>
 */
@Service
public class ImportacionSociosService {

    /** Tope por archivo. Un gimnasio grande tiene 2.000 socios; 5.000 es holgado. */
    public static final int MAXIMO_FILAS = 5000;

    /** A qué hora vence un socio cuyo archivo solo dice la fecha: al cerrar el día. */
    private static final int HORA_FIN = 23, MINUTO_FIN = 59, SEGUNDO_FIN = 59;

    private static final DateTimeFormatter DMA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final GymMemberRepository socios;
    private final GymPlanRepository aranceles;
    private final GymMemberImportRepository importaciones;
    private final GymMemberImportItemRepository items;
    private final EntityManager em;
    private final ObjectMapper json;

    public ImportacionSociosService(GymMemberRepository socios, GymPlanRepository aranceles,
                                    GymMemberImportRepository importaciones,
                                    GymMemberImportItemRepository items,
                                    EntityManager em, ObjectMapper json) {
        this.socios = socios;
        this.aranceles = aranceles;
        this.importaciones = importaciones;
        this.items = items;
        this.em = em;
        this.json = json;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // API
    // ════════════════════════════════════════════════════════════════════════════

    /** Qué pasaría. No escribe nada. */
    @Transactional(readOnly = true)
    public Analisis analizar(Pedido pedido) {
        return resumir(decidir(pedido, LocalDate.now()));
    }

    /**
     * Escribe. Si hay una sola fila con error, no escribe nada y tira
     * {@link ImportacionConErrores} con el análisis completo, para que la pantalla lo muestre.
     */
    @Transactional
    public Resultado importar(Pedido pedido) {
        UUID tenantId = tenantActual();
        // Dos importaciones a la vez del mismo gimnasio (un doble clic, dos pestañas) verían
        // los dos a los mismos socios como "nuevos" y los darían de alta dos veces: el documento
        // no tiene índice único en la base. Con el candado, la segunda espera a que termine la
        // primera y al analizar ya los encuentra: le da todo "sin cambios".
        candado(tenantId);

        List<Decision> decisiones = decidir(pedido, LocalDate.now());
        Analisis analisis = resumir(decisiones);
        if (analisis.conError() > 0) {
            throw new ImportacionConErrores(analisis);
        }
        if (analisis.crear() + analisis.actualizar() == 0) {
            return new Resultado(null, 0, 0, analisis.sinCambios());
        }

        GymMemberImport lote = new GymMemberImport();
        lote.setTenant(tenantRef(tenantId));
        lote.setArchivo(recortar(pedido.archivo(), 255));
        lote.setImportadoPor(SecurityUtils.getCurrentUserId());
        lote.setCreados(analisis.crear());
        lote.setActualizados(analisis.actualizar());
        lote.setSinCambios(analisis.sinCambios());
        lote.setAplicadaAt(LocalDateTime.now()); // provisorio: se fija al terminar de escribir
        importaciones.save(lote);

        List<GymMemberImportItem> rastro = new ArrayList<>();
        for (Decision d : decisiones) {
            if (d.accion == Accion.CREAR) {
                GymMember nuevo = socioNuevo(d.datos, tenantId);
                socios.save(nuevo);
                rastro.add(item(lote, tenantId, nuevo.getId(), GymMemberImportItem.CREADO, null));
            } else if (d.accion == Accion.ACTUALIZAR) {
                d.despues.forEach((campo, valor) -> asignar(d.existente, campo, valor));
                socios.save(d.existente);
                rastro.add(item(lote, tenantId, d.existente.getId(), GymMemberImportItem.ACTUALIZADO,
                        aJson(d.antes)));
            }
        }
        items.saveAll(rastro);

        // La línea que separa "lo que puso la importación" de "lo que pasó después". Se toma
        // DESPUÉS de bajar todo a la base: el updated_at de cada socio que se escribió queda
        // antes de este instante, y cualquier cambio posterior, después.
        socios.flush();
        lote.setAplicadaAt(LocalDateTime.now());
        importaciones.save(lote);

        return new Resultado(lote.getId(), analisis.crear(), analisis.actualizar(), analisis.sinCambios());
    }

    /** La última importación del gimnasio, y si se puede deshacer. Vacío si nunca importó. */
    @Transactional(readOnly = true)
    public Optional<Ultima> ultima() {
        return importaciones.findFirstByTenantIdOrderByCreatedAtDesc(tenantActual()).map(this::describir);
    }

    /**
     * Deshace una importación: borra los socios que creó y les devuelve a los que actualizó
     * lo que tenían. Solo la última que sigue en pie, y solo si nadie tocó lo que puso.
     */
    @Transactional
    public Ultima deshacer(UUID importacionId) {
        UUID tenantId = tenantActual();
        candado(tenantId);

        GymMemberImport lote = importaciones.findById(importacionId)
                .filter(l -> l.getTenant().getId().equals(tenantId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe esa importación."));

        String porQueNo = motivoParaNoDeshacer(lote);
        if (porQueNo != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, porQueNo);
        }

        List<GymMemberImportItem> rastro = items.findByImportId(lote.getId());
        List<UUID> creados = new ArrayList<>();
        for (GymMemberImportItem it : rastro) {
            if (GymMemberImportItem.CREADO.equals(it.getAccion())) {
                creados.add(it.getMemberId());
            } else {
                GymMember s = socios.findById(it.getMemberId()).orElse(null);
                if (s == null) continue; // se purgó con la cuenta: no hay a quién devolverle nada
                deJson(it.getAntes()).forEach((campo, valor) -> asignar(s, campo, valor));
                socios.save(s);
            }
        }

        if (!creados.isEmpty()) {
            try {
                socios.borrarLosQueCreoUnaImportacion(tenantId, creados);
            } catch (DataIntegrityViolationException e) {
                // Algo que no es un cobro ni una entrada los referencia (una reserva de clase,
                // por ejemplo). Todo vuelve atrás: nunca queda un deshacer a medias.
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Algunos de los socios importados ya se usaron en otra parte del sistema. "
                                + "No se deshizo nada.");
            }
        }

        // El borrado masivo limpió la sesión: el lote se vuelve a leer antes de marcarlo.
        GymMemberImport vigente = importaciones.findById(lote.getId()).orElseThrow();
        vigente.setDeshechaAt(LocalDateTime.now());
        vigente.setDeshechaPor(SecurityUtils.getCurrentUserId());
        importaciones.save(vigente);
        return describir(vigente);
    }

    /** La importación no se hizo porque el archivo tiene errores. Lleva el análisis adentro. */
    public static class ImportacionConErrores extends RuntimeException {
        private final transient Analisis analisis;

        public ImportacionConErrores(Analisis analisis) {
            super(analisis.conError() + " filas con error: no se importó nada.");
            this.analisis = analisis;
        }

        public Analisis getAnalisis() {
            return analisis;
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // Decidir qué pasa con cada fila
    // ════════════════════════════════════════════════════════════════════════════

    /** Lo que se sabe de una fila una vez leída. {@code null} = el archivo no lo trae. */
    private record Datos(String nombre, String apellido, String documento, String telefono,
                         String email, LocalDate nacimiento, LocalDate alta, LocalDate vencimiento,
                         GymPlan arancel, Boolean activo, String notas, String direccion,
                         String contactoEmergencia, String telefonoEmergencia, String genero) {
    }

    private static final class Decision {
        final int fila;
        final String nombreVisible;
        final String documento;
        final List<String> errores = new ArrayList<>();
        final List<String> avisos = new ArrayList<>();
        final List<String> cambios = new ArrayList<>();
        /** Valor anterior de cada campo que cambia, en texto: lo que se guarda para deshacer. */
        final Map<String, String> antes = new LinkedHashMap<>();
        /** Valor nuevo de cada campo que cambia, en el mismo formato. */
        final Map<String, String> despues = new LinkedHashMap<>();
        Datos datos;
        GymMember existente;
        Accion accion;

        Decision(int fila, String nombreVisible, String documento) {
            this.fila = fila;
            this.nombreVisible = nombreVisible;
            this.documento = documento;
        }
    }

    private List<Decision> decidir(Pedido pedido, LocalDate hoy) {
        if (pedido == null || pedido.filas() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El archivo no trae filas.");
        }
        List<Fila> filas = pedido.filas().stream().filter(f -> f != null && !vacia(f)).toList();
        if (filas.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El archivo no tiene socios: todas las filas están vacías.");
        }
        if (filas.size() > MAXIMO_FILAS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El archivo tiene " + filas.size() + " filas y el máximo es " + MAXIMO_FILAS
                            + ". Dividilo en dos y subí cada parte.");
        }

        UUID tenantId = tenantActual();
        Map<String, List<GymPlan>> arancelesPorClave = aranceles.findByTenantIdAndIsActiveTrueOrderByPriceAsc(tenantId)
                .stream().collect(Collectors.groupingBy(p -> ValorImportado.clave(p.getName())));

        // 1) Leer cada fila por separado: lo que se puede decir sin mirar la base.
        List<Decision> decisiones = new ArrayList<>();
        for (int i = 0; i < filas.size(); i++) {
            decisiones.add(leer(filas.get(i), i, hoy, arancelesPorClave));
        }

        // 2) El mismo documento dos veces en el archivo: no se sabe cuál de las dos es la buena.
        Map<String, List<Decision>> repetidos = decisiones.stream()
                .filter(d -> !d.documento.isEmpty())
                .collect(Collectors.groupingBy(d -> d.documento, TreeMap::new, Collectors.toList()));
        repetidos.values().stream().filter(l -> l.size() > 1).forEach(l -> {
            String cuales = l.stream().map(d -> String.valueOf(d.fila)).collect(Collectors.joining(", "));
            l.forEach(d -> d.errores.add("El documento " + d.documento + " está repetido en las filas "
                    + cuales + ". Dejá una sola."));
        });

        // 3) Contra lo que ya hay en Veltronik.
        Map<String, List<GymMember>> existentes = new HashMap<>();
        for (GymMember m : socios.findByTenantIdAndDeletedAtIsNull(tenantId)) {
            String doc = Documento.normalizar(m.getDocument());
            if (!doc.isEmpty()) existentes.computeIfAbsent(doc, k -> new ArrayList<>()).add(m);
        }
        Set<String> enPapelera = new HashSet<>(socios.documentosEnPapelera(tenantId));

        List<UUID> candidatos = decisiones.stream()
                .map(d -> existentes.getOrDefault(d.documento, List.of()))
                .filter(l -> l.size() == 1).map(l -> l.get(0).getId()).toList();
        Set<UUID> conCobros = candidatos.isEmpty() ? Set.of() : new HashSet<>(socios.conCobros(candidatos));

        for (Decision d : decisiones) {
            if (d.documento.isEmpty()) continue; // ya tiene su error
            List<GymMember> iguales = existentes.getOrDefault(d.documento, List.of());
            if (iguales.size() > 1) {
                d.errores.add("En Veltronik ya hay " + iguales.size() + " socios con el documento "
                        + d.documento + ". Unificalos (borrá el que sobra) antes de importar.");
            } else if (iguales.size() == 1) {
                d.existente = iguales.get(0);
                if (d.datos != null) comparar(d, conCobros.contains(d.existente.getId()));
            } else if (enPapelera.contains(d.documento)) {
                d.avisos.add("Hay un socio en la papelera con este documento. Si es la misma persona, "
                        + "conviene restaurarlo desde la papelera: así recupera sus visitas y cobros.");
            }
        }

        for (Decision d : decisiones) {
            if (!d.errores.isEmpty()) d.accion = Accion.ERROR;
            else if (d.existente == null) d.accion = Accion.CREAR;
            else if (d.despues.isEmpty()) d.accion = Accion.SIN_CAMBIOS;
            else d.accion = Accion.ACTUALIZAR;
        }
        return decisiones;
    }

    /** Todo lo que se puede saber de una fila sin mirar la base. */
    private Decision leer(Fila f, int indice, LocalDate hoy, Map<String, List<GymPlan>> arancelesPorClave) {
        int numero = f.fila() != null ? f.fila() : indice + 2; // fila 1 = encabezados
        String nombre = ValorImportado.texto(f.nombre());
        String apellido = ValorImportado.texto(f.apellido());
        String visible = String.join(" ", nombre != null ? nombre : "", apellido != null ? apellido : "").trim();

        String documento = ValorImportado.documento(f.documento());
        Decision d = new Decision(numero, visible, documento);

        // ── Identidad: lo único obligatorio además del vencimiento ──
        if (nombre == null && apellido == null) {
            d.errores.add("Falta el nombre.");
        }
        if (ValorImportado.esNotacionCientifica(f.documento())) {
            d.errores.add("El documento «" + ValorImportado.texto(f.documento()) + "» quedó en notación "
                    + "científica: Excel lo convirtió en número. Poné la columna como Texto y volvé a exportar.");
        } else if (documento.isEmpty()) {
            d.errores.add("Falta el documento. Sin él no se lo puede reconocer si volvés a importar, "
                    + "ni buscarlo en el mostrador.");
        } else if (documento.length() < 6) {
            d.errores.add("El documento «" + documento + "» es demasiado corto. ¿Le faltan números?");
        } else if (documento.length() > 20) {
            d.errores.add("El documento «" + documento + "» es demasiado largo.");
        }
        largo(d, "El nombre", nombre, 255);
        largo(d, "El apellido", apellido, 255);

        // ── Fechas ──
        ValorImportado.Fecha venc = ValorImportado.fecha(f.vencimiento(), hoy);
        ValorImportado.Fecha alta = ValorImportado.fecha(f.alta(), hoy);
        ValorImportado.Fecha nac = ValorImportado.fecha(f.nacimiento(), hoy);
        if (venc.error() != null) d.errores.add("Vencimiento: " + venc.error());
        if (alta.error() != null) d.errores.add("Alta: " + alta.error());
        if (nac.error() != null) d.errores.add("Nacimiento: " + nac.error());

        if (venc.valor() != null) {
            if (venc.valor().getYear() < 2000 || venc.valor().isAfter(hoy.plusYears(5))) {
                d.errores.add("El vencimiento " + dma(venc.valor()) + " está fuera de lo posible.");
            } else if (venc.valor().isAfter(hoy.plusMonths(13))) {
                // El caso de Dana (31/08): un plan anual vencía en 2027 y alguien lo "corrigió"
                // a 2026. Un vencimiento lejano puede ser correcto; se muestra para que se mire.
                d.avisos.add("Vence el " + dma(venc.valor()) + ", en más de un año. Si no es un plan "
                        + "anual, revisá el año.");
            }
        } else if (venc.vacia()) {
            d.avisos.add("Sin vencimiento: no va a aparecer en vencidos ni en los avisos del mostrador.");
        }
        if (alta.valor() != null && venc.valor() != null && alta.valor().isAfter(venc.valor())) {
            d.errores.add("La fecha de alta (" + dma(alta.valor()) + ") es posterior al vencimiento ("
                    + dma(venc.valor()) + ").");
        }
        if (alta.valor() != null && alta.valor().isAfter(hoy)) {
            d.errores.add("La fecha de alta (" + dma(alta.valor()) + ") está en el futuro.");
        }
        if (nac.valor() != null) {
            if (nac.valor().isAfter(hoy)) {
                d.errores.add("La fecha de nacimiento (" + dma(nac.valor()) + ") está en el futuro.");
            } else if (nac.valor().isBefore(hoy.minusYears(110))) {
                d.errores.add("La fecha de nacimiento (" + dma(nac.valor()) + ") es imposible.");
            } else if (nac.valor().isAfter(hoy.minusYears(3))) {
                d.avisos.add("Según la fecha de nacimiento tiene menos de 3 años. ¿Está bien el año?");
            }
        }

        // ── Estado ──
        ValorImportado.Estado estado = ValorImportado.estado(f.estado());
        if (!estado.reconocido()) {
            d.avisos.add("No entiendo el estado «" + ValorImportado.texto(f.estado()) + "». Se importa como "
                    + "está en Veltronik (o activo, si es nuevo). Usá «Activo» o «Baja».");
        }

        // ── Email ──
        String email = ValorImportado.texto(f.email());
        if (email != null) {
            email = email.toLowerCase();
            if (!ValorImportado.emailValido(email)) {
                d.avisos.add("El email «" + email + "» no parece válido: se importa sin email.");
                email = null;
            }
        }

        // ── Arancel ──
        GymPlan arancel = null;
        String nombreArancel = ValorImportado.texto(f.arancel());
        if (nombreArancel != null) {
            List<GymPlan> coinciden = arancelesPorClave.getOrDefault(ValorImportado.clave(nombreArancel), List.of());
            if (coinciden.size() == 1) {
                arancel = coinciden.get(0);
            } else if (coinciden.isEmpty()) {
                d.avisos.add("El arancel «" + nombreArancel + "» no existe en Veltronik. Queda sin arancel: "
                        + "creálo en Aranceles y volvé a subir el mismo archivo, se completa solo.");
            } else {
                d.avisos.add("Hay " + coinciden.size() + " aranceles que se llaman «" + nombreArancel
                        + "». Queda sin arancel hasta que se distingan.");
            }
        }

        String telefono = ValorImportado.texto(f.telefono());
        if (ValorImportado.esNotacionCientifica(telefono)) {
            d.avisos.add("El teléfono «" + telefono + "» quedó en notación científica: se importa sin teléfono.");
            telefono = null;
        }
        String telEmergencia = ValorImportado.texto(f.telefonoEmergencia());
        String genero = ValorImportado.texto(f.genero());
        String direccion = ValorImportado.texto(f.direccion());
        String contacto = ValorImportado.texto(f.contactoEmergencia());
        largo(d, "El teléfono", telefono, 255);
        largo(d, "El teléfono de emergencia", telEmergencia, 50);
        largo(d, "El género", genero, 50);
        largo(d, "La dirección", direccion, 255);
        largo(d, "El contacto de emergencia", contacto, 255);

        // Las notas conservan sus renglones: solo se recortan los bordes.
        String notas = f.notas() == null || f.notas().isBlank() ? null : f.notas().strip();

        d.datos = new Datos(nombre, apellido, documento, telefono, email, nac.valor(), alta.valor(),
                venc.valor(), arancel, estado.activo(), notas, direccion, contacto, telEmergencia, genero);
        return d;
    }

    /** Qué le cambiaría el archivo a un socio que ya existe. Solo lo que el archivo trae. */
    private void comparar(Decision d, boolean cobraPorVeltronik) {
        GymMember m = d.existente;
        Datos x = d.datos;

        // El nombre se compara entero y sin mayúsculas: "ANA GOMEZ" contra "Ana Gomez" no es un
        // cambio, y pisar un nombre que alguien ya prolijó con el de un archivo en mayúsculas
        // sería retroceder. Tampoco lo es "Ana Gómez" en una columna contra "Ana" + "Gómez".
        if (x.nombre() != null || x.apellido() != null) {
            String actual = unir(m.getFirstName(), m.getLastName());
            String nuevo = unir(x.nombre(), x.apellido());
            if (!actual.equalsIgnoreCase(nuevo)) {
                cambio(d, "firstName", m.getFirstName(), vacioSiNull(x.nombre()), null);
                cambio(d, "lastName", m.getLastName(), vacioSiNull(x.apellido()), null);
                d.cambios.add("Nombre: " + actual + " → " + nuevo);
            }
        }
        if (x.telefono() != null && !ValorImportado.digitos(x.telefono()).equals(ValorImportado.digitos(m.getPhone()))) {
            cambio(d, "phone", m.getPhone(), x.telefono(), "Teléfono");
        }
        if (x.email() != null && !x.email().equalsIgnoreCase(Objects.toString(m.getEmail(), ""))) {
            cambio(d, "email", m.getEmail(), x.email(), "Email");
        }
        if (x.nacimiento() != null && !x.nacimiento().equals(m.getBirthDate())) {
            cambio(d, "birthDate", texto(m.getBirthDate()), x.nacimiento().toString(), "Nacimiento");
        }
        if (x.alta() != null) {
            LocalDate actual = m.getMembershipStart() == null ? null : m.getMembershipStart().toLocalDate();
            if (!x.alta().equals(actual)) {
                cambio(d, "membershipStart", texto(m.getMembershipStart()), x.alta().atStartOfDay().toString(), "Alta");
            }
        }
        if (x.vencimiento() != null) {
            LocalDate actual = m.getMembershipEnd() == null ? null : m.getMembershipEnd().toLocalDate();
            if (!x.vencimiento().equals(actual)) {
                if (cobraPorVeltronik) {
                    d.avisos.add("Ya cobra por Veltronik: el vencimiento lo corren los cobros, no el archivo. "
                            + "Se queda en " + dma(actual) + " (el archivo dice " + dma(x.vencimiento()) + ").");
                } else {
                    if (actual != null && x.vencimiento().isBefore(actual)) {
                        d.avisos.add("El vencimiento retrocede del " + dma(actual) + " al " + dma(x.vencimiento())
                                + ". ¿El archivo es más viejo que lo que ya está cargado?");
                    }
                    cambio(d, "membershipEnd", texto(m.getMembershipEnd()),
                            finDelDia(x.vencimiento()).toString(), "Vencimiento");
                }
            }
        }
        if (x.arancel() != null) {
            UUID actual = m.getPlan() == null ? null : m.getPlan().getId();
            if (!x.arancel().getId().equals(actual)) {
                d.antes.put("planId", actual == null ? null : actual.toString());
                d.despues.put("planId", x.arancel().getId().toString());
                d.cambios.add("Arancel: " + (m.getPlan() == null ? "(ninguno)" : m.getPlan().getName())
                        + " → " + x.arancel().getName());
            }
        }
        if (x.activo() != null && x.activo() != m.isActive()) {
            d.antes.put("active", String.valueOf(m.isActive()));
            d.despues.put("active", String.valueOf(x.activo()));
            d.cambios.add("Estado: " + (m.isActive() ? "activo" : "baja") + " → " + (x.activo() ? "activo" : "baja"));
        }
        textoLibre(d, "notes", m.getNotes(), x.notas(), "Notas");
        textoLibre(d, "address", m.getAddress(), x.direccion(), "Dirección");
        textoLibre(d, "emergencyContact", m.getEmergencyContact(), x.contactoEmergencia(), "Contacto de emergencia");
        textoLibre(d, "emergencyPhone", m.getEmergencyPhone(), x.telefonoEmergencia(), "Teléfono de emergencia");
        textoLibre(d, "gender", m.getGender(), x.genero(), "Género");
    }

    private static void textoLibre(Decision d, String campo, String actual, String nuevo, String etiqueta) {
        if (nuevo != null && !nuevo.equals(actual == null ? null : actual.strip())) {
            cambio(d, campo, actual, nuevo, etiqueta);
        }
    }

    private static void cambio(Decision d, String campo, String antes, String despues, String etiqueta) {
        d.antes.put(campo, antes);
        d.despues.put(campo, despues);
        if (etiqueta != null) {
            d.cambios.add(etiqueta + ": " + (antes == null || antes.isBlank() ? "(vacío)" : legible(antes))
                    + " → " + legible(despues));
        }
    }

    private Analisis resumir(List<Decision> decisiones) {
        int crear = 0, actualizar = 0, sinCambios = 0, conError = 0, conAviso = 0;
        List<FilaAnalizada> filas = new ArrayList<>();
        for (Decision d : decisiones) {
            switch (d.accion) {
                case CREAR -> crear++;
                case ACTUALIZAR -> actualizar++;
                case SIN_CAMBIOS -> sinCambios++;
                case ERROR -> conError++;
            }
            if (!d.avisos.isEmpty()) conAviso++;
            filas.add(new FilaAnalizada(d.fila, d.nombreVisible, d.documento, d.accion,
                    List.copyOf(d.errores), List.copyOf(d.avisos), List.copyOf(d.cambios)));
        }
        return new Analisis(decisiones.size(), crear, actualizar, sinCambios, conError, conAviso,
                avisosGenerales(decisiones), filas);
    }

    /** Lo que se repite en muchas filas se dice una vez arriba, agrupado. */
    private static List<String> avisosGenerales(List<Decision> decisiones) {
        List<String> generales = new ArrayList<>();
        Map<String, Long> sinArancel = decisiones.stream()
                .flatMap(d -> d.avisos.stream())
                .filter(a -> a.startsWith("El arancel «") && a.contains("no existe"))
                .map(a -> a.substring("El arancel «".length(), a.indexOf('»')))
                .collect(Collectors.groupingBy(n -> n, TreeMap::new, Collectors.counting()));
        sinArancel.forEach((nombre, cuantos) -> generales.add("El arancel «" + nombre + "» no existe en Veltronik ("
                + cuantos + (cuantos == 1 ? " socio" : " socios") + "). Creálo en Aranceles y volvé a subir el "
                + "mismo archivo: se completa solo."));

        long sinVencimiento = decisiones.stream()
                .filter(d -> d.accion != Accion.ERROR && d.avisos.stream().anyMatch(a -> a.startsWith("Sin vencimiento")))
                .count();
        if (sinVencimiento > 0) {
            generales.add(sinVencimiento + (sinVencimiento == 1 ? " socio no tiene" : " socios no tienen")
                    + " vencimiento: no van a aparecer en vencidos ni en los avisos del mostrador.");
        }
        long enPapelera = decisiones.stream()
                .filter(d -> d.avisos.stream().anyMatch(a -> a.startsWith("Hay un socio en la papelera")))
                .count();
        if (enPapelera > 0) {
            generales.add(enPapelera + (enPapelera == 1 ? " socio nuevo coincide" : " socios nuevos coinciden")
                    + " con socios que están en la papelera.");
        }
        return generales;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // Escribir y deshacer
    // ════════════════════════════════════════════════════════════════════════════

    private static GymMember socioNuevo(Datos x, UUID tenantId) {
        GymMember m = new GymMember();
        m.setTenant(tenantRef(tenantId));
        // El nombre NO se parte si vino en una sola columna: en AccesoGym convivían
        // "ABRIL NOGUEIRA" y "acinas delfina". Va entero y no se inventa un orden.
        m.setFirstName(vacioSiNull(x.nombre()));
        m.setLastName(vacioSiNull(x.apellido()));
        // Se guarda limpio: el mostrador y el check-in comparan limpio de los dos lados.
        m.setDocument(x.documento());
        m.setEmail(vacioSiNull(x.email()));
        m.setPhone(x.telefono());
        m.setActive(x.activo() == null || x.activo());
        if (x.alta() != null) m.setMembershipStart(x.alta().atStartOfDay());
        if (x.vencimiento() != null) m.setMembershipEnd(finDelDia(x.vencimiento()));
        m.setBirthDate(x.nacimiento());
        m.setPlan(x.arancel());
        m.setNotes(x.notas());
        m.setAddress(x.direccion());
        m.setEmergencyContact(x.contactoEmergencia());
        m.setEmergencyPhone(x.telefonoEmergencia());
        m.setGender(x.genero());
        return m;
    }

    /**
     * Pone un campo en un valor dado en texto. Lo usan los dos sentidos —aplicar la importación
     * y deshacerla—, así que no puede haber un campo que se sepa escribir y no restaurar.
     */
    private void asignar(GymMember m, String campo, String valor) {
        switch (campo) {
            case "firstName" -> m.setFirstName(vacioSiNull(valor));
            case "lastName" -> m.setLastName(vacioSiNull(valor));
            case "phone" -> m.setPhone(valor);
            case "email" -> m.setEmail(vacioSiNull(valor));
            case "birthDate" -> m.setBirthDate(valor == null ? null : LocalDate.parse(valor));
            case "membershipStart" -> m.setMembershipStart(valor == null ? null : LocalDateTime.parse(valor));
            case "membershipEnd" -> m.setMembershipEnd(valor == null ? null : LocalDateTime.parse(valor));
            case "planId" -> m.setPlan(valor == null ? null : aranceles.findById(UUID.fromString(valor))
                    .filter(p -> p.getTenant().getId().equals(m.getTenant().getId()))
                    .orElse(null));
            case "active" -> m.setActive(Boolean.parseBoolean(valor));
            case "notes" -> m.setNotes(valor);
            case "address" -> m.setAddress(valor);
            case "emergencyContact" -> m.setEmergencyContact(valor);
            case "emergencyPhone" -> m.setEmergencyPhone(valor);
            case "gender" -> m.setGender(valor);
            default -> throw new IllegalStateException("Campo de importación desconocido: " + campo);
        }
    }

    /** Por qué no se puede deshacer, o {@code null} si se puede. */
    private String motivoParaNoDeshacer(GymMemberImport lote) {
        if (lote.estaDeshecha()) {
            return "Esta importación ya se deshizo.";
        }
        UUID ultimaEnPie = importaciones
                .findFirstByTenantIdAndDeshechaAtIsNullOrderByCreatedAtDesc(lote.getTenant().getId())
                .map(GymMemberImport::getId).orElse(null);
        if (!lote.getId().equals(ultimaEnPie)) {
            return "Solo se puede deshacer la última importación. Deshacé primero la más nueva.";
        }

        List<GymMemberImportItem> rastro = items.findByImportId(lote.getId());
        if (rastro.isEmpty()) return null;
        Map<UUID, String> accionPorSocio = rastro.stream()
                .collect(Collectors.toMap(GymMemberImportItem::getMemberId, GymMemberImportItem::getAccion));

        List<String> tocados = new ArrayList<>();
        for (GymMember s : socios.findAllById(accionPorSocio.keySet())) {
            if (s.getUpdatedAt() != null && s.getUpdatedAt().isAfter(lote.getAplicadaAt())) {
                tocados.add(unir(s.getFirstName(), s.getLastName()));
            }
        }
        if (!tocados.isEmpty()) {
            return tocados.size() + (tocados.size() == 1 ? " socio cambió" : " socios cambiaron")
                    + " después de importar (" + muestra(tocados) + "). Deshacer pisaría esos cambios.";
        }

        List<UUID> creados = accionPorSocio.entrySet().stream()
                .filter(e -> GymMemberImportItem.CREADO.equals(e.getValue())).map(Map.Entry::getKey).toList();
        if (!creados.isEmpty()) {
            int conCobros = socios.conCobros(creados).size();
            if (conCobros > 0) {
                return conCobros + (conCobros == 1 ? " socio importado ya tiene" : " socios importados ya tienen")
                        + " cobros registrados. Deshacer los borraría con su plata.";
            }
            int conHistorial = socios.conHistorialImportado(creados).size();
            if (conHistorial > 0) {
                return conHistorial + (conHistorial == 1 ? " socio importado tiene" : " socios importados tienen")
                        + " historial de caja importado. Deshacé primero el historial de caja (en Pagos).";
            }
            int conAccesos = socios.conAccesos(creados).size();
            if (conAccesos > 0) {
                return conAccesos + (conAccesos == 1 ? " socio importado ya pasó" : " socios importados ya pasaron")
                        + " por la puerta. Deshacer borraría esas visitas.";
            }
        }
        return null;
    }

    private Ultima describir(GymMemberImport lote) {
        String porQueNo = motivoParaNoDeshacer(lote);
        return new Ultima(lote.getId(), lote.getCreatedAt(), lote.getArchivo(), lote.getCreados(),
                lote.getActualizados(), lote.estaDeshecha(), porQueNo == null, porQueNo);
    }

    private GymMemberImportItem item(GymMemberImport lote, UUID tenantId, UUID socioId, String accion, String antes) {
        GymMemberImportItem it = new GymMemberImportItem();
        it.setTenant(tenantRef(tenantId));
        it.setImportId(lote.getId());
        it.setMemberId(socioId);
        it.setAccion(accion);
        it.setAntes(antes);
        return it;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // Ayudas
    // ════════════════════════════════════════════════════════════════════════════

    /** Un candado por gimnasio que dura lo que dura la transacción. */
    private void candado(UUID tenantId) {
        em.createNativeQuery("SELECT count(*) FROM (SELECT pg_advisory_xact_lock(hashtext(:clave))) AS c")
                .setParameter("clave", "importacion-socios:" + tenantId)
                .getSingleResult();
    }

    private static UUID tenantActual() {
        UUID id = TenantContextHolder.getTenantId();
        if (id == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Falta el gimnasio.");
        }
        return id;
    }

    private static Tenant tenantRef(UUID id) {
        Tenant t = new Tenant();
        t.setId(id);
        return t;
    }

    private static boolean vacia(Fila f) {
        return java.util.stream.Stream.of(f.nombre(), f.apellido(), f.documento(), f.telefono(), f.email(),
                        f.nacimiento(), f.alta(), f.vencimiento(), f.arancel(), f.estado(), f.notas(),
                        f.direccion(), f.contactoEmergencia(), f.telefonoEmergencia(), f.genero())
                .allMatch(v -> v == null || v.isBlank());
    }

    private static void largo(Decision d, String que, String valor, int maximo) {
        if (valor != null && valor.length() > maximo) {
            d.errores.add(que + " tiene " + valor.length() + " caracteres y el máximo es " + maximo + ".");
        }
    }

    private static LocalDateTime finDelDia(LocalDate d) {
        return d.atTime(HORA_FIN, MINUTO_FIN, SEGUNDO_FIN);
    }

    private static String unir(String a, String b) {
        return (Objects.toString(a, "") + " " + Objects.toString(b, "")).trim().replaceAll("\\s+", " ");
    }

    private static String vacioSiNull(String s) {
        return s == null ? "" : s;
    }

    private static String recortar(String s, int max) {
        return s == null ? null : (s.length() > max ? s.substring(0, max) : s);
    }

    private static String texto(Object o) {
        return o == null ? null : o.toString();
    }

    private static String dma(LocalDate d) {
        return d == null ? "(sin fecha)" : d.format(DMA);
    }

    /** Para mostrar un cambio: una fecha ISO se ve como dd/mm/aaaa. */
    private static String legible(String valor) {
        if (valor == null) return "(vacío)";
        if (valor.matches("^\\d{4}-\\d{2}-\\d{2}.*")) {
            return dma(LocalDate.parse(valor.substring(0, 10)));
        }
        return valor;
    }

    private static String muestra(List<String> nombres) {
        List<String> primeros = nombres.stream().limit(3).toList();
        String texto = String.join(", ", primeros);
        return nombres.size() > 3 ? texto + " y " + (nombres.size() - 3) + " más" : texto;
    }

    private String aJson(Map<String, String> valores) {
        try {
            return json.writeValueAsString(valores);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo guardar el estado anterior del socio", e);
        }
    }

    private Map<String, String> deJson(String texto) {
        if (texto == null || texto.isBlank()) return Map.of();
        try {
            return json.readValue(texto, new TypeReference<LinkedHashMap<String, String>>() { });
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("No se pudo leer el estado anterior del socio", e);
        }
    }
}
