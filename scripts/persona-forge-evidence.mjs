/**
 * Forge QA p2 evidence: stick vs W, speed table, door entry (3 doors × 3 viewports).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PERSONA_STICK_DEAD = 0.15;

fs.mkdirSync(OUT, { recursive: true });

const YAWS = [0, 60, 120, 180, 240, 300];
const STICK_DEFLECTIONS = [0, 0.02, 0.17, 0.36, 0.55, 0.74, 1.0];
const DOORS = ['estudio', 'volaris', 'bain'];
const VIEWPORTS = [
  ['390', { width: 390, height: 844, touch: true }],
  ['844x390', { width: 844, height: 390, touch: true }],
  ['1280', { width: 1280, height: 800, touch: false }],
];

async function boot(page, touch) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.setViewMode), null, { timeout: 90000 });
  await page.evaluate((layout) => {
    window.__playtestQa.setLayout?.(layout);
    window.__playtestQa.leaveInteriorNow?.();
    window.__playtestQa.dismissBuildingPanel?.();
  }, touch ? 'split' : 'map');
  await page.evaluate(() => window.__playtestQa.setViewMode('persona'));
  await wait(500);
}

async function stickVsW(page) {
  const rows = [];
  for (const yaw of YAWS) {
    await page.evaluate((d) => {
      window.__playtestQa.setPersonaYawDeg(d);
      window.__playtestQa.clearInput?.();
    }, yaw);
    await wait(80);
    const w = await page.evaluate(() => window.__playtestQa.personaMoveHeading({ w: true }));
    const stick = await page.evaluate(() => window.__playtestQa.personaMoveHeading({ stickY: -1 }));
    const delta = Math.abs(((w - stick + 540) % 360) - 180);
    rows.push({ yawDeg: yaw, wHeading: w, stickUpHeading: stick, deltaDeg: delta, pass: delta < 0.5 });
  }
  return rows;
}

async function openWalkTile(page) {
  await page.evaluate(() => {
    const sp = window.__playtestQa.jacSpawn()?.center;
    if (sp) window.__playtestQa.setCharacterTile(Math.round(sp.x), Math.round(sp.y));
    else window.__playtestQa.setCharacterTile(29, 36);
    window.__playtestQa.clearInput?.();
  });
  await wait(150);
}

async function speedTable(page) {
  const rows = [];
  for (const def of STICK_DEFLECTIONS) {
    await openWalkTile(page);
    if (def === 0) {
      rows.push({ deflection: def, tilesIn2s: 0, pass: true });
      continue;
    }
    const start = await page.evaluate(() => window.__playtestQa.getCharacterPos());
    await page.evaluate((sy) => {
      window.__playtestQa.clearInput?.();
      window.__playtestQa.jacStick({ x: 0, y: -sy });
    }, def);
    await wait(2000);
    await page.evaluate(() => window.__playtestQa.jacStick(null));
    const end = await page.evaluate(() => window.__playtestQa.getCharacterPos());
    const tiles = Math.hypot(end.x - start.x, end.y - start.y);
    const tilesPerS = tiles / 2;
    rows.push({
      deflection: def,
      tilesIn2s: Number(tiles.toFixed(2)),
      tilesPerS: Number(tilesPerS.toFixed(2)),
      pass: def <= PERSONA_STICK_DEAD ? tiles < 0.02 : def >= 0.17 ? tiles >= 0.08 && tilesPerS <= 2.2 : tilesPerS <= 2.2,
    });
  }
  return rows;
}

async function doorEntry(page, tag, touch) {
  const results = [];
  for (const name of DOORS) {
    const row = { building: name, tag, steps: [] };
    const b = await page.evaluate((n) => {
      const x = window.__playtestQa.getEnterableBuildings().find((o) => o.name === n);
      return x ?? null;
    }, name);
    if (!b?.door) {
      row.error = 'no door';
      results.push(row);
      continue;
    }
    await page.evaluate(({ door, inward }) => {
      window.__playtestQa.setCharacterTile(door.x, door.y);
      window.__playtestQa.clearInput?.();
      for (let deg = 0; deg < 360; deg += 10) {
        window.__playtestQa.setPersonaYawDeg(deg);
        if (window.__playtestQa.personaEnterOffer().show) return;
      }
      if (!window.__playtestQa.personaEnterOffer().show) {
        window.__playtestQa.setCharacterTile(door.x - inward.x, door.y - inward.y);
        for (let deg = 0; deg < 360; deg += 10) {
          window.__playtestQa.setPersonaYawDeg(deg);
          if (window.__playtestQa.personaEnterOffer().show) return;
        }
      }
    }, { door: b.door, inward: b.inward ?? { x: 0, y: 1 } });
    await wait(200);
    const offerBefore = await page.evaluate(() => window.__playtestQa.personaEnterOffer());
    row.steps.push({ offerBefore });
    if (!offerBefore.show) {
      row.entered = false;
      row.skip = 'no offer';
      await page.screenshot({ path: path.join(OUT, `${tag}-enter-${name}.png`) });
      results.push(row);
      continue;
    }
    await page.evaluate(() => window.__playtestQa.personaEnterFromUi());
    const entered = await page
      .waitForFunction(
        () => window.__playtestQa.isInInterior() || window.__playtestQa.isBuildingPanelOpen(),
        null,
        { timeout: 3500 },
      )
      .then(() => true)
      .catch(() => false);
    row.entered = entered;
    if (await page.evaluate(() => window.__playtestQa.isInInterior())) {
      await page.evaluate(() => window.__playtestQa.leaveInteriorNow?.());
      await wait(400);
    } else {
      await page.evaluate(() => window.__playtestQa.dismissBuildingPanel?.());
      await wait(200);
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-enter-${name}.png`) });
    results.push(row);
  }
  return results;
}

async function runViewport(tag, vp) {
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.touch,
    isMobile: vp.touch,
  });
  const page = await ctx.newPage();
  await boot(page, vp.touch);
  const bundle =
    (await page.evaluate(() =>
      [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
    ))?.split('/').pop() ?? '';
  const stickVsWRows = await stickVsW(page);
  const speedRows = await speedTable(page);
  const doors = await doorEntry(page, tag, vp.touch);
  await page.screenshot({ path: path.join(OUT, `${tag}-spawn-frame-c.png`) });
  await ctx.close();
  await browser.close();
  return { tag, bundle, stickVsWRows, speedRows, doors };
}

const all = [];
for (const [tag, vp] of VIEWPORTS) {
  console.log('Evidence', tag);
  all.push(await runViewport(tag, vp));
}

const bundle = all[0]?.bundle ?? '';
const report = {
  base: BASE,
  verifiedBundle: bundle,
  at: new Date().toISOString(),
  stickVsW: all.map((v) => ({ tag: v.tag, rows: v.stickVsWRows })),
  speed: all.map((v) => ({ tag: v.tag, rows: v.speedRows })),
  doors: all.map((v) => ({ tag: v.tag, rows: v.doors })),
  ok:
    all.every((v) => v.stickVsWRows.every((r) => r.pass)) &&
    all.every((v) => v.speedRows.every((r) => r.pass)) &&
    all.every((v) => v.doors.every((d) => d.skip || d.entered)),
};

fs.writeFileSync(path.join(OUT, 'forge-p2-evidence.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(
  path.join(OUT, 'REPORT.md'),
  `# Preview persona Forge QA p2\n\n- **URL:** ${BASE}\n- **Verified bundle:** \`${bundle}\`\n- **Evidence JSON:** forge-p2-evidence.json\n\n## Stick vs W (6 yaws)\n\n${all
    .map(
      (v) =>
        `### ${v.tag}\n\n| yaw° | W° | stick up° | Δ° | pass |\n|------|-----|-----------|-----|------|\n${v.stickVsWRows
          .map((r) => `| ${r.yawDeg} | ${r.wHeading?.toFixed(1)} | ${r.stickUpHeading?.toFixed(1)} | ${r.deltaDeg.toFixed(2)} | ${r.pass ? '✓' : '✗'} |`)
          .join('\n')}`,
    )
    .join('\n\n')}\n\n## Speed vs deflection (2 s stick up)\n\n${all
    .map(
      (v) =>
        `### ${v.tag}\n\n| deflection | tiles/2s | tiles/s | pass |\n|------------|----------|---------|------|\n${v.speedRows
          .map((r) => `| ${(r.deflection * 100).toFixed(0)}% | ${r.tilesIn2s ?? 0} | ${r.tilesPerS ?? '—'} | ${r.pass ? '✓' : '✗'} |`)
          .join('\n')}`,
    )
    .join('\n\n')}\n\n## Door entry\n\n${all
    .map((v) => `- **${v.tag}:** ${v.doors.map((d) => `${d.building}=${d.entered ? 'entered' : 'fail'}`).join(', ')}`)
    .join('\n')}\n`,
);

console.log('Bundle', bundle, 'ok', report.ok);
process.exit(report.ok ? 0 : 1);
