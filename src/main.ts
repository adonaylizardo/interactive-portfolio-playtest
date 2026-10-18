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
import { parseInteriorFromHash } from './camera/hash';
import { getInteriorDef, interiorBlockedTilesHaveProps } from './game/interior';
import { IsoScene } from './game/scene';
import { findPath, findPathOrNearest } from './iso/pathfinding';
import { BuildingPanel } from './ui/buildingPanel';
import { ChromeUI, type DesktopLayout } from './ui/chrome';
import { JacHud } from './ui/jacHud';
import { PersonaJacBoard } from './ui/personaJacBoard';
import { PersonaEnterPrompt } from './ui/personaEnterPrompt';
import { PersonaKitUI } from './ui/personaKitUi';
import { Joystick } from './ui/joystick';
import { personaEnabled } from './game/persona/personaSpec';
import { NameLabels } from './ui/nameLabels';
import { CenitalBuildingLabels } from './ui/cenitalBuildingLabels';
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

  let scene!: IsoScene;
  const chrome = new ChromeUI(uiRoot, {
    onLayoutChange: () => {
      const layout = chrome.getLayout();
      checklist.setCollapsed(layout === 'map' || layout === 'panel');
      scene?.applyCameraFromUi();
    },
    onView: (mode: Camera) => scene?.setViewMode(mode),
    onRotate: () => scene?.rotateView(),
    onMapOverview: () => scene?.toggleMapOverview(),
    onCenter: () => scene?.recenterOnCharacter(),
    onLocate: (id) => scene?.walkToBuildingForQa(id),
  });

  const joystick = new Joystick(uiRoot);
  const labels = new NameLabels(uiRoot, { onJacInfo: () => scene.jacOpenInfo() });
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
  const panel = new BuildingPanel(
    uiRoot,
    () => {
      const open = panel.isInteriorMode();
      checklist.setBuildingPanelOpen(open);
      chrome.setInteriorOpen(open);
      joystick.setHidden(open || panel.isPreviewExpanded());
      if (panel.isPreviewExpanded()) checklist.setCollapsed(true);
      scene?.applyCameraFromUi();
    },
    () => scene.leaveInteriorNow(),
    () => {
      if (personaEnabled() && scene.getViewMode().mode === 'persona') {
        scene.bumpDoorCooldown(2800);
      }
    },
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
        chrome.setInteriorOpen(true);
        panel.showInterior(b.panelTitle, interiorId);
      }
    } else {
      checklist.setBuildingPanelOpen(false);
      chrome.setInteriorOpen(false);
      panel.hide({ snap: true });
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
        return;
      }
      scene.enterInterior(buildingId);
    },
    onMoveCommand: () => studio.noteMoveCommand(),
    onFrame: () => {
      const personaActive =
        personaEnabled() && scene.getViewMode().mode === 'persona' && !scene.isInInterior();
      if (!personaActive) {
        labels.update(scene.nameLabelAnchors());
      } else {
        labels.setHidden(true);
      }
      if (scene.getViewMode().mode === 'cenital' && !scene.isInInterior()) {
        cenitalLabels.setHidden(false);
        cenitalLabels.update(scene.cenitalBuildingLabelAnchors());
      } else {
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
        if (!personaActive) labels.setHidden(false);
      } else {
        jacHud.park();
        if (!personaActive) labels.setHidden(false);
      }
      const ps = scene.qaPersonaState();
      personaJacBoard.sync({
        showIn: kitActive && ps.jacBoard && !driving,
        showOut: kitActive && driving && (isMobileLayout() || personaActive),
      });
      personaEnterPrompt.sync(
        kitActive &&
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
        (!driving && !kitActive) ||
          !!scene.isInInterior() ||
          panel.isPreviewExpanded() ||
          scene.jacInfoOpen(),
      );
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
      if (
        t.closest(
          '.checklist, .building-panel, .chrome, .jac-sheet, .jac-dock, .persona-kit, .persona-jac-board, .persona-enter-prompt',
        )
      )
        return;
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
  await scene.init(canvas);
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

  const bootInterior = parseInteriorFromHash();
  if (bootInterior) {
    syncInteriorPanel(bootInterior);
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
    findPathOrNearest,
    getCharacterTile: () => scene.getCharacterTile(),
    getCharacterPos: () => scene.getCharacterPosForQa(),
    walk: (dx: number, dy: number, sprint = false) => scene.qaWalk(dx, dy, sprint),
    setCharacterTile: (x: number, y: number) => scene.setCharacterTileForQa(x, y),
    walkToBuilding: (name: string) => scene.walkToBuildingForQa(name),
    walkToTile: (x: number, y: number, sprint?: boolean) => scene.qaWalkToTile(x, y, sprint),
    doorScreenPoint: (name: string) => scene.getDoorScreenClientPoint(name),
    frameDoorForQa: (name: string) => scene.frameBuildingDoorForQa(name),
    tapBuildingDoor: (name: string) => scene.tapBuildingDoor(name),
    driveEnter: (name: string) => scene.qaDriveEnter(name),
    setSuppressTap: (ms: number) => scene.setSuppressTapForQa(ms),
    tapMapTile: (tx: number, ty: number) => scene.tapMapTileForQa(tx, ty),
    tapScreen: (sx: number, sy: number) => scene.tapScreenForQa(sx, sy),
    isInInterior: () => scene.isInInterior(),
    getInteriorId: () => scene.getInteriorBuildingId(),
    enterInterior: (name: string) => scene.enterInterior(name),
    exitInterior: () => scene.exitInterior(),
    dismissBuildingPanel: () => panel.hide(),
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
    overviewCoverage: () => scene.qaOverviewCoverage(),
    personaState: () => scene.qaPersonaState(),
    personaCam: () => scene.qaPersonaCam(),
    personaMoveHeading: (opts: { w?: boolean; stickY?: number }) => scene.qaPersonaMoveHeading(opts),
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
    cenitalBuildingLabels: () => cenitalLabels.qa(),
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
    clearInput: () => scene.qaClearInput(),
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
    parkForDoor: (x: number, y: number) => scene.qaParkForDoor(x, y),
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
  };
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="padding:16px;color:red">${t('boot.error')} ${String(err)}</p>`,
  );
});
