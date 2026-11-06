---
name: Stand-Up Therapy · Deja de joder a tu pareja 2.0
description: Comedia con estética cósmica editorial y selección de sillas sobre azul noche.
colors:
  landing-orange: "#f46500"
  hero-orange-mobile: "#f46500"
  hero-title-navy: "#001e62"
  hero-body-blue: "#092358"
  landing-blue: "#0f5496"
  landing-blue-bright: "#1874bf"
  landing-cream: "#fffaf2"
  landing-ink: "#0d1210"
  landing-plum: "#071822"
  landing-wine: "#0b2d48"
  landing-teal: "#0b426f"
  landing-sand: "#d8d1cc"
  landing-yellow: "#f4a30a"
  landing-line: "rgba(255, 250, 242, 0.25)"
  accent: "#0f67b1"
  accent-bright: "#78c4ff"
  mist: "#eae5e2"
  muted: "#bdb4ad"
  line: "rgba(255, 255, 255, 0.14)"
  tier-general: "#f9b609"
  tier-lateral: "#fff0d6"
typography:
  display:
    fontFamily: '"Anton", sans-serif'
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '"Anton", sans-serif'
    fontSize: "clamp(3rem, 5vw, 5.6rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  body:
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    lineHeight: 1.55
  editorial-emphasis:
    fontFamily: '"Playfair Display", serif'
    fontWeight: 700
  action:
    fontSize: "0.82rem"
    fontWeight: 900
    letterSpacing: "0.08em"
  field-label:
    fontSize: "0.72rem"
    fontWeight: 900
rounded:
  editorial: "0"
  field: "12px"
  payment: "14px"
  panel: "22px"
  seat: "5px 5px 8px 8px"
spacing:
  form-gap: "14px"
  action-gap: "12px"
  field-gap: "6px"
  mobile-gutter: "20px"
components:
  button-primary:
    backgroundColor: "{colors.landing-blue}"
    textColor: "{colors.landing-cream}"
    typography: "{typography.action}"
    rounded: "{rounded.editorial}"
    padding: "18px 19px"
  button-primary-hover:
    backgroundColor: "{colors.landing-cream}"
    textColor: "{colors.landing-blue}"
  button-payment:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.landing-cream}"
    rounded: "{rounded.payment}"
    padding: "16px 28px"
    height: "56px"
  field:
    backgroundColor: "rgba(255, 255, 255, 0.06)"
    textColor: "{colors.landing-cream}"
    rounded: "{rounded.field}"
    padding: "0 16px"
    height: "48px"
  seat:
    backgroundColor: "rgba(255, 255, 255, 0.08)"
    textColor: "{colors.landing-cream}"
    rounded: "{rounded.seat}"
    width: "40px"
    height: "44px"
  seat-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.landing-cream}"
  checkout-panel:
    backgroundColor: "linear-gradient(145deg, rgba(15, 84, 150, 0.24), rgba(255, 250, 242, 0.025))"
    rounded: "{rounded.panel}"
    padding: "clamp(24px, 4vw, 44px)"
---

# Design System: Stand-Up Therapy

## Overview

**Creative North Star: "Comedia cósmica editorial"**

Comedia con estética cósmica editorial. El naranja, los titulares azul navy y el blanco crema sostienen una voz de afiche: titulares condensados y cambios amplios de superficie. La referencia vigente muestra una pareja de astronautas sentados conversando en `assets/standup-conversacion-2027.jpg`; el título y la información del evento permanecen como HTML independiente.

El sistema combina la composición expresiva de la landing con superficies densas y legibles para elegir sillas y completar datos. Se documenta el código local de la edición 2.0, actualizada al 18 de febrero de 2027; este archivo no acredita publicación. No existe PRODUCT.md conocido y no se deduce una estrategia de producto adicional.

**Key Characteristics:**
- Naranja y título navy en el hero, cuerpo azul oscuro y acento crema; azul y noche en acciones y operación.
- Anton condensada en titulares; Inter en lectura, controles y datos; Playfair Display en énfasis editorial.
- Imagen y texto separados en el hero móvil; plano de sillas horizontal con desplazamiento interno.

## Colors

La paleta alterna el calor del escenario y el espacio azul oscuro; el hero utiliza titulares navy y cuerpo azul oscuro sobre naranja; el crema permanece en acciones y otras superficies.

### Primary
- **Naranja de escenario** (`landing-orange`): campos amplios de la landing y acentos del contenido editorial. `hero-orange-mobile` es el fondo del bloque de texto móvil; la imagen aporta su textura propia.
- **Navy de titular** (`hero-title-navy`): título principal y última línea; la línea central conserva el crema.
- **Azul de lectura del hero** (`hero-body-blue`): lead, crédito, horarios y reservas sobre naranja.
- **Azul de acción** (`landing-blue`, `landing-blue-bright`): botones, navegación, edición y superficie de fecha; la variante brillante aparece en acentos y progreso.

### Secondary
- **Azul operativo** (`accent`): selección de sillas y pago.
- **Azul luminoso** (`accent-bright`): totales, enlaces y categoría preferencial.
- **Amarillo cálido** (`landing-yellow`): detalles cósmicos y apoyos de información. La tarifa general conserva su color propio `tier-general`; no son el mismo token.

### Neutral
- **Crema** (`landing-cream`): línea central del título, textos sobre superficies oscuras y reverso del botón editorial al pasar el cursor.
- **Tinta y noche** (`landing-ink`, `landing-plum`): fondos de lectura y compra.
- **Azules profundos** (`landing-wine`, `landing-teal`): ficha de datos móvil y estados oscuros de acción.
- **Arena, niebla y texto secundario** (`landing-sand`, `mist`, `muted`): lectura secundaria y estados de operación.
- **Líneas translúcidas** (`landing-line`, `line`): separadores de información y bordes de formularios.
- **Crema de tarifa lateral** (`tier-lateral`): marca inferior de silla y leyenda; conservar su distinción respecto al crema principal.

Los nombres de frontmatter conservan los identificadores de las variables fuente cuando existen. Los tokens `hero-orange-mobile`, `hero-title-navy` y `hero-body-blue` describen valores literales del CSS vigente. Los alias equivalentes de styles.css, como `white`, `black`, `night` y `steel`, no crean nuevos colores. Los colores de tarifa provienen de seat-pricing.js.

## Typography

**Display Font:** Anton, con sans-serif de respaldo en la landing.
**Body Font:** Inter, con la pila de sistema registrada en frontmatter.
**Editorial Emphasis:** Playfair Display en itálica para remates del manifiesto y cierre.

**Character:** Letras condensadas, mayúsculas y grandes masas de texto para el escenario. Inter organiza precios, instrucciones, campos y navegación sin competir con esa voz.

### Hierarchy
- **Display:** familia, peso, interlineado y tracking en frontmatter; el hero usa `clamp(5.3rem, 9.2vw, 9.6rem)` en escritorio y `clamp(4rem, 20vw, 6rem)` hasta 680px. Son medidas de esta composición, no un límite global para nuevas vistas.
- **Headline:** títulos de los bloques narrativos; en móvil pasan a `clamp(3.2rem, 15vw, 4.6rem)`.
- **Body:** el lead usa `clamp(1rem, 1.35vw, 1.25rem)` y medida máxima `min(520px, 43vw)`; móvil usa `.93rem`, interlineado `1.48` y ancho completo. Otros párrafos narrativos usan interlineado `1.65` y máximo `520px`.
- **Action:** botones editoriales en mayúsculas; la acción grande usa `.9rem` y padding de `22px`.
- **Field label:** etiquetas de formulario en mayúsculas; campos de `1rem`, sillas de `.72rem` y `.64rem` hasta 620px.
- **Data:** tarifas y contadores usan cifras tabulares donde está declarado; precios principales combinan Anton y azul luminoso.

## Layout

El hero de escritorio ocupa todo el ancho: bloque de texto a la izquierda (zona de composición del 42%) y arte a la derecha, cuyo contenedor comienza en el 44% del ancho. La imagen muestra astronautas sentados conversando. Su contenedor deja `150px` arriba y `170px` abajo; el archivo se presenta al `160%` de ancho, centrado verticalmente y recortado por el contenedor. Su contenido tiene máximo de `1500px`, laterales de `5vw` y padding superior adaptable. Las secciones alternan campos amplios con composiciones asimétricas y columnas; sus gutters principales son `6vw`.

Hasta `980px`, desaparecen los enlaces centrales de navegación y se apilan narrativa, fecha y compra. Entre `681px` y `1000px`, el título del hero usa `10.5vw` con máximo `61vw`; el lead conserva máximo `48vw`.

Hasta `680px`, el hero es una columna ordenada: texto, imagen y ficha del evento. El texto tiene padding `106px 20px 30px`; la imagen es relativa, sin transformación, con altura `90vw` y máximo `610px`. Se usa la imagen de conversación; el recorte móvil ocupa `160%` de ancho con desplazamiento horizontal de `-37.5%`, dentro de un contenedor que oculta el excedente. Las capas decorativas del hero se ocultan. La ficha pasa a dos columnas y el lugar ocupa una fila completa. Este orden evita escribir sobre los astronautas.

La operación usa un contenedor máximo de `1160px`. El formulario tiene dos columnas y gap de `14px`; pasa a una columna hasta `900px`. El plano conserva 239 sillas: filas A–J de 22 y K de 19. Sus filas no se encogen para caber; el scroll horizontal pertenece al plano, con controles finales de `40 × 44px` en todos los anchos. Las secciones de asientos usan gap de `3px`; los pasillos son de `16px` y `12px` hasta 620px. La leyenda se organiza en dos columnas hasta 620px.

La evidencia guardada en `.impeccable/review/` y `browser-checks.json` cubre 1440, 390 y 320px; confirma separación móvil, conteo y dimensiones del plano. Esta documentación no añade una nueva verificación de navegador ni prueba de pagos.

## Elevation & Depth

La profundidad reutilizable depende del contraste entre superficies, la ilustración y los separadores finos. La ficha del hero utiliza azul profundo y conserva desenfoque de `14px`; la capa de lavado del hero se encuentra oculta en la referencia vigente; la barra al desplazarse usa fondo casi opaco y desenfoque de `18px`. Los paneles operativos llevan borde y gradiente tonal suave. Los halos centrados heredados no forman un vocabulario de elevación: se excluyen de los tokens y ejemplos del sidecar, aunque persisten en el CSS actual.

## Shapes

La landing utiliza acciones y bloques editoriales rectos. En operación, los campos son suavemente redondeados, el pago usa una curva algo mayor y los paneles un contorno amplio; sus valores están en frontmatter. Las sillas conservan la silueta con esquinas superiores e inferiores distintas. La leyenda usa muestras de `16 × 16px` con radio de `4px`. El escenario es una geometría funcional, con arco inferior y borde azul; no equivale a una máscara de los personajes.

## Components

### Buttons

Acciones explícitas y de alto contraste. El botón editorial usa azul con borde crema translúcido, peso fuerte y esquina recta; hover invierte fondo y texto. La navegación utiliza una acción editorial compacta (`14px 20px`). El enlace de texto lleva una línea inferior que pasa a `scaleX(.25)` con hover. El pago es azul operativo, tiene altura mínima definida en frontmatter y reduce opacidad a `.4` cuando está deshabilitado; no copiar su halo heredado.

El foco visible de la landing es un contorno crema de `3px`, separado `5px`; en operación es azul luminoso con separación de `4px`. Las sillas tienen contorno crema separado `2px`.

### Cards / Containers

La ficha del hero reúne precio, fecha y lugar con separadores finos; su tratamiento responsive está en Layout. El panel de compra editorial organiza lista de tarifas, pasos y CTA sobre tinta. El panel de checkout operativo agrupa selección, total y campos con el gradiente y radio del frontmatter; padding móvil de `20px` hasta 620px. No convertir los halos o bordes decorativos heredados en componentes nuevos.

### Inputs / Fields

Campos translúcidos sobre noche, con borde de `line`, altura definida en frontmatter y separación de etiqueta de `6px`. Placeholder en `muted`; foco cambia el borde a `accent`; caret en azul luminoso. Los consentimientos conservan etiquetas multilínea y casillas de `18px` con accent azul. No hay una escala reutilizable de errores visuales extraída de estas fuentes.

### Navigation

Barra fija, identidad a la izquierda, enlaces centrales y acción a la derecha. En la landing su altura pasa de `84px` a `68px` al desplazarse; enlaces de `.74rem`, peso `700`, tracking `.12em`. En móvil el símbolo de marca queda visible y se oculta su texto acompañante. El selector conserva la variante operativa de la barra y sus enlaces azules.

### Seat map

Cada silla muestra número y una marca inferior de tarifa. La categoría general es amarilla, lateral crema y preferencial azul luminoso. El estado seleccionado usa fondo azul operativo; ocupada reduce fondo y borde y conserva texto `muted`, con cursor bloqueado. Hover de una disponible escala a `1.12`, cambia borde y texto; no se aplica a seleccionadas u ocupadas. La leyenda informa categoría, precio y estado. La fila y el número permanecen legibles y el scroll del mapa recibe foco visible.

### Motion

La entrada del hero dura `900ms` con `cubic-bezier(0.2, 0.76, 0.2, 1)` y escalona partes del título entre `100ms` y `320ms`. Los botones editoriales transicionan durante `180ms`; las sillas durante `120ms`. El enlace subrayado responde en `220ms`. La landing incluye movimiento de órbitas y revelados al desplazarse; se registran como implementación existente, sin extenderlos a nuevas pantallas operativas. La preferencia de movimiento reducido elimina animaciones y transiciones del hero, sus botones y revelados y deja visible su contenido.

## Do's and Don'ts

### Do:
- Do mantener los textos del evento en HTML, independientes de la imagen.
- Do separar el bloque de texto y la pareja de astronautas en móvil hasta 680px.
- Do conservar controles de silla de 40 × 44px y desplazar el plano dentro de su contenedor.
- Do acompañar los colores de tarifa con nombre y precio; distinguir selección y ocupación también mediante estados del control.
- Do mantener el foco visible y respetar la preferencia de movimiento reducido en la landing.

### Don't:
- Don't incrustar fechas, precios o títulos en el arte como única fuente de información.
- Don't reducir el plano completo para encajarlo en una pantalla pequeña.
- Don't extender los halos, kickers, numeraciones ornamentales o flechas Unicode heredados como nuevos patrones del sistema.
- Don't tratar tamaños de fecha gigantes o efectos decorativos puntuales como una escala general para nuevas pantallas.

La captura del código conserva defectos anteriores: kickers y numeraciones decorativas, sombras con halo centrado, glifos Unicode como flechas, fuentes remotas y algunos tamaños display superiores al craft floor. No se canonizan como decisiones reutilizables. Este registro describe la implementación y no certifica contraste, accesibilidad completa ni publicación.
