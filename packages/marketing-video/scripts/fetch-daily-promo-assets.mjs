// Récupère les images de la composition `the-box-daily-promo` dans
// public/daily-promo/. Rien n'est versionné : les captures de jeux restent
// la propriété de leurs éditeurs et le classement affiche de vrais pseudos.
//
//   node scripts/fetch-daily-promo-assets.mjs            # captures de jeux + écrans de l'appli
//   node scripts/fetch-daily-promo-assets.mjs --shots    # captures de jeux seulement
//
// Les écrans de l'appli passent par playwright-core (non installé par défaut) :
//   npm i --no-save playwright-core
//   CHROME_PATH=/chemin/vers/chrome-headless-shell node scripts/fetch-daily-promo-assets.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.THE_BOX_URL ?? "https://the-box.battistella.ovh";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "daily-promo");

// <slug du jeu>_<numéro de capture>, tels que référencés dans src/DailyBoxPromo.tsx
const SHOTS = [
  "hollow-knight_1", "hollow-knight_4", "elden-ring_1", "elden-ring_4",
  "mario-kart-8_1", "mario-kart-8_4", "grand-theft-auto-v_1", "grand-theft-auto-v_4",
  "celeste_1", "celeste_4", "hades-2018_1", "hades-2018_4",
];

const SCREENS = [
  { path: "/fr", name: "home" },
  { path: "/fr/leaderboard", name: "leaderboard", tab: /Mensuel/i },
  { path: "/fr/panorama", name: "panorama" },
];

async function fetchShots() {
  await mkdir(join(OUT, "shots"), { recursive: true });
  for (const shot of SHOTS) {
    const [slug, n] = shot.split(/_(?=\d+$)/);
    const url = `${BASE_URL}/uploads/screenshots/${slug}/screenshot_${n}.jpg`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    await writeFile(join(OUT, "shots", `${shot}.jpg`), Buffer.from(await res.arrayBuffer()));
    console.log(`capture ${shot}`);
  }
}

async function captureScreens() {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    throw new Error("playwright-core introuvable : npm i --no-save playwright-core");
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2.5,
    locale: "fr-FR",
    isMobile: true,
    hasTouch: true,
  });
  // Visite guidée terminée + cookies refusés : pas de surcouche, et pas de
  // visite comptée dans Umami.
  await ctx.addInitScript(() => {
    localStorage.setItem("theBox.homeTourCompleted", "1");
    localStorage.setItem(
      "the-box-consent",
      JSON.stringify({ state: { analytics: false, support: false, decided: true }, version: 0 }),
    );
  });
  const page = await ctx.newPage();
  for (const { path, name, tab } of SCREENS) {
    await page.goto(BASE_URL + path, { waitUntil: "load" });
    await page.waitForTimeout(3500);
    await page.addStyleTag({ content: "[data-sonner-toaster]{display:none!important}" });
    if (tab) {
      await page.getByRole("tab", { name: tab }).or(page.getByRole("button", { name: tab })).first().click();
      await page.waitForTimeout(2500);
    }
    await page.screenshot({ path: join(OUT, `app-${name}.png`) });
    console.log(`écran ${name}`);
  }
  await browser.close();
}

await fetchShots();
if (!process.argv.includes("--shots")) await captureScreens();
