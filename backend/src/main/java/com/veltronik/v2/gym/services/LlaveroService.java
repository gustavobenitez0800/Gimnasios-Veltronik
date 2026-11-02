package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.GymMember;
import com.veltronik.v2.gym.entities.MemberCredential;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.gym.repositories.MemberCredentialRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Los llaveros de los socios (ADR-016): asignarlos, darlos de baja y decirle al mostrador de
 * quién es cada uno.
 *
 * <p><b>Lo que NO hace: decidir si alguien pasa.</b> El llavero solo dice quién es. Si entra, si
 * suena la X o si abre el molinete lo decide lo mismo que con el DNI —{@code MemberAccessPolicy}
 * acá, {@code puedePasarElMolinete} en el mostrador—. No hay una regla del llavero.</p>
 *
 * <p><b>Leer un llavero no pasa por acá.</b> El mostrador lo busca en su copia local, que trae
 * los llaveros adentro de la lista de socios ({@link #activosPorSocio}); así anda sin internet.
 * Lo que pasa por acá es lo que escribe, y escribir necesita la base: la regla de «un llavero,
 * un socio» la garantiza su índice único.</p>
 */
@Service
public class LlaveroService {

    /** Lo que se guarda si quien da de baja no dice por qué. */
    static final String MOTIVO_POR_DEFECTO = "Dado de baja";

    private final MemberCredentialRepository repository;
    private final GymMemberRepository memberRepository;
    private final GymMemberService memberService;

    public LlaveroService(MemberCredentialRepository repository, GymMemberRepository memberRepository,
                          GymMemberService memberService) {
        this.repository = repository;
        this.memberRepository = memberRepository;
        this.memberService = memberService;
    }

    /**
     * Cómo terminó una asignación.
     *
     * @param nuevo        false si ese llavero ya era de este socio (asignar dos veces no duplica)
     * @param reasignadoDe el nombre del socio que lo tenía antes, si se le sacó a alguien
     */
    public record Asignacion(MemberCredential llavero, boolean nuevo, String reasignadoDe) {}

    /**
     * El llavero ya es de otro socio y no se pidió pasárselo. El controlador lo convierte en un
     * 409 con el nombre, para que la pantalla pregunte «¿Pasárselo a…?» en vez de un error mudo.
     */
    public static class LlaveroDeOtroSocio extends RuntimeException {
        private final UUID socioId;
        private final String nombre;

        public LlaveroDeOtroSocio(UUID socioId, String nombre) {
            super("Ese llavero es de " + nombre + ".");
            this.socioId = socioId;
            this.nombre = nombre;
        }

        public UUID getSocioId() { return socioId; }
        public String getNombre() { return nombre; }
    }

    // ─── Escribir ────────────────────────────────────────────────────────────────────────────

    /**
     * Le asigna un llavero a un socio.
     *
     * <ul>
     *   <li>Si ya era suyo, no hace nada y lo devuelve: el lector a veces lee dos veces.</li>
     *   <li>Si es de otro socio, frena con {@link LlaveroDeOtroSocio}, salvo que venga
     *       {@code reasignar}: entonces al otro se le da de baja, con el motivo, y no se borra.</li>
     *   <li>Si el otro está en la papelera, se le saca sin preguntar: para el gimnasio ese socio
     *       no existe, y un llavero que nadie puede usar no tiene por qué trabar a uno que sí.</li>
     * </ul>
     *
     * @param hechoPor quién está en el mostrador (el nombre del turno), para el rastro
     */
    @Transactional
    public Asignacion asignar(UUID memberId, String crudo, boolean reasignar, String hechoPor) {
        String codigo = codigoValido(crudo);
        GymMember socio = memberService.findByIdAndVerifyOwnership(memberId);
        UUID tenantId = TenantContextHolder.getTenantId();

        String reasignadoDe = null;
        Optional<MemberCredential> actual = repository.findByTenantIdAndTipoAndCodigoAndDadoDeBajaAtIsNull(
                tenantId, MemberCredential.LLAVERO, codigo);
        if (actual.isPresent()) {
            MemberCredential delOtro = actual.get();
            if (delOtro.getMemberId().equals(memberId)) return new Asignacion(delOtro, false, null);

            GymMember dueno = memberRepository.findById(delOtro.getMemberId()).orElse(null);
            boolean duenoEnLaPapelera = dueno == null || dueno.estaBorrado();
            if (!duenoEnLaPapelera && !reasignar) {
                throw new LlaveroDeOtroSocio(dueno.getId(), dueno.getFullName());
            }
            bajar(delOtro, duenoEnLaPapelera
                    ? "Su socio estaba en la papelera"
                    : "Se lo pasaron a " + socio.getFullName(), hechoPor);
            // ⚠️ Antes de insertar el nuevo: el índice único mira las filas activas, y si la baja
            // quedara para el final de la transacción el insert chocaría contra este mismo.
            repository.saveAndFlush(delOtro);
            reasignadoDe = dueno == null ? null : dueno.getFullName();
        }

        MemberCredential nuevo = new MemberCredential();
        nuevo.setTenant(socio.getTenant());
        nuevo.setMemberId(memberId);
        nuevo.setCodigo(codigo);
        nuevo.setAsignadoPorNombre(recortar(hechoPor));
        try {
            repository.saveAndFlush(nuevo);
        } catch (DataIntegrityViolationException e) {
            // Dos mostradores asignando el mismo llavero en el mismo instante: el índice dejó
            // pasar a uno solo. El otro se entera acá y no queda nada a medias.
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Otro mostrador acaba de asignar ese llavero. Volvé a pasarlo.");
        }
        return new Asignacion(nuevo, true, reasignadoDe);
    }

    /** Da de baja un llavero (lo perdió, se lo cambiaron). Dos veces no cambia nada. */
    @Transactional
    public MemberCredential darDeBaja(UUID llaveroId, String motivo, String hechoPor) {
        MemberCredential c = repository.findByIdAndTenantId(llaveroId, TenantContextHolder.getTenantId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Ese llavero no existe."));
        if (!c.estaActivo()) return c;
        bajar(c, motivo, hechoPor);
        return repository.save(c);
    }

    // ─── Leer ────────────────────────────────────────────────────────────────────────────────

    /** Los llaveros de un socio, los activos primero y después la historia, del más nuevo al más viejo. */
    @Transactional(readOnly = true)
    public List<MemberCredential> delSocio(UUID memberId) {
        memberService.findByIdAndVerifyOwnership(memberId);
        List<MemberCredential> todos = new ArrayList<>(repository
                .findByTenantIdAndMemberIdOrderByCreatedAtDesc(TenantContextHolder.getTenantId(), memberId));
        todos.sort(Comparator.comparing((MemberCredential c) -> !c.estaActivo()));
        return todos;
    }

    /**
     * Los llaveros activos de cada socio del gimnasio, ordenados. Es lo que viaja en
     * {@code GET /gym/members}: el mostrador busca contra esto sin internet.
     */
    @Transactional(readOnly = true)
    public Map<UUID, List<String>> activosPorSocio() {
        Map<UUID, List<String>> porSocio = new HashMap<>();
        for (MemberCredentialRepository.CodigoDelSocio c
                : repository.activosDelGimnasio(TenantContextHolder.getTenantId())) {
            porSocio.computeIfAbsent(c.getMemberId(), k -> new ArrayList<>()).add(c.getCodigo());
        }
        // Inmutables: la lista de socios las guarda en su foto y las comparte entre pedidos.
        porSocio.replaceAll((socio, codigos) -> codigos.stream().sorted().toList());
        return porSocio;
    }

    /**
     * Lo que se sabe de un llavero que el mostrador NO encontró en su copia local.
     *
     * @param activo     de quién es hoy, si es de alguien: lo asignaron en otro mostrador hace un
     *                   rato y la copia todavía no se enteró
     * @param ultimaBaja si hoy no es de nadie, la última vez que se dio de baja: «lo perdió Ana el
     *                   2/11». Que alguien pase un llavero perdido es algo que el mostrador tiene
     *                   que saber.
     */
    public record Consulta(String codigo, MemberCredential activo, GymMember dueno,
                           MemberCredential ultimaBaja, GymMember duenoAnterior) {}

    @Transactional(readOnly = true)
    public Consulta consultar(String crudo) {
        String codigo = Llavero.normalizar(crudo);
        if (!Llavero.esValido(codigo)) return new Consulta(codigo, null, null, null, null);
        UUID tenantId = TenantContextHolder.getTenantId();

        Optional<MemberCredential> activo = repository.findByTenantIdAndTipoAndCodigoAndDadoDeBajaAtIsNull(
                tenantId, MemberCredential.LLAVERO, codigo);
        if (activo.isPresent()) {
            // Uno en la papelera no cuenta: para el gimnasio ese socio no existe, y asignar el
            // llavero de nuevo se lo saca sin preguntar (ver asignar).
            GymMember dueno = memberRepository.findById(activo.get().getMemberId())
                    .filter(m -> !m.estaBorrado()).orElse(null);
            if (dueno != null) return new Consulta(codigo, activo.get(), dueno, null, null);
        }

        MemberCredential baja = repository
                .findFirstByTenantIdAndTipoAndCodigoAndDadoDeBajaAtIsNotNullOrderByDadoDeBajaAtDesc(
                        tenantId, MemberCredential.LLAVERO, codigo)
                .orElse(null);
        GymMember anterior = baja == null ? null : memberRepository.findById(baja.getMemberId()).orElse(null);
        return new Consulta(codigo, null, null, baja, anterior);
    }

    /** Cambia con cada asignación y cada baja del gimnasio actual. */
    @Transactional(readOnly = true)
    public String marcaDelGimnasio() {
        return repository.marcaDelGimnasio(TenantContextHolder.getTenantId());
    }

    // ─── Los llaveros que vinieron en el DNI ─────────────────────────────────────────────────

    /**
     * Un socio que tiene en el documento algo que parece el número de un llavero.
     *
     * @param yaEsDe si ese número ya es el llavero activo de OTRO socio, su nombre: ese no se
     *               puede pasar sin que alguien decida de quién es
     */
    public record Candidato(UUID socioId, String nombre, String documento, String yaEsDe) {}

    /**
     * ⭐ Los socios que, como en ControlFit, tienen el llavero guardado en lugar del DNI.
     *
     * <p>Es una lista para REVISAR, no una conversión: un número largo puede ser también un
     * documento extranjero (ver {@link Llavero#pareceLlavero}). Los que ya tienen ese número
     * como llavero no salen: ya están pasados.</p>
     */
    @Transactional(readOnly = true)
    public List<Candidato> candidatosEnElDocumento() {
        UUID tenantId = TenantContextHolder.getTenantId();
        Map<String, UUID> activos = new HashMap<>();
        for (MemberCredentialRepository.CodigoDelSocio c : repository.activosDelGimnasio(tenantId)) {
            activos.put(c.getCodigo(), c.getMemberId());
        }

        List<GymMember> socios = memberRepository.conDocumentoLargo(tenantId);
        Map<UUID, String> nombres = new HashMap<>();
        for (GymMember s : socios) nombres.put(s.getId(), s.getFullName());

        List<Candidato> candidatos = new ArrayList<>();
        for (GymMember s : socios) {
            if (!Llavero.pareceLlavero(s.getDocument())) continue;
            String codigo = Llavero.normalizar(s.getDocument());
            UUID dueno = activos.get(codigo);
            if (s.getId().equals(dueno)) continue;
            candidatos.add(new Candidato(s.getId(), s.getFullName(), s.getDocument(), nombreDe(dueno, nombres)));
        }
        return candidatos;
    }

    /** Cómo terminó el paso: cuántos se pasaron y cuántos no, para que la pantalla lo diga. */
    public record PasoDelDocumento(int pasados, int salteados) {}

    /**
     * Les pasa a llavero el número que tienen en el documento. <b>El documento no se toca</b>: lo
     * corrige el mostrador cuando el socio traiga el DNI (ADR-016 §9).
     *
     * <p>Se saltea, sin frenar a los demás, a quien ya no parece tener un llavero en el
     * documento (lo editaron en el medio), a quien no es de este gimnasio y a quien tiene un
     * número que ya es el llavero de otro.</p>
     */
    @Transactional
    public PasoDelDocumento pasarDelDocumento(List<UUID> memberIds, String hechoPor) {
        if (memberIds == null || memberIds.isEmpty()) return new PasoDelDocumento(0, 0);
        UUID tenantId = TenantContextHolder.getTenantId();

        int pasados = 0;
        int salteados = 0;
        for (UUID id : new LinkedHashSet<>(memberIds)) {
            GymMember socio = memberRepository.findById(id)
                    .filter(m -> m.getTenant() != null && tenantId.equals(m.getTenant().getId()))
                    .filter(m -> !m.estaBorrado())
                    .orElse(null);
            if (socio == null || !Llavero.pareceLlavero(socio.getDocument())) {
                salteados++;
                continue;
            }
            String codigo = Llavero.normalizar(socio.getDocument());
            Optional<MemberCredential> actual = repository.findByTenantIdAndTipoAndCodigoAndDadoDeBajaAtIsNull(
                    tenantId, MemberCredential.LLAVERO, codigo);
            if (actual.isPresent()) {
                // Ya era suyo: no hay nada que pasar. De otro: lo decide una persona, no esto.
                salteados++;
                continue;
            }
            MemberCredential nuevo = new MemberCredential();
            nuevo.setTenant(socio.getTenant());
            nuevo.setMemberId(socio.getId());
            nuevo.setCodigo(codigo);
            nuevo.setAsignadoPorNombre(recortar(hechoPor));
            repository.saveAndFlush(nuevo);
            pasados++;
        }
        return new PasoDelDocumento(pasados, salteados);
    }

    // ─── Ayudantes ───────────────────────────────────────────────────────────────────────────

    /** El nombre del dueño de un llavero; casi siempre ya está en la lista que se trajo. */
    private String nombreDe(UUID socioId, Map<UUID, String> conocidos) {
        if (socioId == null) return null;
        String nombre = conocidos.get(socioId);
        if (nombre != null) return nombre;
        return memberRepository.findById(socioId).map(GymMember::getFullName).orElse("otro socio");
    }

    /** El código limpio, o un 400 que dice qué pasó. */
    private static String codigoValido(String crudo) {
        String codigo = Llavero.normalizar(crudo);
        if (!Llavero.esValido(codigo)) {
            throw new BusinessException("Eso no parece el número de un llavero (tienen que ser entre "
                    + Llavero.LARGO_MINIMO + " y " + Llavero.LARGO_MAXIMO
                    + " letras o números). Pasalo de nuevo por el lector.");
        }
        return codigo;
    }

    private static void bajar(MemberCredential c, String motivo, String hechoPor) {
        c.setDadoDeBajaAt(LocalDateTime.now());
        c.setMotivoBaja(motivo == null || motivo.isBlank() ? MOTIVO_POR_DEFECTO : recortar(motivo.trim()));
        c.setDadoDeBajaPorNombre(recortar(hechoPor));
    }

    /** Las columnas de nombres y motivos tienen 160: lo que sobra se corta, no rompe el guardado. */
    private static String recortar(String s) {
        if (s == null || s.isBlank()) return null;
        String limpio = s.trim();
        return limpio.length() <= 160 ? limpio : limpio.substring(0, 160);
    }
}
