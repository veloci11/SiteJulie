import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import type { AdminArtwork, SiteSettings } from "./types";
import { isDemo } from "@/lib/auth/server";
import { ServiceError } from "@/lib/validation/artwork";
import type { RoomLayoutDraft } from "@/lib/admin/room-layout";
export interface LocalStore {
  artworks: AdminArtwork[];
  settings: SiteSettings;
  rooms: string[];
  uploads?: UploadRecord[];
  roomLayoutDrafts?: Record<string, RoomLayoutDraft>;
}
export interface UploadRecord {
  id: string;
  artworkId: string;
  ownerId: string;
  status: "pending" | "ready" | "failed";
  path: string;
  createdAt: number;
  artworkRevision?: number;
  error?: string;
}
export const localRoot = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.MUSEUM_LOCAL_DATA_DIR ||
      path.join(process.cwd(), ".local"),
  );
export async function readLocal(): Promise<LocalStore> {
  if (!isDemo()) throw new ServiceError("Stockage local désactivé.", 503);
  for (const file of ["data.json", "seed.json"]) {
    try {
      return JSON.parse(
        await readFile(
          /* turbopackIgnore: true */ path.join(
            /* turbopackIgnore: true */ localRoot(),
            file,
          ),
          "utf8",
        ),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  throw new ServiceError(
    "Catalogue de démonstration absent. Exécutez npm run media:prepare.",
    503,
  );
}
const queueState = globalThis as typeof globalThis & {
  museumWriteQueue?: Promise<unknown>;
};
export function mutateLocal<T>(
  fn: (store: LocalStore) => T | Promise<T>,
): Promise<T> {
  const operation = (queueState.museumWriteQueue || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const data = await readLocal();
      const result = await fn(data);
      await mkdir(localRoot(), { recursive: true });
      const file = path.join(localRoot(), "data.json");
      const temp = `${file}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
      await rename(temp, file);
      return result;
    });
  queueState.museumWriteQueue = operation;
  return operation;
}
