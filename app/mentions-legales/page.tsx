import Link from "next/link";
import LegalPage from "@/components/public/LegalPage";
import { legalIdentity } from "@/lib/legal";
import { getPublicData } from "@/lib/data/repository";
import { pageMetadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const data = await getPublicData();
  return pageMetadata(
    data.settings,
    "Mentions légales",
    "Éditeur, hébergement et conditions d’utilisation de la galerie Julie Thiam.",
    "/mentions-legales",
  );
}
export default function MentionsLegales() {
  const editor = legalIdentity();
  return (
    <LegalPage title="Mentions légales">
      <section>
        <h2>Éditeur et contact</h2>
        <p>
          {editor.name}, artiste peintre.
          <br />
          {editor.address || editor.locality}
        </p>
        <p>
          Pour toute question concernant ce site :{" "}
          <a href={`mailto:${editor.email}`}>{editor.email}</a>.
        </p>
      </section>
      <section>
        <h2>Hébergement</h2>
        <p>
          Le site et son stockage privé sont hébergés par Vercel Inc., 440 N
          Barranca Avenue #4133, Covina, CA 91723, États-Unis.
        </p>
        <p>
          <a href="https://vercel.com">vercel.com</a> ·{" "}
          <a href="https://vercel.com/legal/privacy-notice">
            Informations de Vercel sur la confidentialité
          </a>
          .
        </p>
        <p>
          Le nom de domaine et la redirection de l’adresse de contact sont gérés
          par Infomaniak Network SA, Suisse.
        </p>
      </section>
      <section>
        <h2>Œuvres et contenus</h2>
        <p>
          Les œuvres, photographies et textes présentés restent protégés par les
          droits de leurs auteurs. Leur reproduction ou leur utilisation, en
          dehors des usages autorisés par la loi, nécessite l’accord préalable
          du titulaire des droits.
        </p>
      </section>
      <section>
        <h2>Demandes concernant une œuvre</h2>
        <p>
          La galerie présente les œuvres et permet de contacter l’artiste. Le
          site ne propose ni panier ni paiement en ligne. Une demande envoyée
          par le formulaire ne constitue pas une commande ; les conditions
          éventuelles sont convenues directement avec l’artiste.
        </p>
      </section>
      <section>
        <h2>Données personnelles</h2>
        <p>
          Le traitement des données du formulaire et les moyens d’exercer vos
          droits sont décrits dans la{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
