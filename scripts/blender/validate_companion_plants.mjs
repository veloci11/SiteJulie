import { readFile, mkdir, writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Box3, Vector3 } from "three";
import sharp from "sharp";
import { nodeDracoLoader } from "./node_draco_loader.mjs";

globalThis.self = globalThis;
globalThis.createImageBitmap = async (blob) => {
  const info = await sharp(Buffer.from(await blob.arrayBuffer())).metadata();
  assert(info.width <= 512 && info.height <= 512);
  return { width: info.width, height: info.height, close() {} };
};
const config = JSON.parse(await readFile("lib/museum/companion-plants.json"));
const bytes = await readFile("public/museum/companion-plants.glb");
assert(bytes.length < 1_000_000, "Companion package exceeds 1 MB");
const scene = (
  await new GLTFLoader()
    .setDRACOLoader(nodeDracoLoader)
    .parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    )
).scene;
scene.updateMatrixWorld(true);
const results = [];
for (const [name, spec] of Object.entries(config.species)) {
  const group = scene.getObjectByName(name);
  assert(group, `Missing ${name}`);
  let triangles = 0,
    meshes = 0;
  group.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry,
      material = object.material;
    triangles += geometry.index.count / 3;
    const contact = object.name.endsWith("_contact");
    assert.equal(material.transparent, contact);
    assert(geometry.attributes.uv && geometry.attributes.color);
    if (contact) {
      const color = geometry.attributes.color;
      assert.equal(color.itemSize, 4);
      const alphas = Array.from({ length: color.count }, (_, i) =>
        color.getW(i),
      );
      assert(Math.min(...alphas) < 0.001 && Math.max(...alphas) > 0.2);
    } else assert(material.map && material.normalMap);
    const position = geometry.attributes.position,
      normal = geometry.attributes.normal;
    for (let i = 0; i < position.count; i++) {
      const point = new Vector3().fromBufferAttribute(position, i);
      assert(point.toArray().every(Number.isFinite));
      assert(
        Math.abs(new Vector3().fromBufferAttribute(normal, i).length() - 1) <
          0.01,
      );
      if (!contact) assert(Math.hypot(point.x, point.z) < spec.radius + 0.001);
      if (object.name.includes("humus")) {
        assert(
          point.y > spec.potHeight - 0.035 && point.y < spec.potHeight - 0.015,
        );
        assert(Math.hypot(point.x, point.z) < spec.potRadius - 0.024);
      }
    }
    if (object.name.endsWith("_leaves")) assert.equal(material.side, 2);
  });
  const bounds = new Box3().setFromObject(group);
  assert(Math.abs(bounds.max.y - spec.height) < 0.001);
  assert.equal(meshes, 5);
  assert(triangles < 50_000);
  results.push({
    name,
    meshes,
    triangles,
    min: bounds.min.toArray(),
    max: bounds.max.toArray(),
  });
}
for (const module of ["hall", "extension"]) {
  for (const placement of config[module]) {
    const spec = config.species[placement.species];
    const radius = spec.radius * placement.scale;
    const [x, , z] = placement.position;
    if (placement.zone.endsWith("alcove")) {
      assert(
        Math.abs(x) - radius > 6.15 && Math.abs(x) + radius < 9.8,
        "Alcove foliage crosses a side wall or the doorway",
      );
      assert(
        z - radius > -8.2 && z + radius < -4.15,
        "Alcove foliage crosses its seat or front wall",
      );
    } else {
      assert(placement.zone === "reading-lounge");
      assert(
        Math.abs(x) + radius < 4.1 && z > 7,
        "Low reading companion must stay with the seating, away from painting walls",
      );
    }
    assert(
      Math.abs(placement.position[2]) + radius < 8.8,
      "Leaves cross an end wall",
    );
  }
}
await mkdir("artifacts/plants-qa", { recursive: true });
await writeFile(
  "artifacts/plants-qa/geometry.json",
  JSON.stringify({ bytes: bytes.length, results }, null, 2),
);
console.log({ bytes: bytes.length, results });
