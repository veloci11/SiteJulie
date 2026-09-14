"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="contact-page">
      <span className="eyebrow">La galerie</span>
      <h1>Un instant de pause.</h1>
      <p className="long-copy">
        Le contenu n’a pas pu être chargé. Vous pouvez réessayer dans un
        instant.
      </p>
      <button
        className="button button-dark"
        onClick={reset}
        style={{ marginTop: 25 }}
      >
        Réessayer
      </button>
    </main>
  );
}
