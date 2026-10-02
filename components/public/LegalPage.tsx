import type { ReactNode } from "react";
import PublicHeader from "./PublicHeader";
import PublicFooter from "./PublicFooter";
import { getPublicData } from "@/lib/data/repository";
export default async function LegalPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const data = await getPublicData();
  return (
    <>
      <PublicHeader name={data.settings.artistName} />
      <main className="legal-page">
        <span className="eyebrow">Julie Thiam · Galerie</span>
        <h1>{title}</h1>
        <p className="legal-updated">Mise à jour : 2 octobre 2026</p>
        <div className="gold-rule" />
        <article>{children}</article>
      </main>
      <PublicFooter />
    </>
  );
}
