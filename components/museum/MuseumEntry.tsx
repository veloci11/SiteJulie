"use client";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Destination, PublicData } from "@/lib/data/types";
import { classicUrl, parseDestination } from "@/lib/public";

type Props = { data: PublicData; initialDestination: Destination };
// This entry point never imports the renderer on a phone, including landscape.
export default function MuseumEntry({
  children,
  ...props
}: Props & { children: ReactNode }) {
  const router = useRouter();
  const [Shell, setShell] = useState<ComponentType<Props> | null>(null);
  useEffect(() => {
    let active = true;
    const phone = window.matchMedia(
      "(max-width: 767px), (pointer: coarse) and (max-width: 1100px)",
    );
    const chooseView = () => {
      if (phone.matches) {
        // The shell updates browser history while the entry props retain the
        // first destination. Preserve the work/contact currently being viewed.
        const currentDestination = parseDestination(
          window.location.search,
          props.data.artworks,
          props.data.rooms,
        );
        setShell(null);
        router.replace(classicUrl(currentDestination, props.data.artworks));
      } else {
        void import("./MuseumShell").then((module) => {
          if (active && !phone.matches) setShell(() => module.default);
        });
      }
    };
    chooseView();
    phone.addEventListener("change", chooseView);
    return () => {
      active = false;
      phone.removeEventListener("change", chooseView);
    };
  }, [router, props.data, props.initialDestination]);
  return Shell ? <Shell {...props} /> : children;
}
