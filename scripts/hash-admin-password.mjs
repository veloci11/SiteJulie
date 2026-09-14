import { randomBytes, scryptSync } from "node:crypto";

async function readPassword() {
  if (process.env.MUSEUM_ADMIN_PASSWORD_TO_HASH)
    return process.env.MUSEUM_ADMIN_PASSWORD_TO_HASH;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/[\r\n]+$/, "");
}

const password = await readPassword();
if (!password || password.length < 10) {
  console.error(
    "Définissez temporairement MUSEUM_ADMIN_PASSWORD_TO_HASH avec au moins 10 caractères.",
  );
  process.exit(1);
}
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32, {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});
console.log(
  `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`,
);
