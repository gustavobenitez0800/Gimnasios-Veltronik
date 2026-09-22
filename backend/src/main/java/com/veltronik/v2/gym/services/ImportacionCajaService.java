package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.ImportacionCaja.Accion;
import com.veltronik.v2.gym.dto.ImportacionCaja.Analisis;
import com.veltronik.v2.gym.dto.ImportacionCaja.Fila;
import com.veltronik.v2.gym.dto.ImportacionCaja.FilaAnalizada;
import com.veltronik.v2.gym.dto.ImportacionCaja.Mes;
import com.veltronik.v2.gym.dto.ImportacionCaja.Pedido;
import com.veltronik.v2.gym.dto.ImportacionCaja.Resultado;
import com.veltronik.v2.gym.dto.ImportacionCaja.Ultima;
import com.veltronik.v2.gym.entities.CajaMovimiento;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.entities.GymPayment;
import com.veltronik.v2.gym.entities.GymPaymentImport;
import com.veltronik.v2.gym.repositories.CajaMovimientoRepository;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.gym.repositories.GymPaymentImportRepository;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import jakarta.persistence.EntityManager;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Importar el historial de caja de otro sistema, y poder deshacerlo (V86, ADR-014).
 *
 * <h2>Por qué existe</h2>
 * <p>Un gimnasio que migra trae meses de cobros en su sistema anterior, y el dueño quiere ver
 * sus ingresos desde enero en el tablero —el gráfico y la predicción— y no desde el día que
 * empezó con Veltronik. El primero que lo pidió venía de ControlFit, con nueve meses de caja.</p>
 *
 * <h2>⭐ La regla: un cobro importado es HISTORIA</h2>
 * <p>Por el camino normal no se puede: cobrar corre el vencimiento y reactiva al socio (el
 * 31/08 cargar pagos viejos revivió ex-socios), y el primer cierre de caja mira 30 días para
 * atrás y se habría llevado la plata de ControlFit como si hubiera entrado al cajón hoy. Así
 * que lo importado:</p>
 * <ul>
 *   <li><b>suma en los ingresos</b> — el tablero, la predicción, el resumen del dueño, Pagos;</li>
 *   <li><b>no cubre ningún período</b> — se escribe sin {@code period_end} y sin pasar por
 *       {@code GymPaymentService}: no mueve un solo vencimiento ni reactiva a nadie;</li>
 *   <li><b>no entra a la caja</b> — {@code CajaService} lo salta en el cierre, el balance y la
 *       lista de cobros.</li>
 * </ul>
 *
 * <h2>Las garantías, las mismas del importador de socios</h2>
 * <ol>
 *   <li><b>Primero se mira, después se escribe.</b> {@link #importar} vuelve a analizar desde
 *       cero: nunca le cree a la pantalla.</li>
 *   <li><b>Todo o nada</b>, en una sola transacción.</li>
 *   <li><b>El mismo archivo dos veces no duplica.</b> Cada fila tiene una clave —fecha, hora,
 *       monto, nombre, y cuántas iguales vinieron antes en el archivo— con índice único en la
 *       base. Un archivo más largo (el mismo export, una semana después) trae solo lo nuevo.</li>
 *   <li><b>No se cuenta dos veces lo que ya se cobró acá.</b> Si el mismo socio pagó el mismo
 *       monto el mismo día en Veltronik, la fila del archivo no se importa.</li>
 *   <li><b>Se puede deshacer</b> la última, mientras nadie haya editado lo que puso.</li>
 * </ol>
 *
 * <h2>Los que no están en el padrón</h2>
 * <p>Un cobro se ata a un socio solo por DNI (la misma vara que el check-in). Los ex-socios, los
 * que no tienen DNI y los pases por día entran <b>sin socio</b>, con el nombre en la nota: la
 * plata cuenta igual, y el padrón no se llena de fichas que nadie va a mirar. Si alguno vuelve
 * y se le da de alta, deshacer y reimportar le ata su historia.</p>
 */
@Service
public class ImportacionCajaService {

    /** Tope por archivo. Un año de un gimnasio grande son unos 3.000 movimientos. */
    public static final int MAXIMO_FILAS = 20000;

    /** Quién "anotó" un gasto importado: nadie de este gimnasio lo cargó en Veltronik. */
    static final String FIRMA_IMPORTADO = "Historial importado";

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");
    private static final DateTimeFormatter DMA = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter HM = DateTimeFormatter.ofPattern("HH:mm");
    private static final int LARGO_NOTA = 255;
    private static final int LARGO_CATEGORIA = 30;
    private static final int LARGO_DETALLE = 255;

    private final GymMemberRepository socios;
    private final GymPaymentRepository pagos;
    private final CajaMovimientoRepository movimientos;
    private final GymPaymentImportRepository importaciones;
    private final PeriodosDelHistorialService periodos;
    private final EntityManager em;

    public ImportacionCajaService(GymMemberRepository socios, GymPaymentRepository pagos,
                                  CajaMovimientoRepository movimientos,
                                  GymPaymentImportRepository importaciones,
                                  PeriodosDelHistorialService periodos, EntityManager em) {
        this.socios = socios;
        this.pagos = pagos;
        this.movimientos = movimientos;
        this.importaciones = importaciones;
        this.periodos = periodos;
        this.em = em;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // API
    // ════════════════════════════════════════════════════════════════════════════

    /** Qué pasaría. No escribe nada. */
    @Transactional(readOnly = true)
    public Analisis analizar(Pedido pedido) {
        return resumir(decidir(pedido));
    }

    /**
     * Escribe. Si hay una sola fila con error no escribe nada y tira
     * {@link ImportacionConErrores} con el análisis completo.
     */
    @Transactional
    public Resultado importar(Pedido pedido) {
        UUID tenantId = tenantActual();
        // Un doble clic importaría dos veces: las dos verían las mismas filas como nuevas. El
        // índice único de la clave lo frenaría con un error feo; el candado hace que la segunda
        // espere y encuentre todo "ya importado".
        candado(tenantId);

        List<Decision> decisiones = decidir(pedido);
        Analisis analisis = resumir(decisiones);
        if (analisis.conError() > 0) {
            throw new ImportacionConErrores(analisis);
        }
        if (analisis.cobros() + analisis.gastos() == 0) {
            return new Resultado(null, 0, 0, BigDecimal.ZERO, BigDecimal.ZERO,
                    analisis.yaImportados(), analisis.yaCobrados());
        }

        GymPaymentImport lote = new GymPaymentImport();
        lote.setTenant(tenantRef(tenantId));
        lote.setArchivo(recortar(pedido.archivo(), 255));
        lote.setImportadoPor(SecurityUtils.getCurrentUserId());
        lote.setCobros(analisis.cobros());
        lote.setGastos(analisis.gastos());
        lote.setTotalCobros(analisis.totalCobros());
        lote.setTotalGastos(analisis.totalGastos());
        lote.setDesde(analisis.desde());
        lote.setHasta(analisis.hasta());
        lote.setAplicadaAt(LocalDateTime.now()); // provisorio: se fija al terminar de escribir
        importaciones.save(lote);

        // Dos mil filas de a una son dos mil viajes a la base. En lotes, unas pocas decenas.
        em.unwrap(org.hibernate.Session.class).setJdbcBatchSize(200);

        List<GymPayment> cobros = new ArrayList<>();
        List<CajaMovimiento> gastos = new ArrayList<>();
        for (Decision d : decisiones) {
            if (d.accion == Accion.COBRO) cobros.add(cobro(d, lote, tenantId));
            else if (d.accion == Accion.GASTO) gastos.add(gasto(d, lote, tenantId));
        }
        pagos.saveAll(cobros);
        movimientos.saveAll(gastos);

        // La línea que separa "lo que puso la importación" de "lo que se editó después".
        pagos.flush();
        // El período estimado de cada cobro, para que Pagos no lo muestre vacío (V87). No toca
        // updated_at, así que no cuenta como edición para el deshacer.
        periodos.calcular(lote.getId(), tenantId);
        lote.setAplicadaAt(LocalDateTime.now());
        importaciones.save(lote);

        return new Resultado(lote.getId(), analisis.cobros(), analisis.gastos(),
                analisis.totalCobros(), analisis.totalGastos(),
                analisis.yaImportados(), analisis.yaCobrados());
    }

    /** La última importación del gimnasio, y si se puede deshacer. Vacío si nunca importó. */
    @Transactional(readOnly = true)
    public Optional<Ultima> ultima() {
        return importaciones.findFirstByTenantIdOrderByCreatedAtDesc(tenantActual()).map(this::describir);
    }

    /** Borra lo que trajo una importación. Solo la última en pie, y solo si nadie editó nada. */
    @Transactional
    public Ultima deshacer(UUID importacionId) {
        UUID tenantId = tenantActual();
        candado(tenantId);

        GymPaymentImport lote = importaciones.findById(importacionId)
                .filter(l -> l.getTenant().getId().equals(tenantId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No existe esa importación."));

        String porQueNo = motivoParaNoDeshacer(lote);
        if (porQueNo != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, porQueNo);
        }

        pagos.borrarLosDeUnaImportacion(tenantId, lote.getId());
        movimientos.borrarLosDeUnaImportacion(tenantId, lote.getId());

        // El borrado masivo limpió la sesión: el lote se vuelve a leer antes de marcarlo.
        GymPaymentImport vigente = importaciones.findById(lote.getId()).orElseThrow();
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

    private static final class Decision {
        final int fila;
        final List<String> errores = new ArrayList<>();
        final List<String> avisos = new ArrayList<>();
        String fechaTexto;
        String montoTexto;
        String nombre;
        String documento = "";
        LocalDateTime cuando;
        BigDecimal monto;          // siempre positivo: el signo lo dice `gasto`
        boolean gasto;
        String metodoCobro;        // como lo guarda el cobro: "CASH", "MERCADOPAGO"… (MetodoDePago)
        String metodoCaja;         // como lo guarda la caja: "CASH", "MERCADOPAGO"…
        String concepto;
        String nota;
        String detalle;
        GymMember socio;
        String clave;
        Accion accion;

        Decision(int fila) {
            this.fila = fila;
        }
    }

    private List<Decision> decidir(Pedido pedido) {
        if (pedido == null || pedido.filas() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El archivo no trae filas.");
        }
        List<Fila> filas = pedido.filas().stream().filter(f -> f != null && !vacia(f)).toList();
        if (filas.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El archivo no tiene movimientos: todas las filas están vacías.");
        }
        if (filas.size() > MAXIMO_FILAS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El archivo tiene " + filas.size() + " filas y el máximo es " + MAXIMO_FILAS
                            + ". Dividilo por fecha y subí cada parte.");
        }

        UUID tenantId = tenantActual();
        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);

        // 1) Cada fila por separado: lo que se puede decir sin mirar la base.
        List<Decision> decisiones = new ArrayList<>();
        for (int i = 0; i < filas.size(); i++) {
            decisiones.add(leer(filas.get(i), i, ahora));
        }

        // 2) La clave de cada fila. Dos filas idénticas (dos pases por día a la misma hora y por
        //    el mismo monto) son dos cobros de verdad: se distinguen por el orden en el archivo.
        Map<String, Integer> vistas = new HashMap<>();
        for (Decision d : decisiones) {
            if (!d.errores.isEmpty()) continue;
            String base = String.join("|", d.cuando.toLocalDate().toString(), d.cuando.format(HM),
                    (d.gasto ? "-" : "") + d.monto.stripTrailingZeros().toPlainString(),
                    ValorImportado.clave(d.nombre));
            int n = vistas.merge(base, 1, Integer::sum);
            d.clave = sha256(base + "#" + n);
        }

        // 3) Contra lo que ya hay en Veltronik.
        Set<String> yaImportadas = new HashSet<>(pagos.clavesImportadas(tenantId));
        yaImportadas.addAll(movimientos.clavesImportadas(tenantId));

        Map<String, List<GymMember>> padron = new HashMap<>();
        for (GymMember m : socios.findByTenantIdAndDeletedAtIsNull(tenantId)) {
            String doc = Documento.normalizar(m.getDocument());
            if (!doc.isEmpty()) padron.computeIfAbsent(doc, k -> new ArrayList<>()).add(m);
        }

        Set<String> cobradosAca = cobradosEnVeltronik(tenantId, decisiones);

        for (Decision d : decisiones) {
            if (!d.errores.isEmpty()) {
                d.accion = Accion.ERROR;
                continue;
            }
            if (yaImportadas.contains(d.clave)) {
                d.accion = Accion.YA_IMPORTADO;
                continue;
            }
            if (d.gasto) {
                d.accion = Accion.GASTO;
                continue;
            }
            List<GymMember> conEseDni = d.documento.isEmpty() ? List.of() : padron.getOrDefault(d.documento, List.of());
            if (conEseDni.size() == 1) {
                d.socio = conEseDni.get(0);
            } else if (conEseDni.size() > 1) {
                d.avisos.add("En Veltronik hay " + conEseDni.size() + " socios con el DNI " + d.documento
                        + ": se carga sin socio, con el nombre en la nota.");
            }
            if (d.socio != null && cobradosAca.contains(claveDeCobro(d.socio.getId(), d.cuando.toLocalDate(), d.monto))) {
                d.accion = Accion.YA_COBRADO;
                d.avisos.add("Ya está cobrado en Veltronik: el mismo socio pagó " + pesos(d.monto) + " el "
                        + d.cuando.format(DMA) + ". No se importa, para no contarlo dos veces.");
                continue;
            }
            d.accion = Accion.COBRO;
        }
        return decisiones;
    }

    /** Todo lo que se puede saber de una fila sin mirar la base. */
    private Decision leer(Fila f, int indice, LocalDateTime ahora) {
        int numero = f.fila() != null ? f.fila() : indice + 2; // fila 1 = encabezados
        Decision d = new Decision(numero);
        d.fechaTexto = ValorImportado.texto(f.fecha());
        d.montoTexto = ValorImportado.texto(f.monto());
        d.nombre = ValorImportado.texto(f.socio());
        d.documento = ValorImportado.documento(f.documento());
        d.concepto = ValorImportado.texto(f.concepto());
        d.nota = ValorImportado.texto(f.nota());
        d.detalle = ValorImportado.texto(f.detalle());

        // ── Cuándo ──
        ValorImportado.Fecha fecha = ValorImportado.fecha(f.fecha(), ahora.toLocalDate());
        if (fecha.error() != null) {
            d.errores.add("Fecha: " + fecha.error());
        } else if (fecha.valor() == null) {
            d.errores.add("Falta la fecha.");
        }
        LocalTime hora = null;
        String horaTexto = ValorImportado.texto(f.hora());
        if (horaTexto == null && d.fechaTexto != null) {
            // "05/01/2026 07:17" en una sola celda: la hora viene pegada a la fecha.
            Matcher m = HORA_EN_TEXTO.matcher(d.fechaTexto);
            if (m.find()) horaTexto = m.group();
        }
        if (horaTexto != null) {
            hora = hora(horaTexto);
            if (hora == null) d.errores.add("La hora «" + horaTexto + "» no se entiende. Usá hh:mm, por ejemplo 07:30.");
        }
        if (fecha.valor() != null) {
            d.cuando = fecha.valor().atTime(hora != null ? hora : LocalTime.MIDNIGHT);
            if (fecha.valor().getYear() < 2000) {
                d.errores.add("La fecha " + fecha.valor().format(DMA) + " está fuera de lo posible.");
            } else if (d.cuando.isAfter(ahora)) {
                d.errores.add("La fecha " + d.cuando.format(DMA) + " está en el futuro.");
            }
        }

        // ── Cuánto ──
        BigDecimal monto = monto(f.monto());
        if (d.montoTexto == null) {
            d.errores.add("Falta el monto.");
        } else if (monto == null) {
            d.errores.add("El monto «" + d.montoTexto + "» no es un número.");
        } else if (monto.signum() == 0) {
            d.errores.add("El monto es cero.");
        } else if (monto.scale() > 2) {
            d.errores.add("El monto «" + d.montoTexto + "» tiene más de dos decimales.");
        } else if (monto.abs().compareTo(new BigDecimal("100000000")) >= 0) {
            d.errores.add("El monto «" + d.montoTexto + "» es demasiado grande. ¿Está bien escrito?");
        } else {
            boolean conceptoDeGasto = GASTOS.contains(clave(d.concepto));
            d.gasto = monto.signum() < 0 || conceptoDeGasto;
            d.monto = monto.abs();
            if (conceptoDeGasto && monto.signum() > 0) {
                d.avisos.add("El concepto dice «" + d.concepto + "» y el monto es positivo: se carga como gasto.");
            }
        }

        // ── Cómo ──
        String medio = ValorImportado.texto(f.medio());
        if (medio == null) {
            d.errores.add("Falta el medio de pago (Efectivo, Transferencia, Mercado Pago o Tarjeta).");
        } else {
            String codigo = metodo(medio);
            if (codigo == null) {
                d.errores.add("No entiendo el medio de pago «" + medio + "». Usá Efectivo, Transferencia, "
                        + "Mercado Pago o Tarjeta.");
            } else {
                d.metodoCaja = codigo;
                d.metodoCobro = codigo;
            }
        }
        return d;
    }

    /**
     * Los cobros ya hechos en Veltronik en el rango del archivo, como "socio|día|monto".
     * Es lo que evita contar dos veces el cobro que se registró en los dos sistemas.
     */
    private Set<String> cobradosEnVeltronik(UUID tenantId, List<Decision> decisiones) {
        LocalDateTime desde = null, hasta = null;
        for (Decision d : decisiones) {
            if (d.cuando == null) continue;
            if (desde == null || d.cuando.isBefore(desde)) desde = d.cuando;
            if (hasta == null || d.cuando.isAfter(hasta)) hasta = d.cuando;
        }
        Set<String> claves = new HashSet<>();
        if (desde == null) return claves;
        for (GymPayment p : pagos.cobrosDeVeltronikEntre(tenantId,
                desde.toLocalDate().atStartOfDay(), hasta.toLocalDate().atTime(LocalTime.MAX))) {
            if (p.getMember() == null || p.getAmount() == null || p.getPaymentDate() == null) continue;
            if (!"paid".equalsIgnoreCase(p.getStatus())) continue;
            claves.add(claveDeCobro(p.getMember().getId(), p.getPaymentDate().toLocalDate(), p.getAmount()));
        }
        return claves;
    }

    private static String claveDeCobro(UUID socio, LocalDate dia, BigDecimal monto) {
        return socio + "|" + dia + "|" + monto.stripTrailingZeros().toPlainString();
    }

    private Analisis resumir(List<Decision> decisiones) {
        int cobros = 0, gastos = 0, yaImportados = 0, yaCobrados = 0, conError = 0, conSocio = 0, sinSocio = 0;
        BigDecimal totalCobros = BigDecimal.ZERO, totalGastos = BigDecimal.ZERO;
        LocalDateTime desde = null, hasta = null;
        TreeMap<String, Mes> porMes = new TreeMap<>();
        List<FilaAnalizada> filas = new ArrayList<>();

        for (Decision d : decisiones) {
            switch (d.accion) {
                case COBRO -> {
                    cobros++;
                    totalCobros = totalCobros.add(d.monto);
                    if (d.socio != null) conSocio++;
                    else sinSocio++;
                }
                case GASTO -> {
                    gastos++;
                    totalGastos = totalGastos.add(d.monto);
                }
                case YA_IMPORTADO -> yaImportados++;
                case YA_COBRADO -> yaCobrados++;
                case ERROR -> conError++;
            }
            if (d.accion == Accion.COBRO || d.accion == Accion.GASTO) {
                if (desde == null || d.cuando.isBefore(desde)) desde = d.cuando;
                if (hasta == null || d.cuando.isAfter(hasta)) hasta = d.cuando;
                String mes = d.cuando.toLocalDate().withDayOfMonth(1).toString().substring(0, 7);
                Mes antes = porMes.getOrDefault(mes, new Mes(mes, 0, BigDecimal.ZERO, 0, BigDecimal.ZERO));
                porMes.put(mes, d.accion == Accion.COBRO
                        ? new Mes(mes, antes.cobros() + 1, antes.totalCobros().add(d.monto), antes.gastos(), antes.totalGastos())
                        : new Mes(mes, antes.cobros(), antes.totalCobros(), antes.gastos() + 1, antes.totalGastos().add(d.monto)));
            }
            if (!d.errores.isEmpty() || !d.avisos.isEmpty()) {
                filas.add(new FilaAnalizada(d.fila, d.fechaTexto, d.nombre, d.documento, d.montoTexto, d.accion,
                        List.copyOf(d.errores), List.copyOf(d.avisos)));
            }
        }
        return new Analisis(decisiones.size(), cobros, gastos, yaImportados, yaCobrados, conError,
                totalCobros, totalGastos, conSocio, sinSocio, desde, hasta,
                List.copyOf(porMes.values()), avisosGenerales(decisiones), filas);
    }

    /** Lo que se repite en muchas filas se dice una vez arriba, agrupado. */
    private List<String> avisosGenerales(List<Decision> decisiones) {
        List<String> generales = new ArrayList<>();
        long exSocios = 0, sinDni = 0, sinNombre = 0;
        for (Decision d : decisiones) {
            if (d.accion != Accion.COBRO || d.socio != null) continue;
            if (!d.documento.isEmpty()) exSocios++;
            else if (d.nombre != null) sinDni++;
            else sinNombre++;
        }
        if (exSocios > 0) {
            generales.add(cuantos(exSocios, "cobro es", "cobros son") + " de personas con DNI que no están en el "
                    + "padrón (ex-socios): se cargan sin socio, con el nombre y el DNI en la nota. Suman en los "
                    + "ingresos igual.");
        }
        if (sinDni > 0) {
            generales.add(cuantos(sinDni, "cobro tiene", "cobros tienen") + " nombre pero no DNI: se cargan sin "
                    + "socio, con el nombre en la nota. Por nombre no se ata a nadie: hay nombres repetidos.");
        }
        if (sinNombre > 0) {
            generales.add(cuantos(sinNombre, "cobro no tiene", "cobros no tienen") + " nombre (pases por día, "
                    + "ventas sueltas): se cargan sin socio.");
        }

        long yaCobrados = decisiones.stream().filter(d -> d.accion == Accion.YA_COBRADO).count();
        if (yaCobrados > 0) {
            generales.add(cuantos(yaCobrados, "cobro ya está", "cobros ya están") + " registrados en Veltronik "
                    + "(mismo socio, día y monto): no se importan, para no contarlos dos veces.");
        }
        return generales;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // Escribir y deshacer
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * El cobro importado. ⚠️ No pasa por {@code GymPaymentService} a propósito: ese camino le
     * calcula un período y le corre el vencimiento al socio. Este no tiene período (la V86 lo
     * exige) y no toca al socio.
     */
    private GymPayment cobro(Decision d, GymPaymentImport lote, UUID tenantId) {
        GymPayment p = new GymPayment();
        p.setTenant(tenantRef(tenantId));
        p.setMember(d.socio);
        p.setAmount(d.monto);
        p.setPaymentDate(d.cuando);
        p.setPaymentMethod(d.metodoCobro);
        p.setStatus("paid");
        p.setNotes(nota(d));
        p.setImportId(lote.getId());
        p.setImportClave(d.clave);
        return p;
    }

    /** El gasto importado: a los egresos, nunca a los ingresos. No entra al arqueo. */
    private CajaMovimiento gasto(Decision d, GymPaymentImport lote, UUID tenantId) {
        CajaMovimiento m = new CajaMovimiento();
        m.setTenant(tenantRef(tenantId));
        m.setTipo(CajaMovimiento.EGRESO);
        m.setCategoria(recortar(d.concepto != null ? d.concepto : "Gasto", LARGO_CATEGORIA));
        m.setDetalle(recortar(detalleDelGasto(d), LARGO_DETALLE));
        m.setMonto(d.monto);
        m.setMetodo(d.metodoCaja);
        m.setFecha(d.cuando);
        m.setHechoPorNombre(FIRMA_IMPORTADO);
        m.setImportId(lote.getId());
        m.setImportClave(d.clave);
        return m;
    }

    /**
     * Lo que se lee en Pagos. Al que no quedó atado a un socio se le deja el nombre adelante:
     * es lo único que dice de quién fue esa plata.
     */
    private static String nota(Decision d) {
        List<String> partes = new ArrayList<>();
        if (d.socio == null && (d.nombre != null || !d.documento.isEmpty())) {
            String quien = d.nombre != null ? d.nombre : "Sin nombre";
            partes.add(d.documento.isEmpty() ? quien : quien + " (DNI " + d.documento + ")");
        }
        if (d.concepto != null) partes.add(d.concepto);
        if (d.nota != null) partes.add(d.nota);
        return partes.isEmpty() ? null : recortar(String.join(" · ", partes), LARGO_NOTA);
    }

    /** En qué se gastó. ControlFit escribe "Gasto: Gasto: yerba": se le saca el prefijo repetido. */
    private static String detalleDelGasto(Decision d) {
        for (String candidato : new String[]{d.nota, d.detalle, d.nombre}) {
            if (candidato == null) continue;
            String limpio = PREFIJO_GASTO.matcher(candidato).replaceFirst("").trim();
            if (!limpio.isEmpty()) return limpio;
        }
        return d.concepto != null ? d.concepto : "Gasto";
    }

    private String motivoParaNoDeshacer(GymPaymentImport lote) {
        if (lote.estaDeshecha()) {
            return "Esta importación ya se deshizo.";
        }
        UUID ultimaEnPie = importaciones
                .findFirstByTenantIdAndDeshechaAtIsNullOrderByCreatedAtDesc(lote.getTenant().getId())
                .map(GymPaymentImport::getId).orElse(null);
        if (!lote.getId().equals(ultimaEnPie)) {
            return "Solo se puede deshacer la última importación. Deshacé primero la más nueva.";
        }
        long editados = pagos.editadosDespuesDe(lote.getId(), lote.getAplicadaAt())
                + movimientos.countByImportIdAndUpdatedAtAfter(lote.getId(), lote.getAplicadaAt());
        if (editados > 0) {
            return cuantos(editados, "movimiento importado se editó", "movimientos importados se editaron")
                    + " después de importar. Deshacer borraría esas correcciones.";
        }
        return null;
    }

    private Ultima describir(GymPaymentImport lote) {
        String porQueNo = motivoParaNoDeshacer(lote);
        return new Ultima(lote.getId(), lote.getCreatedAt(), lote.getArchivo(), lote.getCobros(), lote.getGastos(),
                lote.getTotalCobros(), lote.getTotalGastos(), lote.getDesde(), lote.getHasta(),
                lote.estaDeshecha(), porQueNo == null, porQueNo);
    }

    // ════════════════════════════════════════════════════════════════════════════
    // Leer valores
    // ════════════════════════════════════════════════════════════════════════════

    /** Los conceptos que son plata que SALE, aunque el monto venga sin signo. */
    private static final Set<String> GASTOS = Set.of("gasto", "gastos", "egreso", "egresos");

    private static final Pattern PREFIJO_GASTO = Pattern.compile("^(?:\\s*gastos?\\s*:\\s*)+", Pattern.CASE_INSENSITIVE);

    // Sin \b: en "2026-01-05T07:17" entre la T y el 0 no hay límite de palabra.
    private static final Pattern HORA_EN_TEXTO = Pattern.compile("(?<!\\d)\\d{1,2}:\\d{2}(?::\\d{2})?(?!\\d)");

    private static final Pattern HORA = Pattern.compile(
            "^(\\d{1,2})[:.](\\d{2})(?:[:.](\\d{2}))?\\s*(?:(a|p)\\.?\\s*m\\.?)?$", Pattern.CASE_INSENSITIVE);

    /** "07:17", "7:17:05", "7.17", "7:17 p. m.", o la fracción de día que deja Excel (0,3035). */
    static LocalTime hora(String crudo) {
        String s = ValorImportado.texto(crudo);
        if (s == null) return null;
        Matcher m = HORA.matcher(s);
        if (m.matches()) {
            int h = Integer.parseInt(m.group(1));
            int min = Integer.parseInt(m.group(2));
            int seg = m.group(3) != null ? Integer.parseInt(m.group(3)) : 0;
            if (m.group(4) != null) {
                boolean pm = m.group(4).equalsIgnoreCase("p");
                if (h < 1 || h > 12) return null;
                h = (h % 12) + (pm ? 12 : 0);
            }
            if (h > 23 || min > 59 || seg > 59) return null;
            return LocalTime.of(h, min, seg);
        }
        try {
            double fraccion = Double.parseDouble(s.replace(',', '.'));
            if (fraccion >= 0 && fraccion < 1) {
                return LocalTime.ofSecondOfDay(Math.round(fraccion * 86400) % 86400);
            }
        } catch (NumberFormatException ignorado) {
            // no es una fracción de día: la hora no se entiende
        }
        return null;
    }

    /**
     * Un monto escrito como lo escribe la gente: "29000", "-3500", "$ 29.000", "29.000,50",
     * "29000.5". En Argentina el punto separa miles y la coma los decimales; un número que viene
     * de una celda numérica usa el punto decimal. Por eso: si hay punto y coma, el que va último
     * es el decimal; si solo hay puntos y todos los grupos tienen tres cifras, son miles.
     */
    static BigDecimal monto(String crudo) {
        String s = ValorImportado.texto(crudo);
        if (s == null) return null;
        s = s.replace("$", "").replace(" ", "").replace(" ", "");
        boolean negativo = false;
        if (s.startsWith("(") && s.endsWith(")")) {           // (3.500) = negativo, formato contable
            negativo = true;
            s = s.substring(1, s.length() - 1);
        }
        if (s.startsWith("-")) {
            negativo = !negativo;
            s = s.substring(1);
        } else if (s.endsWith("-")) {
            negativo = !negativo;
            s = s.substring(0, s.length() - 1);
        }
        if (!s.matches("[0-9.,]+") || !s.matches(".*\\d.*")) return null;

        int punto = s.lastIndexOf('.');
        int coma = s.lastIndexOf(',');
        String normal;
        if (punto >= 0 && coma >= 0) {
            normal = punto > coma
                    ? s.replace(",", "")                      // 29,000.50
                    : s.replace(".", "").replace(',', '.');   // 29.000,50
        } else if (coma >= 0) {
            normal = s.matches("\\d{1,3}(,\\d{3})+") ? s.replace(",", "") : s.replace(',', '.');
        } else if (punto >= 0) {
            normal = s.matches("\\d{1,3}(\\.\\d{3})+") ? s.replace(".", "") : s;
        } else {
            normal = s;
        }
        try {
            BigDecimal valor = new BigDecimal(normal);
            return negativo ? valor.negate() : valor;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** El medio de pago como lo guarda Veltronik (en la caja, en mayúsculas). {@code null} = no se entiende. */
    static String metodo(String crudo) {
        String c = clave(crudo);
        if (c.isEmpty()) return null;
        if (c.equals("efectivo") || c.equals("contado") || c.equals("cash") || c.equals("caja")) return "CASH";
        if (c.startsWith("transf") || c.equals("deposito") || c.equals("transferenciabancaria")
                || c.equals("cbu") || c.equals("alias")) return "TRANSFER";
        if (c.startsWith("mercadopago") || c.equals("mp") || c.equals("qr") || c.equals("mercado")) return "MERCADOPAGO";
        if (c.startsWith("tarjeta") || c.equals("debito") || c.equals("credito") || c.equals("posnet")
                || c.equals("card")) return "CARD";
        return null;
    }

    /** Sin acentos, sin mayúsculas, sin nada que no sea letra o número. */
    private static String clave(String crudo) {
        return ValorImportado.clave(crudo).replaceAll("[^a-z0-9]", "");
    }

    // ════════════════════════════════════════════════════════════════════════════
    // Ayudas
    // ════════════════════════════════════════════════════════════════════════════

    /** Un candado por gimnasio que dura lo que dura la transacción. */
    private void candado(UUID tenantId) {
        em.createNativeQuery("SELECT count(*) FROM (SELECT pg_advisory_xact_lock(hashtext(:clave))) AS c")
                .setParameter("clave", "importacion-caja:" + tenantId)
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
        return java.util.stream.Stream.of(f.fecha(), f.hora(), f.socio(), f.documento(), f.concepto(),
                        f.medio(), f.monto(), f.nota(), f.detalle())
                .allMatch(v -> v == null || v.isBlank());
    }

    private static String sha256(String texto) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(texto.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("La JVM no tiene SHA-256", e);
        }
    }

    private static String recortar(String s, int max) {
        return s == null ? null : (s.length() > max ? s.substring(0, max) : s);
    }

    private static String cuantos(long n, String uno, String varios) {
        return n + " " + (n == 1 ? uno : varios);
    }

    private static String pesos(BigDecimal monto) {
        return "$" + String.format(new Locale("es", "AR"), "%,.0f", monto);
    }
}
