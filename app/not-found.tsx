import Link from "next/link";
export default function NotFound() {
  return (
    <main className="contact-page">
      <span className="eyebrow">La galerie</span>
      <h1>Cette œuvre n’est pas exposée.</h1>
      <p className="long-copy">
        Le lien a peut-être changé ou cette œuvre a été retirée du catalogue.
      </p>
      <Link
        href="/oeuvres"
        className="button button-dark"
        style={{ marginTop: 25 }}
      >
        Découvrir les œuvres
      </Link>
    </main>
  );
}
