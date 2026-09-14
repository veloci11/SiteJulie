import fs from "node:fs";
import {
  createAmbientWalk,
  ambientWalkPosterPose,
  roomWalkEntry,
  roomWalkEntrySample,
  roomWalkIntroduction,
  sampleJoinedAmbientWalk,
  sampleAmbientWalk,
} from "../lib/museum/tour.ts";
import {
  artworkPose,
  roomArrivalPose,
  motionFromPose,
  motionLookTarget,
  planCameraMotion,
  sampleCameraMotion,
  segmentIsClear,
  navigationObstaclesForRooms,
} from "../lib/museum/navigation.ts";
const sourcePosition = (sample) => sample.position;
const data = JSON.parse(fs.readFileSync(".local/seed.json", "utf8"));
const rooms = ["room-1", "room-2"];
const obs = navigationObstaclesForRooms(rooms);
const results = [];
for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [667, 375],
]) {
  const walks = rooms.map((room) =>
    createAmbientWalk(room, rooms, data.artworks),
  );
  const starts = [
    ...walks.map((walk) => ({
      name: walk.roomId + " overview",
      roomId: walk.roomId,
      pose: ambientWalkPosterPose(walk, width, height),
    })),
    ...data.artworks.map((a) => ({
      name: a.id,
      roomId: a.roomId,
      pose: artworkPose(a, width, height),
    })),
  ];
  for (const start of starts) {
    const targetRoom = start.roomId === "room-1" ? "room-2" : "room-1",
      walk = walks[rooms.indexOf(targetRoom)];
    const from = motionFromPose(start.pose),
      doorway = roomArrivalPose(targetRoom, from, width, height, rooms);
    const entry = roomWalkEntry(walk, motionFromPose(doorway)),
      end = roomWalkEntrySample(walk, entry, width, height);
    const target = {
      position: end.position,
      target: motionLookTarget(end),
      fov: end.fov,
      offsetPx: end.offsetX,
      offsetYPx: end.offsetY,
      roomId: targetRoom,
      roomEntry: true,
    };
    const motion = planCameraMotion(from, target, rooms, { endSample: end });
    let previous = sampleCameraMotion(motion, 0),
      maxSpeed = 0,
      maxAngular = 0,
      maxAngularAcceleration = 0,
      minForward = 1,
      collisions = 0;
    let portal = null,
      minFast = null,
      minAny = null,
      fastSidewaysSeconds = 0;
    const directionMetrics = (cur, elapsed) => {
      const speed = Math.hypot(...cur.velocity);
      const forwardDot =
        (Math.sin(cur.yaw) * cur.velocity[0] +
          Math.cos(cur.yaw) * cur.velocity[2]) /
        Math.max(speed, 1e-10);
      const corridorDot =
        Math.cos(cur.yaw) * (targetRoom === "room-2" ? 1 : -1);
      return {
        elapsed,
        speed,
        position: cur.position,
        forwardDot,
        lookMovementAngle:
          (Math.acos(Math.max(-1, Math.min(1, forwardDot))) * 180) / Math.PI,
        corridorDot,
        corridorAngle:
          (Math.acos(Math.max(-1, Math.min(1, corridorDot))) * 180) / Math.PI,
      };
    };
    for (let i = 1; i <= 1000; i++) {
      const cur = sampleCameraMotion(motion, (motion.duration * i) / 1000),
        speed = Math.hypot(...cur.velocity);
      maxSpeed = Math.max(maxSpeed, speed);
      maxAngularAcceleration = Math.max(
        maxAngularAcceleration,
        ((Math.hypot(
          cur.yawVelocity - previous.yawVelocity,
          cur.pitchVelocity - previous.pitchVelocity,
        ) /
          (motion.duration / 1000)) *
          180) /
          Math.PI,
      );
      maxAngular = Math.max(
        maxAngular,
        (Math.hypot(cur.yawVelocity, cur.pitchVelocity) * 180) / Math.PI,
      );
      if (speed > 0.08)
        minForward = Math.min(
          minForward,
          (Math.sin(cur.yaw) * cur.velocity[0] +
            Math.cos(cur.yaw) * cur.velocity[2]) /
            speed,
        );
      const metrics = directionMetrics(cur, (motion.duration * i) / 1000);
      if (speed > 0.08 && (!minAny || metrics.forwardDot < minAny.forwardDot))
        minAny = metrics;
      if (speed > 1 && (!minFast || metrics.forwardDot < minFast.forwardDot))
        minFast = metrics;
      if (speed > 1 && metrics.forwardDot < 0.5)
        fastSidewaysSeconds += motion.duration / 1000;
      if (!segmentIsClear(previous.position, cur.position, obs)) collisions++;
      if ((previous.position[2] - 9) * (cur.position[2] - 9) <= 0) {
        let lo = (motion.duration * (i - 1)) / 1000,
          hi = (motion.duration * i) / 1000;
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2,
            z = sampleCameraMotion(motion, mid).position[2];
          if (z < 9 === (targetRoom === "room-2")) lo = mid;
          else hi = mid;
        }
        const t = (lo + hi) / 2;
        portal = directionMetrics(sampleCameraMotion(motion, t), t);
      }
      previous = cur;
    }
    const last = sampleCameraMotion(motion, motion.duration);
    const joined = sampleJoinedAmbientWalk(
      walk,
      0,
      entry,
      width,
      height,
      Math.hypot(...last.velocity),
      roomWalkIntroduction(walk, entry, Math.hypot(...last.velocity)),
    );
    const velocityGap = Math.hypot(
      ...joined.velocity.map((v, i) => v - last.velocity[i]),
    );
    const angularVelocityGap = Math.hypot(
      joined.yawVelocity - last.yawVelocity,
      joined.pitchVelocity - last.pitchVelocity,
    );
    results.push({
      start: sourcePosition(from),
      end: target.position,
      directDistance: Math.hypot(
        ...target.position.map((v, i) => v - from.position[i]),
      ),
      detour:
        motion.length /
        Math.hypot(...target.position.map((v, i) => v - from.position[i])),
      velocityGap,
      angularVelocityGap,
      endSpeed: Math.hypot(...last.velocity),
      from: start.name,
      to: targetRoom,
      width,
      duration: motion.duration,
      profileDuration: motion.profile.duration,
      travelDuration: motion.travelDuration,
      totalYaw:
        (motion.roomLook?.yaw
          .slice(1)
          .reduce(
            (sum, y, i) => sum + Math.abs(y - motion.roomLook.yaw[i]),
            0,
          ) *
          180) /
        Math.PI,
      orient: motion.orientDuration,
      length: motion.length,
      maxSpeed,
      maxAngular,
      maxAngularAcceleration,
      minForward,
      collisions,
      portal,
      minFast,
      minAny,
      fastSidewaysSeconds,
      phases: {
        orientation: motion.orientDuration,
        coast: motion.coastDuration,
        walkToPortal:
          portal.elapsed - motion.orientDuration - motion.coastDuration,
        walkAfterPortal: motion.duration - portal.elapsed,
      },
    });
  }
}
const sorted = results.map((r) => r.duration).sort((a, b) => a - b);
const out = {
  summary: {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted.at(-1),
    minForward: Math.min(...results.map((r) => r.minForward)),
    maxAngular: Math.max(...results.map((r) => r.maxAngular)),
    maxVelocityGap: Math.max(...results.map((r) => r.velocityGap)),
    maxAngularVelocityGap: Math.max(
      ...results.map((r) => r.angularVelocityGap),
    ),
    collisions: results.reduce((sum, r) => sum + r.collisions, 0),
  },
  results,
};
fs.mkdirSync("artifacts/finishing-v7", { recursive: true });
fs.writeFileSync(
  "artifacts/finishing-v7/physical-room-audit.json",
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
