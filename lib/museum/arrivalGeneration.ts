import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import type { PublicData } from "@/lib/data/types";
import { arrivalFingerprint } from "./arrival";
import {
  arrivalFolder,
  arrivalReady,
  arrivalRooms,
  arrivalViews,
} from "./arrivalImage";

export type ArrivalCapture = (
  data: PublicData,
  origin: string,
  stillCurrent: () => Promise<boolean>,
) => Promise<Map<string, Buffer>>;
export interface ArrivalJob {
  data: PublicData;
  local: string;
  origin: string;
}
export interface ArrivalDependencies {
  readData: () => Promise<PublicData>;
  capture: ArrivalCapture;
  now?: () => number;
}
// Exactly one browser per server process. A changed revision supersedes queued
// work; the data is checked both before rendering and immediately before commit.
export class ArrivalGenerationQueue {
  private pending?: ArrivalJob;
  private running?: Promise<void>;
  private active?: string;
  private failure?: { fingerprint: string; at: number };
  constructor(private dependencies: ArrivalDependencies) {}
  retryAfter(fingerprint: string) {
    return this.failure?.fingerprint === fingerprint
      ? Math.max(
          0,
          60_000 -
            ((this.dependencies.now?.() ?? Date.now()) - this.failure.at),
        )
      : 0;
  }
  failed(fingerprint: string) {
    return this.retryAfter(fingerprint) > 0;
  }
  enqueue(job: ArrivalJob) {
    const fingerprint = arrivalFingerprint(job.data);
    if (this.retryAfter(fingerprint)) return;
    // A request for the active revision also supersedes an older pending request.
    this.pending = this.active === fingerprint ? undefined : job;
  }
  drain(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async run() {
    while (this.pending) {
      const job = this.pending;
      this.pending = undefined;
      const fingerprint = arrivalFingerprint(job.data);
      this.active = fingerprint;
      let temporary: string | undefined;
      try {
        const stillCurrent = async () =>
          arrivalFingerprint(await this.dependencies.readData()) ===
          fingerprint;
        if (
          !(await stillCurrent()) ||
          (await arrivalReady(job.data, job.local))
        )
          continue;
        const files = await this.dependencies.capture(
          job.data,
          job.origin,
          stillCurrent,
        );
        if (!(await stillCurrent())) continue;
        const parent = path.join(job.local, "arrival", "generated");
        await mkdir(parent, { recursive: true, mode: 0o700 });
        temporary = await mkdtemp(path.join(parent, ".pending-"));
        for (const room of arrivalRooms(job.data))
          for (const view of arrivalViews) {
            const name = `${room}-${view}.webp`;
            const image = files.get(name);
            if (!image?.length) throw new Error("Incomplete capture batch");
            await writeFile(path.join(temporary, name), image, { mode: 0o600 });
          }
        await writeFile(
          path.join(temporary, "manifest.json"),
          JSON.stringify({
            fingerprint,
            capturedAt: new Date().toISOString(),
            generated: true,
          }),
          { mode: 0o600 },
        );
        if (!(await stillCurrent())) continue;
        const destination = arrivalFolder(job.local, fingerprint);
        try {
          await rename(temporary, destination);
        } catch (error) {
          if (!(await arrivalReady(job.data, job.local))) throw error;
        }
        this.failure = undefined;
        // Old images are never served, and successful regeneration also removes
        // old automatic revisions from this private disk cache.
        for (const entry of await readdir(parent))
          if (/^[a-f0-9]{64}$/.test(entry) && entry !== fingerprint)
            await rm(path.join(parent, entry), {
              recursive: true,
              force: true,
            });
      } catch {
        this.failure = {
          fingerprint,
          at: this.dependencies.now?.() ?? Date.now(),
        };
      } finally {
        if (temporary) await rm(temporary, { recursive: true, force: true });
        this.active = undefined;
      }
    }
  }
}

export function arrivalCaptureOrigin(env: Record<string, string | undefined>) {
  if (
    env.MUSEUM_DATA_MODE !== "demo" ||
    env.MUSEUM_LOCAL_PREVIEW !== "1" ||
    env.MUSEUM_ARRIVAL_GENERATION === "0"
  )
    return null;
  const port = env.PORT || "3000";
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    return null;
  // Never trust request Host, Origin, a query URL or the public site's domain.
  return `http://127.0.0.1:${port}`;
}
