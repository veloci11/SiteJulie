-- Sequential local positions (0-based storage, 1-based artist interface).
-- Existing mutations remain protected by admin role, media ownership and placement validation.
-- This migration is prepared locally; it has not been executed against a remote service.
alter function public.save_artwork(jsonb) rename to save_artwork_validated;
revoke all on function public.save_artwork_validated(jsonb) from public, anon, authenticated;
create function public.save_artwork(candidate jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb; target_collection text; target_order integer;
begin
 if not public.is_museum_admin() then raise exception 'Accès refusé'; end if;
 perform pg_advisory_xact_lock(72619001);
 if jsonb_typeof(candidate->'order') is distinct from 'number' or (candidate->>'order')::numeric<>trunc((candidate->>'order')::numeric) or (candidate->>'order')::numeric<0 or (candidate->>'order')::numeric>100000 then raise exception 'Position dans la collection invalide';end if;
 target_collection=lower(trim(coalesce(candidate->>'collection','')));
 select least((candidate->>'order')::integer,count(*)::integer) into target_order from artworks where id<>candidate->>'id' and lower(trim(coalesce(payload->>'collection','')))=target_collection;
 result=public.save_artwork_validated(jsonb_set(candidate,'{order}',to_jsonb(target_order)));
 with peers as (
   select id,lower(trim(coalesce(payload->>'collection',''))) as collection,
     row_number() over(partition by lower(trim(coalesce(payload->>'collection',''))) order by coalesce((payload->>'order')::integer,0),id)-1 as rank
   from artworks where id<>candidate->>'id'
 ), positions as (
   select id,(rank+case when collection=target_collection and rank>=target_order then 1 else 0 end)::integer as rank from peers
   union all select candidate->>'id',target_order
 )
 update artworks a set payload=jsonb_set(jsonb_set(a.payload,'{order}',to_jsonb(p.rank)),'{revision}',to_jsonb(coalesce((a.payload->>'revision')::integer,0)+case when a.id=candidate->>'id' then 0 else 1 end)),updated_at=now()
 from positions p where p.id=a.id and (a.payload->>'order')::integer is distinct from p.rank;
 select payload into result from artworks where id=candidate->>'id';
 return result;
end $$;
revoke all on function public.save_artwork(jsonb) from public, anon;
grant execute on function public.save_artwork(jsonb) to authenticated;

create or replace function public.get_public_museum() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('rooms',(select coalesce(jsonb_agg(id order by sort_order),'[]') from rooms),'settings',(select payload from site_settings where id=1),'artworks',(select coalesce(jsonb_agg(jsonb_build_object(
 'id',id,'slug',payload->'slug','title',payload->'title','description',payload->'description','technique',payload->'technique','widthCm',payload->'widthCm','heightCm',payload->'heightCm','year',payload->'year','imageWidth',payload->'imageWidth','imageHeight',payload->'imageHeight',
 'image','/api/media/'||id||'?variant=room&v='||coalesce(payload->>'mediaId','1'),'thumbnail','/api/media/'||id||'?variant=thumb&v='||coalesce(payload->>'mediaId','1'),'detailImage','/api/media/'||id||'?variant=detail&v='||coalesce(payload->>'mediaId','1'),'alt',payload->'alt',
 'priceMinor',case when payload->>'priceVisibility'='public' then payload->'priceMinor' else 'null'::jsonb end,'currency',payload->'currency','availability',payload->'availability','roomId',payload->'roomId','slotId',payload->'slotId','frameStyle',payload->'frameStyle','placementOffsetX',coalesce(payload->'placementOffsetX','0'::jsonb),'placementOffsetY',coalesce(payload->'placementOffsetY','0'::jsonb),'displayScale',coalesce(payload->'displayScale','1'::jsonb),'order',payload->'order','collection',payload->'collection') order by payload->>'roomId', lower(trim(coalesce(payload->>'collection',''))), (payload->>'order')::int, id),'[]') from artworks where payload->>'publication'='published'));
$$;
revoke all on function public.get_public_museum() from public;grant execute on function public.get_public_museum() to anon,authenticated;
