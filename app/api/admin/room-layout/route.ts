import { after } from "next/server";
import { assertMutationRequest } from "@/lib/auth/server";
import { failure, success } from "@/lib/auth/api";
import { getRoomLayout, saveRoomLayout } from "@/lib/data/room-layouts";
import { refreshArrivalAfterSave } from "@/lib/museum/arrivalService";
export const maxDuration = 240;
export async function GET(request: Request) {
  try {
    return success(
      await getRoomLayout(
        new URL(request.url).searchParams.get("roomId") ?? "",
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    await assertMutationRequest(request);
    const result = await saveRoomLayout(await request.json());
    if (result.action === "apply") refreshArrivalAfterSave(after);
    return success(result);
  } catch (error) {
    return failure(error);
  }
}
