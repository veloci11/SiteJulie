import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const root = process.cwd();
const output = path.resolve(
  process.env.PERF_OUTPUT || "artifacts/perf-current",
);
await fs.mkdir(output, { recursive: true });
const base = process.env.PERF_ORIGIN || "http://127.0.0.1:3000";
const viewport = { width: 1440, height: 900 };
const scenarios = [
  { id: "home-native", path: "/", travel: true },
  { id: "oeuvre08-native", path: "/?vue=oeuvre&slug=oeuvre-08" },
  { id: "home-10mbps-60ms", path: "/", throttle: true },
];
const snapshot = async () => {
  const files = {};
  for (const name of [
    "hall-contemporary.glb",
    "extension-contemporary.glb",
    "extension-terminal-contemporary.glb",
    "end-cap-contemporary.glb",
    "fig-reading.glb",
    "fig-central.glb",
    "brass-room-probe.hdr",
    ...[
      "stone-base",
      "stone-normal",
      "stone-roughness",
      "wood-base",
      "wood-normal",
      "wood-roughness",
      "linen-base",
      "linen-normal",
      "jute-base",
      "jute-normal",
    ].map((name) => `contemporary/details/${name}.webp`),
  ]) {
    try {
      const b = await fs.readFile(path.join(root, "public/museum", name));
      files[name] = {
        bytes: b.length,
        sha256: crypto.createHash("sha256").update(b).digest("hex"),
      };
    } catch {
      files[name] = null;
    }
  }
  return files;
};
const hashesBefore = await snapshot();
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: [
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ],
});
const report = {
  generatedAt: new Date().toISOString(),
  browser: await browser.version(),
  viewport,
  deviceScaleFactor: 2,
  network: "Loopback except explicit CDP 10Mbps / 60ms scenario",
  notes: [
    "Fresh browser context per scenario, HTTP cache disabled. Browser process GPU/program cache may persist across scenarios.",
    "WebGL instrumentation measures synchronous driver-call CPU time, not true GPU elapsed time.",
    "Texture memory is estimated from observed allocation dimensions; it is not a driver memory measurement.",
    "After readiness, selecting the current room stops the home tour. Autoplay and editorial-background walking have separate browser coverage.",
  ],
  hashesBefore,
  scenarios: [],
};
try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Performance.enable");
    if (scenario.throttle)
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 60,
        downloadThroughput: 10_000_000 / 8,
        uploadThroughput: 10_000_000 / 8,
        connectionType: "wifi",
      });
    const requests = new Map();
    const errors = [];
    cdp.on("Network.requestWillBeSent", (event) =>
      requests.set(event.requestId, {
        url: event.request.url,
        type: event.type,
        start: event.timestamp,
      }),
    );
    cdp.on("Network.responseReceived", (event) => {
      const item = requests.get(event.requestId);
      if (item)
        Object.assign(item, {
          status: event.response.status,
          mime: event.response.mimeType,
          response: event.timestamp,
          fromDiskCache: event.response.fromDiskCache,
        });
    });
    cdp.on("Network.loadingFinished", (event) => {
      const item = requests.get(event.requestId);
      if (item)
        Object.assign(item, {
          encodedBytes: event.encodedDataLength,
          finish: event.timestamp,
        });
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const record = {
        longTasks: [],
        webglCalls: {},
        textures: [],
        bitmapDecodes: [],
        frames: [],
        navigation: [],
        context: null,
        firstCanvasMs: null,
        posterPaintMs: null,
        readyMs: null,
      };
      window.__museumPerf = record;
      document.addEventListener(
        "load",
        (event) => {
          if (
            event.target instanceof HTMLImageElement &&
            event.target.closest(".visit-arrival")
          )
            requestAnimationFrame(() => {
              record.posterPaintMs ??= performance.now();
            });
        },
        true,
      );
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          record.longTasks.push({
            start: entry.startTime,
            duration: entry.duration,
          });
      }).observe({ entryTypes: ["longtask"] });
      const contexts = new WeakMap();
      let textureId = 0;
      const wrap = (prototype, name, callback) => {
        if (
          !prototype ||
          !Object.prototype.hasOwnProperty.call(prototype, name) ||
          typeof prototype[name] !== "function"
        )
          return;
        const original = prototype[name];
        prototype[name] = function (...args) {
          const start = performance.now();
          const result = original.apply(this, args);
          const duration = performance.now() - start;
          const stats = (record.webglCalls[name] ||= {
            count: 0,
            sumMs: 0,
            maxMs: 0,
            firstMs: start,
            lastMs: start,
          });
          stats.count++;
          stats.sumMs += duration;
          stats.maxMs = Math.max(stats.maxMs, duration);
          stats.lastMs = start;
          callback?.(this, args, result, start, duration);
          return result;
        };
      };
      const state = (gl) => {
        let item = contexts.get(gl);
        if (!item) {
          item = { bindings: new Map(), ids: new WeakMap() };
          contexts.set(gl, item);
        }
        return item;
      };
      for (const prototype of [
        window.WebGLRenderingContext?.prototype,
        window.WebGL2RenderingContext?.prototype,
      ]) {
        wrap(prototype, "createTexture", (gl, args, result) => {
          const entry = {
            id: ++textureId,
            width: 0,
            height: 0,
            bytesPerPixel: 4,
            mipmaps: false,
            deleted: false,
          };
          state(gl).ids.set(result, entry);
          record.textures.push(entry);
        });
        wrap(prototype, "bindTexture", (gl, args) =>
          state(gl).bindings.set(args[0], args[1]),
        );
        wrap(prototype, "deleteTexture", (gl, args) => {
          const entry = state(gl).ids.get(args[0]);
          if (entry) entry.deleted = true;
        });
        wrap(prototype, "texImage2D", (gl, args, result, start) => {
          const entry = state(gl).ids.get(state(gl).bindings.get(args[0]));
          if (!entry || args[1] !== 0) return;
          const source = args[5];
          const width =
            args.length >= 9 ? args[3] : source?.width || source?.videoWidth;
          const height =
            args.length >= 9 ? args[4] : source?.height || source?.videoHeight;
          if (width && height)
            Object.assign(entry, { width, height, atMs: start });
        });
        wrap(prototype, "texStorage2D", (gl, args, result, start) => {
          const entry = state(gl).ids.get(state(gl).bindings.get(args[0]));
          if (!entry) return;
          const bpp =
            {
              [gl.RGBA16F]: 8,
              [gl.RGB16F]: 6,
              [gl.RGBA32F]: 16,
              [gl.DEPTH_COMPONENT16]: 2,
              [gl.DEPTH_COMPONENT24]: 4,
              [gl.DEPTH_COMPONENT32F]: 4,
            }[args[2]] || 4;
          Object.assign(entry, {
            width: args[3],
            height: args[4],
            bytesPerPixel: bpp,
            mipmaps: args[1] > 1,
            atMs: start,
          });
        });
        wrap(prototype, "generateMipmap", (gl, args) => {
          const entry = state(gl).ids.get(state(gl).bindings.get(args[0]));
          if (entry) entry.mipmaps = true;
        });
        for (const method of [
          "compileShader",
          "linkProgram",
          "texSubImage2D",
          "bufferData",
          "drawElements",
          "drawArrays",
          "getProgramParameter",
        ])
          wrap(prototype, method);
      }
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const result = getContext.apply(this, args);
        if (
          result &&
          ["webgl", "webgl2", "experimental-webgl"].includes(args[0])
        ) {
          const debug = result.getExtension("WEBGL_debug_renderer_info");
          record.context = {
            version: result.getParameter(result.VERSION),
            renderer: debug
              ? result.getParameter(debug.UNMASKED_RENDERER_WEBGL)
              : result.getParameter(result.RENDERER),
            vendor: debug
              ? result.getParameter(debug.UNMASKED_VENDOR_WEBGL)
              : result.getParameter(result.VENDOR),
            maxTextureSize: result.getParameter(result.MAX_TEXTURE_SIZE),
          };
        }
        return result;
      };
      const bitmap = window.createImageBitmap;
      window.createImageBitmap = async function (...args) {
        const start = performance.now();
        const result = await bitmap.apply(this, args);
        record.bitmapDecodes.push({
          start,
          duration: performance.now() - start,
          width: result.width,
          height: result.height,
        });
        return result;
      };
      let lastCount = "",
        lastState = "";
      new MutationObserver(() => {
        const canvas = document.querySelector("canvas[data-frame-count]");
        if (!canvas) return;
        record.firstCanvasMs ??= performance.now();
        if (canvas.dataset.frameCount !== lastCount) {
          lastCount = canvas.dataset.frameCount;
          record.frames.push({
            at: performance.now(),
            count: Number(lastCount),
          });
        }
        if (canvas.dataset.navigationState !== lastState) {
          lastState = canvas.dataset.navigationState;
          record.navigation.push({ at: performance.now(), state: lastState });
        }
        if (
          document.querySelector(".visit-arrival.is-ready") &&
          Number(lastCount) > 1
        )
          record.readyMs ??= performance.now();
      }).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-frame-count", "data-navigation-state", "class"],
      });
    });
    let failure = null;
    let ready = null;
    let travel = null;
    try {
      await page.goto(base + scenario.path, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector("canvas[data-frame-count]");
          return (
            canvas &&
            Number(canvas.dataset.frameCount) > 1 &&
            document.querySelector(".visit-arrival.is-ready")
          );
        },
        {},
        { timeout: 90000 },
      );
      ready = await page.evaluate(() => ({
        at: performance.now(),
        dataset: {
          ...document.querySelector("canvas[data-frame-count]").dataset,
        },
      }));
      if (scenario.path === "/") {
        await page.locator(".visit-room-switch").click();
        await page
          .getByRole("dialog", { name: "D’une salle à l’autre", exact: true })
          .getByRole("button", { name: /Visages/ })
          .click();
      }
      if (scenario.path.includes("oeuvre-08"))
        await page.waitForFunction(
          () =>
            document.querySelector("canvas")?.dataset.detailState === "ready",
          {},
          { timeout: 30000 },
        );
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(output, scenario.id + ".png") });
      if (scenario.travel) {
        const before = await page.evaluate(() => ({
          at: performance.now(),
          frames: window.__museumPerf.frames.length,
        }));
        await page.evaluate(() =>
          document.querySelector('[data-artwork="oeuvre-08"]')?.click(),
        );
        await page.waitForFunction(
          () =>
            document.querySelector("canvas")?.dataset.detailArtwork ===
              "oeuvre-08" &&
            document.querySelector("canvas")?.dataset.navigationState ===
              "arrived",
          {},
          { timeout: 30000 },
        );
        await page.waitForTimeout(800);
        travel = {
          before,
          after: await page.evaluate(() => ({
            at: performance.now(),
            frames: window.__museumPerf.frames.length,
            dataset: { ...document.querySelector("canvas").dataset },
          })),
        };
      }
    } catch (error) {
      failure = error.message;
      await page
        .screenshot({ path: path.join(output, scenario.id + "-failure.png") })
        .catch(() => {});
    }
    const data = await page.evaluate(() => ({
      probe: window.__museumPerf,
      resources: performance.getEntriesByType("resource").map((e) => ({
        name: e.name,
        start: e.startTime,
        duration: e.duration,
        responseEnd: e.responseEnd,
        transferSize: e.transferSize,
        encodedBodySize: e.encodedBodySize,
        decodedBodySize: e.decodedBodySize,
        initiatorType: e.initiatorType,
      })),
      navigation: performance
        .getEntriesByType("navigation")
        .map((e) => e.toJSON()),
      canvas: [...document.querySelectorAll("canvas")].map((c) => ({
        width: c.width,
        height: c.height,
        clientWidth: c.clientWidth,
        clientHeight: c.clientHeight,
        dataset: { ...c.dataset },
      })),
    }));
    const metrics = Object.fromEntries(
      (await cdp.send("Performance.getMetrics")).metrics.map((m) => [
        m.name,
        m.value,
      ]),
    );
    const network = [...requests.values()].filter((r) =>
      r.url.startsWith(base),
    );
    const row = {
      id: scenario.id,
      route: scenario.path,
      throttled: !!scenario.throttle,
      ready,
      travel,
      failure,
      errors,
      data,
      metrics,
      network,
    };
    report.scenarios.push(row);
    await fs.writeFile(
      path.join(output, scenario.id + ".json"),
      JSON.stringify(row, null, 2),
    );
    console.log(
      JSON.stringify({
        scenario: row.id,
        readyMs: data.probe?.readyMs,
        posterPaintMs: data.probe?.posterPaintMs,
        failure,
        renderer: data.probe?.context?.renderer,
        networkMiB:
          network.reduce((s, r) => s + (r.encodedBytes || 0), 0) / 1048576,
        longTasks: data.probe?.longTasks?.length,
        canvas: data.canvas,
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
  report.hashesAfter = await snapshot();
  report.assetFilesStable =
    JSON.stringify(report.hashesBefore) === JSON.stringify(report.hashesAfter);
  await fs.writeFile(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
}
