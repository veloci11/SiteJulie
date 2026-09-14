/** Run with npx tsx. Compare added wall volumes along complete promenades.
 * This is an occlusion audit of the added architecture, not a render assertion.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { Box3, Ray, PerspectiveCamera, Vector3 } from "three";
import { createAmbientWalk, sampleAmbientWalk } from "../lib/museum/tour.ts";
import {
  artworkPose,
  motionFromPose,
  motionLookTarget,
} from "../lib/museum/navigation.ts";
import {
  getSlots,
  artworkSize,
  slotForArtwork,
  roomOffset,
  ARTWORK_IMAGE_DEPTH,
} from "../lib/museum/config.ts";
const output = "artifacts/finishing-v6";
await mkdir(output, { recursive: true });
const data = JSON.parse(
  await readFile(".local/data.json", "utf8").catch(() =>
    readFile(".local/seed.json", "utf8"),
  ),
);
const artworks = data.artworks.filter((a) => a.publication === "published");
const rooms = [...new Set(artworks.map((a) => a.roomId))].sort();
const before = JSON.parse(
  await readFile(`${output}/manifest-before.json`, "utf8"),
);
const after = JSON.parse(
  await readFile(
    process.env.MUSEUM_SIGHTLINE_MANIFEST || "public/museum/manifest.json",
    "utf8",
  ),
);
const hitPoint = new Vector3();
function volumes(manifest, roomId) {
  const module = roomId === "room-1" ? "hall" : "extension";
  return [
    ...(manifest.partitionsByModule?.[module] ?? []),
    ...(manifest.wallDetailsByModule?.[module] ?? []),
  ].map((p) => {
    const center = new Vector3(...p.position).add(
      new Vector3(0, 0, roomOffset(roomId)),
    );
    // V6 panels use world-aligned size; the bound contains their inset objects.
    const extent = new Vector3(...p.size).multiplyScalar(0.5);
    return {
      name: p.name,
      box: new Box3(center.clone().sub(extent), center.clone().add(extent)),
    };
  });
}
function measure(label, manifest) {
  const reports = [];
  for (const roomId of rooms) {
    const art = artworks.filter((a) => a.roomId === roomId),
      walk = createAmbientWalk(roomId, rooms, art),
      boxes = volumes(manifest, roomId);
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
      [320, 568],
      [667, 375],
    ]) {
      let rays = 0,
        blockedRays = 0,
        blockedFrames = 0,
        worst = null;
      const byArtwork = {};
      function audit(sample, items) {
        const camera = new PerspectiveCamera(
          sample.fov,
          width / height,
          0.1,
          150,
        );
        camera.position.fromArray(sample.position);
        camera.lookAt(new Vector3(...motionLookTarget(sample)));
        camera.setViewOffset(
          width,
          height,
          sample.offsetX,
          sample.offsetY,
          width,
          height,
        );
        camera.updateMatrixWorld();
        let frameHits = 0;
        for (const a of items) {
          const slot = slotForArtwork(a),
            size = artworkSize(a, slot),
            origin = camera.position;
          if (
            new Vector3(...slot.wallNormal).dot(
              origin.clone().sub(new Vector3(...slot.position)),
            ) <= 0
          )
            continue;
          for (const x of [-0.49, 0, 0.49])
            for (const y of [-0.49, 0, 0.49]) {
              const point = new Vector3(
                x * size.width,
                y * size.height,
                ARTWORK_IMAGE_DEPTH,
              )
                .applyAxisAngle(new Vector3(0, 1, 0), slot.rotationY)
                .add(new Vector3(...slot.position));
              const screen = point.clone().project(camera);
              if (
                Math.abs(screen.x) > 1 ||
                Math.abs(screen.y) > 1 ||
                Math.abs(screen.z) > 1
              )
                continue;
              rays++;
              const length = origin.distanceTo(point),
                ray = new Ray(origin, point.clone().sub(origin).normalize());
              const obstruction = boxes.find(
                ({ box }) =>
                  ray.intersectBox(box, hitPoint) &&
                  origin.distanceTo(hitPoint) < length - 0.001,
              );
              if (obstruction) {
                blockedRays++;
                frameHits++;
                byArtwork[a.slug] = (byArtwork[a.slug] ?? 0) + 1;
              }
            }
        }
        if (frameHits) {
          blockedFrames++;
          if (!worst || frameHits > worst.hits)
            worst = {
              hits: frameHits,
              position: sample.position,
              yaw: sample.yaw,
              pitch: sample.pitch,
            };
        }
      }
      const samples = 720;
      for (let i = 0; i < samples; i++)
        audit(
          sampleAmbientWalk(
            walk,
            walk.period + 1 + (walk.period * i) / samples,
            width,
            height,
          ),
          art,
        );
      reports.push({
        roomId,
        width,
        height,
        kind: "full-promenade",
        samples,
        rays,
        blockedRays,
        blockedFrames,
        byArtwork,
        worst,
      });
      rays = blockedRays = blockedFrames = 0;
      worst = null;
      // Full-size portrait/landscape at every possible slot, even not yet occupied.
      for (const slot of getSlots(roomId))
        for (const ratio of [0.65, 1.6]) {
          const fixture = {
            ...art[0],
            id: slot.id,
            slug: slot.id,
            slotId: slot.id,
            roomId,
            imageWidth: ratio * 1000,
            imageHeight: 1000,
            widthCm: null,
            heightCm: null,
            displayScale: 1,
            placementOffsetX: 0,
            placementOffsetY: 0,
          };
          audit(motionFromPose(artworkPose(fixture, width, height)), [fixture]);
        }
      reports.push({
        roomId,
        width,
        height,
        kind: "all-slot-focus",
        samples: 24,
        rays,
        blockedRays,
        blockedFrames,
        worst,
      });
    }
  }
  return {
    label,
    reports,
    blockedRays: reports.reduce((s, r) => s + r.blockedRays, 0),
    rays: reports.reduce((s, r) => s + r.rays, 0),
  };
}
const results = [
  measure("V5 projecting returns", before),
  measure("current geometry contract", after),
];
await writeFile(
  `${output}/sightlines.json`,
  JSON.stringify(
    {
      scope:
        "Added wall volumes only. Tree foliage and original architecture require browser inspection.",
      results,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    results.map(({ label, rays, blockedRays }) => ({
      label,
      rays,
      blockedRays,
    })),
    null,
    2,
  ),
);
if (process.argv.includes("--assert-clear"))
  assert.equal(
    results[1].blockedRays,
    0,
    "Added wall volumes obstruct visible artwork samples",
  );
