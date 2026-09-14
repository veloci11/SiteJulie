import { after, NextResponse } from "next/server";
import { getPublicData } from "@/lib/data/repository";
import { failure } from "@/lib/auth/api";
import { arrivalStatus, scheduleArrival } from "@/lib/museum/arrivalService";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 240;
export async function GET() {
  try {
    const data = await getPublicData();
    const status = await arrivalStatus(data);
    if (!status.ready && status.supported) scheduleArrival(data, after);
    return NextResponse.json(status, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
