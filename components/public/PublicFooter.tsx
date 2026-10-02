import Link from "next/link";

export default function PublicFooter() {
  return (
    <footer className="public-footer">
      <span>Prendre le temps de regarder.</span>
      <nav aria-label="Navigation de pied de page">
        <Link href="/">Accueil</Link>
        <Link href="/oeuvres">Œuvres</Link>
        <Link href="/a-propos">À propos</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/mentions-legales">Mentions légales</Link>
        <Link href="/confidentialite">Confidentialité</Link>
      </nav>
    </footer>
  );
}
