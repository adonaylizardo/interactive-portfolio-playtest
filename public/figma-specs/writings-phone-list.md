
const assetPathPrefix = "./assets/writings-phone-list"; // local copies; original temp URL: https://www.figma.com/api/mcp/asset/d53ca286-0cf2-46cb-bf6c-0c0b5d7d3986
const imgGlifoCirculo = `${assetPathPrefix}/5bd06.svg`;
const imgGlifoPagina = `${assetPathPrefix}/aef4f.svg`;
const imgGlifoPortapapeles = `${assetPathPrefix}/629bf.svg`;
const imgEstadoExteriorZoomCerca = `${assetPathPrefix}/af018.svg`;
const imgBibliotecaIngenieriaUcvV3InteriorMuroDeArticulosPlaceholder = `${assetPathPrefix}/53843.png`;
const imgRejilla = `${assetPathPrefix}/e3288.svg`;
const imgIcono = `${assetPathPrefix}/313cb.svg`;
const imgIcono1 = `${assetPathPrefix}/84750.svg`;
const imgAnillo = `${assetPathPrefix}/6af66.svg`;
const imgIcono2 = `${assetPathPrefix}/f1b3a.svg`;

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

export default function WritingsTelefono2HojaLista() {
  return (
    <div className="bg-[var(--ui\/bg,#0b0c0e)] relative size-full" data-node-id="199:1869" data-name="writings/telefono · 2 hoja · lista">
      <div className="absolute bg-[#17181b] h-[812px] left-0 overflow-clip top-0 w-[375px]" data-node-id="199:1870" data-name="mapa">
        <div className="absolute h-[812px] left-0 top-0 w-[375px]" data-node-id="199:1871" data-name="rejilla">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgRejilla} />
        </div>
        <EdificioEstudio className="absolute h-[240px] left-[470px] top-[220px] w-[256px]" />
        <EdificioEstudio className="absolute h-[240px] left-[-170px] top-[360px] w-[256px]" />
        <div className="absolute h-[271.56px] left-[-1px] top-[54px] w-[376.96px]" data-node-id="206:725" data-name="Biblioteca Ingeniería UCV v3 · interior + muro de artículos (placeholder)">
          <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgBibliotecaIngenieriaUcvV3InteriorMuroDeArticulosPlaceholder} />
        </div>
        <div className="absolute h-[271.56px] left-[-1px] top-[54px] w-[376.96px]" data-node-id="206:4890" data-name="contenido-muro-articulos (placeholder) · coords manifest v3">
          <div className="absolute flex h-[67.218px] items-center justify-center left-[57.93px] top-[97.65px] w-[92.276px]" data-node-id="206:4891">
            <div className="flex-none rotate-[-26.57deg] scale-y-89 skew-x-[-26.57deg]">
              <div className="[word-break:break-word] font-['Inter:Regular'] font-normal h-[21.08px] leading-[normal] not-italic overflow-clip relative text-[#f2eee4] text-[4.03px] w-[103.168px] whitespace-nowrap" data-name="muro_articulos · lista (placeholder)">
                <p className="absolute h-[5.239px] left-[6.2px] overflow-hidden text-ellipsis top-[1.86px] w-[90.52px]" data-node-id="206:4892">
                  Artículo 1 (placeholder)
                </p>
                <p className="absolute h-[5.239px] left-[6.2px] overflow-hidden text-ellipsis top-[8.06px] w-[90.52px]" data-node-id="206:4893">
                  Artículo 2 (placeholder)
                </p>
                <p className="absolute h-[5.239px] left-[6.2px] overflow-hidden text-ellipsis top-[14.26px] w-[90.52px]" data-node-id="206:4894">
                  Artículo 3 (placeholder)
                </p>
              </div>
            </div>
          </div>
          <div className="absolute flex h-[45.731px] items-center justify-center left-[121.42px] top-[61.92px] w-[31.942px]" data-node-id="206:4895">
            <div className="flex-none rotate-[-26.57deg] scale-y-89 skew-x-[-26.57deg]">
              <div className="[word-break:break-word] h-[29.76px] leading-[normal] not-italic overflow-clip relative text-[#f2eee4] text-center w-[35.712px] whitespace-nowrap" data-name="luneta 1 · título (placeholder)">
                <p className="-translate-x-1/2 absolute font-['Inter:Bold'] font-bold h-[5.642px] left-[17.86px] overflow-hidden text-[4.34px] text-ellipsis top-[8.68px] w-[30.752px]" data-node-id="206:4896">
                  TÍTULO B
                </p>
                <p className="-translate-x-1/2 absolute font-['Inter:Regular'] font-normal h-[4.433px] left-[17.86px] overflow-hidden text-[3.41px] text-ellipsis top-[14.88px] w-[30.752px]" data-node-id="206:4897">
                  (placeholder)
                </p>
              </div>
            </div>
          </div>
          <div className="absolute flex h-[45.731px] items-center justify-center left-[61.9px] top-[91.68px] w-[31.942px]" data-node-id="206:4898">
            <div className="flex-none rotate-[-26.57deg] scale-y-89 skew-x-[-26.57deg]">
              <div className="[word-break:break-word] h-[29.76px] leading-[normal] not-italic overflow-clip relative text-[#f2eee4] text-center w-[35.712px] whitespace-nowrap" data-name="luneta 2 · título (placeholder)">
                <p className="-translate-x-1/2 absolute font-['Inter:Bold'] font-bold h-[5.642px] left-[17.86px] overflow-hidden text-[4.34px] text-ellipsis top-[8.68px] w-[30.752px]" data-node-id="206:4899">
                  TÍTULO A
                </p>
                <p className="-translate-x-1/2 absolute font-['Inter:Regular'] font-normal h-[4.433px] left-[17.86px] overflow-hidden text-[3.41px] text-ellipsis top-[14.88px] w-[30.752px]" data-node-id="206:4900">
                  (placeholder)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex h-[48px] items-center left-[16px] px-[4px] rounded-[999px] top-[56px]" data-node-id="199:1980" data-name="ui/barra-herramientas-telefono">
        <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="I199:1980;6:271" data-name="buscar">
          <div className="relative shrink-0 size-[15px]" data-node-id="I199:1980;6:271;5:25" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono} />
          </div>
        </div>
        <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="I199:1980;81:525" data-name="sonido">
          <div className="relative shrink-0 size-[15px]" data-node-id="I199:1980;81:525;5:25" data-name="icono">
            <div className="absolute inset-[-4.17%_0_0_-4.17%]">
              <img alt="" className="block max-w-none size-full" src={imgIcono1} />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bg-[var(--ui\/surface,#141518)] content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex flex-col items-start left-[122px] rounded-[26px] top-[56px] w-[237px]" data-node-id="199:1989" data-name="ui/checklist">
        <div className="content-stretch flex gap-[10px] h-[52px] items-center pl-[18px] pr-[8px] relative shrink-0 w-full" data-node-id="I199:1989;7:257" data-name="cabecera">
          <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col items-start leading-[16px] min-w-px not-italic relative text-[13px]" data-node-id="I199:1989;7:258" data-name="textos">
            <p className="font-['Inter:Regular'] font-normal relative shrink-0 text-[color:var(--ui\/text-secondary,#8a8f98)] w-full" data-node-id="I199:1989;7:259">
              Getting started
            </p>
            <p className="font-['Inter:Medium'] font-medium relative shrink-0 text-[color:var(--ui\/text,#edeef0)] w-full" data-node-id="I199:1989;7:260">
              Enter a building
            </p>
          </div>
          <p className="[word-break:break-word] font-['Geist_Mono:Medium'] font-medium leading-[16px] relative shrink-0 text-[13px] text-[color:var(--ui\/text,#edeef0)] whitespace-nowrap" data-node-id="I199:1989;7:261">
            3/5
          </p>
          <div className="relative shrink-0 size-[44px]" data-node-id="I199:1989;7:262" data-name="anillo">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgAnillo} />
          </div>
        </div>
      </div>
      <div className="absolute bg-[var(--ui\/surface,#141518)] border-[var(--ui\/line,#2a2c31)] border-solid border-t content-stretch flex flex-col gap-[12px] h-[620px] items-start left-0 overflow-clip pb-[24px] px-[16px] rounded-tl-[16px] rounded-tr-[16px] shadow-[0px_-8px_32px_0px_rgba(0,0,0,0.45)] top-[192px] w-[375px]" data-node-id="199:1999" data-name="hoja-writings">
        <div className="content-stretch flex items-center justify-center pb-[2px] pt-[10px] relative shrink-0 w-full" data-node-id="199:2000" data-name="agarre">
          <div className="bg-[var(--ui\/line,#2a2c31)] h-[4px] relative rounded-[4px] shrink-0 w-[40px]" data-node-id="199:2001" data-name="barra" />
        </div>
        <div className="content-stretch flex gap-[4px] items-center relative shrink-0 w-full" data-node-id="199:2002" data-name="encabezado">
          <p className="[word-break:break-word] flex-[1_0_0] font-['Inter:Medium'] font-medium leading-[24px] min-w-px not-italic relative text-[16px] text-[color:var(--ui\/text,#edeef0)]" data-node-id="199:2003">
            Writings
          </p>
          <div className="content-stretch flex items-center justify-center relative rounded-[22px] shrink-0 size-[44px]" data-node-id="199:2004" data-name="cerrar">
            <div className="relative shrink-0 size-[15px]" data-node-id="I199:2004;5:25" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono2} />
            </div>
          </div>
        </div>
        <div className="content-stretch flex gap-[8px] items-start relative shrink-0" data-node-id="199:2007" data-name="filtros">
          <div className="bg-[var(--ui\/text,#edeef0)] content-stretch flex items-center justify-center min-h-[44px] px-[14px] relative rounded-[999px] shrink-0" data-node-id="199:2008" data-name="chip · All">
            <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/bg,#0b0c0e)] whitespace-nowrap" data-node-id="199:2009">
              All
            </p>
          </div>
          <div className="border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center min-h-[44px] px-[14px] relative rounded-[999px] shrink-0" data-node-id="199:2010" data-name="chip · UXSC">
            <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2011">
              UXSC
            </p>
          </div>
          <div className="border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center min-h-[44px] px-[14px] relative rounded-[999px] shrink-0" data-node-id="199:2012" data-name="chip · Sinergia">
            <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2013">
              Sinergia
            </p>
          </div>
          <div className="border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center min-h-[44px] px-[14px] relative rounded-[999px] shrink-0" data-node-id="199:2014" data-name="chip · Guest">
            <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2015">
              Guest
            </p>
          </div>
        </div>
        <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full" data-node-id="199:2016" data-name="seccion · UX Sidekick Chronicles">
          <div className="content-stretch flex gap-[8px] items-center min-h-[44px] relative shrink-0 w-full" data-node-id="199:2017" data-name="encabezado-seccion">
            <p className="[word-break:break-word] font-['Inter:Semi_Bold'] font-semibold leading-[24px] not-italic relative shrink-0 text-[16px] text-[color:var(--ui\/text,#edeef0)] whitespace-nowrap" data-node-id="199:2018">
              UX Sidekick Chronicles
            </p>
            <div className="bg-[var(--world\/prop-face,#24262b)] content-stretch flex items-center justify-center px-[8px] py-[2px] relative rounded-[999px] shrink-0" data-node-id="199:2019" data-name="conteo">
              <p className="[word-break:break-word] font-['Geist_Mono:Medium'] font-medium leading-[normal] relative shrink-0 text-[11px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2020">
                0
              </p>
            </div>
            <div className="flex-[1_0_0] h-px min-w-px relative" data-node-id="199:2021" data-name="espaciador" />
            <div className="content-stretch flex items-center justify-center min-h-[44px] pl-[8px] pr-[4px] relative shrink-0" data-node-id="199:2022" data-name="ver-todo">
              <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2023">
                See all
              </p>
            </div>
          </div>
          <p className="[word-break:break-word] font-['Inter:Regular'] font-normal leading-[18px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] w-full" data-node-id="199:2024">
            Descripción de una línea (placeholder).
          </p>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="199:2025" data-name="fila-articulo 0">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center relative rounded-[6px] shrink-0 size-[64px]" data-node-id="199:2026" data-name="portada (placeholder)">
              <UiIcono className="relative shrink-0 size-[15px]" glifo="pagina" />
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="199:2029" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="199:2030">
                Article title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="199:2031">
                Publicación · Fecha · X min
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="199:2032" data-name="fila-articulo 1">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center relative rounded-[6px] shrink-0 size-[64px]" data-node-id="199:2033" data-name="portada (placeholder)">
              <UiIcono className="relative shrink-0 size-[15px]" glifo="pagina" />
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative" data-node-id="199:2036" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium h-[40px] leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="199:2037">
                Article title (placeholder), versión larga que ocupa dos líneas como máximo
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2038">
                Publicación · Fecha · X min
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="199:2039" data-name="fila-articulo 2">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center relative rounded-[6px] shrink-0 size-[64px]" data-node-id="199:2040" data-name="portada (placeholder)">
              <UiIcono className="relative shrink-0 size-[15px]" glifo="pagina" />
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="199:2043" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="199:2044">
                Article title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="199:2045">
                Publicación · Fecha · X min
              </p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--ui\/line,#2a2c31)] h-px relative shrink-0 w-full" data-node-id="199:2046" data-name="separador" />
        <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full" data-node-id="199:2047" data-name="seccion · Academia Sinergia">
          <div className="content-stretch flex gap-[8px] items-center min-h-[44px] relative shrink-0 w-full" data-node-id="199:2048" data-name="encabezado-seccion">
            <p className="[word-break:break-word] font-['Inter:Semi_Bold'] font-semibold leading-[24px] not-italic relative shrink-0 text-[16px] text-[color:var(--ui\/text,#edeef0)] whitespace-nowrap" data-node-id="199:2049">
              Academia Sinergia
            </p>
            <div className="bg-[var(--world\/prop-face,#24262b)] content-stretch flex items-center justify-center px-[8px] py-[2px] relative rounded-[999px] shrink-0" data-node-id="199:2050" data-name="conteo">
              <p className="[word-break:break-word] font-['Geist_Mono:Medium'] font-medium leading-[normal] relative shrink-0 text-[11px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2051">
                0
              </p>
            </div>
            <div className="flex-[1_0_0] h-px min-w-px relative" data-node-id="199:2052" data-name="espaciador" />
            <div className="content-stretch flex items-center justify-center min-h-[44px] pl-[8px] pr-[4px] relative shrink-0" data-node-id="199:2053" data-name="ver-todo">
              <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2054">
                See all
              </p>
            </div>
          </div>
          <p className="[word-break:break-word] font-['Inter:Regular'] font-normal leading-[18px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] w-full" data-node-id="199:2055">
            Descripción de una línea (placeholder).
          </p>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="199:2056" data-name="fila-articulo 3">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center relative rounded-[6px] shrink-0 size-[64px]" data-node-id="199:2057" data-name="portada (placeholder)">
              <UiIcono className="relative shrink-0 size-[15px]" glifo="pagina" />
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="199:2060" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="199:2061">
                Article title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="199:2062">
                Publicación · Fecha · X min
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="199:2063" data-name="fila-articulo 4">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center relative rounded-[6px] shrink-0 size-[64px]" data-node-id="199:2064" data-name="portada (placeholder)">
              <UiIcono className="relative shrink-0 size-[15px]" glifo="pagina" />
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative" data-node-id="199:2067" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium h-[40px] leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="199:2068">
                Article title (placeholder), versión larga que ocupa dos líneas como máximo
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2069">
                Publicación · Fecha · X min
              </p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--ui\/line,#2a2c31)] h-px relative shrink-0 w-full" data-node-id="199:2070" data-name="separador" />
        <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full" data-node-id="199:2071" data-name="seccion · Guest Articles">
          <div className="content-stretch flex gap-[8px] items-center min-h-[44px] relative shrink-0 w-full" data-node-id="199:2072" data-name="encabezado-seccion">
            <p className="[word-break:break-word] font-['Inter:Semi_Bold'] font-semibold leading-[24px] not-italic relative shrink-0 text-[16px] text-[color:var(--ui\/text,#edeef0)] whitespace-nowrap" data-node-id="199:2073">
              Guest Articles
            </p>
            <div className="bg-[var(--world\/prop-face,#24262b)] content-stretch flex items-center justify-center px-[8px] py-[2px] relative rounded-[999px] shrink-0" data-node-id="199:2074" data-name="conteo">
              <p className="[word-break:break-word] font-['Geist_Mono:Medium'] font-medium leading-[normal] relative shrink-0 text-[11px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2075">
                0
              </p>
            </div>
            <div className="flex-[1_0_0] h-px min-w-px relative" data-node-id="199:2076" data-name="espaciador" />
            <div className="content-stretch flex items-center justify-center min-h-[44px] pl-[8px] pr-[4px] relative shrink-0" data-node-id="199:2077" data-name="ver-todo">
              <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[16px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="199:2078">
                See all
              </p>
            </div>
          </div>
          <p className="[word-break:break-word] font-['Inter:Regular'] font-normal leading-[18px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] w-full" data-node-id="199:2079">
            Descripción de una línea (placeholder).
          </p>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="199:2080" data-name="fila-articulo 5">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center relative rounded-[6px] shrink-0 size-[64px]" data-node-id="199:2081" data-name="portada (placeholder)">
              <UiIcono className="relative shrink-0 size-[15px]" glifo="pagina" />
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="199:2084" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="199:2085">
                Article title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="199:2086">
                Publicación · Fecha · X min
              </p>
            </div>
          </div>
          <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="199:2087" data-name="fila-articulo 6">
            <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex items-center justify-center relative rounded-[6px] shrink-0 size-[64px]" data-node-id="199:2088" data-name="portada (placeholder)">
              <UiIcono className="relative shrink-0 size-[15px]" glifo="pagina" />
            </div>
            <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="199:2091" data-name="texto">
              <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="199:2092">
                Article title (placeholder)
              </p>
              <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="199:2093">
                Publicación · Fecha · X min
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
The generated code contains image and SVG URL constants, e.g. const image = `${assetPathPrefix}/<asset file name>`, where assetPathPrefix is declared once at the top of the code and every asset URL interpolates it. These URLs are temporary download sources and expire after 7 days. Download each asset into the project with curl -L, then replace its URL in the generated code with a reference to the downloaded asset. Never use the temporary URLs as runtime image sources.

