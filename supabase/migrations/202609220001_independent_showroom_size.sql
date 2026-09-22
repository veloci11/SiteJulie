-- Showroom scale is independent of descriptive dimensions; image ratio stays intact.
-- Replaces geometry/validation without rewriting artwork payloads or changing RLS.
-- Prepared locally, not applied to a remote service.
create or replace function public.museum_placement_geometry(a jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare i integer; wall integer; x numeric; mw numeric; mh numeric; cy numeric; ratio numeric; scale numeric; w numeric; h numeric;
begin
 i=right(a->>'slotId',2)::integer;
 if i<1 or i>14 or (i>12 and a->>'roomId'<>'room-1') then raise exception 'Emplacement invalide';end if;
 scale=coalesce((a->>'displayScale')::numeric,1);
 ratio=(a->>'imageWidth')::numeric/nullif((a->>'imageHeight')::numeric,0);
 if ratio is null or ratio<=0 then raise exception 'Dimensions image invalides';end if;
 mh=case when i in(13,14) then 1.1 else 3 end;
 cy=case when i in(13,14) then 1.45 else 2.65 end;
 mw=case when i in(13,14) then 1.6 when i in(4,8) then 1.39 when i in(3,7) then 2.23 when i=10 and a->>'roomId'='room-1' then 2.80 else 2.30 end;
 h=least(mh,mw/ratio)*scale;w=h*ratio;
 if i=13 then wall=1;x=-2;
 elsif i=14 then wall=3;x=2;
 elsif i<=4 then wall=1;x=(array[-6,-2,1.5,4])[i];
 elsif i<=8 then wall=3;x=(array[6,2,-1.5,-4])[i-4];
 elsif i=12 then wall=2;x=-3.5;
 elsif i=10 and a->>'roomId'<>'room-1' then wall=2;x=3.5;
 else wall=0;x=(array[-3.5,0,3.5])[i-8];end if;
 return jsonb_build_object('wall',wall,'x',x+coalesce((a->>'placementOffsetX')::numeric,0),'y',cy+coalesce((a->>'placementOffsetY')::numeric,0),'width',w,'height',h,'limitX',((case when i in(13,14) then 2.30 else mw end)-w)/2,'minY',(case when i in(2,6,13,14) and a->>'roomId'='room-1' then 0.9 else cy-mh/2 end)-cy+h/2,'maxY',4.15-cy-h/2);
end $$;
revoke all on function public.museum_placement_geometry(jsonb) from public,anon,authenticated;

create or replace function public.validate_artwork_placement() returns trigger
language plpgsql security definer set search_path=public as $$
declare a jsonb; b jsonb; geom jsonb; othergeom jsonb; scale numeric; ox numeric; oy numeric;
begin
 a=new.payload;
 if (a ? 'displayScale' and jsonb_typeof(a->'displayScale')<>'number') or (a ? 'placementOffsetX' and jsonb_typeof(a->'placementOffsetX')<>'number') or (a ? 'placementOffsetY' and jsonb_typeof(a->'placementOffsetY')<>'number') then raise exception 'Réglages de placement numériques requis';end if;
 scale=coalesce((a->>'displayScale')::numeric,1);ox=coalesce((a->>'placementOffsetX')::numeric,0);oy=coalesce((a->>'placementOffsetY')::numeric,0);
 if scale<0.01 or scale>1 or abs(ox)>5 or abs(oy)>5 then raise exception 'Réglage de placement invalide';end if;
 if a->>'publication'<>'published' then return new;end if;
 perform pg_advisory_xact_lock(72619001);
 geom=public.museum_placement_geometry(a);
 if abs(ox)>(geom->>'limitX')::numeric+0.00001 or oy<(geom->>'minY')::numeric-0.00001 or oy>(geom->>'maxY')::numeric+0.00001 then raise exception 'Le cadre dépasse la zone sûre du mur';end if;
 for b in select payload from artworks where id<>new.id and payload->>'publication'='published' loop
  if lower(trim(coalesce(a->>'collection','')))<>'' and lower(trim(coalesce(b->>'collection','')))=lower(trim(a->>'collection')) and b->>'roomId'<>a->>'roomId' then raise exception 'Chaque collection occupe sa propre salle';end if;
  if b->>'roomId'<>a->>'roomId' then continue;end if;
  othergeom=public.museum_placement_geometry(b);
  if geom->>'wall'=othergeom->>'wall' and abs((geom->>'x')::numeric-(othergeom->>'x')::numeric)<((geom->>'width')::numeric+(othergeom->>'width')::numeric)/2+0.21 and abs((geom->>'y')::numeric-(othergeom->>'y')::numeric)<((geom->>'height')::numeric+(othergeom->>'height')::numeric)/2+0.21 then raise exception 'Les cadres se chevauchent';end if;
 end loop;
 return new;
end $$;
revoke all on function public.validate_artwork_placement() from public,anon,authenticated;



-- A zone can hold multiple works; the geometry trigger still rejects overlap.
drop index if exists public.artworks_published_slot_unique;
create or replace function public.save_artwork_validated(candidate jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare old jsonb; next jsonb; slot text; room text;
begin
 if not public.is_museum_admin() then raise exception 'Accès refusé'; end if;
 perform pg_advisory_xact_lock(72619001);
 if not candidate ?& array['id','slug','title','publication','availability','priceVisibility','currency','revision','image','imageWidth','imageHeight','roomId','slotId','alt'] or candidate->>'publication' is null or candidate->>'availability' is null or candidate->>'priceVisibility' is null or candidate->>'currency' is null or candidate->>'title' is null or candidate->>'slug' is null then raise exception 'Informations obligatoires manquantes';end if;
 select payload into old from artworks where id=candidate->>'id';
 if candidate->>'revision' is null or coalesce((old->>'revision')::int,0) <> (candidate->>'revision')::int then raise exception 'Édition concurrente. Rechargez cette œuvre.';end if;
 if coalesce(candidate->>'mediaId','')<>coalesce(old->>'mediaId','') or coalesce(candidate->>'image','')<>coalesce(old->>'image','') or coalesce((candidate->>'imageWidth')::int,0)<>coalesce((old->>'imageWidth')::int,0) or coalesce((candidate->>'imageHeight')::int,0)<>coalesce((old->>'imageHeight')::int,0) then raise exception 'L’image doit passer par le traitement serveur.';end if;
 if candidate->>'publication'='published' then
  room=candidate->>'roomId';slot=candidate->>'slotId';
  if room is null or slot is null or not exists(select 1 from rooms where id=room) or slot !~ ('^'||room||'-slot-(0[1-9]|1[0-2])$') then raise exception 'Emplacement invalide';end if;
  if coalesce((candidate->>'imageWidth')::int,0)<1 or coalesce((candidate->>'imageHeight')::int,0)<1 or length(trim(coalesce(candidate->>'alt','')))=0 or not exists(select 1 from media_uploads where id::text=candidate->>'mediaId' and artwork_id=candidate->>'id' and status='ready') then raise exception 'Image et texte alternatif requis';end if;
 end if;
 next=jsonb_set(candidate,'{revision}',to_jsonb(coalesce((old->>'revision')::int,0)+1));
 insert into artworks(id,payload) values(candidate->>'id',next) on conflict(id) do update set payload=excluded.payload,updated_at=now();
 insert into admin_audit(actor,operation,target) values(auth.uid(),'save_artwork',candidate->>'id');return next;
end $$;
revoke all on function public.save_artwork_validated(jsonb) from public, anon, authenticated;
