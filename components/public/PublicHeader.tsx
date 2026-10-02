import Link from "next/link";
import { Landmark } from "lucide-react";
export default function PublicHeader({
  name,
  active,
  immersive = "/",
}: {
  name: string;
  active?: string;
  immersive?: string;
}) {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/">
        {name}
        <span>PEINTURES · GALERIE</span>
      </Link>
      <nav aria-label="Navigation principale">
        <Link href="/" aria-current={active === "home" ? "page" : undefined}>
          Accueil
        </Link>
        <Link
          href="/oeuvres"
          aria-current={active === "artworks" ? "page" : undefined}
        >
          Œuvres
        </Link>
        <Link
          href="/a-propos"
          aria-current={active === "about" ? "page" : undefined}
        >
          À propos
        </Link>
        <Link
          href="/contact"
          aria-current={active === "contact" ? "page" : undefined}
        >
          Contact
        </Link>
      </nav>
      <Link
        href={immersive}
        className="view-switch gallery-view-switch desktop-visit-link"
        aria-label="Entrer dans la visite 3D"
      >
        <Landmark size={17} strokeWidth={1.5} />
        <span>Visite 3D</span>
      </Link>
    </header>
  );
}
