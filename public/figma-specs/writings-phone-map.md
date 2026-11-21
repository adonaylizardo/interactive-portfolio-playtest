
const assetPathPrefix = "./assets/writings-phone-map"; // local copies; original temp URL: https://www.figma.com/api/mcp/asset/b2bbe9a9-499c-46fd-9b09-130af37482c2
const imgIcono = `${assetPathPrefix}/7c0ee.svg`;
const imgIcono1 = `${assetPathPrefix}/88655.svg`;
const imgIcono2 = `${assetPathPrefix}/b7a40.svg`;
const imgIcono3 = `${assetPathPrefix}/b545b.svg`;
const imgIcono4 = `${assetPathPrefix}/1452e.svg`;
const imgIcono5 = `${assetPathPrefix}/a6bc1.svg`;
const imgIcono6 = `${assetPathPrefix}/bd3b9.svg`;
const imgGlifoCirculo = `${assetPathPrefix}/5bd06.svg`;
const imgGlifoPagina = `${assetPathPrefix}/aef4f.svg`;
const imgGlifoPortapapeles = `${assetPathPrefix}/629bf.svg`;
const imgEstadoExteriorZoomCerca = `${assetPathPrefix}/af018.svg`;
const imgBibliotecaIngenieriaUcvV3ExteriorLuzEncendida = `${assetPathPrefix}/799f4.png`;
const imgRejilla = `${assetPathPrefix}/e3288.svg`;
const imgIcono7 = `${assetPathPrefix}/313cb.svg`;
const imgIcono8 = `${assetPathPrefix}/84750.svg`;
const imgAnillo = `${assetPathPrefix}/6af66.svg`;

function UiJoystick({ className }: { className?: string }) {
  return (
    <div className={className || "bg-[var(--ui\\/joystick,rgba(20,21,24,0.5))] border border-[var(--ui\\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center relative rounded-[56px] size-[112px]"} data-node-id="24:598" data-name="ui/joystick">
      <div className="bg-[var(--ui\/text,#edeef0)] relative rounded-[24px] shadow-[0px_2px_8px_0px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_2px_0px_var(--ui\/shadow,rgba(0,0,0,0.45))] shrink-0 size-[48px]" data-node-id="24:599" data-name="pomo" />
    </div>
  );
}

type UiDockProps = {
  className?: string;
  mostrarAvatar?: boolean;
  mostrarCasos?: boolean;
  mostrarChat?: boolean;
  mostrarContacto?: boolean;
  mostrarInventario?: boolean;
  mostrarLogros?: boolean;
  mostrarMapa?: boolean;
};

function UiDock({ className, mostrarAvatar = true, mostrarCasos = true, mostrarChat = false, mostrarContacto = true, mostrarInventario = false, mostrarLogros = true, mostrarMapa = true }: UiDockProps) {
  return (
    <div className={className || "content-stretch flex gap-[8px] h-[48px] items-center justify-center relative w-[375px]"} data-node-id="6:254" data-name="ui/dock">
      {mostrarAvatar && (
        <div className="bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center relative rounded-[24px] shrink-0 size-[48px]" data-node-id="6:255" data-name="avatar">
          <div className="relative shrink-0 size-[15px]" data-node-id="I6:255;5:40" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono} />
          </div>
        </div>
      )}
      {mostrarCasos && (
        <div className="bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center relative rounded-[24px] shrink-0 size-[48px]" data-node-id="25:853" data-name="casos">
          <div className="relative shrink-0 size-[15px]" data-node-id="I25:853;5:40" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono1} />
          </div>
        </div>
      )}
      {mostrarLogros && (
        <div className="bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center relative rounded-[24px] shrink-0 size-[48px]" data-node-id="6:258" data-name="logros">
          <div className="relative shrink-0 size-[15px]" data-node-id="I6:258;5:40" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono2} />
          </div>
        </div>
      )}
      {mostrarInventario && (
        <div className="bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center relative rounded-[24px] shrink-0 size-[48px]" data-node-id="25:1229" data-name="inventario">
          <div className="relative shrink-0 size-[15px]" data-node-id="I25:1229;5:40" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono3} />
          </div>
        </div>
      )}
      {mostrarChat && (
        <div className="bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center relative rounded-[24px] shrink-0 size-[48px]" data-node-id="25:1232" data-name="chat">
          <div className="relative shrink-0 size-[15px]" data-node-id="I25:1232;5:40" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono4} />
          </div>
        </div>
      )}
      {mostrarContacto && (
        <div className="bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center relative rounded-[24px] shrink-0 size-[48px]" data-node-id="25:857" data-name="contacto">
          <div className="relative shrink-0 size-[15px]" data-node-id="I25:857;5:40" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono5} />
          </div>
        </div>
      )}
      {mostrarMapa && (
        <div className="bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center relative rounded-[24px] shrink-0 size-[48px]" data-node-id="6:267" data-name="mapa">
          <div className="relative shrink-0 size-[15px]" data-node-id="I6:267;5:40" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono6} />
          </div>
        </div>
      )}
    </div>
  );
}

type UiIconoProps = {
  className?: string;
  glifo?: "circulo" | "pagina" | "portapapeles";
};

function UiIcono({ className, glifo = "circulo" }: UiIconoProps) {
  const isPagina = glifo === "pagina";
  const isPortapapeles = glifo === "portapapeles";
  return (
    <div className={className || "relative size-[15px]"} id={isPortapapeles ? "node-4_847" : isPagina ? "node-4_843" : "node-4_811"}>
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={isPortapapeles ? imgGlifoPortapapeles : isPagina ? imgGlifoPagina : imgGlifoCirculo} />
    </div>
  );
}

type EdificioEstudioProps = {
  className?: string;
  estado?: "exterior";
  zoom?: "cerca";
};

function EdificioEstudio({ className, estado = "exterior", zoom = "cerca" }: EdificioEstudioProps) {
  return (
    <div className={className || "h-[240px] relative w-[256px]"} data-node-id="7:960">
      <div className="absolute inset-[0_-0.2%_-0.21%_-0.2%]">
        <img alt="" className="block max-w-none size-full" src={imgEstadoExteriorZoomCerca} />
      </div>
    </div>
  );
}

export default function WritingsTelefono1MapaEtiquetaWritings() {
  return (
    <div className="bg-[var(--ui\/bg,#0b0c0e)] relative size-full" data-node-id="199:1715" data-name="writings/telefono · 1 mapa · etiqueta Writings">
      <div className="absolute bg-[#17181b] h-[812px] left-0 overflow-clip top-0 w-[375px]" data-node-id="199:1716" data-name="mapa">
        <div className="absolute h-[812px] left-0 top-0 w-[375px]" data-node-id="199:1717" data-name="rejilla">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgRejilla} />
        </div>
        <EdificioEstudio className="absolute h-[240px] left-[470px] top-[460px] w-[256px]" />
        <EdificioEstudio className="absolute h-[240px] left-[-170px] top-[600px] w-[256px]" />
        <div className="absolute h-[271.56px] left-[-1px] top-[230px] w-[376.96px]" data-node-id="206:724" data-name="Biblioteca Ingeniería UCV v3 · exterior (luz encendida)">
          <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgBibliotecaIngenieriaUcvV3ExteriorLuzEncendida} />
        </div>
      </div>
      <div className="absolute bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex h-[48px] items-center left-[16px] px-[4px] rounded-[999px] top-[56px]" data-node-id="199:1826" data-name="ui/barra-herramientas-telefono">
        <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="I199:1826;6:271" data-name="buscar">
          <div className="relative shrink-0 size-[15px]" data-node-id="I199:1826;6:271;5:25" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono7} />
          </div>
        </div>
        <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="I199:1826;81:525" data-name="sonido">
          <div className="relative shrink-0 size-[15px]" data-node-id="I199:1826;81:525;5:25" data-name="icono">
            <div className="absolute inset-[-4.17%_0_0_-4.17%]">
              <img alt="" className="block max-w-none size-full" src={imgIcono8} />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bg-[var(--ui\/surface,#141518)] content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex flex-col items-start left-[122px] rounded-[26px] top-[56px] w-[237px]" data-node-id="199:1835" data-name="ui/checklist">
        <div className="content-stretch flex gap-[10px] h-[52px] items-center pl-[18px] pr-[8px] relative shrink-0 w-full" data-node-id="I199:1835;7:257" data-name="cabecera">
          <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col items-start leading-[16px] min-w-px not-italic relative text-[13px]" data-node-id="I199:1835;7:258" data-name="textos">
            <p className="font-['Inter:Regular'] font-normal relative shrink-0 text-[color:var(--ui\/text-secondary,#8a8f98)] w-full" data-node-id="I199:1835;7:259">
              Getting started
            </p>
            <p className="font-['Inter:Medium'] font-medium relative shrink-0 text-[color:var(--ui\/text,#edeef0)] w-full" data-node-id="I199:1835;7:260">
              Enter a building
            </p>
          </div>
          <p className="[word-break:break-word] font-['Geist_Mono:Medium'] font-medium leading-[16px] relative shrink-0 text-[13px] text-[color:var(--ui\/text,#edeef0)] whitespace-nowrap" data-node-id="I199:1835;7:261">
            3/5
          </p>
          <div className="relative shrink-0 size-[44px]" data-node-id="I199:1835;7:262" data-name="anillo">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgAnillo} />
          </div>
        </div>
      </div>
      <div className="absolute bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_4px_8px_rgba(0,0,0,0.4)] flex gap-[8px] items-center left-[200.9px] pl-[14px] pr-[16px] py-[12px] rounded-[999px] top-[176px]" data-node-id="199:1845" data-name="pill · Writings">
        <UiIcono className="relative shrink-0 size-[15px]" glifo="pagina" />
        <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] whitespace-nowrap" data-node-id="199:1848">
          Writings
        </p>
      </div>
      <UiDock className="absolute content-stretch flex gap-[8px] h-[48px] items-center justify-center left-0 top-[740px] w-[375px]" />
      <UiJoystick className="absolute bg-[var(--ui\/joystick,rgba(20,21,24,0.5))] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center left-[247px] rounded-[56px] size-[112px] top-[612px]" />
    </div>
  );
}
SUPER CRITICAL: The generated React+Tailwind code MUST be converted to match the target project's technology stack and styling system.
1. Analyze the target codebase to identify: technology stack, styling approach, component patterns, and design tokens
2. Convert React syntax to the target framework/library
3. Transform all Tailwind classes to the target styling system while preserving exact visual design
4. Follow the project's existing patterns and conventions
DO NOT install any Tailwind as a dependency unless the user instructs you to do so.

Node ids have been added to the code as data attributes, e.g. `data-node-id="1:2"`.
Component descriptions: The following components have usage descriptions or documentation links defined in Figma. These descriptions provide important context about the intended usage, best practices, and any constraints for each component. Follow these guidelines when implementing or using these components.

## edificio/estudio
**Node ID:** 7:1002

Placeholder del estudio (arte final de Chroma). Huella 2×2 tiles (128×64): frame completo 256×240, ancla abajo al centro (128, 240) = vértice inferior del rombo base (regla 2). Bloque isométrico de 96 de alto. exterior: techo world/tile-top, muro izq world/prop-face, muro der world/tile-side, trazos world/prop-line 1px. hover: trazos ui/text 2px + puerta world/glow. interior: techo quitado, suelo rombo world/tile-top + grilla world/tile-line, muros bajos. resaltado: exterior + contorno world/glow 2px con brillo difuso. lejos: silueta plana world/prop-face sin detalle + un punto de luz world/glow de 8px (puerta). Mismo frame en cerca/lejos para que Forge cambie sin mover el ancla.

## ui/barra-herramientas-telefono
**Node ID:** 6:270

Pill de herramientas teléfono (worldTools). Spec §2.1: 88×48 en 16,24, padding 0 4, radius full, dos círculos 40 (buscar, día/noche). Tokens: ui/surface + anillo ui/line + sombra ui/shadow; iconos ui/text.

## ui/boton-redondo
**Node ID:** 5:42

Botón redondo (icon button). Spec §0 hit targets + §1.2/§1.3: 40 desktop, 44 teléfono, 48 dock; radius full; icono 15 centrado. default = transparente (sobre superficie). seleccionado = outline 1px ui/text (§1.2 selected). flotante = panel cerrado: ui/surface + anillo 1px ui/line inside + sombra ui/shadow (§1.2 / §2.4). Prop icono = instance swap de ui/icono.

## ui/icono
**Node ID:** 4:855

Glifos placeholder 15×15 (trazo 1.25, round caps) para botones y filas. Color: ui/text (sobrescribible por ui/text-secondary / ui/bg en instancias). Fuente: tomjohn spec §1.2 (iconos 15px). Se usan como instancia anidada llamada &quot;icono&quot;. v2: + descargar, maletin, cubo, info, estrella, colapsar e iniciales (texto "AL" Inter Medium 13/16 centrado, sobresale del cuadro de 15 a propósito para leerse dentro de un botón de 40; prop de texto iniciales).

## ui/checklist
**Node ID:** 7:271

Checklist &quot;Primeros pasos&quot;. Spec §1.5 y §2.2. desktop abierta 296×359: cabecera 296×52 (padding 0 8 0 18, gap 10; etiqueta 13/16 ui/text-secondary, paso actual 13/16 Medium, conteo Geist Mono 13/16, anillo 36) + lista padding 8 con borde superior dashed ui/line; filas = instancias expuestas de ui/paso (desktop 280×40) → cualquier fila puede ser pendiente/siguiente/actual/hecho y mostrar instrucción. telefono abierta 256 ancho, filas ui/paso telefono 240×44, 4 pasos. desktop cerrada 40×40 (a 6px del borde sup/der); telefono cerrada pill 256×52 radius 26; telefono circulo 48×48. Props: paso-actual (texto, todas), conteo (texto, sólo desktop; en teléfono editar la capa conteo, por defecto 0/4); anillo y pasos expuestos (cambiar progreso / estado desde la instancia).

## ui/anillo-progreso
**Node ID:** 5:130

Anillo de progreso. Spec §1.5 discoveryRing: 36×36, círculo r=16.75, trazo 2.5, round caps, arco = hechos/total desde las 12 en sentido horario; icono portapapeles 15 centrado. 24 = anillo de sección de Logros (§1.9, r=11 trazo 2 inferido, sin icono). Valores cubren 8% (1/12, aviso de logro), 5 pasos (20/40/60/80%) y 4 pasos teléfono (25/50/75%). Tokens: fondo ui/bg, pista ui/line, progreso ui/accent (regla Chroma: ámbar solo para el contador).

## ui/dock
**Node ID:** 6:254

Dock teléfono (nav.phoneNav, §2.4): fila 375×48, gap 8, centrada, botones ui/boton-redondo 48 flotante. v2: slots avatar (iniciales), casos (maletin), logros, inventario (oculto), chat (oculto), contacto, mapa; cada uno con mostrar-<slot> (bool) e icono-<slot> (swap).

## ui/joystick
**Node ID:** 24:598

Joystick teléfono (§2.1): círculo 112×112 fill ui/joystick (ui/surface al 50%) + borde 1px ui/line; pomo 48 ui/text con sombra ui/shadow. Posición: 247,692 (247,620 con dock; 247,592 con hoja).
The generated code contains image and SVG URL constants, e.g. const image = `${assetPathPrefix}/<asset file name>`, where assetPathPrefix is declared once at the top of the code and every asset URL interpolates it. These URLs are temporary download sources and expire after 7 days. Download each asset into the project with curl -L, then replace its URL in the generated code with a reference to the downloaded asset. Never use the temporary URLs as runtime image sources.

