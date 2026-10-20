import { studio } from './audio/studio';
import { ChecklistUI, isMobileLayout } from './checklist/ui';
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
import { parseInteriorFromHash, replaceOutdoorHash, setHashWriteSuppressed } from './camera/hash';
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
import { findPath, findPathOrNearest } from './iso/pathfinding';
import type { SearchResult } from './data/siteSearch';
import { AboutMePanel } from './ui/aboutMePanel';
import { BuildingPanel } from './ui/buildingPanel';
import { PlaceCardPanel } from './ui/placeCardPanel';
import { ChromeUI, type DesktopLayout } from './ui/chrome';
import { SearchPalette } from './ui/searchPalette';
import { JacHud } from './ui/jacHud';
import { PersonaJacBoard } from './ui/personaJacBoard';
import { PersonaEnterPrompt } from './ui/personaEnterPrompt';
import { PersonaKitUI } from './ui/personaKitUi';
import { Joystick } from './ui/joystick';
import { BuildingMapLabels } from './ui/buildingMapLabels';
import { InteriorStageScreen } from './ui/interiorStageScreen';
import { personaEnabled } from './game/persona/personaSpec';
import { NameLabels } from './ui/nameLabels';
import { CenitalBuildingLabels } from './ui/cenitalBuildingLabels';
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
  if (!isMobileLayout()) checklist.setCollapsed(true);

  const bootFlow = new BootFlow();
  bootFlow.mount();
  const skipWelcome = shouldSkipWelcomeFlow();

  let scene!: IsoScene;
  let chrome!: ChromeUI;
  let panel!: BuildingPanel;
  let aboutPanel!: AboutMePanel;
  let searchPalette!: SearchPalette;
  let labels!: NameLabels;
  let mapLabels!: BuildingMapLabels;

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
      isReadingHash() ||
        (isMobileLayout() &&
          (chrome.isMobileSheetOpen() ||
            panel.isOpen() ||
            aboutPanel.isOpen() ||
            searchPalette.isOpen())),
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
    const route = parseReadingRoute();
    if (!canUseWebGL()) {
      if (route) {
        if (isMobileLayout()) chrome.rememberMobileSheetBeforeReading();
        reading.syncRoute(route);
        checklist.setCollapsed(true);
        if (!isMobileLayout()) chrome.setLayout('panel');
        else chrome.setLayout('map');
      }
      return;
    }
    syncReadingFromHash();
  });

  chrome = new ChromeUI(uiRoot, {
    onLayoutChange: () => {
      const layout = chrome.getLayout();
      if (!isMobileLayout()) checklist.setCollapsed(true);
      else checklist.collapseMobile();
      if (layout === 'map' || layout === 'panel' || isReadingHash()) checklist.setCollapsed(true);
      syncMapOverlays();
      scene?.reflowViewport();
      if (chrome.getLayout() === 'map' && !panel.isOpen() && !isReadingHash()) {
        studio.scheduleIntroWhenMapIdle(450);
      }
    },
    onView: (mode: Camera) => scene?.setViewMode(mode),
    onRotate: () => scene?.rotateView(),
    onMapOverview: () => scene?.toggleMapOverview(),
    onCenter: () => scene?.recenterOnCharacter(),
    onLocate: (id) => {
      if (isReadingHash()) return;
      scene?.walkToBuildingForQa(id);
    },
    onOpenAbout: (opts) => {
      aboutPanel.open(opts);
      syncMapOverlays();
      chrome.sync();
    },
    onOpenSearch: () => searchPalette.open(),
    onReadingOpen: () => {
      if (isMobileLayout()) chrome.rememberMobileSheetBeforeReading();
      navigateReading({ kind: 'list' });
      syncReadingFromHash();
    },
    onReadingClose: closeReading,
  });

  const joystick = new Joystick(uiRoot);
  mapLabels = new BuildingMapLabels(uiRoot, (id) => {
    if (isReadingHash()) return;
    scene?.walkToBuildingForQa(id);
  });
  const cenitalLabels = new CenitalBuildingLabels(uiRoot);
  const personaJacBoard = new PersonaJacBoard(uiRoot, {
    onGetIn: () => scene.jacGetIn(),
    onGetOut: () => scene.jacGetOut(),
  });
  const personaEnterPrompt = new PersonaEnterPrompt(uiRoot, {
    onEnter: () => scene.personaEnterFromUi(),
  });
  let personaKit!: PersonaKitUI;
  const jacHud = new JacHud(uiRoot, {
    onInfo: () => scene.jacOpenInfo(),
    onGetIn: () => scene.jacGetIn(),
    onGetOut: () => scene.jacGetOut(),
    onClose: () => scene.jacClose(),
    onLights: (lights) => scene.jacSetLights(lights),
    onGear: (gear) => scene.jacSetGear(gear),
    onToggle: (id) => scene.jacSetToggle(id),
    onEngine: () => scene.jacSetEngine(),
    onView: (mode) => scene.setViewMode(mode),
    onRotate: () => scene.rotateView(),
    onMapOverview: () => scene.toggleMapOverview(),
    getView: () => {
      const v = scene.getViewMode();
      return { mode: v.mode, overview: v.overview };
    },
  });
  const stageScreen = new InteriorStageScreen(document.body);
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
      joystick.setHidden(open || panel.isPreviewMode() || panel.isPreviewExpanded());
      if (panel.isPreviewExpanded()) checklist.setCollapsed(true);
      if (panel.isPreviewMode() && panel.isOpen() && !isMobileLayout()) {
        checklist.setCollapsed(true);
      }
      if (!panel.isOpen() && !scene?.isInInterior()) {
        if (!isMobileLayout()) checklist.setCollapsed(true);
        scene?.resetMapDoorChainState();
        studio.maybePlayDeferredIntro();
      }
      scene?.applyCameraFromUi();
      scene?.schedulePresentationRefresh(420);
    },
    () => scene.leaveInteriorNow(),
    () => {
      scene?.refreshCanvasPresentation(true);
      scene?.schedulePresentationRefresh(420);
      if (personaEnabled() && scene.getViewMode().mode === 'persona') {
        scene.bumpDoorCooldown(2800);
      }
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
        scene.pushCasePreviewHash(buildingId);
        return;
      }
      scene.enterInterior(buildingId);
    },
    onDriveBuildingDoor: (buildingId, panelTitle) => {
      if (isCaseHouse(buildingId)) {
        if (chrome.isMobileSheetOpen()) chrome.setLayout('map');
        panel.showPreview(buildingId);
        return;
      }
      panel.showBuildingPeek(buildingId, panelTitle);
    },
    onMoveCommand: () => studio.noteMoveCommand(),
    onFrame: () => {
      stageScreen.apply(scene.interiorStageScreenLayout());
      const view = scene.getViewMode();
      const sheetOpen = chrome.isMobileSheetOpen();
      const personaActive =
        personaEnabled() && view.mode === 'persona' && !scene.isInInterior();
      const hidePills =
        view.overview || !!scene.isInInterior() || sheetOpen || personaActive ||
        (isMobileLayout() && (panel.isOpen() || aboutPanel.isOpen() || searchPalette.isOpen()));
      labels.setHidden(hidePills);
      if (!hidePills) labels.update(scene.nameLabelAnchors());
      mapLabels.setHidden(!!scene.isInInterior() || view.mode === 'cenital' || view.mode === 'persona' || sheetOpen);
      if (view.mode !== 'cenital' && view.mode !== 'persona' && !sheetOpen) {
        mapLabels.update(
          scene.buildingMapLabelAnchors().map((a) => ({
            ...a,
            label: a.id === 'teresa' ? `▶ ${t('panel.talks')}` : `📄 ${t('panel.writings')}`,
          })),
        );
      }
      if (!sheetOpen && view.mode === 'cenital' && !scene.isInInterior()) {
        cenitalLabels.setHidden(false);
        cenitalLabels.update(scene.cenitalBuildingLabelAnchors());
      } else if (!sheetOpen) {
        cenitalLabels.setHidden(true);
      }
      const kitActive = personaEnabled() && scene.personaKitActive();
      const driving = !!scene.jacSnapshot()?.driving;
      const kitDriveMobile = kitActive && driving && isMobileLayout();
      if (personaActive && driving) {
        jacHud.park();
      } else if (scene.jacHudActive() && !kitDriveMobile) {
        const snap = scene.jacSnapshot();
        const anchors = scene.jacHudAnchors();
        jacHud.update(snap, anchors, anchors.rear);
        if (!personaActive && !sheetOpen) labels.setHidden(false);
      } else {
        jacHud.park();
        const hideNameLabels =
          isMobileLayout() &&
          (sheetOpen || panel.isOpen() || aboutPanel.isOpen() || searchPalette.isOpen());
        if (personaActive || hideNameLabels) labels.setHidden(true);
        else if (!sheetOpen) labels.setHidden(false);
      }
      const ps = scene.qaPersonaState();
      personaJacBoard.sync({
        showIn: kitActive && ps.jacBoard && !driving,
        showOut: kitActive && driving && (isMobileLayout() || personaActive),
      });
      personaEnterPrompt.sync(
        !sheetOpen &&
          kitActive &&
          scene.getViewMode().mode === 'persona' &&
          ps.enterOffer &&
          !driving &&
          !panel.isPreviewMode() &&
          !panel.isPreviewExpanded(),
      );
      document.body.dataset.view = scene.getViewMode().mode;
      const thirdPersonWalk =
        personaEnabled() && scene.getViewMode().mode === 'persona' && !scene.isInInterior();
      joystick.setPersonaWalk(thirdPersonWalk && !driving);
      joystick.setHidden(
        sheetOpen ||
          (!driving && !kitActive) ||
          !!scene.isInInterior() ||
          panel.isPreviewMode() ||
          panel.isPreviewExpanded() ||
          placeCard.isOpen() ||
          scene.jacInfoOpen(),
      );
      placeCard.tickUi();
      personaKit?.syncCameraSwitch();
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
    onUnknownRoute: () => showToast(t('toast.unknownRoute')),
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
      if (
        t.closest(
          '.checklist, .building-panel, .chrome, .jac-sheet, .jac-dock, .persona-kit, .persona-jac-board, .persona-enter-prompt',
        )
      )
        return;
      if (t === canvas || t.closest('#app, .joystick, #game-canvas, #ui-root')) {
        if (joystick.isActive() || scene?.jacSnapshot()?.driving) e.preventDefault();
      }
      if (t.closest('#app, .joystick, #ui-root') && joystick.isActive()) e.preventDefault();
    },
    { passive: false, capture: true },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          '.checklist, .building-panel, .chrome, .jac-sheet, .jac-dock, .persona-kit, .persona-jac-board, .persona-enter-prompt',
        )
      )
        return;
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

  window.addEventListener('unhandledrejection', (ev) => {
    const msg =
      ev.reason instanceof Error
        ? ev.reason.message
        : typeof ev.reason === 'string'
          ? ev.reason
          : String(ev.reason ?? '');
    if (/(\[Loader\.load\]|Failed to fetch|sprite load failed|deferred load failed)/i.test(msg)) {
      ev.preventDefault();
      console.warn(ev.reason);
    }
  });

  let enteredViaWelcomeRead = false;
  if (skipWelcome) {
    await bootFlow.finishLoading(true);
  } else {
    const choice = await bootFlow.finishLoading(false);
    markWelcomeDone();
    if (choice === 'read') {
      enteredViaWelcomeRead = true;
      enterReadingFromWelcome();
    } else if (!parseInteriorFromHash() && !bootReading) {
      if (isMobileLayout()) {
        chrome.setLayout('map');
        scene.reframeMobileFirstLoadForQa();
      } else {
        chrome.setLayout('split');
        scene.reframeDesktopFirstLoadForQa();
      }
    }
    bootFlow.dismiss();
  }

  personaKit = new PersonaKitUI(uiRoot, {
    getViewMode: () => scene.getViewMode().mode,
    switchView: (mode) => scene.setViewModeWhenReady(mode),
  });
  if (personaEnabled()) {
    scene.setViewMode('cenital');
    if (isMobileLayout()) chrome.setLayout('map');
    personaKit.onBoot();
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
    findPathOrNearest,
    getCharacterTile: () => scene.getCharacterTile(),
    getCharacterPos: () => scene.getCharacterPosForQa(),
    walk: (dx: number, dy: number, sprint = false) => scene.qaWalk(dx, dy, sprint),
    setCharacterTile: (x: number, y: number) => scene.setCharacterTileForQa(x, y),
    walkToBuilding: (name: string) => scene.walkToBuildingForQa(name),
    walkToTile: (x: number, y: number, sprint?: boolean) => scene.qaWalkToTile(x, y, sprint),
    doorScreenPoint: (name: string) => scene.getDoorScreenClientPoint(name),
    frameDoorForQa: (name: string) => scene.frameBuildingDoorForQa(name),
    prepareDoorEntryForQa: (name: string) => scene.prepareDoorEntryForQa(name),
    releaseMapTapGestureForQa: () => scene.releaseMapTapGestureForQa(),
    tapBuildingDoor: (name: string) => scene.tapBuildingDoor(name),
    tapDoorWithTouchEvents: (name: string) => scene.tapDoorWithTouchEventsForQa(name),
    driveEnter: (name: string) => scene.qaDriveEnter(name),
    setSuppressTap: (ms: number) => scene.setSuppressTapForQa(ms),
    clearDriveTapSuppress: () => scene.clearDriveTapSuppressForQa(),
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
    setZoomLevel: (z: number, anchor?: { x: number; y: number }) => scene.setZoomLevel(z, anchor),
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
    spritePixelDiffPlan: () => scene.qaSpritePixelDiffPlan(),
    forceBuildingState: (s: 'default' | 'hover' | 'resaltado' | null) => scene.qaForceBuildingState(s),
    previewSprite: (k: string | null, x?: number, y?: number) => scene.qaPreviewSprite(k, x, y),
    loadAllSprites: () => scene.qaLoadAllSprites(),
    setMapLightsForQa: (on: boolean) => scene.qaSetMapLightsForQa(on),
    setIgnoreJacPick: (ignore: boolean) => scene.qaSetIgnoreJacPick(ignore),
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
    overviewCoverage: () => scene.qaOverviewCoverage(),
    cenitalDoorGlyphScreen: (name: string) => scene.qaCenitalDoorGlyphScreen(name),
    pickDrivingEnterAtScreen: (sx: number, sy: number) =>
      scene.qaPickDrivingEnterAtScreen(sx, sy),
    personaState: () => scene.qaPersonaState(),
    personaCam: () => scene.qaPersonaCam(),
    personaMoveHeading: (opts: { w?: boolean; stickY?: number }) => scene.qaPersonaMoveHeading(opts),
    personaScreenForwardDeg: () => scene.qaPersonaScreenForwardDeg(),
    personaClientChar: () => scene.qaPersonaClientChar(),
    personaWorldMarkClientPx: (tx: number, ty: number) => scene.qaPersonaWorldMarkClientPx(tx, ty),
    personaRenderProbe: () => scene.qaPersonaRenderProbe(),
    personaEnterOffer: () => scene.qaPersonaEnterOffer(),
    personaEnterFromUi: () => scene.personaEnterFromUi(),
    setPersonaYawDeg: (deg: number) => scene.qaSetPersonaYawDeg(deg),
    personaStickSpeedMul: (y: number) => scene.qaPersonaStickSpeedMul(y),
    personaProjectedT9Width: () => scene.qaPersonaProjectedT9Width(),
    personaScreenMetrics: () => scene.qaPersonaScreenMetrics(),
    flushPersonaView: () => scene.qaFlushPersonaView(),
    stickToTile: (dx: number, dy: number) => scene.qaStickToTile(dx, dy),
    cameraViews: () => scene.qaCameraViews(),
    cenitalExpectedHeading: (dx: number, dy: number) => scene.qaCenitalExpectedHeading(dx, dy),
    cenitalBuildingLabels: () => {
      const base = cenitalLabels.qa();
      const visibleBox = (el: HTMLElement) => {
        if (el.hidden) return null;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) < 0.08) {
          return null;
        }
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      };
      const boxes: { x: number; y: number; w: number; h: number }[] = [];
      for (const pill of document.querySelectorAll('.cenital-building-label')) {
        const box = visibleBox(pill as HTMLElement);
        if (box) boxes.push(box);
      }
      for (const pill of document.querySelectorAll('.name-label')) {
        const box = visibleBox(pill as HTMLElement);
        if (box) boxes.push(box);
      }
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const clip = (r: { x: number; y: number; w: number; h: number }) => {
        const left = Math.max(r.x, 0);
        const top = Math.max(r.y, 0);
        const right = Math.min(r.x + r.w, vw);
        const bottom = Math.min(r.y + r.h, vh);
        const w = right - left;
        const h = bottom - top;
        if (w <= 0 || h <= 0) return null;
        return { x: left, y: top, w, h };
      };
      const clipped = boxes.map(clip).filter(Boolean) as { x: number; y: number; w: number; h: number }[];
      let overlaps = base.overlaps;
      for (let i = 0; i < clipped.length; i++) {
        for (let j = i + 1; j < clipped.length; j++) {
          const a = clipped[i];
          const b = clipped[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 0 && oy > 0) overlaps += 1;
        }
      }
      return { ...base, overlaps };
    },
    isMobileSheetOpen: () => chrome.isMobileSheetOpen(),
    mobileSheetPanel: () => chrome.getMobileSheetPanel(),
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
    clearInput: () => scene.qaClearInput(),
    joystick: () => joystick.qa(),
    nameLabels: () => labels.qa(),
    namePillHeads: () => scene.qaNamePillHeads(),
    barks: () => studio.qaBarks(),
    isCasePreview: () => panel.isPreviewMode(),
    openPanelTitle: () => panel.openTitle(),
    isCasePreviewExpanded: () => panel.isPreviewExpanded(),
    showCasePreview: (id: string) => panel.showPreview(id),
    showTalksEmptyForQa: () => panel.showTalksEmptyForQa(),
    showBuildingPeek: (id: string, title?: string) => panel.showBuildingPeek(id, title),
    expandCasePreview: () => panel.expandPreviewForQa(),
    collapseCasePreview: () => panel.collapsePreviewForQa(),
    jac: () => scene.qaJac(),
    jacEntities: () => scene.qaJacEntities(),
    jacSpawn: () => scene.jacSpawn(),
    focusJac: () => scene.focusJac(),
    tapJac: () => scene.tapJac(),
    jacInfo: () => scene.jacOpenInfo(),
    jacGetIn: () => scene.jacGetIn(),
    jacGetOut: (opts?: { thenEnter?: boolean }) => scene.jacGetOut(opts),
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
    jacDriveStep: (dt: number, dx: number, dy: number, opts?: { render?: boolean }) =>
      scene.qaJacDriveStep(dt, dx, dy, opts),
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
  scene.scheduleNpcLoad();
}

main().catch((err) => {
  console.error(err);
  showFatalState('load-failed');
});
