import path from "node:path";
import { after, NextResponse } from "next/server";
import { getPublicData } from "@/lib/data/repository";
import { localRoot } from "@/lib/data/local";
import { arrivalImage } from "@/lib/museum/arrivalImage";
import { failure } from "@/lib/auth/api";

import { scheduleArrival } from "@/lib/museum/arrivalService";

export const runtime = "nodejs";
export const maxDuration = 240;
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const view = query.get("view") === "portrait" ? "portrait" : "wide";
    const data = await getPublicData();
    const room = query.get("room") || "room-1";
    const buffer = await arrivalImage(
      data,
      room,
      view,
      localRoot(),
      path.join(process.cwd(), "public", "museum"),
    );
    scheduleArrival(data, after);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
