// Check names and format only: never print environment values or credentials.
const problems = [];
const env = process.env;
if (env.MUSEUM_DATA_MODE !== "supabase")
  problems.push("MUSEUM_DATA_MODE doit être supabase pour un hébergement public.");
if (env.MUSEUM_LOCAL_PREVIEW || env.MUSEUM_LOCAL_DATA_DIR)
  problems.push("Supprimer MUSEUM_LOCAL_PREVIEW et MUSEUM_LOCAL_DATA_DIR de Vercel.");
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
]) {
  if (!env[key]?.trim()) problems.push(`${key} manque dans les variables Vercel.`);
}
for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SITE_URL"]) {
  if (!env[key]) continue;
  try {
    const url = new URL(env[key]);
    if (
      url.protocol !== "https:" || url.username || url.password ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.search || url.hash || url.pathname !== "/"
    ) throw new Error();
  } catch {
    problems.push(`${key} doit être une origine HTTPS publique, sans chemin ni identifiants.`);
  }
}
if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY && (
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY.startsWith("sb_secret_")
)) problems.push("La clé publique Supabase ne doit jamais être une clé privilégiée.");
if (problems.length) {
  console.error("Configuration d’hébergement incomplète :\n- " + problems.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Variables d’hébergement présentes. Cela ne valide pas les migrations ni les accès Supabase.");
}
