#!/usr/bin/env node
/**
 * Charlas/Biblioteca titles must match active UI language (ES/EN).
 */
import assert from 'node:assert/strict';
import { TALKS, WRITINGS } from '../src/data/experiences.ts';
import {
  experienceItemTitleKey,
  EXPERIENCE_ITEM_TITLES_EN,
  EXPERIENCE_ITEM_TITLES_ES,
} from '../src/data/experienceItemTitles.ts';
import { tForLang } from '../src/ui/i18n.ts';

const EN_IN_ES =
  /^(How to |UX Tricks|The |Creating |Everyone |You're |Pixels in |Google's HEART)/i;
const ES_IN_EN = /[áéíóúñ¿]|^(Cómo |La |El |Todos le|Trucos |Píxeles|Método |Creando )/i;

for (const talk of TALKS) {
  assert.ok(talk.titleKey, `talk ${talk.id} missing titleKey`);
}
for (const section of WRITINGS) {
  for (const item of section.items) {
    assert.ok(item.titleKey, `writing ${item.id} missing titleKey`);
  }
}

for (const lang of ['en', 'es']) {
  const dict = lang === 'en' ? EXPERIENCE_ITEM_TITLES_EN : EXPERIENCE_ITEM_TITLES_ES;
  for (const talk of TALKS) {
    const key = experienceItemTitleKey('talks', talk.id);
    assert.equal(talk.titleKey, key);
    assert.ok(key in dict, `missing dict entry ${key}`);
    const got = tForLang(key, lang);
    const want = dict[key];
    assert.equal(got, want, `${key} @${lang}`);
    if (lang === 'es') assert.ok(!EN_IN_ES.test(got), `EN-looking talk title in ES: ${got}`);
    if (lang === 'en') assert.ok(!ES_IN_EN.test(got), `ES-looking talk title in EN: ${got}`);
  }
  for (const section of WRITINGS) {
    for (const item of section.items) {
      const key = experienceItemTitleKey('writings', item.id);
      assert.equal(item.titleKey, key);
      assert.ok(key in dict, `missing dict entry ${key}`);
      const got = tForLang(key, lang);
      const want = dict[key];
      assert.equal(got, want, `${key} @${lang}`);
      if (lang === 'es') assert.ok(!EN_IN_ES.test(got), `EN-looking writing title in ES: ${got}`);
      if (lang === 'en') assert.ok(!ES_IN_EN.test(got), `ES-looking writing title in EN: ${got}`);
    }
  }
}

console.log('test-experience-title-lang: ok');
