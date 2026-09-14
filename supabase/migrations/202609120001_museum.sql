-- Fresh project migration. No demo records and no administrator credentials.
create table public.admin_memberships (user_id uuid primary key references auth.users(id) on delete cascade, role text not null default 'admin' check (role='admin'));
create or replace function public.is_museum_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.admin_memberships where user_id=auth.uid()) $$;
revoke all on function public.is_museum_admin() from public; grant execute on function public.is_museum_admin() to authenticated;
alter table public.admin_memberships enable row level security;
create policy membership_read_self on public.admin_memberships for select to authenticated using(user_id=auth.uid());
create table public.rooms(id text primary key check(id ~ '^room-[1-4]$'),sort_order integer not null unique);
insert into public.rooms values('room-1',1);
create table public.site_settings(id integer primary key check(id=1),payload jsonb not null);
insert into public.site_settings values(1,'{"artistName":"","tagline":"","heroTitle":"","aboutTitle":"À propos","aboutText":"","contactTitle":"Contact","contactText":"","email":"","currency":"EUR"}');
-- Entire administrative record is private. Public access is through an explicit projection below.
create table public.artworks(id text primary key check(id ~ '^[a-zA-Z0-9-]{1,80}$'),payload jsonb not null,updated_at timestamptz not null default now(),
 check(payload->>'id'=id),check(payload->>'slug' ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),check(length(payload->>'title') between 1 and 200),check(payload->>'publication' in ('draft','published','archived')),check(payload->>'availability' in ('available','reserved','sold')),check(payload->>'priceVisibility' in ('public','on_request')),check(payload->>'currency' in ('EUR','CHF','USD')),
 check((payload->>'priceMinor') is null or ((payload->>'priceMinor')::bigint >=0)),check(payload->>'priceVisibility' <> 'public' or (payload->>'priceMinor') is not null));
create unique index artworks_slug_unique on public.artworks ((payload->>'slug'));
create unique index artworks_published_slot_unique on public.artworks ((payload->>'slotId')) where payload->>'publication'='published';
create table public.media_uploads(id uuid primary key,artwork_id text not null references public.artworks(id),owner_id uuid not null references auth.users(id),path text not null unique,status text not null check(status in ('pending','ready','failed')),created_at timestamptz not null default now());
create table public.admin_audit(id bigint generated always as identity primary key,actor uuid,operation text not null,target text,created_at timestamptz not null default now());
alter table public.artworks enable row level security;alter table public.rooms enable row level security;alter table public.site_settings enable row level security;alter table public.media_uploads enable row level security;alter table public.admin_audit enable row level security;
create policy artworks_admin_read on public.artworks for select to authenticated using(public.is_museum_admin());
create policy rooms_admin_read on public.rooms for select to authenticated using(public.is_museum_admin());
create policy settings_admin_read on public.site_settings for select to authenticated using(public.is_museum_admin());
create policy settings_admin_update on public.site_settings for update to authenticated using(public.is_museum_admin()) with check(public.is_museum_admin());
create policy uploads_admin_read on public.media_uploads for select to authenticated using(public.is_museum_admin());
create policy uploads_owner_insert on public.media_uploads for insert to authenticated with check(public.is_museum_admin() and owner_id=auth.uid() and status='pending' and path=auth.uid()::text||'/'||artwork_id||'/'||id::text||'/source');
create policy uploads_owner_update on public.media_uploads for update to authenticated using(public.is_museum_admin() and owner_id=auth.uid()) with check(public.is_museum_admin() and owner_id=auth.uid() and status='failed');
create policy audit_admin_read on public.admin_audit for select to authenticated using(public.is_museum_admin());
revoke all on public.artworks,public.rooms,public.site_settings,public.media_uploads,public.admin_memberships,public.admin_audit from anon,authenticated;
grant select on public.artworks,public.rooms,public.site_settings,public.media_uploads,public.admin_memberships,public.admin_audit to authenticated;
grant update(payload) on public.site_settings to authenticated;
grant insert on public.media_uploads to authenticated;grant update(status) on public.media_uploads to authenticated;
create or replace function public.get_public_museum() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('rooms',(select coalesce(jsonb_agg(id order by sort_order),'[]') from rooms),'settings',(select payload from site_settings where id=1),'artworks',(select coalesce(jsonb_agg(jsonb_build_object(
 'id',id,'slug',payload->'slug','title',payload->'title','description',payload->'description','technique',payload->'technique','widthCm',payload->'widthCm','heightCm',payload->'heightCm','year',payload->'year','imageWidth',payload->'imageWidth','imageHeight',payload->'imageHeight',
 'image','/api/media/'||id||'?variant=room&v='||coalesce(payload->>'mediaId','1'),'thumbnail','/api/media/'||id||'?variant=thumb&v='||coalesce(payload->>'mediaId','1'),'detailImage','/api/media/'||id||'?variant=detail&v='||coalesce(payload->>'mediaId','1'),'alt',payload->'alt',
 'priceMinor',case when payload->>'priceVisibility'='public' then payload->'priceMinor' else 'null'::jsonb end,'currency',payload->'currency','availability',payload->'availability','roomId',payload->'roomId','slotId',payload->'slotId','frameStyle',payload->'frameStyle','order',payload->'order','collection',payload->'collection') order by (payload->>'order')::int),'[]') from artworks where payload->>'publication'='published'));
$$;
revoke all on function public.get_public_museum() from public;grant execute on function public.get_public_museum() to anon,authenticated;
create or replace function public.save_artwork(candidate jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
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
  if exists(select 1 from artworks where id<>candidate->>'id' and payload->>'publication'='published' and payload->>'slotId'=slot) then raise exception 'Emplacement occupé';end if;
  if coalesce((candidate->>'imageWidth')::int,0)<1 or coalesce((candidate->>'imageHeight')::int,0)<1 or length(trim(coalesce(candidate->>'alt','')))=0 or not exists(select 1 from media_uploads where id::text=candidate->>'mediaId' and artwork_id=candidate->>'id' and status='ready') then raise exception 'Image et texte alternatif requis';end if;
 end if;
 next=jsonb_set(candidate,'{revision}',to_jsonb(coalesce((old->>'revision')::int,0)+1));
 insert into artworks(id,payload) values(candidate->>'id',next) on conflict(id) do update set payload=excluded.payload,updated_at=now();
 insert into admin_audit(actor,operation,target) values(auth.uid(),'save_artwork',candidate->>'id');return next;
end $$;
revoke all on function public.save_artwork(jsonb) from public;grant execute on function public.save_artwork(jsonb) to authenticated;
create or replace function public.add_museum_room() returns text language plpgsql security definer set search_path=public as $$ declare n integer; room text;begin if not public.is_museum_admin() then raise exception 'Accès refusé';end if;perform pg_advisory_xact_lock(72619001);select count(*)+1 into n from rooms;if n>4 then raise exception 'Quatre salles maximum';end if;room='room-'||n;insert into rooms values(room,n);return room;end $$;
revoke all on function public.add_museum_room() from public;grant execute on function public.add_museum_room() to authenticated;
create or replace function public.complete_artwork_media(upload_id uuid,pixel_width integer,pixel_height integer,verified_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare u media_uploads; a jsonb;
begin
 if not exists(select 1 from admin_memberships where user_id=verified_actor) then raise exception 'Accès refusé';end if;
 perform pg_advisory_xact_lock(72619001);select * into u from media_uploads where id=upload_id and owner_id=verified_actor and status='pending' for update;
 if not found or pixel_width<1 or pixel_height<1 or pixel_width::bigint*pixel_height>25000000 then raise exception 'Téléversement invalide';end if;
 select payload into a from artworks where id=u.artwork_id for update;
 a=a||jsonb_build_object('mediaId',u.id::text,'imageWidth',pixel_width,'imageHeight',pixel_height,'image','/api/media/'||u.artwork_id||'?variant=room&v='||u.id,'thumbnail','/api/media/'||u.artwork_id||'?variant=thumb&v='||u.id,'detailImage','/api/media/'||u.artwork_id||'?variant=detail&v='||u.id,'revision',(a->>'revision')::int+1);
 update artworks set payload=a,updated_at=now() where id=u.artwork_id;update media_uploads set status='ready' where id=u.id;return a;
end $$;
revoke all on function public.complete_artwork_media(uuid,integer,integer,uuid) from public,anon,authenticated;grant execute on function public.complete_artwork_media(uuid,integer,integer,uuid) to service_role;
create or replace function public.get_public_media_path(artwork_key text,image_variant text) returns text language sql stable security definer set search_path=public as $$ select regexp_replace(m.path,'/source$','/'||image_variant||'.webp') from artworks a join media_uploads m on m.id::text=a.payload->>'mediaId' where a.id=artwork_key and a.payload->>'publication'='published' and m.status='ready' and image_variant in ('thumb','room','detail') $$;
revoke all on function public.get_public_media_path(text,text) from public;grant execute on function public.get_public_media_path(text,text) to anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('museum-private','museum-private',false,20971520,array['image/jpeg','image/png','image/webp','image/avif','application/octet-stream']);
create policy museum_private_read_admin on storage.objects for select to authenticated using(bucket_id='museum-private' and public.is_museum_admin());
create policy museum_private_owner_insert on storage.objects for insert to authenticated with check(bucket_id='museum-private' and public.is_museum_admin() and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.media_uploads m where m.owner_id=auth.uid() and m.status='pending' and (name=m.path or name=regexp_replace(m.path,'/source$','/(thumb|room|detail).webp') or name ~ ('^'||regexp_replace(m.path,'/source$','')||'/(thumb|room|detail)\.webp$'))));
create policy museum_private_owner_update on storage.objects for update to authenticated using(bucket_id='museum-private' and public.is_museum_admin() and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='museum-private' and public.is_museum_admin() and (storage.foldername(name))[1]=auth.uid()::text);
