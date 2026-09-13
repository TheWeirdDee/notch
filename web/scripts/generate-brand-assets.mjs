// One-off generator for brand raster assets from the NotchLogo mark
// (src/components/notch-logo.tsx), using the app's own design tokens
// (globals.css: --bone #EEE9DE, --ink #17150F, --ink-soft #6B6558, --cut #B23A2E).
// Run once, outputs committed as real files; this script itself is not part of the
// app build.
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BONE = "#EEE9DE";
const INK = "#17150F";
const INK_SOFT = "#6B6558";
const CUT = "#B23A2E";

// The mark itself, from notch-logo.tsx's path, normalized into a 0..1 box for reuse
// at any size/offset below (source viewBox was 0 0 32 32).
const MARK_PATH = "M4 4 H12 L16 13 L20 4 H28 V28 H4 Z";

function markSvg({ size, padFrac = 0.22, bg = BONE, fg = INK }) {
  const inner = size * (1 - padFrac * 2);
  const scale = inner / 32;
  const offset = (size - inner) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  <g transform="translate(${offset},${offset}) scale(${scale})">
    <path d="${MARK_PATH}" fill="${fg}"/>
  </g>
</svg>`;
}

function ogSvg() {
  const w = 1200, h = 630;
  const markSize = 260;
  const markX = 96, markY = (h - markSize) / 2;
  const inner = markSize * 0.62;
  const scale = inner / 32;
  const offset = (markSize - inner) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${BONE}"/>
  <rect x="40" y="40" width="${w - 80}" height="${h - 80}" fill="none" stroke="${INK}" stroke-opacity="0.12" stroke-width="2"/>
  <rect x="${markX}" y="${markY}" width="${markSize}" height="${markSize}" fill="${INK}"/>
  <g transform="translate(${markX + offset},${markY + offset}) scale(${scale})">
    <path d="${MARK_PATH}" fill="${BONE}"/>
  </g>
  <text x="${markX + markSize + 64}" y="310" font-family="Georgia, 'Times New Roman', serif" font-size="120" fill="${INK}">Notch</text>
  <text x="${markX + markSize + 64}" y="368" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="${INK_SOFT}">Cashflow-backed lending, conserved on-chain</text>
  <rect x="${markX + markSize + 64}" y="410" width="10" height="10" fill="${CUT}"/>
  <text x="${markX + markSize + 64 + 24}" y="419" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${INK_SOFT}">Creditcoin CC3 Testnet + Ethereum Sepolia</text>
</svg>`;
}

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const appDir = fileURLToPath(new URL("../src/app", import.meta.url));
mkdirSync(publicDir, { recursive: true });

await sharp(Buffer.from(markSvg({ size: 512 }))).png().toFile(`${publicDir}/logo.png`);
await sharp(Buffer.from(ogSvg())).png().toFile(`${publicDir}/og-image.png`);
await sharp(Buffer.from(markSvg({ size: 256, padFrac: 0.16 }))).png().toFile(`${appDir}/icon.png`);
await sharp(Buffer.from(markSvg({ size: 180, padFrac: 0.16 }))).flatten({ background: BONE }).png().toFile(`${appDir}/apple-icon.png`);

console.log("Wrote public/logo.png, public/og-image.png, src/app/icon.png, src/app/apple-icon.png");
