#!/usr/bin/env node
/**
 * Writings spec gate metadata (Figma file D1Vq9b3rBzXquj0FjwSV2q).
 * Panel XML excerpts in scripts/data/ come from Figma MCP get_metadata on:
 *   writings-desktop-list → panel 199:2650
 *   writings-phone-list   → hoja 199:1999
 *   writings-phone-reading → hoja 199:2206
 * Regenerate excerpts after Figma panel edits; DOM selectors live in scripts/lib/writings-spec-gate.mjs
 */
console.log('Writings spec metadata is committed under scripts/data/writings-*-panel.xml');
console.log('Gate runner: node scripts/verify-edificios-sbs.mjs → artifacts/verify-edificios-sbs/SPEC-GATE.md');
