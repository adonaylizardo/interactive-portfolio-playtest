import { studio } from './audio/studio';
import { ChecklistUI, isMobileLayout } from './checklist/ui';
import { isCaseHouse } from './data/cases';
import {
  doorInwardStep,
  getBuildingByName,
  getBuildingDoorTiles,
  getEnterableBuildings,
  INICIO,
  MAP_TRAMOS,
  validateWalkGridFootprint,
} from './data/map';
import { parseInteriorFromHash, replaceOutdoorHash } from './camera/hash';
import { getInteriorDef, interiorBlockedTilesHaveProps } from './game/interior';
import { IsoScene } from './game/scene';
import { findPath } from './iso/pathfinding';
import type { SearchResult } from './data/siteSearch';
import { AboutMePanel } from './ui/aboutMePanel';
import { BuildingPanel } from './ui/buildingPanel';
import { ChromeUI, type DesktopLayout } from './ui/chrome';
import { SearchPalette } from './ui/searchPalette';
import { JacHud } from './ui/jacHud';
import { Joystick } from './ui/joystick';
import { BuildingMapLabels } from './ui/buildingMapLabels';
import { InteriorStageScreen } from './ui/interiorStageScreen';
import { NameLabels } from './ui/nameLabels';
import { hideToast, showToast } from './ui/toast';
import { getLang, onLangChange, setLang, t } from './ui/i18n';
import type { Camera } from './tokens';

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root')!;
  const applyCanvasLabel = () => canvas.setAttribute('aria-label', t('canvas.label'));
  applyCanvasLabel();
  onLangChange(applyCanvasLabel);

  const checklist = new ChecklistUI(uiRoot, { onSkip: () => {}, onDismiss: () => {} });
  if (!isMobileLayout()) checklist.setCollapsed(true);

  let scene!: IsoScene;
  let chrome!: ChromeUI;
  let panel!: BuildingPanel;
  let aboutPanel!: AboutMePanel;
  let searchPalette!: SearchPalette;
  let labels!: NameLabels;

  function routeSearchResult(result: SearchResult): void {
    switch (result.kind) {
      case 'cases':
      case 'landmarks':
        chrome.setLayout('map');
        scene?.walkToBuildingForQa(result.targetId);
        break;
      case 'articles': {
        chrome.setInteriorOpen(false, { skipLayout: true });
        chrome.setLayout('map');
        const b = getBuildingByName('biblioteca');
        if (b?.panelTitle) {
          panel.showWritings(b.panelTitle, 'biblioteca');
          panel.openWritingById(result.targetId);
          panel.expandExperienceSheet();
        }
        break;
      }
      case 'talks': {
        chrome.setInteriorOpen(false, { skipLayout: true });
        chrome.setLayout('map');
        const b = getBuildingByName('teresa');
        if (b?.panelTitle) {
          panel.showTalks(b.panelTitle, 'teresa');
          panel.openTalkById(result.targetId);
          panel.expandExperienceSheet();
        }
        break;
      }
      case 'contact':
        if (result.targetId === 'cv') {
          const a = document.createElement('a');
          a.href = `${import.meta.env.BASE_URL}cv/adonay-lizardo-cv.pdf`;
          a.download = 'adonay-lizardo-cv.pdf';
          a.click();
          break;
        }
        aboutPanel.open({ highlightContact: true });
        studio.unlock();
        studio.playLineForced('11-contact');
        syncMapOverlays();
        break;
      case 'achievements':
        chrome.setLayout('split');
        if (isMobileLayout()) chrome.openMobileSheetSection('logros');
        else document.querySelector('#chrome-logros')?.scrollIntoView({ block: 'start' });
        break;
      case 'about':
        aboutPanel.open({
          sectionId: result.targetId === 'about' ? undefined : result.targetId,
        });
        syncMapOverlays();
        break;
    }
  }

  const syncMapOverlays = (): void => {
    labels.setHidden(
      isMobileLayout() &&
        (chrome.isMobileSheetOpen() ||
          panel.isOpen() ||
          aboutPanel.isOpen() ||
          searchPalette.isOpen()),
    );
    scene?.applyCameraFromUi();
  };

  labels = new NameLabels(uiRoot, { onJacInfo: () => scene.jacOpenInfo() });
  aboutPanel = new AboutMePanel(uiRoot, {
    onClose: () => {
      syncMapOverlays();
      chrome?.sync();
    },
  });
  searchPalette = new SearchPalette(uiRoot, {
    onSelect: (result) => routeSearchResult(result),
    onOpenChange: () => syncMapOverlays(),
  });

  chrome = new ChromeUI(uiRoot, {
    onLayoutChange: () => {
      if (!isMobileLayout()) checklist.setCollapsed(true);
      else checklist.collapseMobile();
      syncMapOverlays();
      scene?.reflowViewport();
      if (chrome.getLayout() === 'map' && !panel.isOpen()) studio.scheduleIntroWhenMapIdle(450);
    },
    onView: (mode: Camera) => scene?.setViewMode(mode),
    onRotate: () => scene?.rotateView(),
    onMapOverview: () => scene?.toggleMapOverview(),
    onCenter: () => scene?.recenterOnCharacter(),
    onLocate: (id) => scene?.walkToBuildingForQa(id),
    onOpenAbout: (opts) => {
      aboutPanel.open(opts);
      syncMapOverlays();
      chrome.sync();
    },
    onOpenSearch: () => searchPalette.open(),
  });

  const joystick = new Joystick(uiRoot);
  const mapLabels = new BuildingMapLabels(uiRoot);
  const jacHud = new JacHud(uiRoot, {
    onInfo: () => scene.jacOpenInfo(),
    onGetIn: () => scene.jacGetIn(),
    onGetOut: () => scene.jacGetOut(),
    onClose: () => scene.jacClose(),
    onLights: (lights) => scene.jacSetLights(lights),
    onGear: (gear) => scene.jacSetGear(gear),
    onToggle: (id) => scene.jacSetToggle(id),
    onEngine: () => scene.jacSetEngine(),
  });
  const stageScreen = new InteriorStageScreen(document.body);
  panel = new BuildingPanel(
    uiRoot,
    () => {
      const open = panel.isInteriorMode();
      if (panel.isOpen()) studio.noteIntroPanelOpen();
      checklist.setBuildingPanelOpen(open);
      if (panel.isExperienceMode()) {
        chrome.setInteriorOpen(false, { skipLayout: true });
        if (!isMobileLayout() && open) {
          chrome.setLayout('split');
          checklist.setCollapsed(true);
        }
      } else {
        chrome.setInteriorOpen(open);
      }
      joystick.setHidden(open || panel.isPreviewExpanded());
      if (panel.isPreviewExpanded()) checklist.setCollapsed(true);
      if (panel.isPreviewMode() && panel.isOpen() && !isMobileLayout()) {
        checklist.setCollapsed(true);
      }
      if (!panel.isOpen() && !scene?.isInInterior()) {
        if (!isMobileLayout()) checklist.setCollapsed(true);
        scene?.resetMapDoorChainState();
        studio.maybePlayDeferredIntro();
      } else {
        scene?.applyCameraFromUi();
      }
    },
    () => scene.leaveInteriorNow(),
  );
  joystick.onStickStart(() => {
    if (panel.isPreviewMode()) panel.hide();
    studio.noteMoveCommand();
  });

  const syncInteriorPanel = (interiorId: string | null): void => {
    if (interiorId) {
      const b = getBuildingByName(interiorId);
      if (b?.panelTitle) {
        checklist.setBuildingPanelOpen(true);
        if (interiorId === 'teresa') {
          studio.clearSubtitle();
          chrome.setInteriorOpen(false, { skipLayout: true });
          if (!isMobileLayout()) chrome.setLayout('split');
          panel.showTalks(b.panelTitle, interiorId);
        } else if (interiorId === 'biblioteca') {
          studio.clearSubtitle();
          chrome.setInteriorOpen(false, { skipLayout: true });
          if (!isMobileLayout()) chrome.setLayout('split');
          panel.showWritings(b.panelTitle, interiorId);
        } else {
          chrome.setInteriorOpen(true);
          panel.showInterior(b.panelTitle, interiorId);
        }
      }
    } else {
      checklist.setBuildingPanelOpen(false);
      chrome.setInteriorOpen(false);
      panel.hide({ snap: true });
      if (!isMobileLayout()) checklist.setCollapsed(true);
    }
    scene.applyCameraFromUi();
  };

  scene = new IsoScene({
    onChecklist: (step) => checklist.complete(step),
    onEnterBuilding: (buildingId) => {
      checklist.complete('enter-building');
      if (isCaseHouse(buildingId)) {
        if (chrome.isMobileSheetOpen()) chrome.setLayout('map');
        panel.showPreview(buildingId);
        scene.pushCasePreviewHash(buildingId);
        return;
      }
      scene.enterInterior(buildingId);
    },
    onMoveCommand: () => studio.noteMoveCommand(),
    onFrame: () => {
      stageScreen.apply(scene.interiorStageScreenLayout());
      labels.update(scene.nameLabelAnchors());
      mapLabels.setHidden(!!scene.isInInterior());
      mapLabels.update(
        scene.buildingMapLabelAnchors().map((a) => ({
          ...a,
          label: a.id === 'teresa' ? `▶ ${t('panel.talks')}` : `📄 ${t('panel.writings')}`,
        })),
      );
      if (scene.jacHudActive()) {
        const snap = scene.jacSnapshot();
        const anchors = scene.jacHudAnchors();
        jacHud.update(snap, anchors, anchors.rear);
        labels.setHidden(false);
      } else {
        jacHud.park();
        const hideNameLabels =
          isMobileLayout() &&
          (chrome.isMobileSheetOpen() ||
            panel.isOpen() ||
            aboutPanel.isOpen() ||
            searchPalette.isOpen());
        labels.setHidden(hideNameLabels);
      }
      joystick.setHidden(
        !scene.jacSnapshot()?.driving ||
          !!scene.isInInterior() ||
          panel.isPreviewExpanded() ||
          scene.jacInfoOpen(),
      );
    },
    stick: () => joystick.vector(),
    stickActive: () => joystick.isActive(),
    stickShown: () => joystick.isShown(),
    stickCancel: () => joystick.cancel(),
    onExitInterior: () => {
      checklist.setBuildingPanelOpen(false);
      chrome.setInteriorOpen(false, { skipLayout: true });
      panel.hide({ snap: true, silent: true });
    },
    onInteriorIdChange: (id) => {
      hideToast();
      joystick.setHidden(!!id);
      syncInteriorPanel(id);
    },
    onUnreachable: () => showToast(t('toast.unreachable')),
    onGetOutToEnter: () => showToast(t('toast.getOutToEnter')),
    buildingPanel: {
      isOpen: () => panel.isOpen(),
      openTitle: () => panel.openTitle(),
      dismiss: () => panel.hide(),
      isPreview: () => panel.isPreviewMode(),
      layoutInsets: () => panel.layoutInsets(),
      consumeInteriorCanvasTap: (x, y) => panel.consumeInteriorCanvasTap(x, y),
      expandInteriorSheetForQa: () => panel.expandInteriorSheetForQa(),
    },
    checklist: {
      isMobileExpanded: () => checklist.isMobileExpanded(),
      collapseMobile: () => checklist.collapseMobile(),
    },
    chrome: {
      layoutInsets: () => chrome.layoutInsets(),
      onMapInteract: () => {
        if (chrome.isMobileSheetOpen()) chrome.setLayout('map');
      },
      onJacHud: () => chrome.setLayout('map'),
    },
  });

  chrome.bindScene({
    getCharTile: () => scene.getCharacterTile(),
    getView: () => scene.getViewMode(),
  });
  const lockViewport = () => {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  };
  window.addEventListener('scroll', lockViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', lockViewport);
  window.visualViewport?.addEventListener('resize', lockViewport);
  document.addEventListener(
    'touchstart',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('.checklist, .building-panel, .chrome, .jac-sheet, .jac-dock')) return;
      if (t === canvas || t.closest('#app, .joystick, #game-canvas, #ui-root')) {
        if (joystick.isActive() || scene?.jacSnapshot()?.driving) e.preventDefault();
      }
    },
    { passive: false, capture: true },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('.checklist, .building-panel, .chrome, .jac-sheet, .jac-dock')) return;
      if (joystick.isActive() || scene?.jacSnapshot()?.driving) e.preventDefault();
    },
    { passive: false, capture: true },
  );
  const bootInteriorFromUrl = parseInteriorFromHash();
  await scene.init(canvas);
  chrome.beginSoundHint();
  const bootFocus = new URLSearchParams(location.search).get('focus');
  if (bootFocus === 'jac') {
    if (chrome.isMobileSheetOpen()) chrome.setLayout('map');
    scene.focusJac();
  }

  const bootInterior = bootInteriorFromUrl;
  if (bootInterior) {
    const known =
      isCaseHouse(bootInterior) ||
      bootInterior === 'teresa' ||
      bootInterior === 'biblioteca' ||
      !!getInteriorDef(bootInterior) ||
      !!getBuildingByName(bootInterior);
    if (!known) {
      showToast(t('toast.unknownInterior'), 4000);
      replaceOutdoorHash({ x: 0, y: 0, zoom: 0.85 });
      scene.recenterOnCharacter();
    } else {
      chrome.setLayout('map');
      syncInteriorPanel(bootInterior);
    }
  }

  (window as unknown as { __playtestQa?: Record<string, unknown> }).__playtestQa = {
    validateWalkGridFootprint,
    getBuildingDoorTiles,
    getEnterableBuildings: () =>
      getEnterableBuildings().map((o) => ({
        name: o.name,
        x: o.x,
        y: o.y,
        panelTitle: o.panelTitle ?? '',
        door: o.door,
        doorFace: o.doorFace ?? '+y',
        inward: doorInwardStep(o),
      })),
    inicio: INICIO,
    mapTramos: MAP_TRAMOS,
    findPath,
    getCharacterTile: () => scene.getCharacterTile(),
    getCharacterPos: () => scene.getCharacterPosForQa(),
    setCharacterTile: (x: number, y: number) => scene.setCharacterTileForQa(x, y),
    walkToBuilding: (name: string) => scene.walkToBuildingForQa(name),
    doorScreenPoint: (name: string) => scene.getDoorScreenClientPoint(name),
    frameDoorForQa: (name: string) => scene.frameBuildingDoorForQa(name),
    prepareDoorEntryForQa: (name: string) => scene.prepareDoorEntryForQa(name),
    releaseMapTapGestureForQa: () => scene.releaseMapTapGestureForQa(),
    tapBuildingDoor: (name: string) => scene.tapBuildingDoor(name),
    tapDoorWithTouchEvents: (name: string) => scene.tapDoorWithTouchEventsForQa(name),
    setSuppressTap: (ms: number) => scene.setSuppressTapForQa(ms),
    tapMapTile: (tx: number, ty: number) => scene.tapMapTileForQa(tx, ty),
    tapScreen: (sx: number, sy: number) => scene.tapScreenForQa(sx, sy),
    isInInterior: () => scene.isInInterior(),
    getInteriorId: () => scene.getInteriorBuildingId(),
    enterInterior: (name: string) => scene.enterInterior(name),
    exitInterior: () => scene.exitInterior(),
    dismissBuildingPanel: () => panel.hide(),
    setChecklistProgressForQa: (completed: Partial<Record<string, boolean>>) =>
      checklist.setProgressForQa(completed as Partial<Record<import('./checklist/storage').ChecklistStepId, boolean>>),
    collapseChecklistForQa: () => {
      checklist.collapseMobile();
      if (!isMobileLayout()) checklist.setCollapsed(true);
    },
    showPanelOverlayForQa: (title: string) => {
      checklist.setBuildingPanelOpen(true);
      panel.showOverlayForQa(title);
    },
    isBuildingPanelOpen: () => panel.isOpen(),
    setWorkedWith: (logos: { name: string; file: string }[] | null) => panel.setWorkedWithForQa(logos),
    readWalkGoal: () => {
      const raw = document.getElementById('game-canvas')?.dataset.walkGoal;
      return raw ? JSON.parse(raw) : null;
    },
    setZoom: (z: number) => scene.setZoomLevel(z),
    getZoom: () => scene.getZoom(),
    interiorTileScreenPoint: (tx: number, ty: number, liftPx = 0) =>
      scene.getInteriorTileScreenClientPoint(tx, ty, liftPx),
    interiorForwardScreenPoint: () => scene.getInteriorForwardScreenPoint(),
    interiorCharTile: () => scene.getInteriorCharTile(),
    interiorWalk: () => scene.getInteriorWalkForQa(),
    interiorLayout: () => scene.getInteriorLayoutForQa(),
    interiorPixelProbes: () => scene.getInteriorPixelProbesClient(),
    tapInteriorTile: (tx: number, ty: number) => scene.tapInteriorTileForQa(tx, ty),
    expandInteriorSheet: () => panel.expandInteriorSheetForQa(),
    getExperienceSheetRect: () => panel.getExperienceSheetRectForQa(),
    leaveInteriorNow: () => scene.leaveInteriorNow(),
    collapseInteriorSheetToPeek: () => panel.collapseToPeekOnly(),
    reframeMobileDefault: () => scene.reframeMobileDefaultViewForQa(),
    interiorBlockedTilesHaveProps: (name: string) => {
      const def = getInteriorDef(name);
      return def ? interiorBlockedTilesHaveProps(def) : false;
    },
    sampleCanvasColor: (clientX: number, clientY: number) =>
      scene.sampleCanvasColorAtClient(clientX, clientY),
    sampleCanvasColors: (points: { x: number; y: number }[]) =>
      scene.sampleCanvasColorsAtClient(points),
    spriteInstances: () => scene.qaSpriteInstances(),
    forceBuildingState: (s: 'default' | 'hover' | 'resaltado' | null) => scene.qaForceBuildingState(s),
    previewSprite: (k: string | null, x?: number, y?: number) => scene.qaPreviewSprite(k, x, y),
    loadAllSprites: () => scene.qaLoadAllSprites(),
    isolateSprites: (ids: string[] | null) => scene.qaIsolateSprites(ids),
    frameWorld: (x: number, y: number, zoom: number) => scene.qaFrameWorld(x, y, zoom),
    worldToClient: (x: number, y: number) => scene.qaWorldToClient(x, y),
    pickAt: (x: number, y: number) => scene.qaPickAt(x, y),
    obeliscoSilhouettes: () => scene.qaObeliscoSilhouettes(),
    streetTiles: () => scene.qaStreetTiles(),
    npcs: () => scene.qaNpcs(),
    fill: () => scene.qaFill(),
    setNpcs: (on: boolean) => scene.qaSetNpcs(on),
    npcTown: () => scene.qaNpcTown(),
    advanceNpcs: (seconds: number) => scene.qaAdvanceNpcs(seconds),
    playerAvatar: () => scene.qaPlayerAvatar(),
    qaInputReady: () => scene.qaInputReady(),
    setAnim: (dir: 'se' | 'sw' | 'ne' | 'nw', walk: boolean, frame = 0) => scene.qaSetAnim(dir, walk, frame),
    clearAnim: () => scene.qaClearAnim(),
    benches: () => scene.qaBenches(),
    skipQuiet: (seconds: number) => scene.qaSkipQuiet(seconds),
    noah: () => scene.qaNoah(),
    pixiTargetAt: (x: number, y: number) => scene.qaPixiTargetAt(x, y),
    getLayout: () => chrome.getLayout(),
    setLayout: (m: DesktopLayout) => chrome.setLayout(m),
    getViewMode: () => scene.getViewMode(),
    setViewMode: (m: Camera) => scene.setViewMode(m),
    rotateView: () => scene.rotateView(),
    toggleMapOverview: () => scene.toggleMapOverview(),
    isMobileSheetOpen: () => chrome.isMobileSheetOpen(),
    audioMuted: () => studio.isMuted(),
    audioUnlocked: () => studio.isUnlocked(),
    setAudioMuted: (muted: boolean) => studio.setMuted(muted),
    soundHint: () => {
      const el = document.querySelector('.chrome__sound') as HTMLElement | null;
      if (!el) return { present: false, visible: false, opacity: 0, hint: '' };
      const style = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const visible =
        !el.hidden &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) > 0.05 &&
        r.width > 0 &&
        r.height > 0;
      return { present: true, visible, opacity: Number(style.opacity), hint: el.dataset.hint ?? '' };
    },
    stickCancel: () => joystick.cancel(),
    joystick: () => joystick.qa(),
    nameLabels: () => labels.qa(),
    namePillHeads: () => scene.qaNamePillHeads(),
    barks: () => studio.qaBarks(),
    isCasePreview: () => panel.isPreviewMode(),
    openPanelTitle: () => panel.openTitle(),
    isCasePreviewExpanded: () => panel.isPreviewExpanded(),
    showCasePreview: (id: string) => panel.showPreview(id),
    expandCasePreview: () => panel.expandPreviewForQa(),
    collapseCasePreview: () => panel.collapsePreviewForQa(),
    jac: () => scene.qaJac(),
    jacEntities: () => scene.qaJacEntities(),
    jacSpawn: () => scene.jacSpawn(),
    focusJac: () => scene.focusJac(),
    tapJac: () => scene.tapJac(),
    jacInfo: () => scene.jacOpenInfo(),
    jacGetIn: () => scene.jacGetIn(),
    jacGetOut: () => scene.jacGetOut(),
    jacDriveTo: (tx: number, ty: number) => scene.qaDriveTo(tx, ty),
    jacFindDrivePath: (tx: number, ty: number) => scene.qaFindDrivePath(tx, ty),
    lastDriveTap: () => scene.qaLastDriveTap,
    pointerDriveAccepts: () => scene.qaPointerDriveAccepts,
    fps: () => scene.qaFps(),
    tileAtClient: (x: number, y: number) => scene.qaTileAtClient(x, y),
    jacDriveTileOk: (x: number, y: number) => scene.qaDriveTileOk(x, y),
    jacDoor: (from?: { x: number; y: number }) => scene.qaJacDoor(from),
    jacApproach: () => scene.qaJacApproach(),
    jacOverlapsProp: () => scene.qaJacOverlapsProp(),
    jacCanSit: (cx: number, cy: number) => scene.qaJacCanSit(cx, cy),
    parkForDoor: (x: number, y: number, buildingName?: string) =>
      scene.qaParkForDoor(x, y, buildingName),
    inputReady: () => scene.qaInputReady(),
    parkedFootprint: () => scene.qaParkedFootprint(),
    jacStick: (vec: { x: number; y: number } | null) => scene.qaJacStick(vec),
    jacDriveStep: (dt: number, dx: number, dy: number) => scene.qaJacDriveStep(dt, dx, dy),
    viewportLock: () => ({
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      vvOffsetTop: window.visualViewport?.offsetTop ?? 0,
      vvOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
      vvScale: window.visualViewport?.scale ?? 1,
    }),
    jacClose: () => scene.jacClose(),
    jacSetLights: (lights: 'off' | 'auto' | 'on') => scene.jacSetLights(lights),
    jacSetGear: (gear: 'P' | 'R' | 'N' | 'D') => scene.jacSetGear(gear),
    jacSetToggle: (id: 'left' | 'hazards' | 'right' | 'fog' | 'bed' | 'trailer') =>
      scene.jacSetToggle(id),
    jacSetEngine: () => scene.jacSetEngine(),
    jacSetBubble: (on: boolean) => scene.jacSetBubble(on),
    jacSet: (partial: Parameters<IsoScene['qaJacSet']>[0]) => scene.qaJacSet(partial),
    setLang: (lang: 'en' | 'es') => setLang(lang),
    getLang: () => getLang(),
    t: (key: Parameters<typeof t>[0]) => t(key),
  };
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="padding:16px;color:red">${t('boot.error')} ${String(err)}</p>`,
  );
});
