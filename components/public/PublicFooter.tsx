export default function PublicFooter({ demo }: { demo: boolean }) {
  return (
    <footer className="public-footer">
      <span>Prendre le temps de regarder.</span>
      <div>
        {demo && <small>Version de démonstration · Titres provisoires</small>}
      </div>
    </footer>
  );
}
