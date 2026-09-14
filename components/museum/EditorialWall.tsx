"use client";
import type { SiteSettings } from "@/lib/data/types";
import { EngravedText } from "./EngravedText";

export function EditorialWall({ settings }: { settings: SiteSettings }) {
  return (
    <>
      <EngravedText
        text="L’ATELIER"
        position={[-9.788, 3.42, -6.5]}
        rotationY={Math.PI / 2}
        width={2.0}
        height={0.25}
        small
      />
      <EngravedText
        text={settings.aboutTitle || "Au-delà de la toile"}
        position={[-9.787, 2.82, -6.5]}
        rotationY={Math.PI / 2}
        width={2.6}
        height={0.72}
      />
      <EngravedText
        text="UNE RENCONTRE"
        position={[9.788, 3.42, -6.5]}
        rotationY={-Math.PI / 2}
        width={2.2}
        height={0.25}
        small
      />
      <EngravedText
        text={settings.contactTitle || "Parlons d’une œuvre"}
        position={[9.787, 2.82, -6.5]}
        rotationY={-Math.PI / 2}
        width={2.6}
        height={0.72}
      />
    </>
  );
}
