import LegalPage from "@/components/public/LegalPage";
import { legalIdentity } from "@/lib/legal";
import { getPublicData } from "@/lib/data/repository";
import { pageMetadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const data = await getPublicData();
  return pageMetadata(
    data.settings,
    "Confidentialité",
    "Comment la galerie Julie Thiam utilise et protège les informations transmises par son formulaire de contact.",
    "/confidentialite",
  );
}
export default function Confidentialite() {
  const editor = legalIdentity();
  return (
    <LegalPage title="Confidentialité">
      <section>
        <h2>Responsable du traitement</h2>
        <p>
          {editor.name}, {editor.address || editor.locality}, est responsable
          des données traitées pour cette galerie. Contact :{" "}
          <a href={`mailto:${editor.email}`}>{editor.email}</a>.
        </p>
      </section>
      <section>
        <h2>Les informations que vous transmettez</h2>
        <p>
          Le formulaire demande votre nom, votre adresse email et votre message.
          Si votre demande concerne une œuvre, sa référence accompagne le
          message. Ces informations servent à transmettre votre demande à
          l’artiste, vous confirmer son envoi et permettre une réponse.
        </p>
        <p>
          Les champs du formulaire sont nécessaires à son envoi. Vous pouvez
          aussi écrire directement à l’adresse de contact. Évitez d’inclure des
          données sensibles inutiles à votre demande.
        </p>
        <p>
          Les données ne sont pas utilisées pour vous inscrire à une newsletter
          ou vous envoyer de la publicité. Le site n’enregistre pas les messages
          dans son catalogue.
        </p>
      </section>
      <section>
        <h2>Transmission des messages</h2>
        <p>
          Le site utilise Resend (Plus Five Five, Inc., États-Unis) pour envoyer
          le message à {editor.email} et une confirmation à votre adresse.
          L’adresse de contact est redirigée par Infomaniak vers la boîte de
          réception de l’artiste, hébergée par Proton, en Suisse.
        </p>
        <p>
          Vercel héberge le site et traite les données nécessaires à l’exécution
          du formulaire. L’artiste et ces prestataires peuvent accéder aux
          données dans la mesure nécessaire au traitement de votre demande et au
          fonctionnement de leurs services.
        </p>
      </section>
      <section>
        <h2>Traitements à l’étranger</h2>
        <p>
          Le traitement peut avoir lieu en Suisse, dans l’Union européenne
          (notamment en France pour le serveur du site et en Irlande pour
          l’envoi des emails) et aux États-Unis, où Vercel et Resend sont
          établis. Les prestataires encadrent les transferts internationaux dans
          leurs accords de traitement des données, notamment au moyen de clauses
          contractuelles types adaptées à la Suisse.
        </p>
        <p>
          Vous pouvez consulter les accords de{" "}
          <a href="https://vercel.com/legal/dpa">Vercel</a> et de{" "}
          <a href="https://resend.com/legal/dpa">Resend</a> pour connaître ces
          garanties et leurs sous-traitants.
        </p>
      </section>
      <section>
        <h2>Durée de conservation</h2>
        <p>
          La correspondance reçue dans la messagerie est conservée pendant le
          temps nécessaire au suivi de votre demande et, le cas échéant, au
          respect des obligations légales ou à la défense de droits. Les
          journaux d’envoi de Resend suivent la durée de conservation de son
          offre, actuellement de 30 jours.
        </p>
        <p>
          Les sauvegardes de la galerie contiennent le catalogue et les images,
          pas les messages du formulaire.
        </p>
      </section>
      <section>
        <h2>Sécurité et protection contre les abus</h2>
        <p>
          Pour limiter les envois abusifs, le serveur utilise votre adresse IP
          et votre email sous forme d’empreintes protégées par une clé secrète.
          Ces compteurs privés sont partagés entre les serveurs ; ils ne
          contiennent ni votre nom ni votre message. Les compteurs individuels
          expirent après 15 minutes et le compteur global après 24 heures. Les
          entrées expirées sont purgées lors des nouveaux envois et de la
          maintenance quotidienne.
        </p>
        <p>
          L’hébergeur peut également traiter des informations techniques, comme
          l’adresse IP, la date de connexion et la page demandée, pour fournir
          le site et assurer sa sécurité.
        </p>
      </section>
      <section>
        <h2>Cookies et stockage dans votre navigateur</h2>
        <p>
          La galerie n’intègre actuellement ni outil publicitaire ni outil de
          mesure d’audience. Les polices sont servies par le site. Un stockage
          local technique permet de signaler une mise à jour du catalogue entre
          les onglets ; il ne contient pas les informations du formulaire.
        </p>
        <p>
          L’espace d’administration utilise un cookie de session sécurisé,
          réservé à l’artiste, qui expire au bout de huit heures. Les liens
          externes, notamment Instagram, ont leurs propres règles de
          confidentialité.
        </p>
      </section>
      <section>
        <h2>Vos droits</h2>
        <p>
          Vous pouvez demander des informations sur vos données, leur
          rectification ou leur suppression, ou vous opposer à leur utilisation
          dans les conditions prévues par la loi applicable. Écrivez à{" "}
          <a href={`mailto:${editor.email}`}>{editor.email}</a> en précisant
          votre demande. Une vérification d’identité proportionnée peut être
          nécessaire.
        </p>
        <p>
          Vous pouvez également vous adresser au{" "}
          <a href="https://www.edoeb.admin.ch/fr">
            Préposé fédéral à la protection des données et à la transparence
          </a>
          , ou à l’autorité de contrôle compétente dans votre pays.
        </p>
      </section>
    </LegalPage>
  );
}
