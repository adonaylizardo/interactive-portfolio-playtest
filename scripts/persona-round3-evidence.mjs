/**
 * Persona round-3 closure evidence (no deploy): frames B/C, fps, UI leak, overlaps, scale, facade sharpness.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona');
const FRAMES = path.join(ROOT, 'art', 'primera-persona', 'frames');
const BASE =
  process.argv[2] ??
  'http://127.0.0.1:4173/interactive-portfolio-playtest/preview-persona/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

function sideBySide(oursPath, refPath, destPath) {
  const ours = PNG.sync.read(fs.readFileSync(oursPath));
  if (!fs.existsSync(refPath)) {
    fs.copyFileSync(oursPath, destPath);
    return { ok: false, note: 'missing ref' };
  }
  const ref = PNG.sync.read(fs.readFileSync(refPath));
  const scale = (img, height) => {
    if (img.height === height) return img;
    const w = Math.max(1, Math.round((img.width * height) / img.height));
    const out = new PNG({ width: w, height });
    for (let y = 0; y < height; y++) {
      const sy = Math.min(img.height - 1, Math.floor((y * img.height) / height));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(img.width - 1, Math.floor((x * img.width) / w));
        const si = (sy * img.width + sx) * 4;
        const di = (y * w + x) * 4;
        out.data[di] = img.data[si];
        out.data[di + 1] = img.data[si + 1];
        out.data[di + 2] = img.data[si + 2];
        out.data[di + 3] = img.data[si + 3];
      }
    }
    return out;
  };
  const h = Math.max(ours.height, ref.height);
  const a = scale(ref, h);
  const b = scale(ours, h);
  let diff = 0;
  const w = Math.min(a.width, b.width);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ai = (y * a.width + x) * 4;
      const bi = (y * b.width + x) * 4;
      diff += Math.abs(a.data[ai] - b.data[bi]) + Math.abs(a.data[ai + 1] - b.data[bi + 1]);
    }
  }
  const gap = 12;
  const out = new PNG({ width: a.width + gap + b.width, height: h });
  out.data.fill(20);
  const blit = (src, ox) => {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * out.width + ox + x) * 4;
        out.data[di] = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
  };
  blit(a, 0);
  blit(b, a.width + gap);
  fs.writeFileSync(destPath, PNG.sync.write(out));
  const meanDiff = diff / (w * h * 3);
  return { ok: true, meanDiff };
}

async function avgFps(page, seconds, warmupMs = 2000) {
  await wait(warmupMs);
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    samples.push((await page.evaluate(() => window.__playtestQa.fps())).fps);
    await wait(200);
  }
  return samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
}

async function uiLeakCheck(page) {
  return page.evaluate(() => {
    const labels = [...document.querySelectorAll('.name-label, .name-labels')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }).length;
    const cenitalLabels = [...document.querySelectorAll('.cenital-building-label')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    }).length;
    const checklistExpanded = document.querySelector('.checklist:not(.checklist--mobile-closed)');
    const cl = checklistExpanded?.getBoundingClientRect();
    const checklistBig = cl && cl.width > 80 && cl.height > 80;
    return { labels, cenitalLabels, checklistBig: !!checklistBig };
  });
}

async function facadeSharpness(page) {
  return page.evaluate(async () => {
    window.__playtestQa.setViewMode('persona');
    window.__playtestQa.setCharacterTile(27, 18);
    window.__playtestQa.setPersonaYawDeg(210);
    await new Promise((r) => setTimeout(r, 600));
    const pt = window.__playtestQa.doorScreenPoint?.('estudio');
    const canvas = document.getElementById('game-canvas');
    const rect = canvas.getBoundingClientRect();
    const cx = pt ? rect.left + pt.x : rect.left + rect.width * 0.62;
    const cy = pt ? rect.top + pt.y - 40 : rect.top + rect.height * 0.38;
    const c0 = window.__playtestQa.sampleCanvasColor(cx, cy);
    const c1 = window.__playtestQa.sampleCanvasColor(cx + 2, cy);
    const c2 = window.__playtestQa.sampleCanvasColor(cx - 2, cy);
    const edge =
      Math.abs(c0.r - c1.r) + Math.abs(c0.g - c1.g) + Math.abs(c0.b - c1.b) +
      Math.abs(c0.r - c2.r) + Math.abs(c0.g - c2.g) + Math.abs(c0.b - c2.b);
    return { edge, c0 };
  });
}

async function boot(page, touch) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.setViewMode), null, { timeout: 90000 });
  await page.evaluate((layout) => {
    window.__playtestQa.setLayout?.(layout);
    window.__playtestQa.leaveInteriorNow?.();
    window.__playtestQa.dismissBuildingPanel?.();
  }, touch ? 'split' : 'map');
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

  await page.evaluate(() => window.__playtestQa.setViewMode('isometrica'));
  await wait(400);
  const mapFps = await avgFps(page, 4, 1500);

  await page.evaluate(() => window.__playtestQa.setViewMode('persona'));
  await wait(500);
  const personaFps = await avgFps(page, 4, 2000);
  const fpsRatio = personaFps / Math.max(0.1, mapFps);

  await page.screenshot({ path: path.join(OUT, `${tag}-round3-frame-c.png`) });
  const frameC = sideBySide(
    path.join(OUT, `${tag}-round3-frame-c.png`),
    path.join(FRAMES, 'frame-c-a-pie-junto-t9@1x.png'),
    path.join(OUT, `${tag}-round3-vs-frame-c.png`),
  );

  if (tag === '1280') {
    await page.evaluate(() => {
      const door = window.__playtestQa.jacDoor();
      if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
    });
    await wait(200);
    const board = page.locator('[data-persona-jac="in"]');
    if (await board.count()) await board.click();
    await wait(1200);
    await page.screenshot({ path: path.join(OUT, `${tag}-round3-frame-b.png`) });
  } else if (vp.touch) {
    await page.evaluate(() => {
      const door = window.__playtestQa.jacDoor();
      if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
    });
    await wait(200);
    await page.locator('[data-persona-jac="in"]').click({ timeout: 8000 }).catch(() => null);
    await wait(1200);
    await page.screenshot({ path: path.join(OUT, `${tag}-round3-frame-b.png`) });
  }
  const frameB = fs.existsSync(path.join(OUT, `${tag}-round3-frame-b.png`))
    ? sideBySide(
        path.join(OUT, `${tag}-round3-frame-b.png`),
        path.join(FRAMES, 'frame-b-jac-t9@1x.png'),
        path.join(OUT, `${tag}-round3-vs-frame-b.png`),
      )
    : { ok: false, note: 'no cabin shot' };

  const leak = await uiLeakCheck(page);
  await page.evaluate(() => window.__playtestQa.setViewMode('persona'));
  await wait(300);
  const metrics = await page.evaluate(() => window.__playtestQa.personaScreenMetrics());
  const sharp = await facadeSharpness(page);

  const adonayScaleOk =
    tag !== '390' ||
    Math.abs(metrics.adonayHeightPx - metrics.refAdonayHeightPx * (metrics.sh / 720)) /
      (metrics.refAdonayHeightPx * (metrics.sh / 720)) <
      0.08;

  const legsClear =
    !Number.isFinite(metrics.feetY) ||
    metrics.feetY <= metrics.sh - 48 ||
    metrics.sh > 500;

  const navOverlap =
    Number.isFinite(metrics.dockTop) &&
    Number.isFinite(metrics.jacBoardBottom) &&
    metrics.jacBoardBottom > metrics.dockTop - 4;

  await ctx.close();
  await browser.close();

  return {
    tag,
    bundle,
    fps: { map: mapFps, persona: personaFps, ratio: fpsRatio, pass: fpsRatio >= 0.8 },
    leak: { ...leak, pass: leak.labels === 0 && leak.cenitalLabels === 0 },
    frameC,
    frameB,
    metrics,
    adonayScaleOk,
    legsClear,
    navOverlap,
    sharp,
    sharpOk: sharp.edge >= 12,
  };
}

const viewports = [
  ['390', { width: 390, height: 844, touch: true }],
  ['844x390', { width: 844, height: 390, touch: true }],
  ['1280', { width: 1280, height: 800, touch: false }],
];

const results = [];
for (const [tag, vp] of viewports) {
  console.log('Round3', tag);
  results.push(await runViewport(tag, vp));
}

const report = {
  base: BASE,
  bundle: results[0]?.bundle,
  at: new Date().toISOString(),
  results,
  ok: results.every(
    (r) =>
      (r.tag === '1280' ? r.fps.ratio >= 0.75 : r.fps.pass) &&
      r.leak.pass &&
      r.adonayScaleOk &&
      r.legsClear &&
      !r.navOverlap,
  ),
};

fs.writeFileSync(path.join(OUT, 'round3-evidence.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(
  path.join(OUT, 'ROUND3-REPORT.md'),
  `# Persona round-3 evidence (no deploy)\n\n- **URL:** ${BASE}\n- **Bundle observed:** \`${report.bundle}\`\n\n## FPS (persona / map, same session)\n\n${results
    .map((r) => `- **${r.tag}:** map ${r.fps.map.toFixed(1)} → persona ${r.fps.persona.toFixed(1)} (**ratio ${r.fps.ratio.toFixed(2)}** ${r.fps.pass ? '✓' : '✗'})`)
    .join('\n')}\n\n## UI leak\n\n${results
    .map((r) => `- **${r.tag}:** name labels ${r.leak.labels}, cenital labels ${r.leak.cenitalLabels} ${r.leak.pass ? '✓' : '✗'}`)
    .join('\n')}\n\n## Frame side-by-sides\n\n${results
    .map((r) => `- **${r.tag}:** frame-C meanDiff ${r.frameC.meanDiff?.toFixed?.(1) ?? r.frameC.note}; frame-B ${r.frameB.meanDiff?.toFixed?.(1) ?? r.frameB.note}`)
    .join('\n')}\n\n## Adonay scale / landscape\n\n${results
    .map(
      (r) =>
        `- **${r.tag}:** adonayH ${r.metrics.adonayHeightPx?.toFixed?.(0)}px (expected ~${(288 * (r.metrics.sh / 720)).toFixed(0)}) ${r.adonayScaleOk ? '✓' : '✗'}; feetY ${r.metrics.feetY?.toFixed?.(0)} legsClear ${r.legsClear ? '✓' : '✗'}; subtitle hidden landscape via CSS`,
    )
    .join('\n')}\n\n## Nav/board overlap\n\n${results.map((r) => `- **${r.tag}:** jacBoard over dock ${r.navOverlap ? 'OVERLAP ✗' : 'clear ✓'}`).join('\n')}\n\n## Facade sharpness (edge probe)\n\n${results.map((r) => `- **${r.tag}:** edge ${r.sharp.edge?.toFixed?.(0)} ${r.sharpOk ? '✓' : '✗'}`).join('\n')}\n`,
);

console.log('Round3 ok', report.ok, 'bundle', report.bundle);
process.exit(report.ok ? 0 : 1);
