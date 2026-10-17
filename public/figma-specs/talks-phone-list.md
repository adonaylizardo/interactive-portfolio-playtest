
const assetPathPrefix = "./assets/talks-phone-list"; // local copies; original temp URL: https://www.figma.com/api/mcp/asset/4c9e40ba-067b-4c1e-8917-acecd333c269
const imgGlifoCirculo = `${assetPathPrefix}/5bd06.svg`;
const imgGlifoPortapapeles = `${assetPathPrefix}/629bf.svg`;
const imgEstadoExteriorZoomCerca = `${assetPathPrefix}/af018.svg`;
const imgTeatroTeresaCarrenoV2BInteriorPantallaPlaceholderVideo = `${assetPathPrefix}/0f6fa.png`;
const imgRejilla = `${assetPathPrefix}/e3288.svg`;
const imgIcono = `${assetPathPrefix}/313cb.svg`;
const imgIcono1 = `${assetPathPrefix}/84750.svg`;
const imgAnillo = `${assetPathPrefix}/6af66.svg`;
const imgIcono2 = `${assetPathPrefix}/f1b3a.svg`;
const imgPlay = `${assetPathPrefix}/6a8ac.svg`;

type UiIconoProps = {
  className?: string;
  glifo?: "circulo" | "portapapeles";
};

function UiIcono({ className, glifo = "circulo" }: UiIconoProps) {
  const isPortapapeles = glifo === "portapapeles";
  return (
    <div className={className || "relative size-[15px]"} id={isPortapapeles ? "node-4_847" : "node-4_811"}>
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={isPortapapeles ? imgGlifoPortapapeles : imgGlifoCirculo} />
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

export default function TalksTelefono2HojaLista() {
  return (
    <div className="bg-[var(--ui\/bg,#0b0c0e)] relative size-full" data-node-id="194:1541" data-name="talks/telefono · 2 hoja · lista">
      <div className="absolute bg-[#17181b] h-[812px] left-0 overflow-clip top-0 w-[375px]" data-node-id="194:1542" data-name="mapa">
        <div className="absolute h-[812px] left-0 top-0 w-[375px]" data-node-id="194:1543" data-name="rejilla">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgRejilla} />
        </div>
        <EdificioEstudio className="absolute h-[240px] left-[370px] top-[160px] w-[256px]" />
        <EdificioEstudio className="absolute h-[240px] left-[-200px] top-[300px] w-[256px]" />
        <div className="absolute h-[286.44px] left-[23px] top-[63px] w-[357.12px]" data-node-id="202:63" data-name="Teatro Teresa Carreño v2b · interior + pantalla (placeholder video)">
          <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgTeatroTeresaCarrenoV2BInteriorPantallaPlaceholderVideo} />
        </div>
      </div>
      <div className="absolute bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex h-[48px] items-center left-[16px] px-[4px] rounded-[999px] top-[56px]" data-node-id="194:1714" data-name="ui/barra-herramientas-telefono">
        <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="I194:1714;6:271" data-name="buscar">
          <div className="relative shrink-0 size-[15px]" data-node-id="I194:1714;6:271;5:25" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono} />
          </div>
        </div>
        <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="I194:1714;81:525" data-name="sonido">
          <div className="relative shrink-0 size-[15px]" data-node-id="I194:1714;81:525;5:25" data-name="icono">
            <div className="absolute inset-[-4.17%_0_0_-4.17%]">
              <img alt="" className="block max-w-none size-full" src={imgIcono1} />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bg-[var(--ui\/surface,#141518)] content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex flex-col items-start left-[122px] rounded-[26px] top-[56px] w-[237px]" data-node-id="194:1723" data-name="ui/checklist">
        <div className="content-stretch flex gap-[10px] h-[52px] items-center pl-[18px] pr-[8px] relative shrink-0 w-full" data-node-id="I194:1723;7:257" data-name="cabecera">
          <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col items-start leading-[16px] min-w-px not-italic relative text-[13px]" data-node-id="I194:1723;7:258" data-name="textos">
            <p className="font-['Inter:Regular'] font-normal relative shrink-0 text-[color:var(--ui\/text-secondary,#8a8f98)] w-full" data-node-id="I194:1723;7:259">
              Getting started
            </p>
            <p className="font-['Inter:Medium'] font-medium relative shrink-0 text-[color:var(--ui\/text,#edeef0)] w-full" data-node-id="I194:1723;7:260">
              Enter a building
            </p>
          </div>
          <p className="[word-break:break-word] font-['Geist_Mono:Medium'] font-medium leading-[16px] relative shrink-0 text-[13px] text-[color:var(--ui\/text,#edeef0)] whitespace-nowrap" data-node-id="I194:1723;7:261">
            3/5
          </p>
          <div className="relative shrink-0 size-[44px]" data-node-id="I194:1723;7:262" data-name="anillo">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgAnillo} />
          </div>
        </div>
      </div>
      <div className="absolute bg-[var(--ui\/surface,#141518)] border-[var(--ui\/line,#2a2c31)] border-solid border-t content-stretch flex flex-col gap-[12px] h-[560px] items-start left-0 overflow-clip pb-[24px] px-[16px] rounded-tl-[16px] rounded-tr-[16px] shadow-[0px_-8px_32px_0px_rgba(0,0,0,0.45)] top-[252px] w-[375px]" data-node-id="194:1733" data-name="hoja-talks">
        <div className="content-stretch flex flex-col h-[76px] items-start pb-[8px] relative shrink-0 w-full" data-node-id="194:1734" data-name="ui/hoja-encabezado">
          <div className="content-stretch flex h-[24px] items-center justify-center relative shrink-0 w-full" data-node-id="I194:1734;24:654" data-name="agarre">
            <div className="bg-[var(--ui\/line,#2a2c31)] h-[4px] relative rounded-[4px] shrink-0 w-[70px]" data-node-id="I194:1734;24:655" data-name="barra" />
          </div>
          <div className="content-stretch flex gap-[8px] h-[44px] items-center relative shrink-0 w-full" data-node-id="I194:1734;24:656" data-name="fila-titulo">
            <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[24px] not-italic relative shrink-0 text-[16px] text-[color:var(--ui\/text,#edeef0)] whitespace-nowrap" data-node-id="I194:1734;24:657">
              Talks
            </p>
            <div className="flex-[1_0_0] h-[44px] min-w-px relative" data-node-id="I194:1734;24:659" data-name="espaciador" />
            <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="I194:1734;24:663" data-name="cerrar">
              <div className="relative shrink-0 size-[15px]" data-node-id="I194:1734;24:663;5:25" data-name="icono">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono2} />
              </div>
            </div>
          </div>
        </div>
        <p className="[word-break:break-word] font-['Inter:Regular'] font-normal leading-[20px] not-italic relative shrink-0 text-[14px] text-[color:var(--ui\/text-secondary,#8a8f98)] w-full" data-node-id="194:1745">
          Intro de una línea (placeholder).
        </p>
        <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full" data-node-id="194:1746" data-name="lista-talks">
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:1747" data-name="fila-talk 1">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:1748" data-name="miniatura 16:9 (placeholder)">
              <div className="relative shrink-0 size-[12px]" data-node-id="194:1749" data-name="play">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
              </div>
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:1751" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:1752">
                Talk title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:1753">
                Proyecto · Fecha
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:1754" data-name="fila-talk 2">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:1755" data-name="miniatura 16:9 (placeholder)">
              <div className="relative shrink-0 size-[12px]" data-node-id="194:1756" data-name="play">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
              </div>
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative" data-node-id="194:1758" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium h-[40px] leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:1759">
                Talk title (placeholder), versión larga que ocupa dos líneas como máximo
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="194:1760">
                Proyecto · Fecha
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:1761" data-name="fila-talk 3">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:1762" data-name="miniatura 16:9 (placeholder)">
              <div className="relative shrink-0 size-[12px]" data-node-id="194:1763" data-name="play">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
              </div>
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:1765" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:1766">
                Talk title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:1767">
                Proyecto · Fecha
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:1768" data-name="fila-talk 4">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:1769" data-name="miniatura 16:9 (placeholder)">
              <div className="relative shrink-0 size-[12px]" data-node-id="194:1770" data-name="play">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
              </div>
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:1772" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:1773">
                Talk title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:1774">
                Proyecto · Fecha
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:1775" data-name="fila-talk 5">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:1776" data-name="miniatura 16:9 (placeholder)">
              <div className="relative shrink-0 size-[12px]" data-node-id="194:1777" data-name="play">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
              </div>
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:1779" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:1780">
                Talk title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:1781">
                Proyecto · Fecha
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:1782" data-name="fila-talk 6">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:1783" data-name="miniatura 16:9 (placeholder)">
              <div className="relative shrink-0 size-[12px]" data-node-id="194:1784" data-name="play">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
              </div>
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:1786" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:1787">
                Talk title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:1788">
                Proyecto · Fecha
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:1789" data-name="fila-talk 7">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:1790" data-name="miniatura 16:9 (placeholder)">
              <div className="relative shrink-0 size-[12px]" data-node-id="194:1791" data-name="play">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
              </div>
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:1793" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:1794">
                Talk title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:1795">
                Proyecto · Fecha
              </p>
            </div>
          </div>
        </div>
      </div>
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

## ui/hoja-encabezado
**Node ID:** 24:653

Encabezado de hoja teléfono (§2.3 / §2.8): 375×76, padding 0 16 8; agarre 343×24 con barra 70×4 radius 4 ui/line; fila título 44 (gap 8): título 16/24 Medium + meta opcional 13/16 ui/text-secondary + ⋯ 44 opcional + cerrar 44. Props: titulo, meta (texto), mostrar-meta, mostrar-acciones (bool, por defecto false).
The generated code contains image and SVG URL constants, e.g. const image = `${assetPathPrefix}/<asset file name>`, where assetPathPrefix is declared once at the top of the code and every asset URL interpolates it. These URLs are temporary download sources and expire after 7 days. Download each asset into the project with curl -L, then replace its URL in the generated code with a reference to the downloaded asset. Never use the temporary URLs as runtime image sources.

