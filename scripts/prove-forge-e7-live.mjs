#!/usr/bin/env node
/**
 * Forge QA e7 — deployed preview-edificios only, no __playtestQa hooks.
 */
import { chromium, devices } from 'playwright';

const BASE =
  process.env.DEPLOY_URL ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/';

const INTRO_SNIPPET = 'welcome to my studio';

async function waitMap(page, ms = 45000) {
  await page.waitForFunction(
    () => document.querySelector('#game-canvas') && document.querySelector('.chrome'),
    null,
    { timeout: ms },
  );
  await page.waitForTimeout(1200);
}

async function bundleHash(page) {
  return page.evaluate(() => {
    const js = [...document.querySelectorAll('script[src*="assets/index-"]')].map((s) => s.src);
    const css = [...document.querySelectorAll('link[href*="assets/index-"]')].map((l) => l.href);
    return { js, css };
  });
}

async function langCenters(page) {
  return page.evaluate(() => {
    const out = {};
    for (const btn of document.querySelectorAll('.chrome__lang-opt')) {
      const r = btn.getBoundingClientRect();
      out[btn.dataset.lang] = { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    }
    return out;
  });
}

async function hit(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const lang = el.closest('.chrome__lang-opt');
      const rail = el.closest('.chrome__rail button');
      const dock = el.closest('.chrome__dock button');
      const tools = el.closest('.chrome__tools-phone button');
      const target = lang ?? rail ?? dock ?? tools ?? el;
      const r = target.getBoundingClientRect();
      return {
        tag: target.tagName,
        cls: target.className?.toString?.().slice(0, 96) ?? '',
        lang: target instanceof HTMLElement ? target.dataset.lang : '',
        action: target instanceof HTMLElement ? target.dataset.action : '',
        x: r.x,
        y: r.y,
      };
    },
    { x, y },
  );
}

async function checklistBox(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.checklist');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      cls: el.className,
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      collapsed:
        el.classList.contains('checklist--collapsed') ||
        el.classList.contains('checklist--mobile-closed'),
    };
  });
}

function rectsOverlap(a, b, pad = 0) {
  if (!a || !b) return false;
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

async function tapLang(page, lang, touch = false) {
  const centers = await langCenters(page);
  const pt = centers[lang];
  if (!pt) return { ok: false, reason: 'no lang button' };
  const before = await page.evaluate(() => document.documentElement.lang);
  if (touch) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(280);
  const after = await page.evaluate(() => document.documentElement.lang);
  return { ok: after.startsWith(lang), before, after, pt };
}

async function dismissPhoneIntro(page) {
  await page.evaluate(() => {
    document.querySelector('[data-action="intro-close"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(500);
}

const browser = await chromium.launch();
const out = { base: BASE, pass: true, checks: [], bundle: null };

function record(name, ok, detail) {
  out.checks.push({ name, ok, ...detail });
  if (!ok) out.pass = false;
}

try {
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    out.bundle = await bundleHash(page);
    await waitMap(page);

    await page.locator('.chrome__rail [data-action="contact"]').click();
    await page.waitForTimeout(1600);
    const contactFirst = await page.evaluate((snippet) => {
      const sub = document.querySelector('.chrome__subtitle')?.textContent?.trim() ?? '';
      return {
        sub: sub.slice(0, 120),
        introSnippet: sub.toLowerCase().includes(snippet),
        flash: !!document.querySelector('#chrome-contact.chrome__contact--flash'),
      };
    }, INTRO_SNIPPET);
    record('1280 first click contact: not intro', !contactFirst.introSnippet, contactFirst);
    record('1280 first click contact: visible feedback', contactFirst.sub.length > 4 || contactFirst.flash, contactFirst);

    const lang = await langCenters(page);
    for (const action of ['home', 'cases', 'achievements']) {
      await page.locator(`.chrome__rail [data-action="${action}"]`).click();
      await page.waitForTimeout(350);
      const cl = await checklistBox(page);
      const enHit = lang.en ? await hit(page, lang.en.x, lang.en.y) : null;
      record(`1280 split (${action}): checklist collapsed`, cl?.collapsed === true && (cl?.h ?? 999) < 100, { cl });
      record(`1280 split (${action}): EN hit-test`, enHit?.lang === 'en', { enHit });
      const r = await tapLang(page, 'en');
      record(`1280 split (${action}): EN → en`, r.ok, r);
      await page.locator('.chrome__column [data-action="hide-panel"]').click({ timeout: 8000 });
      await page.waitForTimeout(250);
    }

    await page.locator('.chrome__rail [data-action="search"]').click();
    await page.waitForTimeout(300);
    const searchLabel = await page.evaluate(() =>
      document.querySelector('.chrome__rail [data-action="search"]')?.getAttribute('aria-label') ?? '',
    );
    record('1280: search opens split (stub)', (await page.evaluate(() => document.body.dataset.layout)) === 'split', {
      searchLabel,
    });
    record('1280: search aria is Search/Buscar', /^(Search|Buscar)$/i.test(searchLabel.trim()), {
      searchLabel,
    });

    const cvHref = await page.evaluate(() => {
      const a = document.querySelector('.chrome__column a[download]');
      return a?.getAttribute('href') ?? '';
    });
    record('1280: CV href is bundled PDF', cvHref.includes('cv/adonay-lizardo-cv.pdf'), { cvHref });
    await page.locator('.chrome__rail [data-action="download"]').click();
    await page.waitForTimeout(300);
    record('1280: CV download uses PDF href', cvHref.includes('cv/adonay-lizardo-cv.pdf'), { cvHref });

    await page.goto(`${BASE}#view=x=0&y=0&z=0.85&in=biblioteca`, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await page.waitForTimeout(600);
    const subBib = await page.evaluate(() => document.querySelector('.chrome__subtitle')?.textContent?.trim() ?? '');
    record('1280 biblioteca hash: no intro subtitle', !subBib.toLowerCase().includes(INTRO_SNIPPET), { subBib });

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await page.mouse.click(640, 400);
    await page.waitForTimeout(200);
    await page.locator('.chrome__rail [data-action="cases"]').click();
    await page.waitForTimeout(300);
    await page.locator('.chrome__column .chrome__case-row[data-locate="volaris"]').click();
    await page.waitForTimeout(3500);
    const subPreview = await page.evaluate(() => document.querySelector('.chrome__subtitle')?.textContent?.trim() ?? '');
    const previewOpen = await page.evaluate(() =>
      document.querySelector('.building-panel--preview.building-panel--open'),
    );
    record('1280 door path: preview open', !!previewOpen, {});
    record('1280 door path: no intro during preview', !subPreview.toLowerCase().includes(INTRO_SNIPPET), {
      subPreview,
    });
    await page.locator('.case-preview__x[data-close]').click({ timeout: 8000 });
    let subAfter = '';
    for (let i = 0; i < 24; i++) {
      subAfter = await page.evaluate(() => document.querySelector('.chrome__subtitle')?.textContent?.trim() ?? '');
      if (subAfter.toLowerCase().includes(INTRO_SNIPPET)) break;
      await page.waitForTimeout(500);
    }
    record('1280: intro plays after preview close', subAfter.toLowerCase().includes(INTRO_SNIPPET), { subAfter });

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(400);
    await page.mouse.move(900, 400);
    await page.waitForTimeout(800);
    const bibErrors = errors.filter((m) => m.includes('biblioteca') && m.includes('lejos'));
    record('1280: no biblioteca hover/lejos errors', bibErrors.length === 0, { count: bibErrors.length, sample: bibErrors[0] });

    const skel = await page.evaluate(
      () => document.querySelectorAll('.chrome__skeleton, .chrome__skeleton-stack:not([aria-hidden="true"])').length,
    );
    record('1280: no skeleton bars in chrome', skel === 0, { skel });

    {
      const nopePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await nopePage.goto(`${BASE}#view=x=0&y=0&z=0.85&in=nope`, { waitUntil: 'networkidle', timeout: 90000 });
      await nopePage.waitForFunction(
        () => (document.getElementById('playtest-toast')?.textContent?.trim()?.length ?? 0) > 0,
        null,
        { timeout: 20000 },
      );
      await nopePage.waitForTimeout(500);
      const nope = await nopePage.evaluate(() => ({
        toast: document.getElementById('playtest-toast')?.textContent?.trim() ?? '',
        labels: document.querySelectorAll('.building-map-label').length,
      }));
      record('1280 #in=nope: toast + map labels', nope.toast.length > 0 && nope.labels > 0, { nope });
      await nopePage.close();
    }

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await page.locator('.chrome__rail [data-action="cases"]').click();
    await page.waitForTimeout(350);
    await page.locator('.chrome__column .chrome__case-row[data-locate="volaris"]').click();
    await page.waitForTimeout(3500);
    const stack = await page.evaluate(() => {
      const sheet = document.querySelector('.building-panel--preview .building-panel__sheet');
      const sr = sheet?.getBoundingClientRect();
      const caseRow = document.querySelector('.chrome__case-row[data-locate="bain"]');
      const cr = caseRow?.getBoundingClientRect();
      const hit = cr ? document.elementFromPoint(cr.x + cr.width / 2, cr.y + cr.height / 2) : null;
      return {
        sheetLeft: sr?.x ?? 0,
        hitCaseRow: !!hit?.closest('.chrome__case-row'),
        layout: document.body.dataset.layout,
      };
    });
    record('1280 split+preview: sheet right of column', stack.sheetLeft >= 490, stack);
    record('1280 split+preview: casos row hit-test', stack.hitCaseRow, stack);

    const captionDuringPreview = await page.evaluate(() => {
      const sub = document.querySelector('.chrome__subtitle');
      const readBtn = document.querySelector('.case-preview__read, [data-i18n="panel.readCase"]')?.closest('a, button');
      const sr = sub?.getBoundingClientRect();
      const br = readBtn?.getBoundingClientRect();
      const subVisible = sub && getComputedStyle(sub).display !== 'none' && (sub.textContent?.trim()?.length ?? 0) > 0;
      const overlap =
        subVisible &&
        sr &&
        br &&
        !(sr.right <= br.left || br.right <= sr.left || sr.bottom <= br.top || br.bottom <= sr.top);
      return { subVisible, overlap, subDisplay: sub ? getComputedStyle(sub).display : null };
    });
    record('1280 split+preview: caption not over read case', !captionDuringPreview.overlap, captionDuringPreview);

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await page.locator('.chrome__column [data-action="hide-panel"]').click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('.chrome__view-btns [data-view="map"]').click();
    await page.waitForTimeout(500);
    const beforeCenter = await page.evaluate(() => document.getElementById('game-canvas')?.dataset.mapOverview);
    await page.locator('.chrome__views [data-action="center"]').click({ force: true });
    await page.waitForTimeout(350);
    const afterCenter = await page.evaluate(() => document.getElementById('game-canvas')?.dataset.mapOverview);
    record('1280 map overview: center exits overview', beforeCenter === '1' && afterCenter !== '1', {
      beforeCenter,
      afterCenter,
    });

    await page.goto(`${BASE}#view=x=0&y=0&z=0.85&in=biblioteca`, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await page.waitForTimeout(1500);
    const writings = await page.evaluate(() => {
      const text = document.querySelector('.experience')?.textContent ?? '';
      const ph = /placeholder|Título del artículo/i.test(text);
      const badges = [...document.querySelectorAll('.experience__section-count')].map((b) => b.textContent);
      const rows = document.querySelectorAll('.experience__row').length;
      return { ph, badges, rows, sample: text.slice(0, 120) };
    });
    record('1280 biblioteca: no writings placeholders', !writings.ph, writings);
    record(
      '1280 biblioteca: badge is full total (≥ visible rows)',
      writings.badges.length > 0 &&
        Number(writings.badges[0]) >= writings.rows &&
        Number(writings.badges[0]) >= 5,
      writings,
    );

    const railActions = ['home', 'cases', 'achievements', 'contact', 'search', 'sound', 'download'];
    for (const action of railActions) {
      const btn = page.locator(`.chrome__rail [data-action="${action}"]`).first();
      const box = await btn.boundingBox().catch(() => null);
      if (!box) continue;
      const h = await hit(page, box.x + box.width / 2, box.y + box.height / 2);
      record(`1280 rail fresh: ${action} hit`, h?.action === action || (action === 'home' && h?.action === 'home'), { h });
    }

    await page.close();
  }

  {
    const ctx = await browser.newContext({ ...devices['iPhone 12 Pro'], viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    const langFresh = await langCenters(page);
    const clFresh = await checklistBox(page);
    const enBox = langFresh.en
      ? { x: langFresh.en.x - langFresh.en.w / 2, y: langFresh.en.y - langFresh.en.h / 2, w: langFresh.en.w, h: langFresh.en.h }
      : null;
    record(
      '390 fresh: checklist clear of EN',
      clFresh && enBox ? !rectsOverlap(clFresh, enBox, 2) : false,
      { clFresh, enBox },
    );
    record(
      '390 fresh: checklist not over EN corner',
      clFresh && enBox ? !rectsOverlap(clFresh, enBox, 2) : true,
      clFresh,
    );
    await dismissPhoneIntro(page);
    const clDock = await checklistBox(page);
    record(
      '390 dock: checklist above bottom bar',
      (clDock?.y ?? 0) + (clDock?.h ?? 0) < 780,
      { clDock },
    );
    const casesBtn = await page.evaluate(() => {
      const b = document.querySelector('.chrome__dock [data-action="cases"]');
      const r = b?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (casesBtn) {
      await page.touchscreen.tap(casesBtn.x, casesBtn.y);
      await page.waitForTimeout(450);
      const casos = await page.evaluate(() => {
        const row = document.querySelector('#chrome-mobile-casos .chrome__case-row');
        const r = row?.getBoundingClientRect();
        return {
          expanded: document.querySelector('.chrome__intro--expanded') !== null,
          w: r?.width ?? 0,
          h: r?.height ?? 0,
        };
      });
      record('390 Casos: expanded sheet + tappable row', casos.expanded && casos.w > 40 && casos.h > 20, casos);
    }
    const zoomBefore = await page.evaluate(() => Number(document.getElementById('game-canvas')?.dataset.zoom ?? 0));
    const mapBtn = await page.evaluate(() => {
      const b = document.querySelector('.chrome__view-btns [data-view="map"]');
      const r = b?.getBoundingClientRect();
      return r && r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (mapBtn) {
      await page.touchscreen.tap(mapBtn.x, mapBtn.y);
      await page.waitForTimeout(450);
      const mapState = await page.evaluate(() => ({
        zoom: Number(document.getElementById('game-canvas')?.dataset.zoom ?? 0),
        overview: document.getElementById('game-canvas')?.dataset.mapOverview,
      }));
      record(
        '390 Mapa: overview changes zoom',
        mapState.overview === '1' && Math.abs(mapState.zoom - zoomBefore) > 0.008,
        { zoomBefore, ...mapState },
      );
    }
    const ring = await page.evaluate(() => {
      const b = document.querySelector('.checklist__ring-btn');
      const r = b?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (ring) {
      await page.touchscreen.tap(ring.x, ring.y);
      await page.waitForTimeout(350);
      const clExp = await checklistBox(page);
      record(
        '390 checklist expanded: anchored low (bottom sheet)',
        (clExp?.y ?? 0) > 350 && !clExp?.collapsed,
        clExp,
      );
      await page.touchscreen.tap(ring.x, ring.y);
    }
    const lang = await langCenters(page);
    const enHit = lang.en ? await hit(page, lang.en.x, lang.en.y) : null;
    record('390: EN hit-test', enHit?.lang === 'en', { enHit });
    record('390: EN tap → en', (await tapLang(page, 'en', true)).ok, {});

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await dismissPhoneIntro(page);
    const contactPt = await page.evaluate(() => {
      const b = document.querySelector('.chrome__dock [data-action="contact"]');
      const r = b?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (contactPt) {
      await page.touchscreen.tap(contactPt.x, contactPt.y);
      await page.waitForTimeout(2200);
      const contactState = await page.evaluate((snippet) => {
        const sub = document.querySelector('.chrome__subtitle')?.textContent?.trim() ?? '';
        return {
          sub,
          aboutOpen: !!document.querySelector('.about-panel--open'),
          flash: !!document.querySelector('.about-panel__contact--flash'),
          introSnippet: sub.toLowerCase().includes(snippet),
        };
      }, INTRO_SNIPPET);
      record('390 contact tap: not intro caption', !contactState.introSnippet, contactState);
      record(
        '390 contact tap: about panel + highlight',
        contactState.aboutOpen && contactState.flash,
        contactState,
      );
    }
    await page.close();
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await dismissPhoneIntro(page);
    const clLand = await checklistBox(page);
    const langLand = await langCenters(page);
    const langBox = langLand.en
      ? {
          x: langLand.en.x - langLand.en.w / 2,
          y: langLand.en.y - langLand.en.h / 2,
          w: langLand.en.w,
          h: langLand.en.h,
        }
      : null;
    record(
      '844x390: checklist clear of EN',
      clLand && langBox ? !rectsOverlap(clLand, langBox, 2) : false,
      { clLand, langBox },
    );
    record(
      '844x390 dock: checklist above bottom bar',
      (clLand?.y ?? 0) + (clLand?.h ?? 0) < 360,
      { clLand },
    );
    const casesLand = await page.evaluate(() => {
      const b = document.querySelector('.chrome__dock [data-action="cases"]');
      const r = b?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (casesLand) {
      await page.touchscreen.tap(casesLand.x, casesLand.y);
      await page.waitForTimeout(900);
      const casos = await page.evaluate(() => {
        const row = document.querySelector('#chrome-mobile-casos .chrome__case-row');
        const r = row?.getBoundingClientRect();
        return { expanded: !!document.querySelector('.chrome__intro--expanded'), w: r?.width ?? 0, h: r?.height ?? 0 };
      });
      record('844x390 Casos: visible case rows', casos.expanded && casos.w > 40 && casos.h > 20, casos);
    }
    const sound = await page.evaluate(() => {
      const b = document.querySelector('.chrome__tools-phone [data-action="sound"]');
      const r = b?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (sound) {
      const h = await hit(page, sound.x, sound.y);
      record('844x390: sound hit-test', h?.action === 'sound', { h });
      const before = await page.evaluate(() =>
        document.querySelector('[data-action="sound"]')?.getAttribute('aria-pressed'),
      );
      await page.touchscreen.tap(sound.x, sound.y);
      await page.waitForTimeout(200);
      const after = await page.evaluate(() =>
        document.querySelector('[data-action="sound"]')?.getAttribute('aria-pressed'),
      );
      record('844x390: sound toggles', before !== after, { before, after });
    }
    const center = await page.evaluate(() => {
      const b = document.querySelector('.chrome__tools-phone [data-action="center"]');
      const r = b?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (center) {
      const h = await hit(page, center.x, center.y);
      record('844x390: center not lang', h?.action === 'center', { h });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
