
const assetPathPrefix = "./assets/writings-phone-reading"; // local copies; original temp URL: https://www.figma.com/api/mcp/asset/373b75f3-4bf9-4003-955f-deecd70068a0
const imgGlifoCirculo = `${assetPathPrefix}/5bd06.svg`;
const imgGlifoPagina = `${assetPathPrefix}/aef4f.svg`;
const imgEstadoExteriorZoomCerca = `${assetPathPrefix}/af018.svg`;
const imgBibliotecaIngenieriaUcvV3InteriorMuroDeArticulosPlaceholder = `${assetPathPrefix}/53843.png`;
const imgRejilla = `${assetPathPrefix}/e3288.svg`;
const imgIcono = `${assetPathPrefix}/9f9c4.svg`;
const imgIcono1 = `${assetPathPrefix}/f1b3a.svg`;
const imgIcono2 = `${assetPathPrefix}/c0026.svg`;

type UiIconoProps = {
  className?: string;
  glifo?: "circulo" | "pagina";
};

function UiIcono({ className, glifo = "circulo" }: UiIconoProps) {
  const isPagina = glifo === "pagina";
  return (
    <div className={className || "relative size-[15px]"} id={isPagina ? "node-4_843" : "node-4_811"}>
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={isPagina ? imgGlifoPagina : imgGlifoCirculo} />
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

export default function WritingsTelefono3HojaLector() {
  return (
    <div className="bg-[var(--ui\/bg,#0b0c0e)] relative size-full" data-node-id="199:2095" data-name="writings/telefono · 3 hoja · lector">
      <div className="absolute bg-[#17181b] h-[812px] left-0 overflow-clip top-0 w-[375px]" data-node-id="199:2096" data-name="mapa">
        <div className="absolute h-[812px] left-0 top-0 w-[375px]" data-node-id="199:2097" data-name="rejilla">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgRejilla} />
        </div>
        <EdificioEstudio className="absolute h-[240px] left-[470px] top-[120px] w-[256px]" />
        <EdificioEstudio className="absolute h-[240px] left-[-170px] top-[260px] w-[256px]" />
        <div className="absolute h-[271.56px] left-[-1px] top-[-80px] w-[376.96px]" data-node-id="206:726" data-name="Biblioteca Ingeniería UCV v3 · interior + muro de artículos (placeholder)">
          <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgBibliotecaIngenieriaUcvV3InteriorMuroDeArticulosPlaceholder} />
        </div>
        <div className="absolute h-[271.56px] left-[-1px] top-[-80px] w-[376.96px]" data-node-id="206:4901" data-name="contenido-muro-articulos (placeholder) · coords manifest v3">
          <div className="absolute flex h-[67.218px] items-center justify-center left-[57.93px] top-[97.65px] w-[92.276px]" data-node-id="206:4902">
            <div className="flex-none rotate-[-26.57deg] scale-y-89 skew-x-[-26.57deg]">
              <div className="[word-break:break-word] font-['Inter:Regular'] font-normal h-[21.08px] leading-[normal] not-italic overflow-clip relative text-[#f2eee4] text-[4.03px] w-[103.168px] whitespace-nowrap" data-name="muro_articulos · lista (placeholder)">
                <p className="absolute h-[5.239px] left-[6.2px] overflow-hidden text-ellipsis top-[1.86px] w-[90.52px]" data-node-id="206:4903">
                  Artículo 1 (placeholder)
                </p>
                <p className="absolute h-[5.239px] left-[6.2px] overflow-hidden text-ellipsis top-[8.06px] w-[90.52px]" data-node-id="206:4904">
                  Artículo 2 (placeholder)
                </p>
                <p className="absolute h-[5.239px] left-[6.2px] overflow-hidden text-ellipsis top-[14.26px] w-[90.52px]" data-node-id="206:4905">
                  Artículo 3 (placeholder)
                </p>
              </div>
            </div>
          </div>
          <div className="absolute flex h-[45.731px] items-center justify-center left-[121.42px] top-[61.92px] w-[31.942px]" data-node-id="206:4906">
            <div className="flex-none rotate-[-26.57deg] scale-y-89 skew-x-[-26.57deg]">
              <div className="[word-break:break-word] h-[29.76px] leading-[normal] not-italic overflow-clip relative text-[#f2eee4] text-center w-[35.712px] whitespace-nowrap" data-name="luneta 1 · título (placeholder)">
                <p className="-translate-x-1/2 absolute font-['Inter:Bold'] font-bold h-[5.642px] left-[17.86px] overflow-hidden text-[4.34px] text-ellipsis top-[8.68px] w-[30.752px]" data-node-id="206:4907">
                  TÍTULO B
                </p>
                <p className="-translate-x-1/2 absolute font-['Inter:Regular'] font-normal h-[4.433px] left-[17.86px] overflow-hidden text-[3.41px] text-ellipsis top-[14.88px] w-[30.752px]" data-node-id="206:4908">
                  (placeholder)
                </p>
              </div>
            </div>
          </div>
          <div className="absolute flex h-[45.731px] items-center justify-center left-[61.9px] top-[91.68px] w-[31.942px]" data-node-id="206:4909">
            <div className="flex-none rotate-[-26.57deg] scale-y-89 skew-x-[-26.57deg]">
              <div className="[word-break:break-word] h-[29.76px] leading-[normal] not-italic overflow-clip relative text-[#f2eee4] text-center w-[35.712px] whitespace-nowrap" data-name="luneta 2 · título (placeholder)">
                <p className="-translate-x-1/2 absolute font-['Inter:Bold'] font-bold h-[5.642px] left-[17.86px] overflow-hidden text-[4.34px] text-ellipsis top-[8.68px] w-[30.752px]" data-node-id="206:4910">
                  TÍTULO A
                </p>
                <p className="-translate-x-1/2 absolute font-['Inter:Regular'] font-normal h-[4.433px] left-[17.86px] overflow-hidden text-[3.41px] text-ellipsis top-[14.88px] w-[30.752px]" data-node-id="206:4911">
                  (placeholder)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bg-[var(--ui\/surface,#141518)] border-[var(--ui\/line,#2a2c31)] border-solid border-t content-stretch flex flex-col gap-[12px] h-[740px] items-start left-0 overflow-clip pb-[24px] px-[16px] rounded-tl-[16px] rounded-tr-[16px] shadow-[0px_-8px_32px_0px_rgba(0,0,0,0.45)] top-[72px] w-[375px]" data-node-id="199:2206" data-name="hoja-writings">
        <div className="content-stretch flex items-center justify-center pb-[2px] pt-[10px] relative shrink-0 w-full" data-node-id="199:2207" data-name="agarre">
          <div className="bg-[var(--ui\/line,#2a2c31)] h-[4px] relative rounded-[4px] shrink-0 w-[40px]" data-node-id="199:2208" data-name="barra" />
        </div>
        <div className="content-stretch flex gap-[4px] items-center relative shrink-0 w-full" data-node-id="199:2209" data-name="encabezado">
          <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="199:2210" data-name="atras">
            <div className="relative shrink-0 size-[15px]" data-node-id="I199:2210;5:25" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono} />
            </div>
          </div>
          <p className="[word-break:break-word] flex-[1_0_0] font-['Inter:Medium'] font-medium leading-[24px] min-w-px not-italic relative text-[16px] text-[color:var(--ui\/text,#edeef0)]" data-node-id="199:2213">
            Writings
          </p>
          <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="199:2214" data-name="cerrar">
            <div className="relative shrink-0 size-[15px]" data-node-id="I199:2214;5:25" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono1} />
            </div>
          </div>
        </div>
        <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[193px] items-center justify-center relative rounded-[6px] shrink-0 w-[343px]" data-node-id="199:2217" data-name="portada (placeholder)">
          <UiIcono className="relative shrink-0 size-[15px]" glifo="pagina" />
        </div>
        <p className="[word-break:break-word] font-['Geist_Mono:Medium'] font-medium leading-[normal] relative shrink-0 text-[11px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2220">
          UX SIDEKICK CHRONICLES
        </p>
        <p className="[word-break:break-word] font-['Inter:Semi_Bold'] font-semibold leading-[28px] min-w-full not-italic relative shrink-0 text-[22px] text-[color:var(--ui\/text,#edeef0)] w-[min-content]" data-node-id="199:2221">
          Article title (placeholder)
        </p>
        <p className="[word-break:break-word] font-['Inter:Regular'] font-normal leading-[16px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2222">
          Publicación · Fecha · X min
        </p>
        <p className="[word-break:break-word] font-['Inter:Regular'] font-normal leading-[24px] min-w-full not-italic relative shrink-0 text-[15px] text-[color:var(--ui\/text,#edeef0)] w-[min-content]" data-node-id="199:2223">
          Texto del artículo (placeholder). Párrafo de ejemplo para mostrar la lectura en el panel; el contenido real vendrá de la publicación original.
        </p>
        <p className="[word-break:break-word] font-['Inter:Regular'] font-normal leading-[24px] min-w-full not-italic relative shrink-0 text-[15px] text-[color:var(--ui\/text,#edeef0)] w-[min-content]" data-node-id="199:2224">
          Texto del artículo (placeholder). Párrafo de ejemplo para mostrar la lectura en el panel; el contenido real vendrá de la publicación original.
        </p>
        <p className="[word-break:break-word] font-['Inter:Regular'] font-normal leading-[24px] min-w-full not-italic relative shrink-0 text-[15px] text-[color:var(--ui\/text,#edeef0)] w-[min-content]" data-node-id="199:2225">
          Texto del artículo (placeholder). Párrafo de ejemplo para mostrar la lectura en el panel; el contenido real vendrá de la publicación original.
        </p>
        <div className="bg-[var(--ui\/text,#edeef0)] content-stretch drop-shadow-[0px_3px_6px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex gap-[6px] h-[44px] items-center justify-center px-[18px] relative rounded-[999px] shrink-0" data-node-id="199:2226" data-name="ui/boton">
          <div className="relative shrink-0 size-[15px]" data-node-id="I199:2226;23:380" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono2} />
          </div>
          <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/bg,#0b0c0e)] whitespace-nowrap" data-node-id="I199:2226;23:379">
            Leer en Substack
          </p>
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

## ui/boton
**Node ID:** 5:59

Botón pill. Spec §1.3 / §2.1: desktop h40, telefono h44, padding 0 18, gap 6, radius full, etiqueta Inter Medium 13/16. primario = fill ui/text + etiqueta ui/bg + sombra; secundario = fill ui/surface + etiqueta ui/text + anillo 1px ui/line. v2: variante icono=ninguno|antes (antes = icono antes de la etiqueta, gap 6). Props: etiqueta (texto), glifo (swap del icono; antes se llamaba "icono"), mostrar-icono (bool, flecha ↗ al final en icono=ninguno, por defecto false). Disabled = opacidad 40% en la instancia.
The generated code contains image and SVG URL constants, e.g. const image = `${assetPathPrefix}/<asset file name>`, where assetPathPrefix is declared once at the top of the code and every asset URL interpolates it. These URLs are temporary download sources and expire after 7 days. Download each asset into the project with curl -L, then replace its URL in the generated code with a reference to the downloaded asset. Never use the temporary URLs as runtime image sources.

