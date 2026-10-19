
const assetPathPrefix = "./assets/talks-desktop-player"; // local copies; original temp URL: https://www.figma.com/api/mcp/asset/f21a59bd-2822-4f54-88be-1ed5c0b50dd1
const imgTerreno = `${assetPathPrefix}/65c8f.svg`;
const imgEdificio1 = `${assetPathPrefix}/87c16.svg`;
const imgJugador = `${assetPathPrefix}/20483.svg`;
const imgIcono = `${assetPathPrefix}/b4598.svg`;
const imgIcono1 = `${assetPathPrefix}/113da.svg`;
const imgIcono2 = `${assetPathPrefix}/999b8.svg`;
const imgIcono3 = `${assetPathPrefix}/170db.svg`;
const imgIcono4 = `${assetPathPrefix}/5a727.svg`;
const imgIcono5 = `${assetPathPrefix}/bd3b9.svg`;
const imgGlifoCirculo = `${assetPathPrefix}/5bd06.svg`;
const imgGlifoPortapapeles = `${assetPathPrefix}/629bf.svg`;
const imgTamano36Progreso0 = `${assetPathPrefix}/5015a.svg`;
const imgIcono6 = `${assetPathPrefix}/7c0ee.svg`;
const imgIcono7 = `${assetPathPrefix}/88655.svg`;
const imgIcono8 = `${assetPathPrefix}/b7a40.svg`;
const imgIcono9 = `${assetPathPrefix}/b545b.svg`;
const imgIcono10 = `${assetPathPrefix}/1452e.svg`;
const imgIcono11 = `${assetPathPrefix}/a6bc1.svg`;
const imgIcono12 = `${assetPathPrefix}/313cb.svg`;
const imgIcono13 = `${assetPathPrefix}/8333f.svg`;
const imgIcono14 = `${assetPathPrefix}/742f0.svg`;
const imgIcono15 = `${assetPathPrefix}/3da7a.svg`;
const imgEstadoExteriorZoomCerca = `${assetPathPrefix}/af018.svg`;
const imgTeatroTeresaCarrenoV2BInteriorPantallaPlaceholderVideo = `${assetPathPrefix}/0f6fa.png`;
const imgRejilla = `${assetPathPrefix}/0353e.svg`;
const imgIcono16 = `${assetPathPrefix}/9f9c4.svg`;
const imgIcono17 = `${assetPathPrefix}/ce7c9.svg`;
const imgIcono18 = `${assetPathPrefix}/f1b3a.svg`;
const imgPausa = `${assetPathPrefix}/d0608.svg`;
const imgPlay = `${assetPathPrefix}/6a8ac.svg`;

type UiMinimapaProps = {
  className?: string;
  vista?: "isometrica";
};

function UiMinimapa({ className, vista = "isometrica" }: UiMinimapaProps) {
  return (
    <div className={className || "content-stretch flex flex-col items-center relative w-[248px]"} data-node-id="24:600">
      <div className="h-[161.2px] mb-[-38.8px] relative shrink-0 w-[248px]" data-node-id="24:601" data-name="minimapa">
        <div className="absolute h-[148px] left-[4px] top-[4px] w-[240px]" data-node-id="24:602" data-name="terreno">
          <div className="absolute inset-[-0.34%_-0.21%]">
            <img alt="" className="block max-w-none size-full" src={imgTerreno} />
          </div>
        </div>
        <div className="absolute h-[12px] left-[88px] top-[54px] w-[24px]" data-node-id="24:603" data-name="edificio-1">
          <div className="absolute inset-[-4.17%_-2.08%]">
            <img alt="" className="block max-w-none size-full" src={imgEdificio1} />
          </div>
        </div>
        <div className="absolute h-[12px] left-[138px] top-[64px] w-[24px]" data-node-id="24:604" data-name="edificio-2">
          <div className="absolute inset-[-4.17%_-2.08%]">
            <img alt="" className="block max-w-none size-full" src={imgEdificio1} />
          </div>
        </div>
        <div className="absolute h-[12px] left-[108px] top-[94px] w-[24px]" data-node-id="24:605" data-name="edificio-3">
          <div className="absolute inset-[-4.17%_-2.08%]">
            <img alt="" className="block max-w-none size-full" src={imgEdificio1} />
          </div>
        </div>
        <div className="absolute h-[12px] left-[68px] top-[79px] w-[24px]" data-node-id="24:606" data-name="edificio-4">
          <div className="absolute inset-[-4.17%_-2.08%]">
            <img alt="" className="block max-w-none size-full" src={imgEdificio1} />
          </div>
        </div>
        <div className="absolute h-[12px] left-[158px] top-[89px] w-[24px]" data-node-id="24:607" data-name="edificio-5">
          <div className="absolute inset-[-4.17%_-2.08%]">
            <img alt="" className="block max-w-none size-full" src={imgEdificio1} />
          </div>
        </div>
        <div className="absolute left-[121px] size-[6px] top-[75px]" data-node-id="24:608" data-name="jugador">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgJugador} />
        </div>
        <div className="absolute bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center left-[194px] rounded-[20px] size-[40px] top-0" data-node-id="24:609" data-name="recentrar">
          <div className="relative shrink-0 size-[15px]" data-node-id="I24:609;5:22" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono} />
          </div>
        </div>
      </div>
      <div className="content-stretch flex gap-[16px] h-[40px] items-center justify-center relative shrink-0 w-[220px]" data-node-id="24:612" data-name="controles">
        <div className="bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="24:613" data-name="rotar">
          <div className="relative shrink-0 size-[15px]" data-node-id="I24:613;5:22" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono1} />
          </div>
        </div>
        <div className="bg-[var(--ui\/track,rgba(237,238,240,0.08))] content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex gap-[4px] items-center p-[5px] relative rounded-[999px] shrink-0" data-node-id="24:616" data-name="vista">
          <div className="bg-[var(--ui\/text,#edeef0)] content-stretch flex items-center justify-center relative rounded-[999px] shrink-0 size-[30px]" data-node-id="I24:616;23:513" data-name="opcion-1">
            <div className="relative shrink-0 size-[15px]" data-node-id="I24:616;23:514" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono2} />
            </div>
          </div>
          <div className="content-stretch flex items-center justify-center relative rounded-[999px] shrink-0 size-[30px]" data-node-id="I24:616;23:516" data-name="opcion-2">
            <div className="relative shrink-0 size-[15px]" data-node-id="I24:616;23:517" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono3} />
            </div>
          </div>
          <div className="content-stretch flex items-center justify-center relative rounded-[999px] shrink-0 size-[30px]" data-node-id="I24:616;23:519" data-name="opcion-3">
            <div className="relative shrink-0 size-[15px]" data-node-id="I24:616;23:520" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono4} />
            </div>
          </div>
        </div>
        <div className="bg-[var(--ui\/surface,#141518)] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="24:623" data-name="mapa">
          <div className="relative shrink-0 size-[15px]" data-node-id="I24:623;5:22" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono5} />
          </div>
        </div>
      </div>
    </div>
  );
}

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

type UiAnilloProgresoProps = {
  className?: string;
  progreso?: "0%";
  tamano?: "36";
};

function UiAnilloProgreso({ className, progreso = "0%", tamano = "36" }: UiAnilloProgresoProps) {
  return (
    <div className={className || "relative size-[36px]"} data-node-id="5:60">
      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgTamano36Progreso0} />
    </div>
  );
}

type UiChecklistProps = {
  className?: string;
  estado?: "cerrada";
  plataforma?: "desktop";
};

function UiChecklist({ className, estado = "cerrada", plataforma = "desktop" }: UiChecklistProps) {
  return (
    <div className={className || "bg-[var(--ui\\/surface,#141518)] content-stretch drop-shadow-[0px_2px_4px_var(--ui\\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center relative rounded-[20px] size-[40px]"} data-node-id="7:220">
      <UiAnilloProgreso className="relative shrink-0 size-[36px]" />
    </div>
  );
}

type UiBarraIconosProps = {
  className?: string;
  mostrarAvatar?: boolean;
  mostrarBuscar?: boolean;
  mostrarCasos?: boolean;
  mostrarChat?: boolean;
  mostrarContacto?: boolean;
  mostrarDescargarCv?: boolean;
  mostrarInventario?: boolean;
  mostrarLogros?: boolean;
  mostrarPaginaCompleta?: boolean;
  mostrarSilencio?: boolean;
  panel?: "abierto";
};

function UiBarraIconos({ className, mostrarAvatar = true, mostrarBuscar = true, mostrarCasos = true, mostrarChat = false, mostrarContacto = true, mostrarDescargarCv = true, mostrarInventario = false, mostrarLogros = true, mostrarPaginaCompleta = true, mostrarSilencio = true, panel = "abierto" }: UiBarraIconosProps) {
  return (
    <div className={className || "bg-[var(--ui\\/surface,#141518)] border-[var(--ui\\/line,#2a2c31)] border-r border-solid content-stretch flex flex-col gap-[8px] h-[900px] items-center py-[12px] relative w-[64px]"} data-node-id="6:45">
      {mostrarAvatar && (
        <div className="border border-[var(--ui\/text,#edeef0)] border-solid content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="6:46" data-name="avatar">
          <div className="relative shrink-0 size-[15px]" data-node-id="I6:46;5:19" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono6} />
          </div>
        </div>
      )}
      {mostrarCasos && (
        <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="25:841" data-name="casos">
          <div className="relative shrink-0 size-[15px]" data-node-id="I25:841;5:16" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono7} />
          </div>
        </div>
      )}
      {mostrarLogros && (
        <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="6:49" data-name="logros">
          <div className="relative shrink-0 size-[15px]" data-node-id="I6:49;5:16" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono8} />
          </div>
        </div>
      )}
      {mostrarInventario && (
        <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="25:1217" data-name="inventario">
          <div className="relative shrink-0 size-[15px]" data-node-id="I25:1217;5:16" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono9} />
          </div>
        </div>
      )}
      {mostrarChat && (
        <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="25:1220" data-name="chat">
          <div className="relative shrink-0 size-[15px]" data-node-id="I25:1220;5:16" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono10} />
          </div>
        </div>
      )}
      {mostrarContacto && (
        <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="6:58" data-name="contacto">
          <div className="relative shrink-0 size-[15px]" data-node-id="I6:58;5:16" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono11} />
          </div>
        </div>
      )}
      {mostrarBuscar && (
        <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="6:61" data-name="buscar">
          <div className="relative shrink-0 size-[15px]" data-node-id="I6:61;5:16" data-name="icono">
            <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono12} />
          </div>
        </div>
      )}
      <div className="flex-[1_0_0] min-h-px relative w-[40px]" data-node-id="6:64" data-name="espaciador" />
      <div className="content-stretch flex flex-col h-[120px] items-start relative rounded-[999px] shrink-0 w-[40px]" data-node-id="6:65" data-name="herramientas">
        {mostrarDescargarCv && (
          <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="6:66" data-name="descargar-cv">
            <div className="relative shrink-0 size-[15px]" data-node-id="I6:66;5:16" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono13} />
            </div>
          </div>
        )}
        {mostrarSilencio && (
          <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="6:69" data-name="silencio">
            <div className="relative shrink-0 size-[15px]" data-node-id="I6:69;5:16" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono14} />
            </div>
          </div>
        )}
        {mostrarPaginaCompleta && (
          <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="6:72" data-name="pagina-completa">
            <div className="relative shrink-0 size-[15px]" data-node-id="I6:72;5:16" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono15} />
            </div>
          </div>
        )}
      </div>
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

export default function TalksDesktop3PanelReproductor() {
  return (
    <div className="bg-[var(--ui\/bg,#0b0c0e)] relative size-full" data-node-id="194:2585" data-name="talks/desktop · 3 panel · reproductor">
      <div className="absolute bg-[#17181b] h-[900px] left-[496px] overflow-clip top-0 w-[944px]" data-node-id="194:2586" data-name="mapa">
        <div className="absolute h-[900px] left-0 top-0 w-[944px]" data-node-id="194:2587" data-name="rejilla">
          <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgRejilla} />
        </div>
        <EdificioEstudio className="absolute h-[240px] left-[740px] top-[340px] w-[256px]" />
        <EdificioEstudio className="absolute h-[240px] left-[-112px] top-[480px] w-[256px]" />
        <div className="absolute h-[462px] left-[154px] top-[155px] w-[576px]" data-node-id="202:322" data-name="Teatro Teresa Carreño v2b · interior + pantalla (placeholder video)">
          <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={imgTeatroTeresaCarrenoV2BInteriorPantallaPlaceholderVideo} />
        </div>
      </div>
      <UiBarraIconos className="absolute bg-[var(--ui\/surface,#141518)] border-[var(--ui\/line,#2a2c31)] border-r border-solid content-stretch flex flex-col gap-[8px] h-[900px] items-center left-0 py-[12px] top-0 w-[64px]" />
      <UiChecklist className="absolute bg-[var(--ui\/surface,#141518)] content-stretch drop-shadow-[0px_2px_4px_var(--ui\/shadow,rgba(0,0,0,0.45)),0px_1px_1px_var(--ui\/shadow,rgba(0,0,0,0.45))] flex items-center justify-center left-[1384px] rounded-[20px] size-[40px] top-[16px]" />
      <UiMinimapa className="absolute content-stretch flex flex-col items-center left-[1176px] top-[721.6px] w-[248px]" />
      <div className="absolute bg-[var(--ui\/surface,#141518)] border-[var(--ui\/line,#2a2c31)] border-r border-solid content-stretch flex flex-col h-[900px] items-start left-[64px] overflow-clip top-0 w-[432px]" data-node-id="194:2847" data-name="panel · dividido">
        <div className="bg-[var(--ui\/surface,#141518)] border-[var(--ui\/line,#2a2c31)] border-b border-dashed content-stretch flex gap-[8px] h-[65px] items-center pl-[12px] pr-[24px] py-[12px] relative shrink-0 w-full" data-node-id="194:2848" data-name="ui/panel-encabezado">
          <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="I194:2848;6:118" data-name="atras">
            <div className="relative shrink-0 size-[15px]" data-node-id="I194:2848;6:118;5:16" data-name="icono">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono16} />
            </div>
          </div>
          <p className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[24px] not-italic relative shrink-0 text-[16px] text-[color:var(--ui\/text,#edeef0)] whitespace-nowrap" data-node-id="I194:2848;6:121">
            Talks
          </p>
          <div className="flex-[1_0_0] h-[40px] min-w-px relative" data-node-id="I194:2848;6:123" data-name="espaciador" />
          <div className="content-stretch flex gap-[8px] items-center relative shrink-0" data-node-id="I194:2848;6:124" data-name="acciones">
            <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="I194:2848;6:128" data-name="expandir">
              <div className="relative shrink-0 size-[15px]" data-node-id="I194:2848;6:128;5:16" data-name="icono">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono17} />
              </div>
            </div>
            <div className="content-stretch flex items-center justify-center relative rounded-[20px] shrink-0 size-[40px]" data-node-id="I194:2848;6:131" data-name="cerrar">
              <div className="relative shrink-0 size-[15px]" data-node-id="I194:2848;6:131;5:16" data-name="icono">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcono18} />
              </div>
            </div>
          </div>
        </div>
        <div className="content-stretch flex flex-col gap-[16px] items-start pb-[24px] pt-[20px] px-[24px] relative shrink-0 w-full" data-node-id="194:2865" data-name="cuerpo">
          <div className="bg-[var(--ui\/bg,#0b0c0e)] border border-[var(--ui\/line,#2a2c31)] border-solid h-[216px] relative rounded-[8px] shrink-0 w-[384px]" data-node-id="194:2866" data-name="video 16:9 (placeholder)">
            <p className="[word-break:break-word] absolute font-['Geist_Mono:Medium'] font-medium leading-[normal] left-[128px] text-[11px] text-[color:var(--ui\/text-secondary,#8a8f98)] top-[99px] whitespace-nowrap" data-node-id="194:2867">
              VIDEO · PLACEHOLDER
            </p>
            <div className="absolute bg-[var(--ui\/line,#2a2c31)] h-[4px] left-[43px] rounded-[2px] top-[193px] w-[246px]" data-node-id="194:2868" data-name="progreso" />
            <div className="absolute bg-[var(--ui\/text,#edeef0)] h-[4px] left-[43px] rounded-[2px] top-[193px] w-[73.8px]" data-node-id="194:2869" data-name="avance" />
            <div className="absolute left-[15px] size-[14px] top-[188px]" data-node-id="194:2870" data-name="pausa">
              <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPausa} />
            </div>
            <p className="[word-break:break-word] absolute font-['Geist_Mono:Medium'] font-medium leading-[normal] left-[301px] text-[10px] text-[color:var(--ui\/text-secondary,#8a8f98)] top-[188px] whitespace-nowrap" data-node-id="194:2873">
              0:00 / 0:00
            </p>
          </div>
          <p className="[word-break:break-word] font-['Inter:Semi_Bold'] font-semibold leading-[24px] min-w-full not-italic relative shrink-0 text-[18px] text-[color:var(--ui\/text,#edeef0)] w-[min-content]" data-node-id="194:2874">
            Talk title (placeholder)
          </p>
          <p className="[word-break:break-word] font-['Inter:Regular'] font-normal leading-[16px] not-italic relative shrink-0 text-[13px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="194:2875">
            Proyecto · Fecha
          </p>
          <div className="bg-[var(--ui\/line,#2a2c31)] h-px relative shrink-0 w-[384px]" data-node-id="194:2876" data-name="separador" />
          <div className="content-stretch flex flex-col gap-[4px] items-start relative shrink-0 w-full" data-node-id="194:2877" data-name="lista-talks">
            <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:2878" data-name="fila-talk 2">
              <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:2879" data-name="miniatura 16:9 (placeholder)">
                <div className="relative shrink-0 size-[12px]" data-node-id="194:2880" data-name="play">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
                </div>
              </div>
              <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative" data-node-id="194:2882" data-name="texto">
                <p className="font-['Inter:Medium'] font-medium h-[40px] leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:2883">
                  Talk title (placeholder), versión larga que ocupa dos líneas como máximo
                </p>
                <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)] whitespace-nowrap" data-node-id="194:2884">
                  Proyecto · Fecha
                </p>
              </div>
            </div>
            <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:2885" data-name="fila-talk 3">
              <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:2886" data-name="miniatura 16:9 (placeholder)">
                <div className="relative shrink-0 size-[12px]" data-node-id="194:2887" data-name="play">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
                </div>
              </div>
              <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:2889" data-name="texto">
                <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:2890">
                  Talk title (placeholder)
                </p>
                <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:2891">
                  Proyecto · Fecha
                </p>
              </div>
            </div>
            <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:2892" data-name="fila-talk 4">
              <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:2893" data-name="miniatura 16:9 (placeholder)">
                <div className="relative shrink-0 size-[12px]" data-node-id="194:2894" data-name="play">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
                </div>
              </div>
              <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:2896" data-name="texto">
                <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:2897">
                  Talk title (placeholder)
                </p>
                <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:2898">
                  Proyecto · Fecha
                </p>
              </div>
            </div>
            <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:2899" data-name="fila-talk 5">
              <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:2900" data-name="miniatura 16:9 (placeholder)">
                <div className="relative shrink-0 size-[12px]" data-node-id="194:2901" data-name="play">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
                </div>
              </div>
              <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:2903" data-name="texto">
                <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:2904">
                  Talk title (placeholder)
                </p>
                <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:2905">
                  Proyecto · Fecha
                </p>
              </div>
            </div>
            <div className="content-stretch flex gap-[12px] items-center py-[8px] relative shrink-0 w-full" data-node-id="194:2906" data-name="fila-talk 6">
              <div className="bg-[#1c1d21] border border-[var(--ui\/line,#2a2c31)] border-solid content-stretch flex h-[64px] items-center justify-center relative rounded-[6px] shrink-0 w-[114px]" data-node-id="194:2907" data-name="miniatura 16:9 (placeholder)">
                <div className="relative shrink-0 size-[12px]" data-node-id="194:2908" data-name="play">
                  <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgPlay} />
                </div>
              </div>
              <div className="[word-break:break-word] content-stretch flex flex-[1_0_0] flex-col gap-[4px] items-start min-w-px not-italic relative whitespace-nowrap" data-node-id="194:2910" data-name="texto">
                <p className="font-['Inter:Medium'] font-medium leading-[20px] min-w-full overflow-hidden relative shrink-0 text-[14px] text-[color:var(--ui\/text,#edeef0)] text-ellipsis w-[min-content]" data-node-id="194:2911">
                  Talk title (placeholder)
                </p>
                <p className="font-['Inter:Regular'] font-normal leading-[16px] relative shrink-0 text-[12px] text-[color:var(--ui\/text-secondary,#8a8f98)]" data-node-id="194:2912">
                  Proyecto · Fecha
                </p>
              </div>
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

## ui/barra-iconos
**Node ID:** 6:105

Rail de iconos desktop (§1.1/§1.2): 64×900, padding 12 0, gap 8, items ui/boton-redondo 40 en x=12, pitch 48 desde y=12; espaciador FILL; grupo herramientas 40×120 abajo. abierto = ui/surface + hairline derecha ui/line, item activo seleccionado; cerrado = transparente, items flotante. v2: cada slot tiene mostrar-<slot> (bool) e icono-<slot> (swap). Slots: avatar (iniciales AL), casos (maletin), logros, inventario (oculto), chat (oculto), contacto, buscar; herramientas: descargar-cv (descargar), silencio (sonido), pagina-completa (pagina).

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

## ui/minimapa
**Node ID:** 24:652

Clúster de mapa desktop (mapCube, §1.6): 248 ancho, columna centrada; minimapa 248×161.2 (rombo world/tile-top + world/tile-line, edificios world/prop-face, jugador world/glow 6px); recentrar ui/boton-redondo 40 flotante arriba a la derecha (x=194, y=0); fila de controles 220×40 gap 16 centrada: rotar 40 + ui/control-segmentado desktop tipo=icono opciones=3 (108×40: isométrica cubo / cenital mapa / perspectiva ojo) + mapa 40. Gap -38.8 = margin-bottom -46.8 del spec: alto total 162.4. vista=isometrica|cenital|perspectiva cambia el segmento activo (activa=1|2|3); perspectiva (cámara detrás del personaje, sale en v1.1) añade un cono de visión world/prop-line desde el jugador. Colocar a right 16 / bottom 16.

## ui/control-segmentado
**Node ID:** 23:542

Control segmentado (viewSwitch / daylightModal). Spec §1.6 y §2.7: track radius full, padding 5, gap 4, fill ui/track (#EDEEF0 8%). desktop: items 30 alto (texto padding 0 12, o tipo=icono 30×30 con icono 15) → control 40 alto; telefono: 311×54, items 44 alto que reparten el ancho. Activa: fill ui/text + etiqueta/icono ui/bg; inactivas: transparente + ui/text-secondary. Props: opcion-1..3 (texto), icono-1..3 (swap, tipo=icono). Variantes: plataforma × opciones=2|3 × activa=1|2|3 × tipo=texto|icono (icono sólo desktop).

## ui/panel-encabezado
**Node ID:** 6:134

Encabezado del panel. Spec §1.3 sceneHeader: 432×65, padding 12 24 (13 abajo para compensar el borde de 1px que en CSS suma alto), gap 8, divisor inferior dashed \[2,2\] 1px ui/line, fill ui/surface. Título Inter Medium 16/24 ui/text en x=24; meta opcional 13/16 ui/text-secondary (capa &quot;meta&quot;, oculta). Acciones derecha gap 8: expandir (x=320) y cerrar (x=368), 40px. detalle: Atrás 40 en x=12 (padding izq 12), título en x=60, y Ubicar antes de Expandir. v2: props titulo (texto), mostrar-meta (bool, por defecto false) y meta (texto 13/16 ui/text-secondary tras el título) en ambas vistas.
The generated code contains image and SVG URL constants, e.g. const image = `${assetPathPrefix}/<asset file name>`, where assetPathPrefix is declared once at the top of the code and every asset URL interpolates it. These URLs are temporary download sources and expire after 7 days. Download each asset into the project with curl -L, then replace its URL in the generated code with a reference to the downloaded asset. Never use the temporary URLs as runtime image sources.

