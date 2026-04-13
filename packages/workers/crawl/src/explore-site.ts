#!/usr/bin/env node
/** Intercept API calls to find how the site loads development data. */
import { chromium } from "playwright";

async function main() {
  const url = "https://propiedadescancun.mx/desarrollos-inmobiliarios-cancun";
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Intercept all fetch/XHR calls
  const apiCalls: string[] = [];
  page.on("request", (req) => {
    const u = req.url();
    if (
      (req.resourceType() === "fetch" || req.resourceType() === "xhr") &&
      !u.includes("google") &&
      !u.includes("facebook") &&
      !u.includes("analytics")
    ) {
      apiCalls.push(`${req.method()} ${u}`);
    }
  });

  // Also capture responses with JSON
  const jsonResponses: Array<{ url: string; size: number; preview: string }> = [];
  page.on("response", async (res) => {
    const ct = res.headers()["content-type"] ?? "";
    if (ct.includes("json") && res.url().includes("propiedadescancun")) {
      try {
        const body = await res.text();
        jsonResponses.push({
          url: res.url(),
          size: body.length,
          preview: body.slice(0, 500),
        });
      } catch {}
    }
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

  // Scroll and click to trigger lazy loads
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
  }

  // Try clicking load more
  try {
    const btn = await page.$('button:has-text("más"), a:has-text("más"), button:has-text("Ver más")');
    if (btn) {
      console.log("Clicking 'mas' button...");
      await btn.click();
      await page.waitForTimeout(3000);
    }
  } catch {}

  console.log(`\n=== API CALLS (${apiCalls.length}) ===`);
  for (const c of apiCalls) console.log(c);

  console.log(`\n=== JSON RESPONSES (${jsonResponses.length}) ===`);
  for (const r of jsonResponses) {
    console.log(`\nURL: ${r.url} (${r.size} bytes)`);
    console.log(`Preview: ${r.preview}`);
  }

  // Check page source for __NUXT__ or similar
  const pageData = await page.evaluate(() => {
    const scripts = document.querySelectorAll("script");
    for (const s of scripts) {
      const text = s.textContent ?? "";
      if (text.includes("__NUXT__") || text.includes("__NEXT_DATA__") || text.includes("window.__data")) {
        return text.slice(0, 1000);
      }
    }
    return null;
  });

  if (pageData) {
    console.log("\n=== PAGE DATA (hydration) ===");
    console.log(pageData);
  }

  // Check total card count on page
  const cardCount = await page.evaluate(() => {
    // Common card selectors
    const selectors = [
      ".card", ".listing-card", ".property-card", ".development-card",
      "[class*='card']", "[class*='proyecto']", "[class*='desarrollo']",
      "article", ".grid > div", ".listings > div",
    ];
    for (const sel of selectors) {
      const count = document.querySelectorAll(sel).length;
      if (count > 5) return `${sel}: ${count}`;
    }
    return "no cards found";
  });
  console.log(`\n=== CARD COUNT: ${cardCount} ===`);

  await browser.close();
  process.exit(0);
}

main().catch(console.error);
