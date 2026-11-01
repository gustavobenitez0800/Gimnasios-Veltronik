# ============================================
# VELTRONIK - EL PROGRAMA DE LA CAJITA DEL MOLINETE
# ============================================
# Corre en una Raspberry Pi Pico con MicroPython, dentro de la cajita que va enchufada por USB
# a la PC del mostrador. Maneja un relé (pata GP28) que va cableado al molinete. No decide
# nada: abre cuando el escritorio de Veltronik se lo pide, y el escritorio decide con el mismo
# veredicto que pinta el cartel del mostrador.
#
# Dos formas de cablearla, según el molinete (se elige desde Ajustes y queda guardada acá):
#
#   SOSTENER  el relé PRENDIDO traba el molinete; apagado, gira libre. La cajita lo sostiene
#             prendido todo el día y lo suelta unos segundos para que pase alguien. Si se
#             corta la luz o se apaga la PC, el molinete queda libre: se puede salir siempre.
#             (Así está el del gimnasio de Nelson Hernández, el primero.)
#   PULSO     el molinete tiene su propia placa y abre con una señal en su entrada de
#             "abrir" (la del botón): el relé se prende un instante y la placa del molinete
#             hace el resto (cuenta la vuelta y vuelve a trabar sola).
#
# Órdenes por USB, una por renglón (contesta otro renglón):
#   PING            -> PONG veltronik-molinete 2
#   ABRIR [ms]      abre esos milisegundos (sin número, los guardados) y vuelve a trabar sola
#   TRABAR          traba ya
#   LIBRE           deja pasar hasta nueva orden
#   ESTADO          -> ESTADO <TRABADO|ABIERTO|LIBRE> MODO=<..> ABRIR_MS=<..> veltronik-molinete 2
#   MODO <SOSTENER|PULSO>, TIEMPO <ms>   cambian la configuración y la guardan en cajita.json
#
# Para instalarla o actualizarla: Ajustes -> Cajita del molinete, en el escritorio de Veltronik
# (le copia este archivo solo). A mano: docs/molinete/cajita.md.
#
# Ctrl-C la deja en la consola de MicroPython (así se actualiza). Nunca abrir el puerto a 1200
# baudios: reinicia la Pico en modo cargador.
# ============================================

import sys
import json
import time
import select
import machine

VERSION = 'veltronik-molinete 2'
PIN_RELE = 28
ARCHIVO = 'cajita.json'
MODOS = ('SOSTENER', 'PULSO')
MS_MINIMO = 100
MS_MAXIMO = 30000


def limitar(ms):
    return max(MS_MINIMO, min(MS_MAXIMO, int(ms)))


# Lo guardado, o lo de fábrica: SOSTENER y 5 segundos, como el primer molinete.
config = {'modo': 'SOSTENER', 'abrir_ms': 5000}
try:
    with open(ARCHIVO) as f:
        guardada = json.load(f)
    if guardada.get('modo') in MODOS:
        config['modo'] = guardada['modo']
    if 'abrir_ms' in guardada:
        config['abrir_ms'] = limitar(guardada['abrir_ms'])
except Exception:
    pass  # primera vez, o un archivo roto: queda lo de fábrica


def guardar():
    with open(ARCHIVO, 'w') as f:
        json.dump(config, f)


rele = machine.Pin(PIN_RELE, machine.Pin.OUT)
estado = 'TRABADO'
volver_a_trabar = None  # ticks_ms en que un ABRIR vuelve a trabar solo


def nivel_que_deja_pasar():
    # SOSTENER: el relé apagado suelta la traba. PULSO: el relé prendido es la señal de abrir.
    return 0 if config['modo'] == 'SOSTENER' else 1


def poner(nuevo, ms=None):
    global estado, volver_a_trabar
    estado = nuevo
    abierto = nuevo in ('ABIERTO', 'LIBRE')
    rele.value(nivel_que_deja_pasar() if abierto else 1 - nivel_que_deja_pasar())
    volver_a_trabar = time.ticks_add(time.ticks_ms(), ms) if nuevo == 'ABIERTO' else None


def contestar(texto):
    print(texto)


def numero(texto):
    try:
        return int(texto)
    except (TypeError, ValueError):
        return None


def atender(renglon):
    partes = renglon.strip().split()
    if not partes:
        return
    orden = partes[0].upper()
    arg = partes[1] if len(partes) > 1 else None

    if orden == 'PING':
        contestar('PONG ' + VERSION)
    elif orden == 'ABRIR':
        n = numero(arg)
        ms = limitar(n) if n is not None else config['abrir_ms']
        poner('ABIERTO', ms)
        contestar('OK ABIERTO ' + str(ms))
    elif orden == 'TRABAR':
        poner('TRABADO')
        contestar('OK TRABADO')
    elif orden == 'LIBRE':
        poner('LIBRE')
        contestar('OK LIBRE')
    elif orden == 'ESTADO':
        contestar('ESTADO ' + estado + ' MODO=' + config['modo']
                  + ' ABRIR_MS=' + str(config['abrir_ms']) + ' ' + VERSION)
    elif orden == 'MODO' and arg and arg.upper() in MODOS:
        config['modo'] = arg.upper()
        guardar()
        # Cambiar de modo invierte qué nivel traba: se vuelve a aplicar el estado de ahora (y
        # un ABRIR a medias termina trabado, que es lo seguro).
        poner('LIBRE' if estado == 'LIBRE' else 'TRABADO')
        contestar('OK MODO ' + config['modo'])
    elif orden == 'TIEMPO' and numero(arg) is not None:
        config['abrir_ms'] = limitar(numero(arg))
        guardar()
        contestar('OK TIEMPO ' + str(config['abrir_ms']))
    else:
        contestar('ERROR ' + orden)


# Arranca trabado: con la cajita recién enchufada nadie pasa sin que el mostrador lo diga.
poner('TRABADO')

lector = select.poll()
lector.register(sys.stdin, select.POLLIN)
renglon = ''

while True:
    if volver_a_trabar is not None and time.ticks_diff(volver_a_trabar, time.ticks_ms()) <= 0:
        poner('TRABADO')
    if lector.poll(20):
        c = sys.stdin.read(1)
        if c in ('\n', '\r'):
            try:
                atender(renglon)
            except Exception as e:
                contestar('ERROR ' + str(e))
            renglon = ''
        elif len(renglon) < 64:
            renglon += c
