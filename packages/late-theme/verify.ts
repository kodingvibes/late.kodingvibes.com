/** @late/theme/verify.ts — contrast self-check for all 6 accents × 2 modes.
 *  Run with: npx tsx packages/late-theme/verify.ts
 *  Fails if any pair falls below WCAG AA thresholds.
 *  ponytail: single-file self-check, no test framework, no fixtures.
 */

import { ACCENT_VARS } from "./accents";

function luminance(r: number, g: number, b: number): number {
  const [R, G, B] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(...hexToRgb(hex1));
  const l2 = luminance(...hexToRgb(hex2));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const DARK_BG = "#020617";
const LIGHT_BG = "#f8fafc";
const DARK_SURFACE = "#0f172a";
const LIGHT_SURFACE = "#ffffff";

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

const errors: string[] = [];

for (const [name, vars] of Object.entries(ACCENT_VARS)) {
  const pairs = [
    // Dark mode: primary on dark bg (badges, solid buttons)
    { label: `${name}: white on primary (dark)`, fg: "#ffffff", bg: vars.primary, threshold: AA_LARGE },
    // Light mode: primaryLight on light bg (badges, solid buttons)
    { label: `${name}: white on primaryLight (light)`, fg: "#ffffff", bg: vars.primaryLight, threshold: AA_LARGE },
    // Dark mode: text-accent (soft) on dark surface
    { label: `${name}: soft on dark surface`, fg: vars.soft, bg: DARK_SURFACE, threshold: AA_NORMAL },
    // Light mode: text-accent (softLight) on light surface
    { label: `${name}: softLight on light surface`, fg: vars.softLight, bg: LIGHT_SURFACE, threshold: AA_NORMAL },
    // Dark mode: ring on dark bg
    { label: `${name}: ring on dark bg`, fg: vars.ring, bg: DARK_BG, threshold: AA_LARGE },
    // Light mode: ringLight on light bg
    { label: `${name}: ringLight on light bg`, fg: vars.ringLight, bg: LIGHT_BG, threshold: AA_LARGE },
  ];

  for (const p of pairs) {
    const ratio = contrastRatio(p.fg, p.bg);
    if (ratio < p.threshold) {
      errors.push(
        `${p.label}: ${ratio.toFixed(2)}:1 < ${p.threshold}:1 (fg=${p.fg}, bg=${p.bg})`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("FAIL: contrast check errors:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
} else {
  console.log(`OK: all ${Object.keys(ACCENT_VARS).length} accents × 2 modes pass WCAG AA thresholds.`);
}
