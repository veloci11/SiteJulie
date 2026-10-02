import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { latestBackup, readPrivateBytes, sha256 } from "../lib/storage/backups";

// Read-only export. This script never writes to the live catalogue or images.
if (process.env.VERCEL !== "1") {
  // The local CLI uses the explicitly supplied store token, not an unrelated
  // development OIDC session. No parent-process environment is modified.
  delete process.env.BLOB_STORE_ID;
  delete process.env.VERCEL_OIDC_TOKEN;
}
async function main() {
  const destination = process.argv[2];
  if (
    !destination ||
    !path
      .resolve(destination)
      .startsWith(path.resolve(".local/backups") + path.sep)
  )
    throw new Error("Choisir un nouveau dossier sous .local/backups/.");
  const manifest = await latestBackup();
  if (!manifest) throw new Error("Aucune sauvegarde terminée.");
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await mkdir(destination, { recursive: false, mode: 0o700 });
  const catalog = await readPrivateBytes(manifest.catalogPath);
  if (sha256(catalog) !== manifest.catalogSha256)
    throw new Error("Le catalogue sauvegardé est corrompu.");
  await writeFile(path.join(destination, "catalog.json"), catalog, {
    flag: "wx",
    mode: 0o600,
  });
  for (const asset of manifest.assets) {
    const relative = asset.source.split("/");
    if (
      relative.some((part) => ["", ".", ".."].includes(part)) ||
      relative[0] !== "museum"
    )
      throw new Error("Chemin de restauration invalide.");
    const target = path.join(destination, ...relative);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const body = await readPrivateBytes(asset.backup);
    if (body.length !== asset.size || sha256(body) !== asset.sha256)
      throw new Error("Image sauvegardée incomplète ou corrompue.");
    await writeFile(target, body, { flag: "wx", mode: 0o600 });
  }
  await writeFile(
    path.join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      exported: true,
      assets: manifest.assets.length,
      destination,
    }),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
