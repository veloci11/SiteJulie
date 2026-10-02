interface ContactConfirmationInput {
  artistName: string;
  visitorName: string;
  contactEmail: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderContactConfirmation(input: ContactConfirmationInput) {
  const subject = `Message bien envoyé — ${input.artistName.replace(/[\r\n]/g, " ")}`;
  const text = [
    `Bonjour ${input.visitorName},`,
    "",
    "Votre message a bien été envoyé depuis le formulaire de la galerie.",
    `${input.artistName} pourra vous répondre à l’adresse email que vous avez indiquée.`,
    "",
    `Si vous souhaitez ajouter une précision, écrivez à ${input.contactEmail}.`,
    "",
    `À bientôt,`,
    `La galerie de ${input.artistName}`,
  ].join("\n");

  const artistName = escapeHtml(input.artistName);
  const visitorName = escapeHtml(input.visitorName);
  const contactEmail = escapeHtml(input.contactEmail);
  const html = `<!doctype html>
<html lang="fr" dir="ltr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Message bien envoyé</title></head>
<body lang="fr" dir="ltr" style="margin:0;padding:0;background-color:#f5f0e7;color:#3f352c;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Votre message a bien été envoyé depuis le formulaire de la galerie.</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f5f0e7"><tbody><tr><td align="center" style="padding:42px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;border-collapse:collapse;background-color:#fffdf9;border:1px solid #ded4c4;border-radius:18px"><tbody>
      <tr><td style="padding:40px 42px 32px">
        <p style="margin:0 0 20px;color:#806b44;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase">${artistName} · Galerie</p>
        <h1 style="margin:0 0 22px;color:#3f352c;font-family:Georgia,'Times New Roman',serif;font-size:36px;font-weight:400;line-height:1.14">Message bien envoyé</h1>
        <p style="margin:0 0 16px;color:#3f352c;font-size:16px;line-height:1.7">Bonjour ${visitorName},</p>
        <p style="margin:0 0 16px;color:#3f352c;font-size:16px;line-height:1.7">Votre message a bien été envoyé depuis le formulaire de la galerie. ${artistName} pourra vous répondre à l’adresse email que vous avez indiquée.</p>
        <p style="margin:0;color:#695f54;font-size:15px;line-height:1.7">Si vous souhaitez ajouter une précision, écrivez à <a href="mailto:${contactEmail}" style="color:#806b44;text-decoration:underline">${contactEmail}</a>.</p>
      </td></tr>
      <tr><td style="padding:22px 42px 27px;background-color:#f5f0e7;border-top:1px solid #ded4c4;border-radius:0 0 18px 18px">
        <p style="margin:0;color:#695f54;font-size:13px;line-height:1.5">À bientôt,<br>La galerie de ${artistName}</p>
      </td></tr>
    </tbody></table>
  </td></tr></tbody></table>
</body></html>`;
  return { subject, text, html };
}
