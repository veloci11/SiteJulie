"use client";
import type { RoomCapacity } from "@/lib/admin/room-capacity";

export default function RoomOverview({
  rooms,
  collections,
  capacity,
  selected,
  onSelect,
  disabled,
}: {
  rooms: string[];
  collections: { name: string; roomId: string }[];
  capacity: (room: string) => RoomCapacity;
  selected: string;
  onSelect: (room: string) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="admin-room-overview" disabled={disabled}>
      <legend>Salle d’exposition</legend>
      <p className="admin-room-sequence">
        <strong>Les salles sont reliées dans cet ordre</strong>
        <span>
          {rooms
            .map((room) => `Salle ${room.replace("room-", "")}`)
            .join(" → ")}
        </span>
      </p>
      <div className="admin-room-options">
        {rooms.map((room) => {
          const { freeSurfaceM2, occupiedZones, total } = capacity(room);
          const names = collections
            .filter((collection) => collection.roomId === room)
            .map((collection) => collection.name || "Sans collection");
          return (
            <label key={room} className="admin-room-option">
              <input
                className="admin-room-radio"
                type="radio"
                name="roomId"
                value={room}
                checked={selected === room}
                onChange={() => onSelect(room)}
                aria-label={`Salle ${room.replace("room-", "")}`}
                aria-describedby={`room-collections-${room} room-capacity-${room}`}
                required
              />
              <span className="admin-room-outline" aria-hidden="true">
                <b>{room.replace("room-", "")}</b>
                {Array.from({ length: Math.min(total, 14) }, (_, index) => (
                  <i
                    key={index}
                    className={index < occupiedZones ? "is-taken" : ""}
                  />
                ))}
              </span>
              <strong>Salle {room.replace("room-", "")}</strong>
              <span id={`room-collections-${room}`}>
                {names.length ? names.join(" · ") : "Aucune collection"}
              </span>
              <small id={`room-capacity-${room}`}>
                {total} zones ·{" "}
                {freeSurfaceM2.toLocaleString("fr-CH", {
                  maximumFractionDigits: 1,
                })}{" "}
                m² hors cadres · l’ajout dépend du format du tableau
              </small>
              {selected === room && <em>✓ Salle choisie</em>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
