import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/validation/artwork";
export function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof ServiceError
          ? error.message
          : "Une erreur est survenue. Veuillez réessayer.",
    },
    {
      status: error instanceof ServiceError ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export function success(data: unknown) {
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
