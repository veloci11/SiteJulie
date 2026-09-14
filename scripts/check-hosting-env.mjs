// Check names and format only: never print environment values or credentials.
const problems = [];
const env = process.env;
const mode = env.MUSEUM_DATA_MODE;

if (!["supabase", "blob"].includes(mode || ""))
  problems.push(
    "MUSEUM_DATA_MODE doit être supabase ou blob pour un hébergement public.",
  );
if (env.MUSEUM_LOCAL_PREVIEW || env.MUSEUM_LOCAL_DATA_DIR)
  problems.push(
    "Supprimer MUSEUM_LOCAL_PREVIEW et MUSEUM_LOCAL_DATA_DIR de Vercel.",
  );

if (!env.NEXT_PUBLIC_SITE_URL?.trim())
  problems.push("NEXT_PUBLIC_SITE_URL manque dans les variables Vercel.");
else {
  try {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error();
  } catch {
    problems.push(
      "NEXT_PUBLIC_SITE_URL doit être une origine HTTPS publique, sans chemin ni identifiants.",
    );
  }
}

if (mode === "supabase") {
  const publicKey =
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.trim())
    problems.push("NEXT_PUBLIC_SUPABASE_URL manque dans les variables Vercel.");
  else {
    try {
      const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
      )
        throw new Error();
    } catch {
      problems.push(
        "NEXT_PUBLIC_SUPABASE_URL doit être une origine HTTPS publique, sans chemin ni identifiants.",
      );
    }
  }
  if (!publicKey?.trim())
    problems.push(
      "Une clé publique Supabase manque (NEXT_PUBLIC_SUPABASE_ANON_KEY ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).",
    );
  if (!secretKey?.trim())
    problems.push(
      "Une clé serveur Supabase manque (SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY).",
    );
  if (
    publicKey &&
    (publicKey === secretKey || publicKey.startsWith("sb_secret_"))
  )
    problems.push(
      "La clé publique Supabase ne doit jamais être une clé privilégiée.",
    );
}

if (mode === "blob") {
  for (const key of [
    "BLOB_READ_WRITE_TOKEN",
    "MUSEUM_ADMIN_USERNAME",
    "MUSEUM_ADMIN_PASSWORD_HASH",
    "MUSEUM_SESSION_SECRET",
  ]) {
    if (!env[key]?.trim())
      problems.push(`${key} manque dans les variables Vercel.`);
  }
  if (
    env.MUSEUM_ADMIN_PASSWORD_HASH &&
    !/^scrypt\$[A-Za-z0-9_-]{16,}\$[A-Za-z0-9_-]{32,}$/.test(
      env.MUSEUM_ADMIN_PASSWORD_HASH,
    )
  )
    problems.push("MUSEUM_ADMIN_PASSWORD_HASH a un format invalide.");
  if (env.MUSEUM_SESSION_SECRET && env.MUSEUM_SESSION_SECRET.trim().length < 32)
    problems.push(
      "MUSEUM_SESSION_SECRET doit contenir au moins 32 caractères.",
    );
}

if (problems.length) {
  console.error(
    "Configuration d’hébergement incomplète :\n- " + problems.join("\n- "),
  );
  process.exitCode = 1;
} else {
  console.log(
    "Variables d’hébergement présentes. Cela ne valide pas le contenu ni l’accès au stockage.",
  );
}
