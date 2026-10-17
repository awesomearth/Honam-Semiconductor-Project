// Headless verification of honam-semiconductor/index.html
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const URL = "http://127.0.0.1:8765/index.html";
const ROOT = process.argv[2];
const SHOTS = process.argv[3];
const factors = JSON.parse(fs.readFileSync(path.join(ROOT, "data/factors.json"), "utf8"));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new",
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  const report = { console: [], pageErrors: [], failed: [], checks: {} };
  const page = await browser.newPage();
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) report.console.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => report.pageErrors.push(String(e)));
  page.on("requestfailed", (r) => report.failed.push(`${r.url()} ${r.failure() && r.failure().errorText}`));

  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }]);
  await page.goto(URL, { waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: `${SHOTS}/desk-light-top.png` });
  report.checks.firstViewport = await page.evaluate(() => {
    const sel = { headline: ".h-head h1", verdict: ".h-verdict", metrics: ".h-metrics", map: "#map", powerChart: "#chart-power svg", waterChart: "#chart-water svg", factorGrid: ".fgrid", criticalPath: ".cpath" };
    const out = {};
    for (const [k, q] of Object.entries(sel)) { const r = document.querySelector(q).getBoundingClientRect(); out[k] = { top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.top >= 0 && r.bottom <= window.innerHeight }; }
    return out;
  });

  // --- layer toggles via checkboxes ---
  const toggles = await page.evaluate(() => {
    const out = {};
    const H = window.__honam;
    document.querySelectorAll(".ctl-layers input[data-layer]").forEach((b) => {
      const id = b.dataset.layer;
      const before = H.map.hasLayer(H.groups[id]);
      b.click(); const flipped = H.map.hasLayer(H.groups[id]) !== before;
      b.click(); const back = H.map.hasLayer(H.groups[id]) === before;
      out[id] = flipped && back;
    });
    return out;
  });
  report.checks.toggles = toggles;

  // --- heading click -> isolate layer + fit bounds; click one feature per layer ---
  report.checks.headings = {};
  report.checks.popups = {};
  for (const f of factors) {
    await page.evaluate(() => window.scrollTo(0, 0)); await page.click(`.ftile[data-factor="${f.id}"]`);
    await new Promise((r) => setTimeout(r, 900));
    const state = await page.evaluate((fid) => {
      const H = window.__honam;
      const vis = Object.keys(H.groups).filter((k) => H.map.hasLayer(H.groups[k]));
      const gb = H.groups[fid].getBounds();
      const inView = H.map.getBounds().pad(0.05).intersects(gb);
      return { visible: vis, inView, zoom: H.map.getZoom() };
    }, f.id);
    report.checks.headings[f.id] = state.visible.join(",") === ["base", f.id].sort().join(",") || state.visible.sort().join(",") === ["base", f.id].sort().join(",") ? `ok (zoom ${state.zoom}, inView ${state.inView})` : `FAIL visible=${state.visible}`;

    // pick the first non-casing interactive layer that is inside the map view; click it with the real mouse
    const target = await page.evaluate((fid) => {
      const H = window.__honam;
      const mb = H.map.getBounds();
      const rect = H.map.getContainer().getBoundingClientRect();
      let pick = null;
      const ls = []; H.groups[fid].eachLayer((l) => ls.push(l));
      ls.sort((a, b) => (b.getLatLng ? 1 : 0) - (a.getLatLng ? 1 : 0));
      ls.forEach((l) => {
        if (pick || !l.feature) return;
        let ll = l.getLatLng ? l.getLatLng() : null;
        if (!ll && l.getLatLngs) { const a = l.getLatLngs().flat(3); ll = a[Math.floor(a.length / 2)]; }
        if (ll && mb.contains(ll)) {
          const p = H.map.latLngToContainerPoint(ll);
          const x = rect.left + p.x, y = rect.top + p.y;
          const hit = document.elementFromPoint(x, y);
          if (hit && hit.closest(".leaflet-control")) return;
          pick = { x, y, name: l.feature.properties.name };
        }
      });
      return pick;
    }, f.id);
    if (!target) { report.checks.popups[f.id] = "FAIL no feature in view"; continue; }
    await page.mouse.click(target.x, target.y);
    await new Promise((r) => setTimeout(r, 400));
    const pop = await page.evaluate(() => {
      const p = document.querySelector(".leaflet-popup-content");
      if (!p) return null;
      return { name: (p.querySelector(".pp-name") || {}).textContent, src: (p.querySelector(".pp-ref") || {}).textContent, prec: (p.querySelector(".prec") || {}).textContent };
    });
    report.checks.popups[f.id] = pop ? `ok: "${pop.name}" | ${pop.prec} | ${pop.src}` : `FAIL no popup for ${target.name}`;
    await page.evaluate(() => window.__honam.map.closePopup());
    if (f.id === "F2") await page.screenshot({ path: `${SHOTS}/desk-light-F2.png` });
  }

  // --- citations resolve; figures present with source ---
  report.checks.citations = await page.evaluate(() => {
    const ids = new Set([...document.querySelectorAll("ol.refs li[id]")].map((li) => li.id));
    const links = [...document.querySelectorAll('a[href^="#ref-"]')];
    const cited = new Set(links.map((a) => a.getAttribute("href").slice(1)));
    const missing = [...cited].filter((c) => !ids.has(c));
    const uncited = [...ids].filter((i) => !cited.has(i));
    return { links: links.length, distinctCited: cited.size, references: ids.size, missing, uncited };
  });
  report.checks.figures = await page.evaluate((factors) => {
    const rows = [...document.querySelectorAll("tr[data-fig]")].map((r) => r.textContent.replace(/\s+/g, " "));
    const norm = (s) => s.replace(/\s+/g, " ");
    const missing = [];
    let n = 0;
    for (const f of factors) for (const g of f.figures) {
      n++;
      const ok = rows.some((t) => t.includes(norm(g.label)) && t.includes(norm(g.value)) && t.includes(g.source));
      if (!ok) missing.push(`${f.id}: ${g.label}`);
    }
    return { total: n, missing };
  }, factors);

  // --- horizontal scroll + screenshots at widths/themes ---
  report.checks.overflow = {};
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    for (const scheme of ["light", "dark"]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise((r) => setTimeout(r, 600));
      const o = await page.evaluate(() => {
        const de = document.documentElement;
        const wide = [...document.querySelectorAll("body *")].filter((el) => {
          if (el.closest(".tablewrap") || el.closest(".tablist") || el.closest(".scrollx") || el.closest(".leaflet-container") || el.closest("svg")) return false;
          const r = el.getBoundingClientRect(); return r.right > de.clientWidth + 1;
        }).slice(0, 5).map((el) => el.tagName + "." + el.className);
        return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, wide };
      });
      report.checks.overflow[`${w}-${scheme}`] = o;
      await page.screenshot({ path: `${SHOTS}/w${w}-${scheme}-top.png` });
      await page.evaluate(() => document.getElementById("fig1").scrollIntoView());
      await new Promise((r) => setTimeout(r, 900));
      await page.screenshot({ path: `${SHOTS}/w${w}-${scheme}-map.png` });
      await page.evaluate(() => document.getElementById("factors").scrollIntoView());
      await new Promise((r) => setTimeout(r, 300));
      await page.screenshot({ path: `${SHOTS}/w${w}-${scheme}-factors.png` });
    }
  }
  report.fileBytes = fs.statSync(path.join(ROOT, "index.html")).size;
  console.log(JSON.stringify(report, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
