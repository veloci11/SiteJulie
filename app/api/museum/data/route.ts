import { NextResponse } from "next/server";
import { getPublicData } from "@/lib/data/repository";
import { failure } from "@/lib/auth/api";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    // Exactly the same public projection as the gallery page: no admin payload.
    return NextResponse.json(await getPublicData(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
