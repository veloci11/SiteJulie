"use client";
import {
  WALL_GUIDES,
  planPoint,
  roomPassages,
  slotCode,
} from "@/lib/admin/placement-guide";
import type { AdminArtwork } from "@/lib/data/types";
import type { ArtworkSlot } from "@/lib/museum/config";
import { wallKey } from "@/lib/validation/placement";

export default function RoomPlan({
  roomId,
  rooms,
  slots,
  selected,
  viewedWall,
  occupied,
  onView,
}: {
  roomId: string;
  rooms: string[];
  slots: ArtworkSlot[];
  selected?: ArtworkSlot;
  viewedWall: number;
  occupied: (slot: ArtworkSlot) => AdminArtwork | undefined;
  onView: (wall: number) => void;
}) {
  const passages = roomPassages(roomId, rooms);
  const guide = WALL_GUIDES.find((wall) => wall.id === viewedWall)!;
  const rotation = { 0: 0, 1: -90, 2: 180, 3: 90 }[viewedWall];
  const hitAreas: Record<
    number,
    { x: number; y: number; width: number; height: number }
  > = {
    1: { x: 10, y: 45, width: 32, height: 178 },
    3: { x: 198, y: 45, width: 32, height: 178 },
    0: { x: 26, y: 12, width: 188, height: 32 },
    2: { x: 26, y: 224, width: 188, height: 32 },
  };
  const strokes: Record<number, string> = {
    1: "M26 28V240",
    3: "M214 28V240",
    0: passages.back ? "M26 28H98 M142 28H214" : "M26 28H214",
    2: passages.front ? "M26 240H98 M142 240H214" : "M26 240H214",
  };
  return (
    <section className="admin-room-map" aria-label="Plan de la salle">
      <p className="admin-map-caption">
        <strong>1. Salle {roomId.replace("room-", "")} · Vue du dessus</strong>
        <span>Cliquez sur un mur ou sur sa lettre ci-dessous.</span>
      </p>
      <div className="admin-map-layout">
        {WALL_GUIDES.map((wall) => {
          const own = slots.filter((slot) => wallKey(slot) === wall.id);
          const free = own.filter(
            (slot) => !occupied(slot) && slot.id !== selected?.id,
          ).length;
          return (
            <button
              type="button"
              key={wall.id}
              className={`admin-map-wall is-${wall.side}`}
              aria-label={`${wall.code} · ${wall.label}`}
              aria-pressed={viewedWall === wall.id}
              onClick={() => onView(wall.id)}
            >
              <b>{wall.code}</b>
              <span>{wall.label}</span>
              <small>
                {own.length} zones
              </small>
              {selected && wallKey(selected) === wall.id && (
                <em>Votre tableau</em>
              )}
            </button>
          );
        })}
        <svg
          className="admin-plan-drawing"
          viewBox="0 0 240 280"
          role="group"
          aria-label={`Plan simplifié de la salle ${roomId.replace("room-", "")}`}
        >
          <rect
            x="26"
            y="28"
            width="188"
            height="212"
            fill="#f4f0e7"
            aria-hidden="true"
          />
          {WALL_GUIDES.map((wall) => (
            <g key={wall.id}>
              <path
                d={strokes[wall.id]}
                fill="none"
                stroke={viewedWall === wall.id ? "#455938" : "#b4b6aa"}
                strokeWidth={viewedWall === wall.id ? 7 : 3}
                aria-hidden="true"
              />
              <rect
                {...hitAreas[wall.id]}
                className="admin-map-hit"
                role="button"
                tabIndex={0}
                aria-label={`Voir le mur ${wall.code} sur le plan`}
                aria-pressed={viewedWall === wall.id}
                onClick={() => onView(wall.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onView(wall.id);
                  }
                }}
              />
            </g>
          ))}
          <g aria-hidden="true" className="admin-plan-annotations">
            <text x="120" y="15" textAnchor="middle">
              {passages.back
                ? `Passage · Salle ${passages.back.replace("room-", "")}`
                : "Mur fermé"}
            </text>
            <text x="120" y="266" textAnchor="middle">
              {passages.front
                ? `Passage · Salle ${passages.front.replace("room-", "")}`
                : "Mur fermé"}
            </text>
            {slots
              .filter((slot) => !slot.anchorIndex)
              .map((slot) => {
                const point = planPoint(slot);
                const lower = slots.find(
                  (other) =>
                    other.anchorIndex === Number(slot.id.split("-slot-")[1]),
                );
                const current = selected?.id === slot.id;
                const taken = Boolean(occupied(slot));
                const lowerCurrent = Boolean(
                  lower && selected?.id === lower.id,
                );
                return (
                  <g key={slot.id}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={current ? 9 : 5}
                      fill={current ? "#24646c" : taken ? "#92795b" : "#fff"}
                      stroke={current ? "#24646c" : "#6e7664"}
                      strokeWidth="1.5"
                    />
                    {lower && (
                      <circle
                        cx={point.x}
                        cy={point.y + 16}
                        r={lowerCurrent ? 7 : 4}
                        fill={
                          lowerCurrent
                            ? "#24646c"
                            : occupied(lower)
                              ? "#92795b"
                              : "#fff"
                        }
                        stroke={lowerCurrent ? "#24646c" : "#6e7664"}
                        strokeWidth="1.5"
                      />
                    )}
                    <text
                      x={
                        wallKey(slot) % 2
                          ? point.x < 120
                            ? point.x + 12
                            : point.x - 12
                          : point.x
                      }
                      y={
                        wallKey(slot) % 2
                          ? point.y + 4
                          : point.y + (wallKey(slot) === 0 ? 18 : -13)
                      }
                      textAnchor={
                        wallKey(slot) % 2
                          ? point.x < 120
                            ? "start"
                            : "end"
                          : "middle"
                      }
                      className={`admin-map-slot-code${current ? " admin-map-current-code" : ""}`}
                    >
                      <tspan>{slotCode(slot)}</tspan>
                      {lower && (
                        <tspan
                          x={point.x < 120 ? point.x + 12 : point.x - 12}
                          dy="16"
                          className={
                            lowerCurrent
                              ? "admin-map-current-code"
                              : "admin-map-secondary-code"
                          }
                        >
                          {slotCode(lower)}
                        </tspan>
                      )}
                    </text>
                  </g>
                );
              })}
            <text
              x="120"
              y="109"
              textAnchor="middle"
              className="admin-map-gaze-label"
            >
              Vue du mur {guide.code}
            </text>
            <g transform={`rotate(${rotation} 120 175)`}>
              <path d="M120 175L105 136H135Z" fill="#dfe7d3" />
              <path
                d="M120 166V143M113 151L120 143L127 151"
                stroke="#455938"
                fill="none"
                strokeWidth="2.5"
              />
            </g>
            <circle cx="120" cy="175" r="6" fill="#455938" />
          </g>
        </svg>
      </div>
      <div className="admin-map-legend" aria-label="Légende du plan">
        <span>
          <i className="is-free" />
          Zone vide
        </span>
        <span>
          <i className="is-occupied" />
          Zone occupée
        </span>
        <span>
          <i className="is-current" />
          Votre tableau
        </span>
      </div>
      <p className="admin-help">
        Gauche et droite se lisent depuis le bas du plan. La flèche pointe vers
        le mur consulté ; les lettres restent fixes. Choisissez ensuite une
        zone dans la vue de face, sous le plan. Une zone peut accueillir plusieurs tableaux de tailles différentes.
      </p>
    </section>
  );
}
