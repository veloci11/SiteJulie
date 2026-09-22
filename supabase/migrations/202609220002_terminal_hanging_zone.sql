-- Prepared only: Blob production does not run this migration.
-- Derive D centre from the real closed terminal wall, preserving all old geometry.
alter function public.museum_placement_geometry(jsonb) rename to museum_placement_geometry_before_terminal_zone;
create function public.museum_placement_geometry(a jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare ratio numeric; h numeric; w numeric;
begin
 if a->>'roomId' <> 'room-2' or a->>'slotId' <> 'room-2-slot-13' then return public.museum_placement_geometry_before_terminal_zone(a); end if;
 ratio=(a->>'imageWidth')::numeric/nullif((a->>'imageHeight')::numeric,0);
 if ratio is null or ratio<=0 then raise exception 'Dimensions image invalides';end if;
 h=least(3,2.30/ratio)*coalesce((a->>'displayScale')::numeric,1);w=h*ratio;
 return jsonb_build_object('wall',2,'x',coalesce((a->>'placementOffsetX')::numeric,0),'y',2.65+coalesce((a->>'placementOffsetY')::numeric,0),'width',w,'height',h,'limitX',(2.30-w)/2,'minY',-1.5+h/2,'maxY',1.5-h/2);
end $$;
revoke all on function public.museum_placement_geometry(jsonb) from public,anon,authenticated;

create or replace function public.validate_terminal_zone() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(72619001);
 if new.payload->>'publication'='published' and new.payload->>'slotId'='room-2-slot-13' and exists(select 1 from rooms where id='room-3') then raise exception 'D centre est devenu un passage';end if;
 return new;
end $$;
revoke all on function public.validate_terminal_zone() from public,anon,authenticated;
create trigger check_terminal_zone before insert or update on public.artworks for each row execute function public.validate_terminal_zone();

create or replace function public.add_museum_room() returns text language plpgsql security definer set search_path=public as $$
declare n integer; room text;
begin
 if not public.is_museum_admin() then raise exception 'Accès refusé';end if;
 perform pg_advisory_xact_lock(72619001);
 select count(*)+1 into n from rooms;
 if n>4 then raise exception 'Quatre salles maximum';end if;
 if n=3 and exists(select 1 from artworks where payload->>'publication'='published' and payload->>'slotId'='room-2-slot-13') then raise exception 'Déplacez les tableaux de D centre avant d’ouvrir un passage vers la salle suivante';end if;
 room='room-'||n;insert into rooms values(room,n);return room;
end $$;
revoke all on function public.add_museum_room() from public,anon;
grant execute on function public.add_museum_room() to authenticated;

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
  if room is null or slot is null or not exists(select 1 from rooms where id=room) or (slot !~ ('^'||room||'-slot-(0[1-9]|1[0-2])$') and not (room='room-2' and slot='room-2-slot-13' and not exists(select 1 from rooms where id='room-3'))) then raise exception 'Emplacement invalide';end if;
  if coalesce((candidate->>'imageWidth')::int,0)<1 or coalesce((candidate->>'imageHeight')::int,0)<1 or length(trim(coalesce(candidate->>'alt','')))=0 or not exists(select 1 from media_uploads where id::text=candidate->>'mediaId' and artwork_id=candidate->>'id' and status='ready') then raise exception 'Image et texte alternatif requis';end if;
 end if;
 next=jsonb_set(candidate,'{revision}',to_jsonb(coalesce((old->>'revision')::int,0)+1));
 insert into artworks(id,payload) values(candidate->>'id',next) on conflict(id) do update set payload=excluded.payload,updated_at=now();
 insert into admin_audit(actor,operation,target) values(auth.uid(),'save_artwork',candidate->>'id');return next;
end $$;
revoke all on function public.save_artwork_validated(jsonb) from public, anon, authenticated;
