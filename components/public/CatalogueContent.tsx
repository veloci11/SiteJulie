import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { priceLabel, availabilityLabel } from "@/lib/public";
import { groupCollections } from "@/lib/data/collections";
import PublicHeader from "@/components/public/PublicHeader";
import PublicFooter from "@/components/public/PublicFooter";
import type { PublicData } from "@/lib/data/types";
export default function CatalogueContent({
  data,
  active = "artworks",
}: {
  data: PublicData;
  active?: string;
}) {
  const collections = groupCollections(data.artworks, data.rooms);
  const priorityIds = new Set(
    collections
      .flatMap((group) => group.artworks)
      .slice(0, 3)
      .map((a) => a.id),
  );
  return (
    <>
      <a className="skip-link" href="#catalogue">
        Aller aux œuvres
      </a>
      <PublicHeader name={data.settings.artistName} active={active} />
      <main id="catalogue" className="catalogue-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">La collection</span>
            <h1>
              Les œuvres,
              <span className="serif-italic"> au fil des couleurs.</span>
            </h1>
          </div>
          <p>
            {String(data.artworks.length).padStart(2, "0")} œuvres à découvrir
            <br />À votre rythme, en toute simplicité.
          </p>
        </div>
        {collections.map(({ name, artworks }) => {
          if (!artworks.length) return null;
          return (
            <section
              className="catalogue-collection"
              key={name}
              aria-label={name}
            >
              <div className="catalogue-collection-heading">
                <h2>{name}</h2>
                <span>{artworks.length} œuvres</span>
              </div>
              {data.settings.collectionDescriptions?.[name] && (
                <>
                  <p className="collection-copy">
                    {data.settings.collectionDescriptions[name]}
                  </p>
                  <details className="collection-mobile-copy">
                    <summary>À propos de cette collection</summary>
                    <p>{data.settings.collectionDescriptions[name]}</p>
                  </details>
                </>
              )}
              <div className="catalogue-grid">
                {artworks.map((a, i) => (
                  <Link
                    key={a.id}
                    href={`/oeuvres/${a.slug}`}
                    className="catalogue-card"
                    data-availability={a.availability}
                  >
                    <div className="catalogue-image">
                      <img
                        src={a.image}
                        alt={a.alt}
                        width={a.imageWidth}
                        height={a.imageHeight}
                        crossOrigin="anonymous"
                        decoding="async"
                        loading={priorityIds.has(a.id) ? "eager" : "lazy"}
                      />
                      <span className="catalogue-index">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="card-arrow">
                        <ArrowUpRight size={23} />
                      </span>
                    </div>
                    <div className="catalogue-caption">
                      <h2>{a.title}</h2>
                      <p>{priceLabel(a)}</p>
                    </div>
                    <small>{availabilityLabel(a)}</small>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </main>
      <PublicFooter />
    </>
  );
}
