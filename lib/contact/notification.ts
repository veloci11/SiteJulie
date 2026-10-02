export interface ContactNotificationInput {
  artistName: string;
  visitorName: string;
  visitorEmail: string;
  message: string;
  origin: string;
  artwork?: {
    id: string;
    slug: string;
    title: string;
    collection?: string;
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderContactNotification(input: ContactNotificationInput) {
  const artworkUrl = input.artwork
    ? new URL(
        `/oeuvres/${encodeURIComponent(input.artwork.slug)}`,
        input.origin,
      ).href
    : undefined;
  const subject = input.artwork
    ? `Nouvelle demande — ${input.artwork.title.replace(/[\r\n]/g, " ")} (${input.artwork.id})`
    : `Nouveau message depuis la galerie — ${input.visitorName}`;
  const text = [
    `Nouvelle demande pour ${input.artistName}`,
    "",
    `De : ${input.visitorName}`,
    `Email : ${input.visitorEmail}`,
    ...(input.artwork
      ? [
          "",
          `Œuvre : ${input.artwork.title}`,
          ...(input.artwork.collection
            ? [`Collection : ${input.artwork.collection}`]
            : []),
          `Référence : ${input.artwork.id}`,
          artworkUrl || "",
        ]
      : ["", "Demande générale"]),
    "",
    "Message :",
    input.message,
    "",
    `Répondez à cet email pour écrire à ${input.visitorName}.`,
  ].join("\n");

  const artistName = escapeHtml(input.artistName);
  const visitorName = escapeHtml(input.visitorName);
  const visitorEmail = escapeHtml(input.visitorEmail);
  const message = escapeHtml(input.message).replace(/\r?\n/g, "<br>");
  const artwork = input.artwork;
  const artworkSection = artwork
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f5f0e7;border-left:3px solid #806b44"><tbody><tr><td style="padding:20px 22px">
        <p style="margin:0 0 8px;color:#806b44;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase">À propos de l’œuvre</p>
        <p style="margin:0 0 7px;color:#3f352c;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.2">${escapeHtml(artwork.title)}</p>
        <p style="margin:0 0 10px;color:#695f54;font-size:13px;line-height:1.5">${artwork.collection ? `${escapeHtml(artwork.collection)} · ` : ""}Réf. ${escapeHtml(artwork.id)}</p>
        <a href="${escapeHtml(artworkUrl || "")}" style="color:#806b44;font-size:13px;font-weight:700;text-decoration:underline">Voir l’œuvre sur la galerie</a>
      </td></tr></tbody></table>`
    : "";

  // Tables and inline styles keep the notification readable in common mail clients.
  const html = `<!doctype html>
<html lang="fr" dir="ltr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nouvelle demande depuis la galerie</title></head>
<body lang="fr" dir="ltr" style="margin:0;padding:0;background-color:#f5f0e7;color:#3f352c;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${visitorName} vous a écrit depuis le formulaire de votre site internet.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f5f0e7"><tbody><tr><td align="center" style="padding:42px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;border-collapse:collapse;background-color:#fffdf9;border:1px solid #ded4c4;border-radius:18px"><tbody>
      <tr><td style="padding:40px 42px 32px">
        <p style="margin:0 0 20px;color:#806b44;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase">${artistName} · Galerie</p>
        <h1 style="margin:0 0 12px;color:#3f352c;font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:400;line-height:1.14">Une nouvelle demande</h1>
        <p style="margin:0 0 30px;color:#695f54;font-size:15px;line-height:1.6">${visitorName} vous a écrit depuis le formulaire de votre site internet.</p>
        ${artworkSection}
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-top:30px"><tbody>
          <tr><td style="padding:0 0 19px;border-bottom:1px solid #ded4c4">
            <p style="margin:0 0 8px;color:#806b44;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase">De la part de</p>
            <p style="margin:0 0 4px;color:#3f352c;font-size:17px;font-weight:700">${visitorName}</p>
            <a href="mailto:${visitorEmail}" style="color:#806b44;font-size:14px;text-decoration:underline">${visitorEmail}</a>
          </td></tr>
          <tr><td style="padding:25px 0 2px">
            <p style="margin:0 0 13px;color:#806b44;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase">Son message</p>
            <p style="margin:0;color:#3f352c;font-size:16px;line-height:1.75;overflow-wrap:break-word">${message}</p>
          </td></tr>
        </tbody></table>
      </td></tr>
      <tr><td style="padding:22px 42px 27px;background-color:#f5f0e7;border-top:1px solid #ded4c4;border-radius:0 0 18px 18px">
        <p style="margin:0;color:#695f54;font-size:13px;line-height:1.5">Répondez directement à cet email pour écrire à ${visitorName}.</p>
      </td></tr>
    </tbody></table>
  </td></tr></tbody></table>
</body></html>`;
  return { subject, text, html };
}
