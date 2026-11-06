# Revisión local: Deja de joder a tu pareja 2.0

Preparación local del nuevo evento. No se ha publicado esta edición, habilitado ventas ni enviado correos durante esta actualización.

## Evento confirmado

- Jueves 18 de febrero de 2027. Teatro Belarte, Cra. 7 #152-54, Bogotá.
- Puertas: 7:00 p. m. Inicio: 7:30 p. m. Zona: America/Bogota.
- Identificador: `standup-therapy-deja-de-joder-pareja-2-0-bogota-18feb2027`.
- Referencias del checkout: prefijo `ST-18FEB27-`.
- Configuración compartida: `event-config.js`, consumida por servidor, motor de precios y ambos selectores.

## Plano y tarifas

239 sillas: A–J con 22 puestos por fila, K con 19. Se conserva la división de pasillos.

| Ubicación | Sillas | Precio COP |
| --- | --- | ---: |
| Lateral | A–J: 1, 2, 3, 20, 21 y 22; 60 sillas | 49.000 |
| Preferencial | A–C: 6 a 17; 36 sillas | 79.000 |
| General | Las restantes, incluida toda K; 143 sillas | 59.000 |

La promoción temporal anterior está desactivada. La categoría interna `preventa` conserva su identificador técnico y se presenta como General.

## Identidad y experiencia

Se reutilizan las ilustraciones sin texto de astronautas, micrófono, planetas y mariposas. El afiche actualizado guía el título y el número visible de reservas: +57 323 801 6527. En móvil, texto e ilustración ocupan bloques distintos.

## Separación y protecciones

- Check-in y limpieza automática importan el identificador compartido.
- Las operaciones requieren `EVENT_RELEASE_ID` igual al identificador nuevo, además de sus interruptores de habilitación.
- El checkout rechaza referencias del evento anterior. Actualización y reversión de reservas incluyen `event_id`.
- Las claves del almacenamiento de referencias del navegador incluyen el identificador nuevo.
- Correos, recordatorios, QR, administración y términos muestran el nombre, fecha y horarios nuevos.
- Los envíos conservan `RESEND_FROM` como remitente configurable del evento. No se verificaron ni modificaron credenciales remotas.
- Se conserva la corrección local de check-in con `event_log.reservation_id`.
- No se ejecutaron mutaciones de Supabase durante esta actualización de la web. Se conservaron los cambios locales previos.

## Validación local

- 27 pruebas automatizadas: tarifas, pagos simulados, rechazo de referencias anteriores, reversión aislada, bloqueo de la edición anterior y autenticación administrativa.
- Compilación estática y revisión de sintaxis.
- Navegador local en 1440, 390 y 320 px. Selección A-1, A-4 y A-6: 187.000 COP. Pagos deshabilitados en la vista local.
- Invitación comprobada con respuestas simuladas, sin crear ni enviar invitaciones reales.
- Prueba táctil simulada a 390 px: A-22 y C-17 por 128.000 COP, formulario completo, pago real bloqueado. Ver `touch-check.json`.
- Segunda revisión independiente: resueltos el desbordamiento de invitación y el acceso legal en móvil.
- Evidencia del navegador: `.impeccable/review/`. Ver `browser-checks.json` para los resultados de la última pasada.
- El detector automático de diseño no pudo ejecutarse porque el motor no está instalado. Se realizó revisión independiente sobre capturas y código.

## Antes de publicar o vender

1. Aplicar y verificar en Supabase el cambio preparado en `supabase-manual-transfer-migration.sql`: la función remota de transferencias conserva su restricción de edición hasta actualizarla. No se ejecutó ese SQL.
2. Verificar disponibilidad real del nuevo identificador y remitente del evento. Una vista local vacía no prueba disponibilidad remota.
3. Actualizar bot y enlaces de Instagram para esta edición antes de promocionarlos: su tabla remota de enlaces todavía no incorpora un evento.
4. Probar con registros exclusivos del nuevo evento: pago y notificación, invitación, reenvío, transferencia y check-in con reversión. Las pruebas de este repositorio usan respuestas simuladas.
5. Configurar `EVENT_RELEASE_ID`, `EVENT_PUBLIC_URL`, secretos administrativos y remitente. Habilitar interruptores únicamente después de las pruebas controladas.
6. Publicar solo con autorización posterior de Javi. No realizar commit ni push sin autorización.

## Publicación autorizada

Esta copia de publicación excluye los cambios locales previos de atribución de Instagram y del diseño de recordatorios. Se mantiene la venta cerrada hasta una validación controlada del pago real y correo. El identificador remoto no se cambió: todas las operaciones nuevas permanecen bloqueadas por falta de coincidencia de edición. El selector público presenta el plano como referencia.

La revisión final de capturas a 1440, 390 y 320 px resolvió el contraste: textos navy sobre naranja uniforme, información sobre azul en crema, y ausencia de superposición de texto e ilustración.

## Activación de pagos autorizada

Se habilita el cobro Bold exclusivamente para el evento 2.0, con `EVENT_RELEASE_ID` de esta edición y `ENABLE_REAL_PAYMENTS=true` en producción. `ENABLE_EVENT_OPERATIONS=false` mantiene bloqueadas invitaciones, transferencias administrativas, reenvíos/campañas y check-in. El endpoint de disponibilidad permite lectura del evento si los pagos están activos. La limpieza de reservas vencidas pertenece al flujo de pagos y mantiene el filtro de evento.

Se verificó en Supabase, dentro de una transacción revertida, el rechazo de montos incorrectos, la confirmación atómica y la idempotencia; no quedaron registros sintéticos. Las pruebas locales pasan con administración desactivada. La creación de enlace y apertura de checkout se comprueban tras el despliegue sin realizar cargos. La prueba de un pago efectivamente abonado y su correo no forma parte de esa comprobación sin cobro.
