import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getPublicData } from "@/lib/data/repository";
import PublicHeader from "@/components/public/PublicHeader";
import PublicFooter from "@/components/public/PublicFooter";
export const dynamic = "force-dynamic";
export const metadata = { title: "À propos" };
export default async function About() {
  const data = await getPublicData();
  return (
    <>
      <PublicHeader
        name={data.settings.artistName}
        active="about"
        immersive="/?vue=apropos"
      />
      <main className="editorial-page">
        <div className="editorial-visual">
          {data.artworks[0] && (
            <img
              src={data.artworks[0].detailImage}
              alt={data.artworks[0].alt}
            />
          )}
          <span>La couleur comme point de rencontre.</span>
        </div>
        <article>
          <span className="eyebrow">À propos</span>
          <h1>{data.settings.aboutTitle}</h1>
          <div className="gold-rule" />
          <p className="long-copy">{data.settings.aboutText}</p>
          <Link className="text-link" href="/oeuvres">
            Explorer les œuvres <ArrowUpRight size={17} />
          </Link>
        </article>
      </main>
      <PublicFooter demo={data.mode === "demo"} />
    </>
  );
}
