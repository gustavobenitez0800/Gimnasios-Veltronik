import { useEffect, useRef } from 'react';
import { suscribirRefrescoGeneral } from './queryCacheStore';

/**
 * Llama a `fn` cada vez que la app entera se pone al día: volvió la conexión, o subió lo que
 * esperaba en la cola (ver `refrescarTodo`).
 *
 * <p>Es para las pantallas que cargan por su cuenta, sin `useQueryCache` —la Caja, el QR de
 * Accesos, los aranceles de Socios—. Las que usan la caché ya se enteran solas. Sin esto, lo
 * que una de estas mostró sin conexión quedaba en pantalla después de volver internet, y la
 * única forma de verlo al día era salir y volver a entrar.</p>
 *
 * <p>Se suscribe UNA vez y llama siempre a la versión vigente de `fn`: depender de su
 * identidad re-suscribiría en cada render (ver `useRefrescoAutomatico`, donde eso ya costó).</p>
 */
export function useAlPonerseAlDia(fn) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  useEffect(() => suscribirRefrescoGeneral(() => fnRef.current()), []);
}

export default useAlPonerseAlDia;
