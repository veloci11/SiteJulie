import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { renderContactNotification } from "../lib/contact/notification";
import { renderContactConfirmation } from "../lib/contact/confirmation";

const directory = path.resolve("artifacts/contact-preview");

const examples = [
  {
    file: "demande-oeuvre",
    input: {
      artistName: "Julie Thiam",
      visitorName: "Camille Martin",
      visitorEmail: "camille@example.com",
      message:
        "Bonjour Julie,\n\nJ’ai découvert cette œuvre dans votre galerie et j’aimerais en savoir un peu plus. Est-elle disponible ?\n\nMerci et belle journée,\nCamille",
      origin: "https://www.juliethiam.art",
      artwork: {
        id: "oeuvre-06",
        slug: "oeuvre-06",
        title: "Variations — 01",
        collection: "Variations",
      },
    },
  },
  {
    file: "demande-generale",
    input: {
      artistName: "Julie Thiam",
      visitorName: "Camille Martin",
      visitorEmail: "camille@example.com",
      message:
        "Bonjour Julie,\n\nJ’aimerais avoir des renseignements sur vos cours d’arts visuels. Pouvez-vous m’indiquer les horaires et les places disponibles ?\n\nMerci,\nCamille",
      origin: "https://www.juliethiam.art",
    },
  },
] as const;

async function main() {
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const example of examples) {
      const email = renderContactNotification(example.input);
      await writeFile(path.join(directory, `${example.file}.html`), email.html);
      await writeFile(
        path.join(directory, `${example.file}.txt`),
        `Objet : ${email.subject}\n\n${email.text}\n`,
      );
      const page = await browser.newPage({
        viewport: { width: 900, height: 950 },
        deviceScaleFactor: 1,
      });
      await page.setContent(email.html, { waitUntil: "load" });
      await page.screenshot({
        path: path.join(directory, `${example.file}.png`),
        fullPage: true,
      });
      await page.close();
      const mobilePage = await browser.newPage({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
      });
      await mobilePage.setContent(email.html, { waitUntil: "load" });
      await mobilePage.screenshot({
        path: path.join(directory, `${example.file}-mobile.png`),
        fullPage: true,
      });
      await mobilePage.close();
    }
    const confirmation = renderContactConfirmation({
      artistName: "Julie Thiam",
      visitorName: "GIL Mathis test",
      contactEmail: "contact@juliethiam.art",
    });
    await writeFile(
      path.join(directory, "confirmation.html"),
      confirmation.html,
    );
    await writeFile(
      path.join(directory, "confirmation.txt"),
      `Objet : ${confirmation.subject}\n\n${confirmation.text}\n`,
    );
    const page = await browser.newPage({
      viewport: { width: 900, height: 950 },
      deviceScaleFactor: 1,
    });
    await page.setContent(confirmation.html, { waitUntil: "load" });
    await page.screenshot({
      path: path.join(directory, "confirmation.png"),
      fullPage: true,
    });
    await page.close();
    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
    });
    await mobilePage.setContent(confirmation.html, { waitUntil: "load" });
    await mobilePage.screenshot({
      path: path.join(directory, "confirmation-mobile.png"),
      fullPage: true,
    });
    await mobilePage.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
