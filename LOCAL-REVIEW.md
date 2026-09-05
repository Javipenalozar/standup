# Revisión local: Deja de joder a tu pareja

Esta edición permanece aislada del evento anterior. La versión pública está activa en `https://standup.eventosjv.com`; los cambios descritos en la sección “Pendiente de despliegue” siguen únicamente en este repositorio hasta recibir autorización de publicación.

## Datos del evento

- Evento: Stand-Up Therapy — Deja de joder a tu pareja
- Fecha: jueves 5 de noviembre de 2026
- Hora: 7:00 p. m.
- Lugar: Teatro Belarte, Cra. 7 # 152-54, Bogotá
- Tarifa lateral: $49.000 COP — sillas 1, 2, 3, 20, 21 y 22 de las filas A–J
- Tarifa preferencial: $79.000 COP — sillas 6 a 17 de las filas A–C
- Preventa general: $59.000 COP — todas las demás sillas
- Identificador: `standup-therapy-deja-de-joder-pareja-bogota-5nov2026`
- Plano confirmado: 239 sillas, con filas A–J de 22 puestos y fila K de 19 puestos

## Protecciones activas

- El navegador local muestra el selector sin consultar ocupación remota y mantiene el botón de pago deshabilitado.
- `crear-pago-bold`, el webhook y la limpieza de pagos exigen `ENABLE_REAL_PAYMENTS=true` y que `EVENT_RELEASE_ID` coincida exactamente con esta edición.
- Creación de invitaciones, reservas de cortesía y envíos administrativos exigen `ENABLE_EVENT_OPERATIONS=true`.
- Todo enlace público generado por el backend exige `EVENT_PUBLIC_URL`; no hay un dominio de producción heredado como respaldo.
- Reservas, webhooks, administración, recordatorios e invitaciones usan tablas `st_*` y filtran el identificador de esta edición.
- La aceptación de privacidad y términos es explícita, separada y sin casillas premarcadas.
- La verificación pública de entradas oculta parcialmente el correo del comprador.
- Los pagos aprobados se aplican de forma atómica únicamente cuando valor y moneda coinciden con las sillas reservadas.
- Los eventos de Bold conservan una bitácora idempotente, incluso cuando el procesamiento termina en error.
- El panel administrativo usa una cookie de sesión firmada, `HttpOnly`, `Secure` y `SameSite=Strict`; la contraseña deja de viajar en cada operación. Requiere `ADMIN_SESSION_SECRET` antes de desplegar esta versión.

## Verificación realizada

- `npm test`: pruebas automatizadas de precios, aislamiento, pagos, webhook, seguridad administrativa y contrato de publicación.
- `npm run check`: sintaxis, referencias del evento y contrato de archivos superados.
- `npm exec netlify build`: compilación y empaquetado de funciones superados.
- Revisión responsive en 522 px y 1253 px sin desbordamiento horizontal ni errores de consola.
- Producción verificada: https://standup.eventosjv.com
- La base remota usa las tablas aisladas `st_*`; RLS y permisos de `anon`, `authenticated` y `service_role` fueron revisados.
- Prueba de vencimiento sin pago completada el 4 de septiembre de 2026: A-1 por $49.000, referencia `ST-EXPIRY-20260904-A1`, enlace Bold `LNK_Y59LPS849G`. La reserva venció a los 15 minutos, el proceso programado la cambió a `cancelled`, el selector volvió a mostrar la silla disponible y el registro sintético fue eliminado después de la verificación.

## Pendiente de despliegue y operación

1. Configurar `ADMIN_SESSION_SECRET` en Netlify con al menos 32 caracteres aleatorios antes de publicar el nuevo panel.
2. Probar en una vista previa el inicio de sesión, cierre de sesión, creación de invitaciones y check-in con la nueva cookie.
3. Confirmar ciudad y domicilio legal del responsable si se desea que la política los indique de forma separada a la dirección de atención `Calle 23G No. 81-66`.
4. Publicar el cambio en producción únicamente con autorización separada.
