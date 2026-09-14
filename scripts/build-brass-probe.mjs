// Precompute Three's tiny RoomEnvironment once, so visitors never generate it.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
const sources = new Map([
  ["/three.js", "node_modules/three/build/three.module.js"],
  ["/three.core.js", "node_modules/three/build/three.core.js"],
  [
    "/room.js",
    "node_modules/three/examples/jsm/environments/RoomEnvironment.js",
  ],
]);
const document = `<!doctype html><script type="importmap">{"imports":{"three":"/three.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { RoomEnvironment } from '/room.js';
try {
 const gl = new THREE.WebGLRenderer();
 const studio = new RoomEnvironment();
 const generator = new THREE.PMREMGenerator(gl);
 const target = generator.fromScene(studio, .04, .1, 100, {size:32});
 const pixels = new Uint16Array(target.width * target.height * 4);
 await gl.readRenderTargetPixelsAsync(target, 0, 0, target.width, target.height, pixels);
 const rgbe = new Uint8Array(pixels.length);
 for (let i=0; i<pixels.length; i+=4) {
  const rgb=[0,1,2].map(c=>Math.max(0,THREE.DataUtils.fromHalfFloat(pixels[i+c])));
  const max=Math.max(...rgb);
  if (max < 1e-32) continue;
  const exponent=Math.floor(Math.log2(max))+1;
  const factor=256/Math.pow(2,exponent);
  for(let c=0;c<3;c++)rgbe[i+c]=Math.min(255,Math.round(rgb[c]*factor));
  rgbe[i+3]=exponent+128;
 }
 window.probe={width:target.width,height:target.height,pixels:Array.from(rgbe)};
 target.dispose(); generator.dispose(); studio.dispose(); gl.dispose();
} catch (error) { window.probeError=String(error); }
</script>`;
const server = createServer(async (request, response) => {
  const source = sources.get(request.url);
  if (request.url === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end(document);
  } else if (source) {
    response.setHeader("Content-Type", "application/javascript");
    response.end(await readFile(source));
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(
    () => window.probe || window.probeError,
    {},
    { timeout: 60000 },
  );
  const result = await page.evaluate(() => ({
    probe: window.probe,
    error: window.probeError,
  }));
  if (result.error) throw new Error(result.error);
  const { width, height, pixels } = result.probe;
  const bytes = [];
  for (let y = 0; y < height; y++) {
    bytes.push(2, 2, width >> 8, width & 255);
    for (let c = 0; c < 4; c++) {
      const row = Array.from(
        { length: width },
        (_, x) => pixels[(y * width + x) * 4 + c],
      );
      let x = 0;
      while (x < width) {
        let run = 1;
        while (run < 127 && x + run < width && row[x + run] === row[x]) run++;
        if (run >= 4) {
          bytes.push(128 + run, row[x]);
          x += run;
          continue;
        }
        const start = x;
        x += run;
        while (x < width && x - start < 128) {
          let next = 1;
          while (next < 4 && x + next < width && row[x + next] === row[x])
            next++;
          if (next >= 4) break;
          x += Math.min(next, 128 - (x - start));
        }
        bytes.push(x - start, ...row.slice(start, x));
      }
    }
  }
  const header = Buffer.from(
    `#?RADIANCE\n# Three r186 RoomEnvironment, PMREM size32, CubeUV data\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`,
  );
  const file = Buffer.concat([header, Buffer.from(bytes)]);
  const decoded = new HDRLoader().parse(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  );
  if (decoded.width !== width || decoded.height !== height)
    throw new Error("Invalid probe dimensions");
  await writeFile("public/museum/brass-room-probe.hdr", file);
  console.log(
    JSON.stringify({
      width,
      height,
      bytes: file.length,
      source: "Three r186 RoomEnvironment",
      encoding: "Radiance RLE / prefiltered CubeUV / 32px faces",
    }),
  );
} finally {
  await browser.close();
  server.close();
}
