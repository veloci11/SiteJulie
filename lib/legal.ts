import "server-only";
export function legalIdentity() {
  return {
    name: process.env.SITE_EDITOR_NAME?.trim() || "Julie Thiam",
    address: process.env.SITE_EDITOR_ADDRESS?.trim() || "",
    locality: "Neuchâtel, Suisse",
    email: "contact@juliethiam.art",
  };
}
