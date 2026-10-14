/**
 * Run #43 "Worked with" logo strip (deploy gate). Renders 17 fixture logos of mixed aspect ratios in
 * the Estudio panel, then checks at 1280 and 375:
 *  - every logo is exactly the strip height (24 px desktop, 18 px phone) with object-fit contain
 *  - logos wrap onto several rows; nothing overflows the panel or the page horizontally
 *  - even horizontal spacing between neighbours in a row
 *  - every logo starts in the same gray; hover (mouse), keyboard focus and tap (touch) reveal its
 *    real colours with a ~200 ms transition (checked on screenshot pixels), and alt = company name
 *  - the strip only shows in the Estudio panel
 *  - the real list (src/data/worked-with.json) loads every file
 * Usage: imported by qa-smoke.mjs; `node scripts/qa-run43-logos.mjs [--shots] [url]` runs it alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { installReadyWait } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);

export const RUN43_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } }, height: 24 },
  'webkit-1280': { type: webkit, options: { viewport: { width: 1280, height: 800 } }, height: 24 },
  'chromium-375': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    height: 18,
    touch: true,
  },
  'webkit-iphone': { type: webkit, options: { ...devices['iPhone 13'] }, height: 18, touch: true },
};

/** Coloured wordmark-like SVGs, widths 1:1 to 8:1, as data URIs. */
function fixtureLogos() {
  const ratios = [1, 2.2, 3.5, 5, 8, 1.6, 4, 2.8, 6, 1.2, 3, 7, 2, 4.5, 1.4, 3.8, 2.5];
  return ratios.map((r, i) => {
    const h = 40;
    const w = Math.round(h * r);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
      `<rect x="2" y="6" width="${h - 12}" height="${h - 12}" rx="6" fill="hsl(${i * 37} 70% 45%)"/>` +
      (w > h ? `<rect x="${h}" y="14" width="${w - h - 4}" height="12" rx="3" fill="hsl(${i * 37} 60% 35%)"/>` : '') +
      `</svg>`;
    return { name: `Fixture ${i + 1}`, file: `data:image/svg+xml,${encodeURIComponent(svg)}` };
  });
}

async function openEstudio(page, base) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await wait(600);
  await qa(page, () => window.__playtestQa.enterInterior('estudio'));
  await page.waitForFunction(() => window.__playtestQa.isBuildingPanelOpen(), null, { timeout: 15000 });
  await qa(page, () => window.__playtestQa.expandInteriorSheet());
  await wait(500);
}

async function measure(page) {
  return qa(page, async () => {
    const strip = document.querySelector('.worked-with');
    const imgs = [...strip.querySelectorAll('img')];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
    const sheet = document.querySelector('.building-panel__sheet');
    const list = strip.querySelector('.worked-with__logos');
    const r = (el) => {
      const b = el.getBoundingClientRect();
      return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height };
    };
    const cs = imgs[0] ? getComputedStyle(imgs[0]) : null;
    return {
      hidden: strip.hidden || getComputedStyle(strip).display === 'none',
      sheet: r(sheet),
      list: r(list),
      sheetOverflowX: sheet.scrollWidth - sheet.clientWidth,
      pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      fit: cs?.objectFit,
      transition: cs ? `${cs.transitionProperty} ${cs.transitionDuration}` : '',
      imgs: imgs.map((i) => {
        const c = getComputedStyle(i);
        return { alt: i.alt, ok: i.complete && i.naturalWidth > 0, filter: c.filter, opacity: +c.opacity, ...r(i) };
      }),
    };
  });
}

/** Max channel spread (0-255) over a logo's on-screen pixels: ~0 when gray, high when coloured. */
async function logoChroma(page, n) {
  const box = await page.locator('.worked-with__logo').nth(n).boundingBox();
  const shot = await page.screenshot({ clip: box, type: 'png' });
  return qa(
    page,
    async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let best = 0;
      for (let i = 0; i < d.length; i += 4) best = Math.max(best, Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]));
      return best;
    },
    shot.toString('base64'),
  );
}

/** Gray by default; mouse hover / keyboard focus (desktop) or tap (touch) shows the real colours. */
async function testReveal(page, spec, tag, errors) {
  const logos = page.locator('.worked-with__logo');
  const gray0 = await logoChroma(page, 0);
  const gray1 = await logoChroma(page, 1);
  if (Math.max(gray0, gray1) > 12) errors.push(`${tag}: logos are not gray by default (colour spread ${Math.max(gray0, gray1)})`);
  const settle = () => wait(320);
  const results = [];
  if (spec.touch) {
    const tap = async (n) => {
      const b = await logos.nth(n).boundingBox();
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      await settle();
    };
    await tap(0);
    const c0 = await logoChroma(page, 0);
    if (c0 < 60) errors.push(`${tag}: tapping a logo did not show its colours (spread ${c0})`);
    await tap(1);
    const [a, b] = [await logoChroma(page, 0), await logoChroma(page, 1)];
    if (a > 12 || b < 60) errors.push(`${tag}: tapping another logo should gray the first and colour the second (spreads ${a}, ${b})`);
    await tap(1);
    const off = await logoChroma(page, 1);
    if (off > 12) errors.push(`${tag}: tapping the coloured logo again did not gray it (spread ${off})`);
    await tap(1);
    results.push(`tap reveals colour (spread ${gray0} -> ${c0}), next tap moves it, second tap grays`);
  } else {
    await logos.nth(0).hover();
    await settle();
    const hov = await logoChroma(page, 0);
    const other = await logoChroma(page, 1);
    if (hov < 60) errors.push(`${tag}: hovering a logo did not show its colours (spread ${hov})`);
    if (other > 12) errors.push(`${tag}: hovering one logo coloured another (spread ${other})`);
    await page.mouse.move(5, 5);
    await settle();
    const back = await logoChroma(page, 0);
    if (back > 12) errors.push(`${tag}: logo stayed coloured after the mouse left (spread ${back})`);
    await logos.nth(0).focus();
    await page.keyboard.press('Tab');
    await settle();
    const focused = await qa(page, () => document.activeElement?.alt ?? '');
    const foc = await logoChroma(page, 1);
    if (foc < 60) errors.push(`${tag}: keyboard focus (Tab to ${focused}) did not show its colours (spread ${foc})`);
    await logos.nth(2).hover();
    await settle();
    results.push(`hover reveals colour (spread ${gray0} -> ${hov}) and grays on leave; Tab focus reveals (${foc})`);
  }
  return results.join('; ');
}

/**
 * @param {{ kind: keyof typeof RUN43_KINDS, base: string, errors: string[], notes: string[], shots?: string }} args
 */
export async function runRun43LogoSuite({ kind, base, errors, notes, shots }) {
  const spec = RUN43_KINDS[kind];
  const tag = `run43-${kind}-logos`;
  const browser = installReadyWait(await spec.type.launch());
  const ctx = await browser.newContext(spec.options);
  const page = await ctx.newPage();
  try {
    await openEstudio(page, base);
    const real = await measure(page);
    const broken = real.imgs.filter((i) => !i.ok);
    if (broken.length) errors.push(`${tag}: real logos failed to load: ${broken.map((i) => i.alt).join(', ')}`);
    if (real.imgs.length === 0 && !real.hidden) errors.push(`${tag}: empty strip is visible`);

    const fixtures = fixtureLogos();
    await qa(page, (l) => window.__playtestQa.setWorkedWith(l), fixtures);
    await wait(200);
    await page.locator('.worked-with').scrollIntoViewIfNeeded();
    await wait(200);
    const m = await measure(page);
    if (m.hidden) errors.push(`${tag}: strip hidden in the Estudio panel`);
    if (m.imgs.length !== fixtures.length) errors.push(`${tag}: ${m.imgs.length}/${fixtures.length} logos rendered`);
    const badH = m.imgs.filter((i) => Math.abs(i.h - spec.height) > 0.5);
    if (badH.length) errors.push(`${tag}: logo heights ${badH.map((i) => `${i.alt}=${i.h.toFixed(1)}`).join(', ')} (want ${spec.height}px)`);
    if (m.fit !== 'contain') errors.push(`${tag}: object-fit is ${m.fit}`);
    const looks = new Set(m.imgs.map((i) => `${i.filter} @${i.opacity}`));
    if (looks.size !== 1 || !/grayscale\(1\)/.test(m.imgs[0]?.filter ?? '') || !(m.imgs[0]?.opacity < 0.8)) {
      errors.push(`${tag}: logos do not all start in the same gray (${[...looks].join(' | ')})`);
    }
    if (!/filter/.test(m.transition) || !/0\.2s|200ms/.test(m.transition)) errors.push(`${tag}: colour reveal transition is "${m.transition}" (want filter ~200ms)`);
    const badAlt = m.imgs.filter((i, n) => i.alt !== fixtures[n].name);
    if (badAlt.length) errors.push(`${tag}: alt text ${badAlt.map((i) => `"${i.alt}"`).join(', ')} does not match the company names`);
    const out = m.imgs.filter((i) => i.l < m.list.l - 0.5 || i.r > m.list.r + 0.5 || i.l < m.sheet.l || i.r > m.sheet.r);
    if (out.length) errors.push(`${tag}: ${out.length} logo(s) stick out of the panel (${out.map((i) => i.alt).join(', ')})`);
    if (m.sheetOverflowX > 0) errors.push(`${tag}: panel scrolls sideways by ${m.sheetOverflowX}px`);
    if (m.pageOverflowX > 0) errors.push(`${tag}: page scrolls sideways by ${m.pageOverflowX}px`);
    const rows = [];
    for (const i of m.imgs) {
      const row = rows.find((rw) => Math.abs(rw.t - i.t) < 2);
      if (row) row.items.push(i);
      else rows.push({ t: i.t, items: [i] });
    }
    if (rows.length < 2) errors.push(`${tag}: ${fixtures.length} logos did not wrap (1 row)`);
    const gaps = rows.flatMap((rw) => rw.items.slice(1).map((it, n) => it.l - rw.items[n].r));
    const spread = gaps.length ? Math.max(...gaps) - Math.min(...gaps) : 0;
    if (spread > 1.5) errors.push(`${tag}: uneven spacing between logos (gaps ${Math.min(...gaps).toFixed(1)}-${Math.max(...gaps).toFixed(1)}px)`);
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: path.join(shots, `logos-fixtures-${kind}-gray.png`) });
    }
    const reveal = await testReveal(page, spec, tag, errors);
    if (shots) await page.screenshot({ path: path.join(shots, `logos-fixtures-${kind}-${spec.touch ? 'tap' : 'hover'}.png`) });

    await qa(page, () => window.__playtestQa.exitInterior());
    await wait(500);
    await qa(page, () => window.__playtestQa.enterInterior('volaris'));
    await page.waitForFunction(() => window.__playtestQa.isBuildingPanelOpen(), null, { timeout: 15000 });
    await qa(page, () => window.__playtestQa.expandInteriorSheet());
    await wait(300);
    const other = await measure(page);
    if (!other.hidden) errors.push(`${tag}: strip also shows in the Volaris panel`);
    notes.push(
      `${tag}: ${m.imgs.length} fixture logos at ${spec.height}px in ${rows.length} rows, gaps ${gaps.length ? Math.min(...gaps).toFixed(1) : '-'}px, ` +
        `no overflow; ${reveal}; real list ${real.imgs.length} logo(s) loaded; hidden outside the Estudio`,
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const shots = args.includes('--shots') ? path.join(ROOT, 'artifacts/run43') : undefined;
  const base = args.find((a) => /^https?:/.test(a)) ?? 'https://adonaylizardo.github.io/interactive-portfolio-playtest/';
  const errors = [];
  const notes = [];
  for (const kind of Object.keys(RUN43_KINDS)) await runRun43LogoSuite({ kind, base, errors, notes, shots });
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(errors.length ? 1 : 0);
}
