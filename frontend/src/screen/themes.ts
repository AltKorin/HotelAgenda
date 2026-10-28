// Screen looks are data: colour themes (themes.json, from Słownik Kolorów) and font pairings
// (fonts.json, Figma's pairings with Polish glyphs verified) are chosen separately per group. Each theme proposes a pairing; any mix is allowed.
// Unknown ids fall back to the first entry, so a stale choice never breaks the lobby screen.
import "./fonts.css";
import type { CSSProperties } from "react";
import fontData from "./fonts.json";
import themeData from "./themes.json";

export type Theme = (typeof themeData)[number];
export type FontPair = (typeof fontData)[number];
export const THEMES: Theme[] = themeData;
export const FONT_PAIRS: FontPair[] = fontData;

export function themeById(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function fontsById(id: string | null | undefined): FontPair | undefined {
  return FONT_PAIRS.find((f) => f.id === id);
}

/** Group's own pairing if valid, otherwise the one its colour theme proposes. */
export function resolveFonts(theme: Theme, id: string | null | undefined): FontPair {
  return fontsById(id) ?? fontsById(theme.fonts) ?? FONT_PAIRS[0];
}

export function lookStyle(theme: Theme, fonts: FontPair): CSSProperties {
  const c = theme.colors;
  const d = fonts.display;
  return {
    "--bg": c.bg,
    "--ink": c.ink,
    "--muted": c.muted,
    "--accent": c.accent,
    "--accent-ink": c.accentInk,
    "--band": c.band,
    // QR sits on the light band, so it takes whichever theme colour is dark.
    "--qr": qrColor(theme),
    "--display": d.family,
    "--display-weight": d.weight,
    "--display-tracking": d.tracking,
    "--display-transform": d.transform,
    "--display-scale": d.scale,
    "--group-style": d.italicGroup ? "italic" : "normal",
    "--text": fonts.text.family,
    // Script and ultra-wide faces stay in headings; agenda rows then use the body face.
    "--title": fonts.titles === "text" ? fonts.text.family : d.family,
    "--title-weight-row": fonts.titles === "text" ? 600 : d.titleWeight,
  } as CSSProperties;
}

export function qrColor(theme: Theme): string {
  return theme.dark ? theme.colors.bg : theme.colors.ink;
}
