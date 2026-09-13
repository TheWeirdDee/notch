// Renders docs/whitepaper.html to NOTCH_WHITEPAPER.pdf at the repo root via a locally
// installed Chrome (headless), driven through playwright-core (already a devDependency
// of web/). Not a Claude Artifact -- a real PDF file committed to the repo so it has a
// real, permanent URL (raw.githubusercontent.com) for judges.
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const candidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = candidates.find(existsSync);
if (!executablePath) throw new Error("No local Chrome/Edge install found to drive.");

const htmlPath = fileURLToPath(new URL("../../docs/whitepaper.html", import.meta.url));
const pdfPath = fileURLToPath(new URL("../../NOTCH_WHITEPAPER.pdf", import.meta.url));

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();
await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
console.log("Wrote", pdfPath);
