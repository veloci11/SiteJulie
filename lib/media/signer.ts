import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ServiceError } from "@/lib/validation/artwork";
export async function signApprovedPath(path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new ServiceError("Signature privée non configurée.", 503);
  if (
    !/^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\/(thumb|room|detail)\.webp$/.test(
      path,
    )
  )
    throw new ServiceError("Chemin média refusé.", 403);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.storage
    .from("museum-private")
    .createSignedUrl(path, 60);
  if (error || !data) throw new ServiceError("Image indisponible.", 503);
  return data.signedUrl;
}
export async function finalizeProcessedUpload(
  id: string,
  width: number,
  height: number,
  verifiedActor: string,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new ServiceError("Traitement privé non configuré.", 503);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("complete_artwork_media", {
    upload_id: id,
    pixel_width: width,
    pixel_height: height,
    verified_actor: verifiedActor,
  });
  if (error) throw new ServiceError("Finalisation du média impossible.");
  return data;
}
