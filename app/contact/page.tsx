import Link from "next/link";
import { getPublicData } from "@/lib/data/repository";
import PublicHeader from "@/components/public/PublicHeader";
import PublicFooter from "@/components/public/PublicFooter";
import ContactActions from "@/components/public/ContactActions";
export const dynamic = "force-dynamic";
export const metadata = { title: "Contact" };
export default async function Contact({
  searchParams,
}: {
  searchParams: Promise<{ oeuvre?: string }>;
}) {
  const [data, p] = await Promise.all([getPublicData(), searchParams]);
  const a = data.artworks.find((a) => a.slug === p.oeuvre);
  return (
    <>
      <PublicHeader
        name={data.settings.artistName}
        active="contact"
        immersive={"/?vue=contact" + (a ? "&oeuvre=" + a.id : "")}
      />
      <main className="contact-page">
        <span className="eyebrow">Une conversation commence ici</span>
        <h1>{data.settings.contactTitle}</h1>
        <p className="long-copy">{data.settings.contactText}</p>
        <div className="gold-rule" />
        <ContactActions settings={data.settings} artwork={a} />
        {a && (
          <Link href="/contact" className="text-link">
            Faire une demande générale
          </Link>
        )}
      </main>
      <PublicFooter demo={data.mode === "demo"} />
    </>
  );
}
