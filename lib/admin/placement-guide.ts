import { roomOffset, type ArtworkSlot } from "@/lib/museum/config";
import { wallKey } from "@/lib/validation/placement";

// Fixed orientation of destinationPose(home/room): from +Z looking toward -Z.
// A doorway is not an orientation reference: extensions are entered from -Z.
export const WALL_GUIDES = [
  { id: 1, code: "A", label: "Mur gauche", side: "left" },
  { id: 3, code: "B", label: "Mur droit", side: "right" },
  { id: 0, code: "C", label: "Mur en face", side: "back" },
  { id: 2, code: "D", label: "Mur derrière", side: "front" },
] as const;

export function slotCode(slot: ArtworkSlot) {
  const number = Number(slot.id.split("-slot-")[1]);
  const wall = WALL_GUIDES.find((entry) => entry.id === wallKey(slot))!;
  if (slot.anchorIndex) return `${wall.code}2`;
  if (number <= 8) return `${wall.code}${((number - 1) % 4) + 1}`;
  if (wall.id === 0) return `${wall.code}${number - 8}`;
  return `${wall.code}${number === 10 ? 1 : 2}`;
}

export function planPoint(slot: ArtworkSlot) {
  return {
    x: 26 + ((slot.position[0] + 6) / 12) * 188,
    y: 28 + ((slot.position[2] - roomOffset(slot.roomId) + 9) / 18) * 212,
  };
}

export function roomPassages(roomId: string, rooms: readonly string[]) {
  const index = rooms.indexOf(roomId);
  return {
    back: index > 0 ? rooms[index - 1] : null,
    front: index >= 0 && index < rooms.length - 1 ? rooms[index + 1] : null,
  };
}
