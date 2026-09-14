import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Box } from "lucide-react";
import { getPublicData } from "@/lib/data/repository";
import { priceLabel, availabilityLabel } from "@/lib/public";
import PublicHeader from "@/components/public/PublicHeader";
import PublicFooter from "@/components/public/PublicFooter";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPublicData();
  const a = data.artworks.find((a) => a.slug === slug);
  return {
    title: a?.title || "Œuvre introuvable",
    description: a?.description || "Découvrez cette œuvre dans la galerie.",
  };
}
export default async function ArtworkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPublicData();
  const a = data.artworks.find((a) => a.slug === slug);
  if (!a) notFound();
  return (
    <>
      <PublicHeader
        name={data.settings.artistName}
        active="artworks"
        immersive={`/?vue=oeuvre&slug=${a.slug}`}
      />
      <main className="artwork-page">
        <Link href="/oeuvres" className="text-link back-link">
          <ArrowLeft size={16} /> Toutes les œuvres
        </Link>
        <div className="artwork-page-grid">
          <div className="artwork-original">
            <img
              src={a.detailImage}
              alt={a.alt}
              width={a.imageWidth}
              height={a.imageHeight}
            />
          </div>
          <article className="artwork-page-info">
            <span className="eyebrow">La collection</span>
            <h1>{a.title}</h1>
            {a.description && <p className="long-copy">{a.description}</p>}
            <dl className="artwork-facts">
              {a.technique && (
                <>
                  <dt>Technique</dt>
                  <dd>{a.technique}</dd>
                </>
              )}
              {a.widthCm && a.heightCm && (
                <>
                  <dt>Dimensions</dt>
                  <dd>
                    {a.widthCm} × {a.heightCm} cm
                  </dd>
                </>
              )}
              {a.year && (
                <>
                  <dt>Année</dt>
                  <dd>{a.year}</dd>
                </>
              )}
              <dt>Référence</dt>
              <dd>{a.id}</dd>
            </dl>
            <p className="artwork-price">{priceLabel(a)}</p>
            <p className={`availability ${a.availability}`}>
              {availabilityLabel(a)}
            </p>
            <Link
              className="button button-dark"
              href={`/contact?oeuvre=${a.slug}`}
            >
              S’informer sur cette œuvre <ArrowUpRight size={17} />
            </Link>
            <Link className="text-link" href={`/?vue=oeuvre&slug=${a.slug}`}>
              <Box size={17} /> Voir dans la galerie 3D
            </Link>
          </article>
        </div>
      </main>
      <PublicFooter demo={data.mode === "demo"} />
    </>
  );
}
