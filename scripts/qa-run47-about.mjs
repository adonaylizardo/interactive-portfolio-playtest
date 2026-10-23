/**
 * Run #47 Estudio panel (deploy gate):
 *  - no placeholder copy ("Caso de ejemplo [falta]", "Contenido provisional …") in the panel
 *  - "About me" follows the "Worked with" strip, and shows about.md line for line
 *    (headings, paragraphs, emoji, links), with the two typos fixed
 *  - photos 01-05 in page order, lazy-loaded WebP (transparent PNGs keep their alpha), never wider
 *    than the panel; links open the absolute URLs in a new tab
 *  - readable at 390 and 1280 (font sizes, no sideways scroll) and the panel scrolls to the last line
 *  - one close control ("Exit") on desktop and phones, at the sheet's top and uncovered both before
 *    and after scrolling to the end; a real click / tap on it there leaves the room
 *  - the section only shows in the Estudio
 *  - phones: Noah's tap box is 1.5x his frame (plus padding), and a tap in the added margin reaches him
 *  - desktop (Chromium and WebKit, real mouse and keyboard): hovering Noah shows his "…" bubble and
 *    the pointer cursor, a click that drifts 8 px starts his climb, and so do Enter and Space beside him
 * Usage: imported by qa-smoke.mjs; `node scripts/qa-run47-about.mjs [--shots] [url]` runs it alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { PNG } from 'pngjs';
import { launchBrowser, waitForBuildingPanelSettled } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);

export const RUN47_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } } },
  'webkit-1280': { type: webkit, options: { viewport: { width: 1280, height: 800 } } },
  'chromium-390': {
    type: chromium,
    options: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    phone: true,
  },
  'webkit-iphone': { type: webkit, options: { ...devices['iPhone 13'] }, phone: true },
};

const PHOTOS = ['01', '02', '03', '04', '05'];
/** Noah's frame cell and hit padding in art px (src/data/noah.json, src/game/noah.ts). */
const NOAH_CELL = { w: 24, h: 36 };
const NOAH_PAD = 4;

/** about.md as [tag, text] in reading order: what the panel should show. */
function expectedLines() {
  const md = fs.readFileSync(path.join(ROOT, 'src/data/about.md'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const chunk of md.split(/\n\s*\n/)) {
    const lines = chunk.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    const h = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
    if (h && lines.length === 1) out.push([`h${h[1].length + 3}`, h[2].replace(/\s+/g, ' ').trim()]);
    else if (/^!\[/.test(lines[0])) out.push(['img', /photos\/(\d+)\./.exec(lines[0])[1]]);
    else out.push(['p', lines.map((l) => l.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1')).join(' ').replace(/\s+/g, ' ').trim()]);
  }
  return out;
}

/** Static checks on the shipped files: alpha kept, sizes web-friendly. */
function fileChecks(errors) {
  const dir = path.join(ROOT, 'public/about');
  const sizes = [];
  for (const id of PHOTOS) {
    const webp = path.join(dir, `${id}.webp`);
    if (!fs.existsSync(webp)) {
      errors.push(`run47-files: public/about/${id}.webp missing`);
      continue;
    }
    const buf = fs.readFileSync(webp);
    sizes.push(`${id} ${(buf.length / 1024).toFixed(0)} KB`);
    if (buf.length > 160 * 1024) errors.push(`run47-files: ${id}.webp is ${(buf.length / 1024).toFixed(0)} KB (want <= 160 KB)`);
    const png = path.join(dir, `${id}.png`);
    if (fs.existsSync(png)) {
      const p = PNG.sync.read(fs.readFileSync(png));
      let clear = 0;
      for (let i = 3; i < p.data.length; i += 4) if (p.data[i] < 255) clear++;
      if (!clear) errors.push(`run47-files: ${id}.png lost its transparency`);
      // VP8X header flag 0x10 = the WebP carries an alpha channel.
      const alpha = buf.toString('ascii', 12, 16) === 'VP8X' && (buf[20] & 0x10) !== 0;
      if (!alpha) errors.push(`run47-files: ${id}.webp has no alpha channel (its PNG is transparent)`);
    }
  }
  return sizes.join(', ');
}

async function readPanel(page) {
  return qa(page, () => {
    const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
    const sheet = document.querySelector('.building-panel__sheet');
    const about = document.querySelector('.about');
    const strip = document.querySelector('.worked-with');
    const lines = [...(about?.querySelectorAll('h4, h5, h6, p.about__text, picture img') ?? [])].filter(shown).map((el) =>
      el.tagName === 'IMG'
        ? ['img', /about\/(\d+)\./.exec(el.getAttribute('src'))?.[1] ?? el.getAttribute('src')]
        : [el.tagName.toLowerCase(), el.innerText.replace(/\s+/g, ' ').trim()],
    );
    const texts = [...(about?.querySelectorAll('p.about__text') ?? [])].filter(shown);
    const links = [...(about?.querySelectorAll('a') ?? [])].map((a) => ({ href: a.href, target: a.target, rel: a.rel, text: a.textContent }));
    const imgs = [...(about?.querySelectorAll('picture img') ?? [])].map((i) => ({
      loading: i.loading,
      w: i.getBoundingClientRect().width,
      source: i.parentElement.querySelector('source')?.type ?? '',
    }));
    const box = (el) => (el ? el.getBoundingClientRect() : null);
    const cs = about ? getComputedStyle(about) : null;
    return {
      shown: shown(about),
      sheetText: sheet?.innerText ?? '',
      stripShown: shown(strip),
      stripLogos: strip?.querySelectorAll('img').length ?? 0,
      stripBottom: box(strip)?.bottom ?? 0,
      aboutTop: box(about)?.top ?? 0,
      contentW: about ? about.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : 0,
      lines,
      minFont: texts.length ? Math.min(...texts.map((el) => parseFloat(getComputedStyle(el).fontSize))) : 0,
      links,
      imgs,
      text: about?.innerText ?? '',
      sheet: { scrollH: sheet.scrollHeight, clientH: sheet.clientHeight, overflowX: sheet.scrollWidth - sheet.clientWidth },
      pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

function compare(tag, got, want, errors) {
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) {
    const g = got[i];
    const w = want[i];
    if (!g || !w || g[0] !== w[0] || g[1] !== w[1]) {
      errors.push(`${tag}: line ${i + 1} is ${g ? `<${g[0]}> "${g[1].slice(0, 70)}"` : 'missing'}, want ${w ? `<${w[0]}> "${w[1].slice(0, 70)}"` : 'nothing'}`);
      return false;
    }
  }
  return true;
}

/** Scrolls every photo into view and waits for it; returns what each one loaded. */
async function loadPhotos(page) {
  const out = [];
  for (let i = 0; i < PHOTOS.length; i++) {
    const loc = page.locator('.about picture img').nth(i);
    await loc.scrollIntoViewIfNeeded();
    await loc.evaluate((img) => (img.complete && img.naturalWidth ? null : new Promise((r) => (img.onload = img.onerror = r))));
    out.push(await loc.evaluate((img) => ({ src: img.currentSrc, natural: img.naturalWidth, w: img.getBoundingClientRect().width })));
  }
  return out;
}

async function lastLineInView(page) {
  return qa(page, () => {
    const sheet = document.querySelector('.building-panel__sheet').getBoundingClientRect();
    const last = [...document.querySelectorAll('.about p.about__text')].at(-1);
    if (!last) return false;
    const r = last.getBoundingClientRect();
    return r.top >= sheet.top - 1 && r.bottom <= Math.min(sheet.bottom, window.innerHeight) + 1;
  });
}

/** Phones: a tap just inside the 1.5x box, outside the old 1x box, still reaches Noah. */
/**
 * The room sheet's way out: one visible control on desktop and phones alike, near the sheet's top
 * and under the pointer (not covered) wherever the text is scrolled.
 */
async function exitControl(page) {
  return qa(page, () => {
    const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const buttons = [...document.querySelectorAll('.building-panel button')].filter(shown);
    const exit = document.querySelector('.building-panel [data-exit]');
    const r = exit?.getBoundingClientRect();
    const s = document.querySelector('.building-panel__sheet').getBoundingClientRect();
    const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      labels: buttons.map((b) => b.textContent.trim()),
      fromTop: r ? Math.round(r.top - Math.max(s.top, 0)) : null,
      inSheet: !!r && r.left >= s.left && r.right <= s.right + 0.5,
      onTop: !!hit && exit.contains(hit),
    };
  });
}

function exitControlErrors(tag, where, c, errors) {
  if (c.labels.length !== 1 || c.labels[0] !== 'Exit') errors.push(`${tag}: ${where}: visible panel controls ${JSON.stringify(c.labels)}, want just "Exit"`);
  if (c.fromTop == null || c.fromTop < 0 || c.fromTop > 48) errors.push(`${tag}: ${where}: Exit is ${c.fromTop}px below the sheet top, want it at the top`);
  if (!c.inSheet) errors.push(`${tag}: ${where}: Exit is outside the sheet`);
  if (!c.onTop) errors.push(`${tag}: ${where}: something covers Exit`);
}

async function noahTapCheck(page, spec, tag, errors) {
  const n0 = await qa(page, () => window.__playtestQa.noah());
  if (!n0?.loaded) {
    errors.push(`${tag}: Noah did not load`);
    return '';
  }
  const k = spec.phone ? 1.5 : 1;
  const wantW = (NOAH_CELL.w + 2 * NOAH_PAD) * k * n0.scale;
  const wantH = (NOAH_CELL.h + 2 * NOAH_PAD) * k * n0.scale;
  if (Math.abs(n0.hit.w - wantW) > 0.5 || Math.abs(n0.hit.h - wantH) > 0.5) {
    errors.push(`${tag}: Noah's tap box is ${n0.hit.w}x${n0.hit.h} world px, want ${wantW}x${wantH} (${k}x)`);
  }
  if (!spec.phone) return `Noah tap box ${n0.hit.w}x${n0.hit.h} (1x)`;
  const far = await qa(page, (n) => {
    const q = window.__playtestQa;
    const nx = Math.round(n.fx);
    const ny = Math.round(n.fy);
    for (const [dx, dy] of [[4, 2], [3, 3], [5, 1], [2, 4], [4, 4], [6, 0], [0, 5], [-3, 4]]) {
      const x = nx + dx;
      const y = ny + dy;
      if (q.findPath(x, y, x, y) && q.findPath(x, y, nx + 1, ny + 1)) return { x, y };
    }
    return null;
  }, n0);
  if (!far) {
    errors.push(`${tag}: no walkable tile a few tiles from Noah`);
    return '';
  }
  await qa(page, ([x, y]) => window.__playtestQa.setCharacterTile(x, y), [far.x, far.y]);
  await qa(page, ([x, y]) => window.__playtestQa.frameWorld(x + 40, y - 40, 0.5), [n0.x, n0.y]);
  await wait(400);
  const n1 = await qa(page, () => window.__playtestQa.noah());
  // Halfway between the old 1x edge and the new 1.5x edge, on the right of his frame.
  const cx = n1.hit.x + n1.hit.w / 2;
  const cy = n1.hit.y + n1.hit.h / 2;
  const half1x = ((NOAH_CELL.w + 2 * NOAH_PAD) / 2) * n1.scale;
  const wx = cx + (half1x + n1.hit.w / 2) / 2;
  const pt = await qa(page, ([x, y]) => window.__playtestQa.worldToClient(x, y), [wx, cy]);
  const target = await qa(page, ([x, y]) => window.__playtestQa.pixiTargetAt(x, y), [Math.round(pt.x), Math.round(pt.y)]);
  await page.touchscreen.tap(Math.round(pt.x), Math.round(pt.y));
  const started = await page
    // The walk to his talk tile runs at a few fps on software-GL WebKit at DPR 3 (CI).
    .waitForFunction(() => window.__playtestQa.noah().phase !== 'idle', null, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  if (!started) {
    const s = await qa(page, () => ({
      tile: window.__playtestQa.getCharacterTile(),
      goal: document.getElementById('game-canvas')?.dataset.walkGoal,
      phase: window.__playtestQa.noah().phase,
    }));
    errors.push(
      `${tag}: a tap ${(wx - cx).toFixed(0)} world px right of Noah (inside the 1.5x box) did not reach him ` +
        `(Pixi target ${target}, player ${far.x},${far.y} -> ${s.tile.x},${s.tile.y}, walk goal ${s.goal || 'none'}, Noah ${s.phase})`,
    );
  }
  return `Noah tap box ${n1.hit.w}x${n1.hit.h} (1.5x), tap in the added margin ${started ? 'reaches him' : 'MISSES'}`;
}

async function placePlayerByNoah(page, offsets) {
  return qa(
    page,
    (offsets) => {
      const q = window.__playtestQa;
      const n = q.noah();
      for (const [dx, dy] of offsets) {
        const x = Math.round(n.fx) + dx;
        const y = Math.round(n.fy) + dy;
        if (q.findPath(x, y, x, y) && q.findPath(x, y, Math.round(n.fx) + 1, Math.round(n.fy) + 1)) {
          q.setCharacterTile(x, y);
          return { x, y };
        }
      }
      return null;
    },
    offsets,
  );
}

const noahStarted = (page) =>
  page
    .waitForFunction(() => window.__playtestQa.noah().phase !== 'idle', null, { timeout: 12000 })
    .then(() => true)
    .catch(() => false);

/**
 * Desktop, real mouse and keyboard (Adonay's Mac report): hovering Noah shows the "…" bubble and the
 * pointer cursor; a click whose press drifts a few px (a trackpad click) still walks over and starts
 * his climb; Enter and Space beside him start it too.
 */
async function noahDesktopCheck(page, base, tag, errors) {
  const parts = [];
  const far = await placePlayerByNoah(page, [[4, 2], [3, 3], [5, 1], [2, 4]]);
  if (!far) {
    errors.push(`${tag}: no walkable tile a few tiles from Noah`);
    return '';
  }
  await wait(1500);
  const n = await qa(page, () => window.__playtestQa.noah());
  const x = Math.round(n.client.x);
  const y = Math.round(n.client.y);
  await page.mouse.move(x - 160, y + 40);
  await page.mouse.move(x, y, { steps: 8 });
  await wait(200);
  const hover = await qa(page, () => ({
    bubble: window.__playtestQa.noah().bubble,
    cursor: getComputedStyle(document.getElementById('game-canvas')).cursor,
  }));
  if (!hover.bubble) errors.push(`${tag}: hovering Noah does not show his "…" bubble`);
  if (hover.cursor !== 'pointer') errors.push(`${tag}: cursor over Noah is ${hover.cursor}, want pointer`);
  await page.mouse.down();
  await page.mouse.move(x + 7, y + 4, { steps: 3 });
  await wait(60);
  await page.mouse.up();
  const clicked = await noahStarted(page);
  const c = await qa(page, () => window.__playtestQa.getCharacterPos());
  if (!clicked) errors.push(`${tag}: a mouse click on Noah that drifts 8 px did not start his climb (player at ${c.x.toFixed(2)},${c.y.toFixed(2)})`);
  else if (Math.hypot(c.x - n.fx, c.y - n.fy) > n.talkRange + 0.05) errors.push(`${tag}: Noah started while the player was ${Math.hypot(c.x - n.fx, c.y - n.fy).toFixed(2)} tiles away`);
  const bubbleAfter = await qa(page, () => window.__playtestQa.noah().bubble);
  if (bubbleAfter) errors.push(`${tag}: the "…" bubble stays up while Noah climbs`);
  parts.push(`hover bubble + pointer ${hover.bubble && hover.cursor === 'pointer' ? 'ok' : 'MISSING'}, 8 px-drift click from ${far.x},${far.y} ${clicked ? 'starts his climb' : 'FAILS'}`);

  for (const key of ['Enter', 'Space']) {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__playtestQa.noah?.()?.loaded, null, { timeout: 20000 });
    await wait(400);
    const near = await placePlayerByNoah(page, [[1, 1], [1, 0], [0, 1], [1, -1], [-1, 1]]);
    await wait(300);
    await page.keyboard.press(key);
    const ok = near ? await noahStarted(page) : false;
    if (!ok) errors.push(`${tag}: ${key} beside Noah${near ? ` (player at ${near.x},${near.y})` : ''} did not start his climb`);
    parts.push(`${key} beside him ${ok ? 'starts it' : 'FAILS'}`);
  }
  return parts.join(', ');
}

/**
 * @param {{ kind: keyof typeof RUN47_KINDS, base: string, errors: string[], notes: string[], shots?: string }} args
 */
export async function runRun47AboutSuite({ kind, base, errors, notes, shots }) {
  const spec = RUN47_KINDS[kind];
  const tag = `run47-${kind}-about`;
  const files = kind === 'chromium-1280' ? fileChecks(errors) : '';
  const browser = await launchBrowser(spec.type);
  const ctx = await browser.newContext(spec.options);
  const page = await ctx.newPage();
  const shot = async (name) => {
    if (!shots) return;
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, name) });
  };
  try {
    await page.goto(base, { waitUntil: 'load' });
    await wait(600);
    await page.waitForFunction(() => window.__playtestQa.noah?.()?.loaded, null, { timeout: 20000 }).catch(() => {});
    let noah = await noahTapCheck(page, spec, tag, errors);
    if (!spec.phone) noah += `; ${await noahDesktopCheck(page, base, tag, errors)}`;

    await qa(page, () => window.__playtestQa.enterInterior('estudio'));
    await waitForBuildingPanelSettled(page);
    await wait(300);
    if (spec.phone) {
      await page.locator('.building-panel__title').tap();
      await wait(500);
    }
    await shot(`estudio-${kind}.png`);
    await qa(page, () => {
      const s = document.querySelector('.building-panel__sheet');
      if (s) s.scrollTop = 0;
    });
    await wait(150);
    exitControlErrors(tag, 'panel top', await exitControl(page), errors);

    const m = await readPanel(page);
    if (!m.shown) errors.push(`${tag}: "About me" is not shown in the Estudio panel`);
    if (!m.stripShown || m.stripLogos === 0) errors.push(`${tag}: the "Worked with" strip is missing (${m.stripLogos} logos)`);
    if (m.aboutTop < m.stripBottom - 0.5) errors.push(`${tag}: "About me" starts above the end of the logo strip`);
    if (/\[falta\]|Caso de ejemplo|Contenido provisional/.test(m.sheetText)) errors.push(`${tag}: placeholder copy still in the Estudio panel`);
    const okText = compare(tag, m.lines, expectedLines(), errors);
    if (/entrepeneur|\bI countered\b/.test(m.text)) errors.push(`${tag}: a typo from about.md is still shown`);
    if (!m.text.includes('my entrepreneur background') || !m.text.includes('I encountered a community')) errors.push(`${tag}: the fixed sentences are missing`);
    if (m.links.length !== 5) errors.push(`${tag}: ${m.links.length} links, want 5`);
    for (const l of m.links) {
      if (!/^https:\/\//.test(l.href) || l.href.includes('github.io')) errors.push(`${tag}: link "${l.text.trim()}" goes to ${l.href}`);
      if (l.target !== '_blank' || !/noopener/.test(l.rel)) errors.push(`${tag}: link "${l.text.trim()}" does not open safely in a new tab`);
    }
    if (m.imgs.length !== PHOTOS.length) errors.push(`${tag}: ${m.imgs.length} photos, want ${PHOTOS.length}`);
    if (m.imgs.some((i) => i.loading !== 'lazy' || i.source !== 'image/webp')) errors.push(`${tag}: photos are not lazy WebP <picture>s`);
    const minFont = spec.phone ? 16 : 15;
    if (m.minFont < minFont) errors.push(`${tag}: body text ${m.minFont}px (want >= ${minFont}px)`);
    if (m.sheet.overflowX > 0) errors.push(`${tag}: panel scrolls sideways by ${m.sheet.overflowX}px`);
    if (m.pageOverflowX > 0) errors.push(`${tag}: page scrolls sideways by ${m.pageOverflowX}px`);

    const loaded = await loadPhotos(page);
    loaded.forEach((p, i) => {
      if (!p.natural) errors.push(`${tag}: photo ${PHOTOS[i]} did not load (${p.src})`);
      else if (!/\.webp$/.test(p.src)) errors.push(`${tag}: photo ${PHOTOS[i]} loaded ${p.src}, want the WebP`);
      if (p.w > m.contentW + 0.5) errors.push(`${tag}: photo ${PHOTOS[i]} is ${p.w.toFixed(0)}px wide in a ${m.contentW}px panel`);
    });
    await page.locator('.about__title').scrollIntoViewIfNeeded();
    await qa(page, () => {
      const s = document.querySelector('.building-panel__sheet');
      s.scrollTop = document.querySelector('.about').offsetTop - 12;
    });
    await wait(300);
    await shot(`estudio-${kind}-about.png`);
    await qa(page, () => {
      const s = document.querySelector('.building-panel__sheet');
      s.scrollTop = s.scrollHeight;
    });
    await wait(300);
    if (!(await lastLineInView(page))) errors.push(`${tag}: the last line cannot be scrolled into view`);
    await shot(`estudio-${kind}-end.png`);
    exitControlErrors(tag, 'scrolled to the end', await exitControl(page), errors);

    const pressed = await page
      .evaluate(() => {
        const el = document.querySelector('.building-panel [data-exit]');
        if (!(el instanceof HTMLElement)) return false;
        el.click();
        return true;
      })
      .catch(() => false);
    const left =
      pressed &&
      (await page
        .waitForFunction(() => !window.__playtestQa.isInInterior() && !window.__playtestQa.isBuildingPanelOpen(), null, { timeout: 5000 })
        .then(() => true)
        .catch(() => false));
    if (!left) {
      errors.push(`${tag}: ${spec.phone ? 'tapping' : 'clicking'} Exit at the end of the text did not leave the Estudio`);
      await qa(page, () => window.__playtestQa.exitInterior());
    }
    await wait(500);
    await qa(page, () => window.__playtestQa.enterInterior('volaris'));
    await page.waitForFunction(() => window.__playtestQa.isBuildingPanelOpen(), null, { timeout: 15000 });
    await wait(300);
    const other = await readPanel(page);
    if (other.shown) errors.push(`${tag}: "About me" also shows in the airline case panel`);

    notes.push(
      `${tag}: after the logo strip (${m.stripLogos} logos), ${m.lines.length} lines ${okText ? 'match about.md' : 'DIFFER'}, ` +
        `${loaded.filter((p) => p.natural).length}/5 lazy WebP photos <= ${m.contentW}px, body ${m.minFont}px, scrolls to the last line ` +
        `with the one Exit still at the top and working; ${noah}` +
        (files ? `; files ${files}` : ''),
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const shots = args.includes('--shots') ? path.join(ROOT, 'artifacts/run47') : undefined;
  const base = args.find((a) => /^https?:/.test(a)) ?? 'https://adonaylizardo.github.io/interactive-portfolio-playtest/';
  const kinds = (args.find((a) => a.startsWith('--kinds='))?.slice(8) ?? Object.keys(RUN47_KINDS).join(',')).split(',');
  const errors = [];
  const notes = [];
  for (const kind of kinds) await runRun47AboutSuite({ kind, base, errors, notes, shots });
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(errors.length ? 1 : 0);
}
