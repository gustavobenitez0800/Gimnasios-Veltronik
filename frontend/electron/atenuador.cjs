/**
 * ============================================
 * VELTRONIK - BAJAR LA MÚSICA PARA QUE SE OIGA EL AVISO
 * ============================================
 *
 * Muchos gimnasios tienen el escritorio en la misma PC que pasa la música. Cuando entra un
 * socio con la cuota vencida suena una "X" corta, y para que se oiga hay que bajar un poco la
 * música, hacerla sonar y devolverle el volumen. Lo pidió el dueño así.
 *
 * <p><b>Cómo.</b> El volumen de cada programa lo maneja Windows (el mezclador de volumen), y
 * Electron no tiene cómo tocarlo. Lo hace un ayudante chico en PowerShell, que viene en todo
 * Windows: se levanta UNA vez al arrancar —compilar su parte en C# tarda un segundo— y después
 * atiende pedidos al instante por su entrada estándar. Nada que instalar, nada nativo.</p>
 *
 * <p><b>Lo que NO toca:</b> el volumen general de la PC, ni el de Veltronik (si bajara el
 * suyo, la "X" no se oiría). Solo el de las OTRAS aplicaciones que estén sonando.</p>
 *
 * <p><b>Las tres garantías que importan</b>, porque dejarle la música baja a un gimnasio es peor
 * que no avisar:</p>
 * <ol>
 *   <li><b>Dos vencidos seguidos no la dejan baja para siempre.</b> El segundo pedido, con la
 *       música todavía baja, solo ESTIRA el plazo. Si volviera a bajar, tomaría el volumen ya
 *       bajado como el "original" y lo devolvería ahí.</li>
 *   <li><b>Si alguien mueve el volumen mientras está bajo, gana esa persona:</b> al volver, solo
 *       se restaura el programa que sigue exactamente donde lo dejamos.</li>
 *   <li><b>Si Veltronik se cierra en el medio, la música vuelve igual</b>: el ayudante lee su
 *       entrada estándar, y cuando el proceso padre muere la entrada se cierra y restaura.</li>
 * </ol>
 *
 * <p>Si algo de esto falla —no hay PowerShell, un antivirus lo frena, una política lo
 * bloquea—, la "X" suena igual, sin bajar la música. Nunca se traba el mostrador por esto.</p>
 */

const fs = require('fs');
const path = require('path');

/** Cuánto baja la música: al 25% de lo que estaba. Se oye el aviso sin que se corte la música. */
const NIVEL = 0.25;
/** Cuánto aguanta baja como máximo, por pedido. El ayudante también lo acota. */
const MAXIMO_MS = 3000;
/** Cuántas veces se lo levanta de nuevo si se cae, antes de rendirse hasta el próximo arranque. */
const REINTENTOS = 3;
/**
 * ⭐ Cuánto se espera a que el ayudante CONTESTE que bajó (02/11/2026).
 *
 * Antes el aviso sonaba 120 ms después de pedir, bajara o no: si el ayudante tardaba un poco
 * más en encontrar la música, la X sonaba con la música a todo volumen y no se oía. Ahora el
 * aviso espera la respuesta —«bajé N programas»— y si no llega en este rato suena igual.
 */
const ESPERA_RESPUESTA_MS = 450;

/*
 * El ayudante. C# 5 a propósito: PowerShell 5.1 (el de todo Windows 10/11) compila con el csc
 * de .NET Framework, que no entiende `$"..."`, `?.` ni `out var`.
 *
 * Interfaces de Core Audio (mmdeviceapi.h / audiopolicy.h). El orden de los métodos es el de la
 * vtable y NO se puede cambiar, aunque no se usen todos: son los lugares que ocupan.
 */
const SCRIPT = String.raw`param([string]$Propios = '')
$ErrorActionPreference = 'Stop'
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

namespace Veltronik
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumerator { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int Item(uint index, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(IntPtr sessionGuid, int streamFlags, out IntPtr sessionControl);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr sessionGuid, int streamFlags, out IntPtr audioVolume);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnum);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, out IAudioSessionControl2 session);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName(out IntPtr name);
        [PreserveSig] int SetDisplayName(IntPtr value, IntPtr eventContext);
        [PreserveSig] int GetIconPath(out IntPtr path);
        [PreserveSig] int SetIconPath(IntPtr value, IntPtr eventContext);
        [PreserveSig] int GetGroupingParam(out Guid groupingParam);
        [PreserveSig] int SetGroupingParam(IntPtr groupingParam, IntPtr eventContext);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
        [PreserveSig] int GetSessionIdentifier(out IntPtr id);
        [PreserveSig] int GetSessionInstanceIdentifier(out IntPtr id);
        [PreserveSig] int GetProcessId(out uint pid);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference(bool optOut);
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface ISimpleAudioVolume
    {
        [PreserveSig] int SetMasterVolume(float level, ref Guid eventContext);
        [PreserveSig] int GetMasterVolume(out float level);
        [PreserveSig] int SetMute(bool mute, ref Guid eventContext);
        [PreserveSig] int GetMute(out bool mute);
    }

    internal class Sesion
    {
        public ISimpleAudioVolume Volumen;
        public string Nombre;
        public float Original;
        public float Aplicado;
    }

    public static class Atenuador
    {
        private static List<Sesion> atenuadas;
        private static DateTime hasta;
        private static HashSet<string> propios;

        public static void Correr(string nombresPropios)
        {
            propios = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string n in (nombresPropios ?? "").Split(','))
            {
                if (n.Trim().Length > 0) propios.Add(n.Trim());
            }

            BlockingCollection<string> cola = new BlockingCollection<string>();
            Thread lector = new Thread(delegate ()
            {
                try
                {
                    string linea;
                    while ((linea = Console.In.ReadLine()) != null) cola.Add(linea);
                }
                catch (Exception) { }
                cola.Add("SALIR");
            });
            lector.IsBackground = true;
            lector.Start();

            Responder("LISTO");
            while (true)
            {
                string linea;
                if (cola.TryTake(out linea, 40))
                {
                    string[] partes = linea.Trim().Split(' ');
                    string orden = partes[0].ToUpperInvariant();
                    try
                    {
                        if (orden == "SALIR") { Restaurar(); return; }
                        if (orden == "BAJAR" && partes.Length >= 3)
                        {
                            float nivel = float.Parse(partes[1], CultureInfo.InvariantCulture);
                            int ms = int.Parse(partes[2], CultureInfo.InvariantCulture);
                            Bajar(nivel, ms);
                            Responder("BAJADO " + (atenuadas == null ? 0 : atenuadas.Count));
                        }
                        else if (orden == "LISTAR") Listar();
                        else if (orden == "PING") Responder("PONG");
                    }
                    catch (Exception e) { Responder("ERROR " + e.Message.Replace('\n', ' ')); }
                }
                if (atenuadas != null && DateTime.UtcNow >= hasta)
                {
                    try { Restaurar(); } catch (Exception e) { Responder("ERROR " + e.Message.Replace('\n', ' ')); atenuadas = null; }
                }
            }
        }

        private static void Responder(string texto)
        {
            Console.Out.WriteLine(texto);
            Console.Out.Flush();
        }

        private static void Bajar(float nivel, int ms)
        {
            nivel = Math.Max(0.05f, Math.Min(1f, nivel));
            DateTime nuevo = DateTime.UtcNow.AddMilliseconds(Math.Max(100, Math.Min(ms, 5000)));
            if (nuevo > hasta) hasta = nuevo;
            // Ya estaba baja: se estira el plazo y nada más. Volver a bajar tomaría el volumen
            // ya bajado como "original" y la música quedaría baja para siempre.
            if (atenuadas != null) return;

            List<Sesion> lista = new List<Sesion>();
            foreach (Sesion s in SesionesAjenas())
            {
                if (s.Original > 0.001f)
                {
                    s.Aplicado = s.Original * nivel;
                    lista.Add(s);
                }
            }
            atenuadas = lista;
            Rampa(lista, true);
        }

        private static void Restaurar()
        {
            if (atenuadas == null) return;
            List<Sesion> lista = new List<Sesion>();
            foreach (Sesion s in atenuadas)
            {
                float actual;
                // Si alguien lo movió mientras estaba bajo, gana esa persona: no se toca.
                if (s.Volumen.GetMasterVolume(out actual) == 0 && Math.Abs(actual - s.Aplicado) < 0.02f) lista.Add(s);
            }
            atenuadas = null;
            Rampa(lista, false);
        }

        /** Unos pocos pasos cortos: bajar o subir de golpe se oye como un corte. */
        private static void Rampa(List<Sesion> lista, bool bajando)
        {
            Guid contexto = Guid.Empty;
            const int pasos = 5;
            for (int i = 1; i <= pasos; i++)
            {
                foreach (Sesion s in lista)
                {
                    float desde = bajando ? s.Original : s.Aplicado;
                    float destino = bajando ? s.Aplicado : s.Original;
                    s.Volumen.SetMasterVolume(desde + (destino - desde) * i / pasos, ref contexto);
                }
                if (lista.Count > 0) Thread.Sleep(16);
            }
        }

        private static List<Sesion> SesionesAjenas()
        {
            List<Sesion> res = new List<Sesion>();
            IMMDeviceEnumerator enumerador = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
            IMMDeviceCollection salidas;
            // 0 = eRender (las salidas), 1 = DEVICE_STATE_ACTIVE (las enchufadas). TODAS, no solo
            // la principal: hay gimnasios con la música en otra salida (la del amplificador, un
            // HDMI, una placa USB), y ahí antes no se encontraba nada que bajar.
            if (enumerador.EnumAudioEndpoints(0, 1, out salidas) != 0 || salidas == null) return res;
            uint cuantasSalidas;
            if (salidas.GetCount(out cuantasSalidas) != 0) return res;
            int yo = Process.GetCurrentProcess().Id;
            for (uint d = 0; d < cuantasSalidas; d++)
            {
                IMMDevice dispositivo;
                if (salidas.Item(d, out dispositivo) != 0 || dispositivo == null) continue;
                SesionesDe(dispositivo, yo, res);
            }
            return res;
        }

        private static void SesionesDe(IMMDevice dispositivo, int yo, List<Sesion> res)
        {
            Guid iid = typeof(IAudioSessionManager2).GUID;
            object instancia;
            if (dispositivo.Activate(ref iid, 23, IntPtr.Zero, out instancia) != 0) return;
            IAudioSessionManager2 gestor = (IAudioSessionManager2)instancia;
            IAudioSessionEnumerator sesiones;
            if (gestor.GetSessionEnumerator(out sesiones) != 0 || sesiones == null) return;

            int cuantas;
            sesiones.GetCount(out cuantas);
            for (int i = 0; i < cuantas; i++)
            {
                IAudioSessionControl2 control;
                if (sesiones.GetSession(i, out control) != 0 || control == null) continue;
                if (control.IsSystemSoundsSession() == 0) continue;   // S_OK = los sonidos de Windows
                int estado;
                if (control.GetState(out estado) != 0 || estado != 1) continue;   // 1 = está sonando
                uint pid;
                control.GetProcessId(out pid);
                if (pid == 0 || pid == yo) continue;
                string nombre = NombreDe(pid);
                if (nombre == null || propios.Contains(nombre)) continue;

                ISimpleAudioVolume volumen = (ISimpleAudioVolume)control;
                float v;
                if (volumen.GetMasterVolume(out v) != 0) continue;
                Sesion s = new Sesion();
                s.Volumen = volumen;
                s.Nombre = nombre;
                s.Original = v;
                res.Add(s);
            }
        }

        private static string NombreDe(uint pid)
        {
            try { return Process.GetProcessById((int)pid).ProcessName; }
            catch (Exception) { return null; }
        }

        /** Para probar sin tocar nada: qué sonaría y a qué volumen está. */
        private static void Listar()
        {
            foreach (Sesion s in SesionesAjenas())
            {
                Responder("SESION " + s.Nombre + " " + s.Original.ToString("0.00", CultureInfo.InvariantCulture));
            }
            Responder("FIN");
        }
    }
}
'@
[Veltronik.Atenuador]::Correr($Propios)
`;

/**
 * El atenuador, con sus dependencias inyectables para poder probarlo sin Windows ni PowerShell.
 *
 * @param {object} deps
 * @param {Function} deps.spawn             child_process.spawn
 * @param {string}   deps.carpeta           dónde escribir el script (la carpeta de datos de la app)
 * @param {string}   deps.propios           el nombre del proceso de Veltronik, para no bajarse a sí mismo
 * @param {string}   [deps.plataforma]      process.platform
 * @param {Function} [deps.escribir]        fs.writeFileSync
 * @param {Function} [deps.avisar]          dónde dejar constancia de un problema
 */
function crearAtenuador({
    spawn, carpeta, propios, plataforma = process.platform, escribir = fs.writeFileSync,
    avisar = console.warn, esperar = setTimeout,
}) {
    let proceso = null;
    let listo = false;
    let caidas = 0;
    let ultimoError = null;
    // Los pedidos de BAJAR que esperan su «BAJADO n», en orden: el ayudante contesta en el mismo
    // orden en que le llegan. Uno que se cansó de esperar queda marcado y se descarta al llegar
    // su respuesta, así la siguiente no se le atribuye al pedido equivocado.
    let esperando = [];

    /** Contesta (y saca) el pedido más viejo que todavía espera. */
    function contestar(cuantos) {
        const pedido = esperando.shift();
        if (pedido && !pedido.vencido) pedido.resolver(cuantos);
    }

    function iniciar() {
        if (plataforma !== 'win32' || proceso || caidas > REINTENTOS) return;
        try {
            const ruta = path.join(carpeta, 'bajar-musica.ps1');
            // Se escribe en cada arranque: si una versión nueva cambia el ayudante, no queda
            // el viejo en disco. Va con BOM: PowerShell 5.1 lee sin BOM como ANSI.
            escribir(ruta, '﻿' + SCRIPT, 'utf8');
            proceso = spawn('powershell.exe', [
                '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
                '-WindowStyle', 'Hidden', '-File', ruta, '-Propios', propios,
            ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (e) {
            caidas = REINTENTOS + 1;
            ultimoError = e.message;
            avisar('[musica] no se pudo levantar el ayudante:', e.message);
            proceso = null;
            return;
        }

        const esteProceso = proceso;
        esteProceso.stdout.setEncoding('utf8');
        esteProceso.stdout.on('data', (texto) => {
            if (/\bLISTO\b/.test(texto)) listo = true;
            for (const bajado of String(texto).matchAll(/BAJADO (\d+)/g)) contestar(Number(bajado[1]));
            const error = /ERROR (.*)/.exec(texto);
            if (error) {
                ultimoError = error[1].trim();
                avisar('[musica]', ultimoError);
                contestar(-1);
            }
        });
        esteProceso.stderr.setEncoding('utf8');
        esteProceso.stderr.on('data', (texto) => {
            const linea = String(texto).trim().slice(0, 300);
            if (linea) ultimoError = linea;
            avisar('[musica]', linea);
        });
        const alCaer = () => {
            if (proceso !== esteProceso) return;
            proceso = null;
            listo = false;
            caidas += 1;
            // Lo que esperaba respuesta de este ayudante ya no la va a tener.
            const pendientes = esperando;
            esperando = [];
            pendientes.forEach((p) => { if (!p.vencido) p.resolver(-1); });
        };
        esteProceso.on('exit', alCaer);
        esteProceso.on('error', (e) => {
            ultimoError = e.message;
            avisar('[musica] el ayudante falló:', e.message);
            alCaer();
        });
    }

    /**
     * Baja la música de los otros programas durante `ms` milisegundos.
     *
     * @returns {Promise<number>} cuántos programas bajó (0 = no había ninguno sonando en esta PC),
     *          o -1 si el ayudante no está listo o no contestó a tiempo. El aviso espera esto para
     *          sonar, y en Ajustes se muestra para saber si la música se baja de verdad.
     */
    function bajar(ms) {
        if (!proceso || !listo) {
            iniciar();
            return Promise.resolve(-1);
        }
        const duracion = Math.max(100, Math.min(Number(ms) || 0, MAXIMO_MS));
        try {
            proceso.stdin.write(`BAJAR ${NIVEL} ${Math.round(duracion)}\n`);
        } catch (e) {
            ultimoError = e.message;
            avisar('[musica] no se pudo pedir:', e.message);
            return Promise.resolve(-1);
        }
        return new Promise((resolver) => {
            const pedido = { resolver, vencido: false };
            esperando.push(pedido);
            esperar(() => {
                if (pedido.vencido || !esperando.includes(pedido)) return;
                pedido.vencido = true;
                resolver(-1);
            }, ESPERA_RESPUESTA_MS);
        });
    }

    /** Cómo está, para Ajustes → Sonido del mostrador. */
    function estado() {
        return {
            disponible: plataforma === 'win32',
            listo,
            rendido: caidas > REINTENTOS,
            ultimoError,
        };
    }

    /** Al cerrar la app: que devuelva el volumen y se vaya. */
    function detener() {
        if (!proceso) return;
        try { proceso.stdin.write('SALIR\n'); proceso.stdin.end(); } catch { /* ya no está */ }
        proceso = null;
        listo = false;
    }

    return { iniciar, bajar, detener, estado, estaListo: () => listo };
}

module.exports = { crearAtenuador, SCRIPT, NIVEL, ESPERA_RESPUESTA_MS };
