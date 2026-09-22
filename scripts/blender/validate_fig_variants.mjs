import { readFile, writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Box3, Vector3 } from "three";
import sharp from "sharp";
import { nodeDracoLoader } from "./node_draco_loader.mjs";

globalThis.self = globalThis;
const textureHashes = [];
globalThis.createImageBitmap = async (blob) => {
  const bytes = Buffer.from(await blob.arrayBuffer());
  const { info } = await sharp(bytes)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert(info.width <= 1024 && info.height <= 1024);
  textureHashes.push(createHash("sha256").update(bytes).digest("hex"));
  return { width: info.width, height: info.height, close() {} };
};
const contract = JSON.parse(
  await readFile("scripts/blender/contemporary_contract.json"),
);
const results = [];
for (const variant of ["reading", "central"]) {
  const placement =
    contract.treesByModule[variant === "reading" ? "hall" : "extension"][0];
  const bytes = await readFile(`public/museum/fig-${variant}.glb`);
  textureHashes.length = 0;
  const scene = (
    await new GLTFLoader()
      .setDRACOLoader(nodeDracoLoader)
      .parseAsync(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
        "",
      )
  ).scene;
  scene.updateMatrixWorld(true);
  let triangles = 0,
    radius = 0,
    soilBounds;
  const meshes = [];
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    const positions = geometry.attributes.position,
      normals = geometry.attributes.normal;
    assert(
      positions &&
        normals &&
        geometry.attributes.uv &&
        geometry.attributes.color,
    );
    assert(object.material.map && object.material.normalMap);
    assert(!object.material.transparent);
    assert.equal(object.material.side, object.name.includes("laminae") ? 2 : 0);
    assert.equal(object.material.opacity, 1);
    const soil = object.name.includes("soil");
    if (soil) soilBounds = new Box3().setFromObject(object);
    for (let i = 0; i < positions.count; i++) {
      const point = new Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(object.matrixWorld);
      radius = Math.max(radius, Math.hypot(point.x, point.z));
      assert(point.toArray().every(Number.isFinite));
      assert(
        Math.abs(new Vector3().fromBufferAttribute(normals, i).length() - 1) <
          0.01,
      );
      if (soil) {
        const worldY = point.y * placement.scale + placement.position[1];
        assert(
          Math.hypot(point.x, point.z) * placement.scale <
            placement.potRadius - 0.034,
          "Soil crosses the inner pot wall",
        );
        assert(
          worldY > placement.soilY + 0.0126,
          "Soil intersects the old flat disc",
        );
        assert(
          worldY < placement.potHeight - 0.006,
          "Soil protrudes above the rim",
        );
      }
    }
    const count = geometry.index.count / 3;
    triangles += count;
    meshes.push({
      name: object.name,
      triangles: count,
      positionHash: createHash("sha256")
        .update(Buffer.from(positions.array.buffer))
        .digest("hex"),
      side: object.material.side,
      roughness: object.material.roughness,
      normalScale: object.material.normalScale.toArray(),
    });
  });
  const bounds = new Box3().setFromObject(scene);
  const height = variant === "reading" ? 3.95 : 4.35;
  assert.equal(meshes.length, 4);
  assert(
    soilBounds && soilBounds.max.y - soilBounds.min.y > 0.008,
    "Soil must have geometric relief",
  );
  assert(triangles < 80000 && bytes.length < 1000000);
  assert(
    radius < 1.1001 &&
      bounds.min.y > 0.66 &&
      Math.abs(bounds.max.y - height) < 0.001,
  );
  results.push({
    variant,
    bytes: bytes.length,
    triangles,
    meshes,
    radius,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    soilBounds: {
      min: soilBounds.min.toArray(),
      max: soilBounds.max.toArray(),
    },
    textureHashes: [...textureHashes].sort(),
  });
}
assert.notEqual(
  results[0].meshes[0].positionHash,
  results[1].meshes[0].positionHash,
);
assert.notEqual(results[0].triangles, results[1].triangles);
assert(
  results[0].radius > results[1].radius + 0.08,
  "Reading tree should spread wider",
);
assert.deepEqual(
  results[0].textureHashes,
  results[1].textureHashes,
  "Texture pixels should be shared despite different tree geometry",
);
await writeFile(
  "artifacts/fig-qa/variants-validation.json",
  JSON.stringify(
    { results, geometryDistinct: true, texturesIdentical: true },
    null,
    2,
  ),
);
console.log(
  results.map((result) => ({
    variant: result.variant,
    bytes: result.bytes,
    triangles: result.triangles,
    radius: result.radius,
    height: result.bounds.max[1],
  })),
);
