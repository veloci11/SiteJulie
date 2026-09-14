import type { Page } from "@playwright/test";

// Follow the visible navigation at this viewport. Return the real opener so
// keyboard tests can still verify focus restoration when the dialog closes.
export async function openArtworkDrawer(page: Page) {
  const desktop = page.locator(".visit-navigation").getByRole("button", {
    name: "Les œuvres",
    exact: true,
  });
  if (await desktop.isVisible()) {
    await desktop.click();
    return desktop;
  }
  const menu = page.getByRole("button", {
    name: "Ouvrir le menu",
    exact: true,
  });
  await menu.click();
  await page
    .getByRole("dialog", { name: "Bienvenue", exact: true })
    .getByRole("button", { name: "Les œuvres", exact: true })
    .click();
  return menu;
}
