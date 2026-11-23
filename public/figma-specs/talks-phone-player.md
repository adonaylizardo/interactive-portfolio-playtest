
const assetPathPrefix = "./assets/talks-phone-player"; // local copies; original temp URL: https://www.figma.com/api/mcp/asset/1c10796a-a313-4c6d-967f-fd03de19a46e
const imgEstadoExteriorZoomCerca = `${assetPathPrefix}/af018.svg`;
const imgTeatroTeresaCarrenoV2BInteriorPantallaPlaceholderVideo = `${assetPathPrefix}/0f6fa.png`;
const imgRejilla = `${assetPathPrefix}/e3288.svg`;
const imgIcono = `${assetPathPrefix}/9f9c4.svg`;
const imgIcono1 = `${assetPathPrefix}/f1b3a.svg`;
const imgPausa = `${assetPathPrefix}/d0608.svg`;
const imgPlay = `${assetPathPrefix}/6a8ac.svg`;

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

export default function TalksTelefono3HojaReproductor() {
  return (
    <div className="bg-[var(--ui\/bg,#0b0c0e)] relative size-full" data-node-id="194:1796" data-name="talks/telefono · 3 hoja · reproductor">
      <div className="absolute bg-[#17181b] h-[812px] left-0 overflow-clip top-0 w-[375px]" data-node-id="194:1797" data-name="mapa">
        <div className="absolute h-[812px] left-0 top-0 w-[375px]" data-node-id="194:1798" data-name="rejilla">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgRejilla} />
        </div>
        <EdificioEstudio className="absolute h-[240px] left-[370px] top-[60px] w-[256px]" />
        <EdificioEstudio className="absolute h-[240px] left-[-200px] top-[200px] w-[256px]" />
        <div className="absolute h-[286.44px] left-[23px] top-[-37px] w-[357.12px]" data-node-id="202:104" data-name="Teatro Teresa Carreño v2b · interior + pantalla (placeholder video)">
          <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgTeatroTeresaCarrenoV2BInteriorPantallaPlaceholderVideo} />
        </div>
      </div>
      <div className="absolute bg-[var(--ui\/surface,#141518)] border-[var(--ui\/line,#2a2c31)] border-solid border-t content-stretch flex flex-col gap-[12px] h-[720px] items-start left-0 overflow-clip pb-[24px] px-[16px] rounded-tl-[16px] rounded-tr-[16px] shadow-[0px_-8px_32px_0px_rgba(0,0,0,0.45)] top-[92px] w-[375px]" data-node-id="194:1969" data-name="hoja-talks">
        <div className="content-stretch flex items-center justify-center pb-[2px] pt-[10px] relative shrink-0 w-full" data-node-id="194:1970" data-name="agarre">
          <div className="bg-[var(--ui\/line,#2a2c31)] h-[4px] relative rounded-[4px] shrink-0 w-[40px]" data-node-id="194:1971" data-name="barra" />
        </div>
        <div className="content-stretch flex gap-[4px] items-center relative shrink-0 w-full" data-node-id="194:1972" data-name="encabezado">
          <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="194:1973" data-name="atras">
            <div className="relative shrink-0 size-[15px]" data-node-id="I194:1973;5:25" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono} />
            </div>
          </div>
          <p className="[word-break:break-word] flex-[1_0_0] font-['Inter:Medium'] font-medium leading-[24px] min-w-px not-italic relative text-[16px] text-[color:var(--ui\/text,#edeef0)]" data-node-id="194:1976">
            Talks
          </p>
          <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="194:1977" data-name="cerrar">
            <div className="relative shrink-0 size-[15px]" data-node-id="I194:1977;5:25" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono1} />
            </div>
          </div>
        </div>
        <div className="bg-[var(--ui\/bg,#0b0c0e)] border border-[var(--ui\/line,#2a2c31)] border-solid h-[193px] relative rounded-[8px] shrink-0 w-[343px]" data-node-id="194:1980" data-name="video 16:9 (placeholder)">
          <p className="[word-break:break-word] absolute font-['Geist_Mono:Medium'] font-medium leading-[normal] left-[107.5px] text-[11px] text-[color:var(--ui\/text-secondary,#8a8f98)] top-[87.5px] whitespace-nowrap" data-node-id="194:1981">
            VIDEO · PLACEHOLDER
          </p>
          <div className="absolute bg-[var(--ui\/line,#2a2c31)] h-[4px] left-[43px] rounded-[2px] top-[170px] w-[205px]" data-node-id="194:1982" data-name="progreso" />
          <div className="absolute bg-[var(--ui\/text,#edeef0)] h-[4px] left-[43px] rounded-[2px] top-[170px] w-[61.5px]" data-node-id="194:1983" data-name="avance" />
          <div className="absolute left-[15px] size-[14px] top-[165px]" data-node-id="194:1984" data-name="pausa">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPausa} />
          </div>
          <p className="[word-break:break-word] absolute font-['Geist_Mono:Medium'] font-medium leading-[normal] left-[260px] text-[10px] text-[color:var(--ui\/text-secondary,#8a8f98)] top-[165px] whitespace-nowrap" data-node-id="194:1987">
            0:00 / 0:00
          </p>
        </div>
        <p className="[word-break:break-word] font-['Inter:Semi_Bold'] font-semibold leading-[24px] min-w-full not-italic relative shrink-0 text-[18px] text-[color:var(--ui\/text,#edeef0)] w-[min-content]" data-node-id="194:1988">
          Talk title (placeholder)
        </p>
        <p className="[word-break:break-word] font-['Inter:Regular'] font-normal leading-[16px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="194:1989">
          Proyecto · Fecha
        </p>
        <div className="bg-[var(--ui\/line,#2a2c31)] h-px relative shrink-0 w-[343px]" data-node-id="194:1990" data-name="separador" />
        <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full" data-node-id="194:1991" data-name="lista-talks">
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:1992" data-name="fila-talk 2">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:1993" data-name="miniatura 16:9 (placeholder)">
              <div className="relative shrink-0 size-[12px]" data-node-id="194:1994" data-name="play">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
              </div>
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative" data-node-id="194:1996" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium h-[40px] leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:1997">
                Talk title (placeholder), versión larga que ocupa dos líneas como máximo
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="194:1998">
                Proyecto · Fecha
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:1999" data-name="fila-talk 3">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:2000" data-name="miniatura 16:9 (placeholder)">
              <div className="relative shrink-0 size-[12px]" data-node-id="194:2001" data-name="play">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
              </div>
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:2003" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:2004">
                Talk title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:2005">
                Proyecto · Fecha
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:2006" data-name="fila-talk 4">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:2007" data-name="miniatura 16:9 (placeholder)">
              <div className="relative shrink-0 size-[12px]" data-node-id="194:2008" data-name="play">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
              </div>
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:2010" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:2011">
                Talk title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:2012">
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

## ui/boton-redondo
**Node ID:** 5:42

Botón redondo (icon button). Spec §0 hit targets + §1.2/§1.3: 40 desktop, 44 teléfono, 48 dock; radius full; icono 15 centrado. default = transparente (sobre superficie). seleccionado = outline 1px ui/text (§1.2 selected). flotante = panel cerrado: ui/surface + anillo 1px ui/line inside + sombra ui/shadow (§1.2 / §2.4). Prop icono = instance swap de ui/icono.

## ui/icono
**Node ID:** 4:855

Glifos placeholder 15×15 (trazo 1.25, round caps) para botones y filas. Color: ui/text (sobrescribible por ui/text-secondary / ui/bg en instancias). Fuente: tomjohn spec §1.2 (iconos 15px). Se usan como instancia anidada llamada &quot;icono&quot;. v2: + descargar, maletin, cubo, info, estrella, colapsar e iniciales (texto "AL" Inter Medium 13/16 centrado, sobresale del cuadro de 15 a propósito para leerse dentro de un botón de 40; prop de texto iniciales).
The generated code contains image and SVG URL constants, e.g. const image = `${assetPathPrefix}/<asset file name>`, where assetPathPrefix is declared once at the top of the code and every asset URL interpolates it. These URLs are temporary download sources and expire after 7 days. Download each asset into the project with curl -L, then replace its URL in the generated code with a reference to the downloaded asset. Never use the temporary URLs as runtime image sources.

