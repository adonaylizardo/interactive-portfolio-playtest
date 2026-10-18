import { studio } from './audio/studio';
import { ChecklistUI } from './checklist/ui';
import { isCaseHouse } from './data/cases';
import { isPlaceCard } from './data/placeCards';
import {
  doorInwardStep,
  getBuildingByName,
  getBuildingDoorTiles,
  getEnterableBuildings,
  INICIO,
  MAP_TRAMOS,
  validateWalkGridFootprint,
} from './data/map';
import { parseInteriorFromHash, setHashWriteSuppressed } from './camera/hash';
import { isMobileLayout } from './checklist/ui';
import {
  isReadingHash,
  leaveReadingHash,
  navigateReading,
  readingDepth,
  syncReadingDepthFromHistory,
  parseReadingRoute,
  resetReadingNavigationForLoad,
} from './ui/readingRoute';
import { ReadingView } from './ui/readingView';
import { getInteriorDef, interiorBlockedTilesHaveProps } from './game/interior';
import { IsoScene } from './game/scene';
import { findPath } from './iso/pathfinding';
import { BuildingPanel } from './ui/buildingPanel';
import { PlaceCardPanel } from './ui/placeCardPanel';
import { ChromeUI, type DesktopLayout } from './ui/chrome';
import { JacHud } from './ui/jacHud';
import { Joystick } from './ui/joystick';
import { BuildingMapLabels } from './ui/buildingMapLabels';
import { NameLabels } from './ui/nameLabels';
import { hideToast, showToast } from './ui/toast';
import { formatContentDate } from './ui/contentLabels';
import {
  BootFlow,
  enterReadingFromWelcome,
  markWelcomeDone,
  shouldSkipWelcomeFlow,
} from './ui/bootFlow';
import { armBootAssetGuard, disarmBootAssetGuard } from './ui/bootAssetGuard';
import { showFatalState, setOnFatalReadInstead } from './ui/fatalState';
import { startOfflineMonitor, isOfflineBannerVisible } from './ui/offlineBanner';
import { canUseWebGL } from './ui/webglCheck';
import { getLang, onLangChange, setLang, t } from './ui/i18n';
import type { Camera } from './tokens';

async function main(): Promise<void> {
  resetReadingNavigationForLoad();
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root')!;
  const applyCanvasLabel = () => canvas.setAttribute('aria-label', t('canvas.label'));
  applyCanvasLabel();
  document.documentElement.lang = getLang();
  onLangChange(applyCanvasLabel);

  const checklist = new ChecklistUI(uiRoot, { onSkip: () => {}, onDismiss: () => {} });
  const bootFlow = new BootFlow();
  bootFlow.mount();
  const skipWelcome = shouldSkipWelcomeFlow();

  let scene!: IsoScene;

  const syncReadingFromHash = (): void => {
    const route = parseReadingRoute();
    if (route) {
      if (isMobileLayout() && !reading.isActive()) {
        chrome.rememberMobileSheetBeforeReading();
      }
      setHashWriteSuppressed(true);
      reading.syncRoute(route);
      checklist.setCollapsed(true);
      if (!isMobileLayout()) chrome.setLayout('panel');
      else chrome.setLayout('map');
      panel.hide({ snap: true, silent: true });
      scene?.setReadingPaused(true);
      mapLabels.setHidden(true);
      scene?.applyCameraFromUi();
      return;
    }
    setHashWriteSuppressed(false);
    reading.syncRoute(null);
    scene?.setReadingPaused(false);
    mapLabels.setHidden(false);
    if (!isMobileLayout()) chrome.setLayout('split');
    else chrome.restoreMobileSheetAfterReading();
    scene?.applyCameraFromUi();
  };

  /** Keep chrome, reading, and map panel aligned with history (incl. back/forward). */
  const syncNavigationFromHistory = (): void => {
    const route = parseReadingRoute();
    if (route) {
      syncReadingFromHash();
      return;
    }
    setHashWriteSuppressed(false);
    reading.syncRoute(null);
    scene?.setReadingPaused(false);
    mapLabels.setHidden(false);
    const interiorId = parseInteriorFromHash();
    if (interiorId) {
      syncInteriorPanel(interiorId);
    } else {
      panel.hide({ snap: true, silent: true });
      chrome.setInteriorOpen(false, { skipLayout: true });
      if (!isMobileLayout()) {
        if (chrome.getLayout() === 'panel') chrome.setLayout('split');
      } else {
        chrome.restoreMobileSheetAfterReading();
      }
    }
    scene?.applyCameraFromUi();
  };

  const closeReading = (): void => {
    const depthBeforeLeave = readingDepth();
    leaveReadingHash();
    if (depthBeforeLeave < 1) syncReadingFromHash();
  };

  const reading = new ReadingView(uiRoot, closeReading);

  setOnFatalReadInstead(() => {
    bootFlow.dismiss();
    syncReadingFromHash();
  });

  const chrome = new ChromeUI(uiRoot, {
    onLayoutChange: () => {
      const layout = chrome.getLayout();
      checklist.setCollapsed(layout === 'map' || layout === 'panel' || isReadingHash());
      scene?.applyCameraFromUi();
    },
    onView: (mode: Camera) => scene?.setViewMode(mode),
    onRotate: () => scene?.rotateView(),
    onMapOverview: () => scene?.toggleMapOverview(),
    onCenter: () => scene?.recenterOnCharacter(),
    onLocate: (id) => {
      if (isReadingHash()) return;
      scene?.walkToBuildingForQa(id);
    },
    onReadingOpen: () => {
      if (isMobileLayout()) chrome.rememberMobileSheetBeforeReading();
      navigateReading({ kind: 'list' });
      syncReadingFromHash();
    },
    onReadingClose: closeReading,
  });

  const joystick = new Joystick(uiRoot);
  const labels = new NameLabels(uiRoot, { onJacInfo: () => scene.jacOpenInfo() });
  const mapLabels = new BuildingMapLabels(uiRoot, (id) => {
    if (isReadingHash()) return;
    scene?.walkToBuildingForQa(id);
  });
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
  const placeCard = new PlaceCardPanel(uiRoot, () => {
    chrome.setPlaceCardOpen(placeCard.isOpen());
    scene?.applyCameraFromUi();
  });

  const bootReading = parseReadingRoute();
  if (bootReading) setHashWriteSuppressed(true);

  if (!canUseWebGL()) {
    bootFlow.dismiss();
    showFatalState('webgl');
    startOfflineMonitor();
    return;
  }

  const panel = new BuildingPanel(
    uiRoot,
    () => {
      const open = panel.isInteriorMode();
      checklist.setBuildingPanelOpen(open);
      chrome.setInteriorOpen(open);
      joystick.setHidden(open || panel.isPreviewExpanded());
      if (panel.isPreviewExpanded()) checklist.setCollapsed(true);
      scene?.applyCameraFromUi();
      scene?.schedulePresentationRefresh(420);
    },
    () => scene.leaveInteriorNow(),
    () => {
      scene?.refreshCanvasPresentation(true);
      scene?.schedulePresentationRefresh(420);
    },
  );
  joystick.onStickStart(() => {
    if (panel.isPreviewMode()) panel.hide();
    if (placeCard.isOpen()) placeCard.hide();
    studio.noteMoveCommand();
  });

  const syncInteriorPanel = (interiorId: string | null): void => {
    if (interiorId) {
      const b = getBuildingByName(interiorId);
      if (b?.panelTitle) {
        if (reading.isActive() || isReadingHash()) {
          reading.syncRoute(null);
          scene.setReadingPaused(false);
        }
        checklist.setBuildingPanelOpen(true);
        if (interiorId === 'teresa') {
          studio.clearSubtitle();
          chrome.setInteriorOpen(true, { skipLayout: true });
          panel.showTalks(t('panel.talks'), interiorId);
        } else if (interiorId === 'biblioteca') {
          studio.clearSubtitle();
          chrome.setInteriorOpen(true, { skipLayout: true });
          panel.showWritings(t('panel.writings'), interiorId);
        } else {
          chrome.setInteriorOpen(true);
          panel.showInterior(b.panelTitle, interiorId);
        }
      }
    } else {
      checklist.setBuildingPanelOpen(false);
      chrome.setInteriorOpen(false);
      panel.hide({ snap: true });
    }
    scene.applyCameraFromUi();
  };

  scene = new IsoScene({
    onInteriorLoadFailed: () => {
      showToast(t('state.loadFailed.sub'));
    },
    onChecklist: (step) => checklist.complete(step),
    onEnterBuilding: (buildingId) => {
      checklist.complete('enter-building');
      if (isPlaceCard(buildingId)) {
        if (chrome.isMobileSheetOpen()) chrome.setLayout('map');
        placeCard.open(buildingId);
        return;
      }
      if (isCaseHouse(buildingId)) {
        if (chrome.isMobileSheetOpen()) chrome.setLayout('map');
        panel.showPreview(buildingId);
        return;
      }
      scene.enterInterior(buildingId);
    },
    onMoveCommand: () => studio.noteMoveCommand(),
    onFrame: () => {
      labels.update(scene.nameLabelAnchors());
      labels.setHidden(!!scene.isInInterior());
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
        labels.setHidden(false);
      }
      joystick.setHidden(
        !scene.jacSnapshot()?.driving ||
          !!scene.isInInterior() ||
          panel.isPreviewExpanded() ||
          placeCard.isOpen() ||
          scene.jacInfoOpen(),
      );
      placeCard.tickUi();
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
      isInteriorSheetExpanded: () => panel.isInteriorSheetExpanded(),
    },
    placeCard: {
      isOpen: () => placeCard.isOpen(),
      layoutInsets: () => placeCard.layoutInsets(),
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
    onLoadProgress: (pct) => bootFlow.setProgress(pct),
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
  armBootAssetGuard(() => showFatalState('load-failed'));

  try {
    await scene.init(canvas);
  } catch (err) {
    console.error(err);
    disarmBootAssetGuard();
    showFatalState('load-failed');
    return;
  }
  disarmBootAssetGuard();

  chrome.bindScene({
    getCharTile: () => scene.getCharacterTile(),
    getView: () => scene.getViewMode(),
  });

  startOfflineMonitor();

  let enteredViaWelcomeRead = false;
  if (skipWelcome) {
    await bootFlow.finishLoading(true);
  } else {
    const choice = await bootFlow.finishLoading(false);
    markWelcomeDone();
    if (choice === 'read') {
      enteredViaWelcomeRead = true;
      enterReadingFromWelcome();
    } else {
      if (isMobileLayout()) chrome.setLayout('map');
      else chrome.setLayout('split');
    }
    bootFlow.dismiss();
  }

  chrome.beginSoundHint();
  const bootFocus = new URLSearchParams(location.search).get('focus');
  if (bootFocus === 'jac') {
    if (chrome.isMobileSheetOpen()) chrome.setLayout('map');
    scene.focusJac();
  }

  if (bootReading || enteredViaWelcomeRead) {
    syncReadingFromHash();
  } else {
    const bootInterior = parseInteriorFromHash();
    if (bootInterior) {
      syncInteriorPanel(bootInterior);
    }
  }

  window.addEventListener('hashchange', () => syncNavigationFromHistory());
  window.addEventListener('popstate', () => {
    syncReadingDepthFromHistory();
    syncNavigationFromHistory();
  });

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
    tapBuildingDoor: (name: string) => scene.tapBuildingDoor(name),
    setSuppressTap: (ms: number) => scene.setSuppressTapForQa(ms),
    tapMapTile: (tx: number, ty: number) => scene.tapMapTileForQa(tx, ty),
    tapScreen: (sx: number, sy: number) => scene.tapScreenForQa(sx, sy),
    isInInterior: () => scene.isInInterior(),
    getInteriorId: () => scene.getInteriorBuildingId(),
    enterInterior: (name: string) => scene.enterInterior(name),
    exitInterior: () => scene.exitInterior(),
    dismissBuildingPanel: () => panel.hide(),
    openPlaceCard: (id: string) => {
      if (isPlaceCard(id)) placeCard.open(id);
    },
    closePlaceCard: () => placeCard.hide(),
    isPlaceCardOpen: () => placeCard.isOpen(),
    placeVoiceProgress: () => studio.getPlaceVoiceProgress(),
    qaPlayPlaceVoice: (voiceId: string) => studio.qaPlayPlaceVoice(voiceId),
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
    expandInteriorSheetForQa: () => panel.expandInteriorSheetForQa(),
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
    formatContentDate: (raw: string) => formatContentDate(raw),
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
    showTalksEmptyForQa: () => panel.showTalksEmptyForQa(),
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
    showFatalState: (kind: 'webgl' | 'load-failed') => showFatalState(kind),
    isOfflineBannerVisible: () => isOfflineBannerVisible(),
  };
}

main().catch((err) => {
  console.error(err);
  showFatalState('load-failed');
});
