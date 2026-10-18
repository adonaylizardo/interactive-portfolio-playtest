# Writings spec gate (Figma metadata vs DOM)

Strict: ±2px on x/y/w/h; exact font-size, line-height, weight, and family from `scripts/data/writings-spec-typography.json`.

**Scope (automated):** writings desktop-list, phone-list, phone-reading only — first list section + first rows, desktop reader not included, phone-map/desktop-map not included. Pixel diff for those frames remains separate (≤12% info cap).

## writings-desktop-list

**Overall:** PASS

| Node | Name | Selector | Figma box | DOM box | Type | Gate |
|---|---|---|---|---|---|---|
| `199:2651` | ui/panel-encabezado | `.exp-header` | 0,0,431×65 | 0.0,0.0,431.0×65.0 | n/a | PASS |
| `199:2668` | cuerpo | `.building-panel__body-wrap` | 0,65,431×835 | 0.0,65.0,431.0×835.0 | n/a | PASS |
| `199:2669` | filtros | `.experience__filters` | 24,85,383×32 | 24.0,85.0,383.0×32.0 | n/a | PASS |
| `199:2670` | chip · All | `.experience__filter[data-writings-filter="all"]` | 24,85,44×32 | 24.0,85.0,45.0×32.0 | true | PASS |
| `199:2672` | chip · UXSC | `.experience__filter[data-writings-filter="uxsc"]` | 76,85,67×32 | 77.0,85.0,67.0×32.0 | true | PASS |
| `199:2678` | seccion · UX Sidekick Chronicles | `.experience__list > .experience__section:nth-child(1)` | 24,125,383×282 | 24.0,125.0,383.0×282.0 | n/a | PASS |
| `199:2679` | encabezado-seccion | `.experience__list > .experience__section:nth-child(1) .experience__section-row` | 24,125,383×32 | 24.0,125.0,383.0×32.0 | n/a | PASS |
| `199:2680` | nombre | `.experience__list > .experience__section:nth-child(1) .experience__section-title` | 24,129,180×24 | 24.0,129.0,179.0×24.0 | true | PASS |
| `199:2681` | conteo | `.experience__list > .experience__section:nth-child(1) .experience__section-count` | 212,132,23×18 | 211.0,132.0,23.0×18.0 | true | PASS |
| `199:2684` | ver-todo | `.experience__list > .experience__section:nth-child(1) .experience__see-all` | 354,125,53×32 | 355.0,125.0,52.0×32.0 | true | PASS |
| `199:2686` | descripcion | `.experience__list > .experience__section:nth-child(1) .experience__section-desc` | 24,161,383×18 | 24.0,161.0,383.0×18.0 | true | PASS |
| `199:2687` | fila-articulo 0 | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1)` | 24,183,383×72 | 24.0,183.0,383.0×72.0 | n/a | PASS |
| `199:2688` | portada (placeholder) | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__thumb--doc` | 24,187,64×64 | 24.0,187.0,64.0×64.0 | n/a | PASS |
| `199:2691` | texto | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__copy` | 100,199,307×40 | 100.0,199.0,307.0×40.0 | n/a | PASS |
| `199:2692` | titulo | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-title` | 100,199,307×20 | 100.0,199.0,307.0×20.0 | true | PASS |
| `199:2693` | meta | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-meta` | 100,223,151×16 | 100.0,223.0,151.0×16.0 | true | PASS |
| `199:2694` | fila-articulo 1 | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2)` | 24,259,383×72 | 24.0,259.0,383.0×72.0 | n/a | PASS |
| `199:2695` | portada (placeholder) | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__thumb--doc` | 24,263,64×64 | 24.0,263.0,64.0×64.0 | n/a | PASS |
| `199:2699` | titulo | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__row-title` | 100,265,307×40 | 100.0,265.0,307.0×40.0 | true | PASS |
| `199:2700` | meta | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__row-meta` | 100,309,151×16 | 100.0,309.0,151.0×16.0 | true | PASS |
| `crop-anchor` | panel sheet vs Figma crop origin | `.building-panel--writings.building-panel--exp-list .building-panel__sheet` | 64,0,— | 64.0,0.0,— | n/a | PASS |

## writings-phone-list

**Overall:** PASS

| Node | Name | Selector | Figma box | DOM box | Type | Gate |
|---|---|---|---|---|---|---|
| `199:2000` | agarre | `.exp-mobile-chrome__grab` | 16,1,343×16 | 16.0,1.0,343.0×16.0 | n/a | PASS |
| `199:2001` | barra | `.exp-mobile-chrome__bar` | 167.5,11,40×4 | 167.5,11.0,40.0×4.0 | n/a | PASS |
| `199:2002` | encabezado | `.exp-mobile-chrome__row` | 16,29,343×44 | 16.0,29.0,343.0×44.0 | n/a | PASS |
| `199:2003` | titulo | `.exp-mobile-chrome__title` | 16,39,295×24 | 16.0,39.0,295.0×24.0 | true | PASS |
| `199:2004` | cerrar | `[data-exp-mobile-close]` | 315,29,44×44 | 315.0,29.0,44.0×44.0 | n/a | PASS |
| `199:2007` | filtros | `.experience__filters` | 16,85,343×44 | 16.0,85.0,343.0×44.0 | n/a | PASS |
| `199:2008` | chip · All | `.experience__filter[data-writings-filter="all"]` | 16,85,44×44 | 16.0,85.0,45.0×44.0 | true | PASS |
| `199:2010` | chip · UXSC | `.experience__filter[data-writings-filter="uxsc"]` | 68,85,67×44 | 69.0,85.0,67.0×44.0 | true | PASS |
| `199:2012` | chip · Sinergia | `.experience__filter[data-writings-filter="sinergia"]` | 143,85,81×44 | 144.0,85.0,80.0×44.0 | true | PASS |
| `199:2014` | chip · Guest | `.experience__filter[data-writings-filter="guest"]` | 232,85,67×44 | 232.0,85.0,67.0×44.0 | true | PASS |
| `199:2016` | seccion · UX Sidekick Chronicles | `.experience__list > .experience__section:nth-child(1)` | 16,141,343×318 | 16.0,141.0,343.0×318.0 | n/a | PASS |
| `199:2017` | encabezado-seccion | `.experience__list > .experience__section:nth-child(1) .experience__section-row` | 16,141,343×44 | 16.0,141.0,343.0×44.0 | n/a | PASS |
| `199:2018` | nombre | `.experience__list > .experience__section:nth-child(1) .experience__section-title` | 16,151,180×24 | 16.0,151.0,179.0×24.0 | true | PASS |
| `199:2019` | conteo | `.experience__list > .experience__section:nth-child(1) .experience__section-count` | 204,154,23×18 | 203.0,154.0,23.0×18.0 | true | PASS |
| `199:2022` | ver-todo | `.experience__list > .experience__section:nth-child(1) .experience__see-all` | 306,141,53×44 | 307.0,141.0,52.0×44.0 | true | PASS |
| `199:2024` | descripcion | `.experience__list > .experience__section:nth-child(1) .experience__section-desc` | 16,189,343×18 | 16.0,189.0,343.0×18.0 | true | PASS |
| `199:2025` | fila-articulo 0 | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1)` | 16,211,343×80 | 16.0,211.0,343.0×80.0 | n/a | PASS |
| `199:2026` | portada (placeholder) | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__thumb--doc` | 16,219,64×64 | 16.0,219.0,64.0×64.0 | n/a | PASS |
| `199:2030` | titulo | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-title` | 92,231,267×20 | 92.0,231.0,267.0×20.0 | true | PASS |
| `199:2031` | meta | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-meta` | 92,255,151×16 | 92.0,255.0,151.0×16.0 | true | PASS |
| `199:2032` | fila-articulo 1 | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2)` | 16,295,343×80 | 16.0,295.0,343.0×80.0 | n/a | PASS |
| `199:2033` | portada (placeholder) | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__thumb--doc` | 16,303,64×64 | 16.0,303.0,64.0×64.0 | n/a | PASS |
| `199:2037` | titulo | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__row-title` | 92,305,267×40 | 92.0,305.0,267.0×40.0 | true | PASS |
| `199:2038` | meta | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__row-meta` | 92,349,151×16 | 92.0,349.0,151.0×16.0 | true | PASS |
| `199:2039` | fila-articulo 2 | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(3)` | 16,379,343×80 | 16.0,379.0,343.0×80.0 | n/a | PASS |
| `199:2040` | portada (placeholder) | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(3) .experience__thumb--doc` | 16,387,64×64 | 16.0,387.0,64.0×64.0 | n/a | PASS |
| `199:2044` | titulo | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(3) .experience__row-title` | 92,399,267×20 | 92.0,399.0,267.0×20.0 | true | PASS |
| `199:2045` | meta | `.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(3) .experience__row-meta` | 92,423,151×16 | 92.0,423.0,151.0×16.0 | true | PASS |

## writings-phone-reading

**Overall:** PASS

| Node | Name | Selector | Figma box | DOM box | Type | Gate |
|---|---|---|---|---|---|---|
| `199:2207` | agarre | `.exp-mobile-chrome__grab` | 16,1,343×16 | 16.0,1.0,343.0×16.0 | n/a | PASS |
| `199:2208` | barra | `.exp-mobile-chrome__bar` | 167.5,11,40×4 | 167.5,11.0,40.0×4.0 | n/a | PASS |
| `199:2209` | encabezado | `.exp-mobile-chrome__row` | 16,29,343×44 | 16.0,29.0,343.0×44.0 | n/a | PASS |
| `199:2210` | atras | `[data-exp-mobile-back]` | 16,29,44×44 | 16.0,29.0,44.0×44.0 | n/a | PASS |
| `199:2213` | titulo | `.exp-mobile-chrome__title` | 64,39,247×24 | 64.0,39.0,247.0×24.0 | true | PASS |
| `199:2214` | cerrar | `[data-exp-mobile-close]` | 315,29,44×44 | 315.0,29.0,44.0×44.0 | n/a | PASS |
| `199:2217` | portada (placeholder) | `.writings-reader__hero` | 16,85,343×193 | 16.0,85.0,343.0×193.0 | n/a | PASS |
| `199:2220` | etiqueta | `.writings-reader__kicker` | 16,290,154×14 | 16.0,290.0,154.0×14.0 | true | PASS |
| `199:2221` | titulo | `.writings-reader__title` | 16,316,343×28 | 16.0,316.0,343.0×28.0 | true | PASS |
| `199:2222` | meta | `.writings-reader__meta` | 16,356,164×16 | 16.0,356.0,166.0×16.0 | true | PASS |
| `199:2223` | cuerpo | `.writings-reader__p` | 16,384,343×72 | 16.0,384.0,343.0×72.0 | true | PASS |
| `199:2224` | cuerpo | `.writings-reader__p` | 16,468,343×72 | 16.0,468.0,343.0×72.0 | true | PASS |
| `199:2225` | cuerpo | `.writings-reader__p` | 16,552,343×72 | 16.0,552.0,343.0×72.0 | true | PASS |
| `199:2226` | ui/boton | `.writings-reader__substack` | 16,636,165×44 | 16.0,636.0,164.0×44.0 | true | PASS |

