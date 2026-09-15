"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addEffect, useFrame, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import CameraControlsImpl from "camera-controls";
import { PerspectiveCamera, Vector3 } from "three";
import type { Destination, PublicData } from "@/lib/data/types";
import { ROOM_DEPTH, type Vec3 } from "@/lib/museum/config";
import {
  destinationPose,
  roomArrivalPose,
  distance,
  motionFromPose,
  motionLookTarget,
  planCameraMotion,
  sampleCameraMotion,
  type CameraMotion,
  type CameraMotionSample,
  type CameraPose,
} from "@/lib/museum/navigation";
import {
  ambientWalkPosterPose,
  createAmbientWalk,
  nearestWalkEntry,
  roomWalkEntry,
  roomWalkEntrySample,
  pausedWalkSample,
  visibleWalkArtwork,
  walkDistanceAt,
  type AmbientWalk,
  canRunAmbientTour,
  tourArtworks,
  TourTimeline,
  TOUR_INITIAL_DELAY,
} from "@/lib/museum/tour";
import { ContinuousPromenade, continuationRoom } from "@/lib/museum/promenade";
interface Props {
  data: PublicData;
  destination: Destination;
  navigationId: number;
  reducedMotion: boolean;
  onArrive: (id: number) => void;
  onError: () => void;
  skipTransition?: boolean;
  ambientTour?: boolean;
  roomAutoplay?: boolean;
  resumeFromCurrent?: boolean;
  onTourArtwork?: (artworkId: string | null) => void;
}
interface Journey {
  id: number;
  motion: CameraMotion;
  startedAt: number | null;
  elapsed: number;
  lastFrame: number | null;
  reframe: boolean;
}
export function CameraDirector({
  data,
  destination,
  navigationId,
  reducedMotion,
  onArrive,
  onError,
  skipTransition,
  ambientTour = false,
  roomAutoplay = false,
  resumeFromCurrent = false,
  onTourArtwork,
}: Props) {
  const controls = useRef<CameraControlsImpl>(null);
  const journey = useRef<Journey | null>(null);
  const presentationTime = useRef<number | null>(null);
  useLayoutEffect(
    () =>
      addEffect((timestamp) => {
        presentationTime.current = timestamp / 1000;
      }),
    [],
  );
  const rendered = useRef<CameraMotionSample | null>(null);
  const first = useRef(true);
  const appliedId = useRef<number | null>(null);
  const appliedPose = useRef<CameraPose | null>(null);
  const arrivedId = useRef<number | null>(null);
  const callbacks = useRef({
    onArrive,
    onError,
    onTourArtwork,
  });
  callbacks.current = { onArrive, onError, onTourArtwork };
  const [visible, setVisible] = useState(true);
  const promenade = useRef<ContinuousPromenade | null>(null);
  const previousActiveTime = useRef(0);
  const tour = useRef({
    timeline: new TourTimeline(),
    artworkId: null as string | null,
    walk: null as AmbientWalk | null,
    lastMetadataTime: -Infinity,
    startedAt: 0,
    dueAt: TOUR_INITIAL_DELAY,
    hasStarted: false,
    readyOnLoop: false,
    entryElapsed: null as number | null,
  });
  const wake = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tourAllowed = canRunAmbientTour(
    destination,
    ambientTour,
    reducedMotion,
    visible,
  );
  const allowedRef = useRef(tourAllowed);
  allowedRef.current = tourAllowed;
  const walkData = useRef<PublicData | null>(null);
  // Build the room loops once per catalogue update, never during a cancel click.
  const roomWalks = useMemo(
    () =>
      new Map(
        data.rooms.map((roomId) => [
          roomId,
          createAmbientWalk(roomId, data.rooms, data.artworks),
        ]),
      ),
    [data],
  );
  const appliedSize = useRef({ width: 0, height: 0 });
  const latestId = useRef(navigationId);
  latestId.current = navigationId;
  const { camera, size, invalidate, gl } = useThree();
  const cameraRef = camera as PerspectiveCamera;
  const destinationKey = JSON.stringify(destination);
  function clearWake() {
    if (wake.current !== null) clearTimeout(wake.current);
    wake.current = null;
  }
  function wakeAfter(seconds: number) {
    clearWake();
    wake.current = setTimeout(() => invalidate(), Math.max(0, seconds) * 1000);
  }
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    tour.current.timeline.update(performance.now() / 1000, tourAllowed);
    clearWake();
    // A direct selection while walking retains the last rendered velocity.
    // Only an actual pause of this same request discards that momentum.
    if (
      !tourAllowed &&
      tour.current.hasStarted &&
      !journey.current &&
      appliedId.current === navigationId &&
      rendered.current
    ) {
      rendered.current = pausedWalkSample(rendered.current);
      gl.domElement.dataset.tourSpeed = "0";
      gl.domElement.dataset.tourYawSpeed = "0";
    }
    gl.domElement.dataset.tourState = tourAllowed
      ? tour.current.hasStarted
        ? "walking"
        : "waiting"
      : tour.current.hasStarted
        ? "paused"
        : "off";
    if (tourAllowed) invalidate();
    return clearWake;
  }, [tourAllowed, navigationId, visible, gl, invalidate]);

  function applySample(sample: CameraMotionSample, delta: number) {
    const controller = controls.current;
    if (!controller) return;
    const target = motionLookTarget(sample);
    void controller.setLookAt(...sample.position, ...target, false);
    // CameraControls is the sole owner of position and orientation. Lens shift
    // keeps the artwork inside the actual HTML-free rectangle of the Canvas.
    cameraRef.fov = sample.fov;
    if (Math.abs(sample.offsetX) + Math.abs(sample.offsetY) > 0.001) {
      cameraRef.setViewOffset(
        size.width,
        size.height,
        sample.offsetX,
        sample.offsetY,
        size.width,
        size.height,
      );
    } else cameraRef.clearViewOffset();
    controller.update(delta);
    gl.domElement.dataset.cameraFov = sample.fov.toFixed(4);
    gl.domElement.dataset.cameraOffset = JSON.stringify([
      sample.offsetX,
      sample.offsetY,
    ]);
    rendered.current = sample;
    gl.domElement.dataset.resumeRoom = continuationRoom(sample, data.rooms);
    gl.domElement.dataset.cameraPosition = JSON.stringify(
      sample.position.map((v) => Number(v.toFixed(5))),
    );
    gl.domElement.dataset.cameraRoom = `room-${Math.max(1, Math.min(data.rooms.length, Math.floor((sample.position[2] + ROOM_DEPTH / 2) / ROOM_DEPTH) + 1))}`;
    gl.domElement.dataset.cameraTarget = JSON.stringify(
      target.map((v) => Number(v.toFixed(5))),
    );
  }
  function arrive(id: number) {
    if (id !== latestId.current) return;
    gl.domElement.dataset.navigationState = "arrived";
    if (id === latestId.current && arrivedId.current !== id) {
      arrivedId.current = id;
      callbacks.current.onArrive(id);
    }
  }
  useEffect(() => {
    const controller = controls.current;
    if (!controller) return;
    try {
      const overview =
        destination.kind === "home" || destination.kind === "room";
      const roomId =
        destination.kind === "room" ? destination.roomId : "room-1";
      const walk = overview
        ? tour.current.walk?.roomId === roomId && walkData.current === data
          ? tour.current.walk
          : roomWalks.get(roomId)!
        : null;
      walkData.current = data;
      if (walk) tour.current.walk = walk;
      const sameRequest = appliedId.current === navigationId;
      const previousPose = appliedPose.current;
      const roomStart =
        sameRequest && previousPose
          ? motionFromPose(previousPose)
          : rendered.current;
      let pose =
        destination.kind === "room" && roomStart && !first.current
          ? roomArrivalPose(
              destination.roomId,
              roomStart,
              size.width,
              size.height,
              data.rooms,
            )
          : walk
            ? ambientWalkPosterPose(walk, size.width, size.height)
            : destinationPose(destination, data, size.width, size.height);
      const resized =
        appliedSize.current.width !== size.width ||
        appliedSize.current.height !== size.height;
      appliedSize.current = { width: size.width, height: size.height };
      appliedPose.current = pose;
      // A pause or responsive resize must never send an ambient visit home.
      if (
        sameRequest &&
        tour.current.hasStarted &&
        (destination.kind === "home" || destination.kind === "room")
      ) {
        if (resized && promenade.current) {
          applySample(promenade.current.sample, 1 / 60);
          invalidate();
        }
        return;
      }
      if (!sameRequest) {
        promenade.current = null;
        previousActiveTime.current = 0;
        clearWake();
        tour.current = {
          timeline: new TourTimeline(),
          artworkId: null,
          walk,
          lastMetadataTime: -Infinity,
          startedAt: 0,
          dueAt: TOUR_INITIAL_DELAY,
          hasStarted: false,
          readyOnLoop: first.current && roomAutoplay,
          entryElapsed: null,
        };
        tour.current.timeline.update(
          performance.now() / 1000,
          allowedRef.current,
        );
        gl.domElement.dataset.tourArtwork = "";
        gl.domElement.dataset.tourState = allowedRef.current
          ? "waiting"
          : "off";
        gl.domElement.dataset.tourProgress = "0";
        gl.domElement.dataset.tourCycle = "0";
        gl.domElement.dataset.tourElapsed = "0";
        gl.domElement.dataset.tourSpeed = "0";
        callbacks.current.onTourArtwork?.(null);
      }
      const wasTraveling = journey.current !== null;
      const from =
        rendered.current ??
        motionFromPose({
          position: controller.getPosition(new Vector3()).toArray() as Vec3,
          target: controller.getTarget(new Vector3()).toArray() as Vec3,
          offsetPx: 0,
          offsetYPx: 0,
          roomId: pose.roomId,
        });
      controller.stop();
      journey.current = null;
      appliedId.current = navigationId;
      gl.domElement.dataset.navigationId = String(navigationId);
      if (
        resumeFromCurrent &&
        !sameRequest &&
        walk &&
        !first.current &&
        !reducedMotion
      ) {
        promenade.current = new ContinuousPromenade(walk, from, data.rooms);
        tour.current.hasStarted = true;
        tour.current.startedAt = tour.current.timeline.time;
        tour.current.dueAt = 0;
        gl.domElement.dataset.transitionKind = "resume";
        gl.domElement.dataset.transitionDuration = "0";
        gl.domElement.dataset.tourState = "walking";
        // The last rendered pose is the first resumed pose. No travel to an
        // arrival marker, no reset to a stored tour time, no second camera.
        applySample(from, 0);
        arrive(navigationId);
        invalidate();
        return;
      }
      let roomEndSample: CameraMotionSample | undefined;
      const differentRoom =
        destination.kind === "room" &&
        !first.current &&
        Math.floor((from.position[2] + ROOM_DEPTH / 2) / ROOM_DEPTH) !==
          Math.floor((pose.position[2] + ROOM_DEPTH / 2) / ROOM_DEPTH);
      if (
        roomAutoplay &&
        walk &&
        (differentRoom ||
          (!sameRequest && destination.kind === "room" && !first.current) ||
          (sameRequest && wasTraveling && tour.current.entryElapsed !== null))
      ) {
        const entryElapsed =
          sameRequest && tour.current.entryElapsed !== null
            ? tour.current.entryElapsed
            : differentRoom
              ? roomWalkEntry(walk, motionFromPose(pose))
              : nearestWalkEntry(walk, from);
        const target = roomWalkEntrySample(
          walk,
          entryElapsed,
          size.width,
          size.height,
        );
        roomEndSample = target;
        pose = {
          position: target.position,
          target: motionLookTarget(target),
          roomId: pose.roomId,
          fov: target.fov,
          offsetPx: target.offsetX,
          offsetYPx: target.offsetY,
          roomEntry: true,
        };
        appliedPose.current = pose;
        tour.current.entryElapsed = entryElapsed;
        tour.current.readyOnLoop = true;
      }
      gl.domElement.dataset.transitionKind = "continuous";
      if (first.current || reducedMotion || skipTransition) {
        first.current = false;
        applySample(motionFromPose(pose), 1 / 60);
        arrive(navigationId);
        if (allowedRef.current) wakeAfter(TOUR_INITIAL_DELAY);
        invalidate(3);
        return;
      }
      const final = motionFromPose(pose);
      const angularDelta =
        Math.abs(
          Math.atan2(
            Math.sin(final.yaw - from.yaw),
            Math.cos(final.yaw - from.yaw),
          ),
        ) + Math.abs(final.pitch - from.pitch);
      if (
        sameRequest &&
        !wasTraveling &&
        distance(from.position, pose.position) < 0.001 &&
        angularDelta < 0.001 &&
        Math.abs(from.fov - final.fov) < 0.001 &&
        Math.abs(from.offsetX - pose.offsetPx) +
          Math.abs(from.offsetY - pose.offsetYPx) <
          0.1
      ) {
        arrive(navigationId);
        invalidate(2);
        return;
      }
      // Resizing never calls the instant-navigation branch. A settled image is
      // gently reframed; a journey in progress retains its current momentum.
      const reframe =
        sameRequest &&
        arrivedId.current === navigationId &&
        previousPose?.roomId === pose.roomId &&
        distance(previousPose.target, pose.target) < 0.001;
      const duration = reframe
        ? Math.min(1.1, 0.55 + distance(from.position, pose.position) * 0.08)
        : undefined;
      const motion = planCameraMotion(from, pose, data.rooms, {
        duration,
        endSample: roomEndSample,
      });
      journey.current = {
        id: navigationId,
        motion,
        // Begin on the first rendered frame, excluding synchronous preparation
        // and GPU compilation from the animation clock (which caused a jump).
        startedAt: null,
        elapsed: 0,
        lastFrame: null,
        reframe,
      };
      gl.domElement.dataset.navigationState = reframe
        ? "reframing"
        : "traveling";
      gl.domElement.dataset.transitionDuration = motion.duration.toFixed(3);
      gl.domElement.dataset.transitionLength = motion.length.toFixed(4);
      gl.domElement.dataset.transitionDetour = (
        motion.length / Math.max(0.001, distance(from.position, pose.position))
      ).toFixed(4);
      invalidate();
    } catch (error) {
      console.error("Museum camera:", error);
      callbacks.current.onError();
    }
    // Destination is keyed by value; callback changes cannot restart a journey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    destinationKey,
    navigationId,
    reducedMotion,
    skipTransition,
    size.width,
    size.height,
    data,
  ]);
  useEffect(
    () => () => {
      journey.current = null;
      clearWake();
    },
    [],
  );
  useFrame((_, delta) => {
    if (!controls.current) return;
    // Fiber's global before-effect receives the actual RAF timestamp. Sampling
    // performance.now() here would turn intra-frame JS latency into a camera
    // jump, followed by a shorter step on the next equally spaced display frame.
    const now = presentationTime.current;
    if (now === null) return;
    gl.domElement.dataset.cameraSampleTime = (now * 1000).toFixed(4);
    const activeTime = tour.current.timeline.update(now, allowedRef.current);
    // A menu layout or texture upload must not be paid back as a camera jump.
    // Advance at most one 30 Hz display step after a missed presentation frame.
    const activeDelta = Math.min(
      1 / 30,
      Math.max(0, activeTime - previousActiveTime.current),
    );
    previousActiveTime.current = activeTime;
    const current = journey.current;
    if (current) {
      current.startedAt ??= now;
      current.elapsed +=
        current.lastFrame === null
          ? 0
          : Math.min(1 / 30, Math.max(0, now - current.lastFrame));
      current.lastFrame = now;
      const elapsed = current.elapsed;
      gl.domElement.dataset.motionElapsed = elapsed.toFixed(6);
      applySample(sampleCameraMotion(current.motion, elapsed), delta);
      if (elapsed >= current.motion.duration) {
        journey.current = null;
        if (tour.current.readyOnLoop && tour.current.entryElapsed !== null) {
          const overshoot = Math.max(0, elapsed - current.motion.duration);
          tour.current.startedAt = activeTime - overshoot;
          tour.current.hasStarted = true;
          if (tour.current.walk) {
            promenade.current = new ContinuousPromenade(
              tour.current.walk,
              rendered.current!,
              data.rooms,
              walkDistanceAt(tour.current.walk, tour.current.entryElapsed)
                .distance,
            );
            gl.domElement.dataset.tourDuration =
              tour.current.walk.period.toFixed(3);
          }
        }
        arrive(current.id);
        const delay = tour.current.readyOnLoop ? 0 : TOUR_INITIAL_DELAY;
        tour.current.dueAt = activeTime + delay;
        if (allowedRef.current) wakeAfter(delay);
        invalidate(2);
      } else invalidate();
      return;
    }
    if (!allowedRef.current || !rendered.current) return;
    const state = tour.current;
    if (!state.walk) return;
    if (!state.hasStarted) {
      if (activeTime < state.dueAt) {
        wakeAfter(state.dueAt - activeTime);
        return;
      }
      state.startedAt = activeTime;
      state.hasStarted = true;
      gl.domElement.dataset.tourDuration = state.walk.period.toFixed(3);
    }
    const elapsed = activeTime - state.startedAt;
    if (!promenade.current) {
      promenade.current = new ContinuousPromenade(
        state.walk,
        rendered.current,
        data.rooms,
        state.entryElapsed === null
          ? 0
          : walkDistanceAt(state.walk, state.entryElapsed).distance,
      );
    }
    const sample = promenade.current.step(activeDelta, size.width, size.height);
    applySample(sample, delta);
    const travel = {
      distance: promenade.current.distance,
      speed: Math.hypot(...sample.velocity),
    };
    gl.domElement.dataset.tourState = "walking";
    gl.domElement.dataset.tourElapsed = elapsed.toFixed(5);
    gl.domElement.dataset.tourProgress = (
      (travel.distance / state.walk.length) %
      1
    ).toFixed(6);
    gl.domElement.dataset.tourCycle = String(
      Math.floor(travel.distance / state.walk.length),
    );
    gl.domElement.dataset.tourSpeed = travel.speed.toFixed(5);
    gl.domElement.dataset.tourYawSpeed = (
      (sample.yawVelocity * 180) /
      Math.PI
    ).toFixed(4);
    if (activeTime - state.lastMetadataTime >= 0.3) {
      state.lastMetadataTime = activeTime;
      const artworkId = visibleWalkArtwork(
        sample,
        tourArtworks(data, state.walk.roomId),
        size.width,
        size.height,
        state.artworkId,
      );
      if (artworkId !== state.artworkId) {
        state.artworkId = artworkId;
        gl.domElement.dataset.tourArtwork = artworkId ?? "";
        callbacks.current.onTourArtwork?.(artworkId);
      }
    }
    invalidate();
  }, -0.5);
  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={false}
      smoothTime={0}
      draggingSmoothTime={0}
      mouseButtons={{ left: 0, middle: 0, right: 0, wheel: 0 }}
      touches={{ one: 0, two: 0, three: 0 }}
    />
  );
}
