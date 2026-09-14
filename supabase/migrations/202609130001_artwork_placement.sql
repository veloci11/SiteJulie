-- Optional placement controls: legacy records keep offset 0 and displayScale 1.
-- Geometry mirrors lib/museum/config.ts. Never changes declared dimensions/media.
create or replace function public.museum_placement_geometry(a jsonb) returns jsonb
language plpgsql immutable set search_path=public as $$
declare i integer; wall integer; x numeric; mw numeric; ratio numeric; scale numeric; w numeric; h numeric; fit numeric;
begin
 i=right(a->>'slotId',2)::integer;
 if i<1 or i>12 then raise exception 'Emplacement invalide';end if;
 scale=coalesce((a->>'displayScale')::numeric,1);
 ratio=(a->>'imageWidth')::numeric/nullif((a->>'imageHeight')::numeric,0);
 if ratio is null or ratio<=0 then raise exception 'Dimensions image invalides';end if;
 mw=case when i in(4,8) then 1.39 when i in(3,7) then 2.23 when i=10 and a->>'roomId'='room-1' then 2.80 else 2.30 end;
 h=least(3,mw/ratio)*scale;w=h*ratio;
 if coalesce((a->>'widthCm')::numeric,0)>0 or coalesce((a->>'heightCm')::numeric,0)>0 then
  w=coalesce((a->>'widthCm')::numeric,(a->>'heightCm')::numeric*ratio)/100*scale;h=w/ratio;
  if w>mw+0.00001 or h>3.00001 or coalesce((a->>'heightCm')::numeric,0)/100*scale>3.00001 then raise exception 'Dimensions physiques incompatibles avec cet emplacement';end if;
  fit=least(1,mw/w,3/h);w=w*fit;h=h*fit;
 end if;
 if i<=4 then wall=1;x=(array[-6,-2,1.5,4])[i];
 elsif i<=8 then wall=3;x=(array[6,2,-1.5,-4])[i-4];
 elsif i=12 then wall=2;x=-3.5;
 elsif i=10 and a->>'roomId'<>'room-1' then wall=2;x=3.5;
 else wall=0;x=(array[-3.5,0,3.5])[i-8];end if;
 return jsonb_build_object('wall',wall,'x',x+coalesce((a->>'placementOffsetX')::numeric,0),'y',2.65+coalesce((a->>'placementOffsetY')::numeric,0),'width',w,'height',h,'limitX',(mw-w)/2,'limitY',(3-h)/2);
end $$;
revoke all on function public.museum_placement_geometry(jsonb) from public,anon,authenticated;

create or replace function public.validate_artwork_placement() returns trigger
language plpgsql security definer set search_path=public as $$
declare a jsonb; b jsonb; geom jsonb; othergeom jsonb; scale numeric; ox numeric; oy numeric;
begin
 a=new.payload;
 if (a ? 'displayScale' and jsonb_typeof(a->'displayScale')<>'number') or (a ? 'placementOffsetX' and jsonb_typeof(a->'placementOffsetX')<>'number') or (a ? 'placementOffsetY' and jsonb_typeof(a->'placementOffsetY')<>'number') then raise exception 'Réglages de placement numériques requis';end if;
 scale=coalesce((a->>'displayScale')::numeric,1);ox=coalesce((a->>'placementOffsetX')::numeric,0);oy=coalesce((a->>'placementOffsetY')::numeric,0);
 if scale<0.35 or scale>1 or abs(ox)>5 or abs(oy)>5 then raise exception 'Réglage de placement invalide';end if;
 if a->>'publication'<>'published' then return new;end if;
 perform pg_advisory_xact_lock(72619001);
 geom=public.museum_placement_geometry(a);
 if abs(ox)>(geom->>'limitX')::numeric+0.00001 or abs(oy)>(geom->>'limitY')::numeric+0.00001 then raise exception 'Le cadre dépasse la zone sûre du mur';end if;
 for b in select payload from artworks where id<>new.id and payload->>'publication'='published' loop
  if lower(trim(coalesce(a->>'collection','')))<>'' and lower(trim(coalesce(b->>'collection','')))=lower(trim(a->>'collection')) and b->>'roomId'<>a->>'roomId' then raise exception 'Chaque collection occupe sa propre salle';end if;
  if b->>'roomId'<>a->>'roomId' then continue;end if;
  if lower(trim(coalesce(b->>'collection','')))<>lower(trim(coalesce(a->>'collection',''))) then raise exception 'Cette salle appartient à une autre collection';end if;
  othergeom=public.museum_placement_geometry(b);
  if geom->>'wall'=othergeom->>'wall' and abs((geom->>'x')::numeric-(othergeom->>'x')::numeric)<((geom->>'width')::numeric+(othergeom->>'width')::numeric)/2+0.21 and abs((geom->>'y')::numeric-(othergeom->>'y')::numeric)<((geom->>'height')::numeric+(othergeom->>'height')::numeric)/2+0.21 then raise exception 'Les cadres se chevauchent';end if;
 end loop;
 return new;
end $$;
revoke all on function public.validate_artwork_placement() from public,anon,authenticated;
create trigger artworks_validate_placement before insert or update of payload on public.artworks for each row execute function public.validate_artwork_placement();

create or replace function public.get_public_museum() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('rooms',(select coalesce(jsonb_agg(id order by sort_order),'[]') from rooms),'settings',(select payload from site_settings where id=1),'artworks',(select coalesce(jsonb_agg(jsonb_build_object(
 'id',id,'slug',payload->'slug','title',payload->'title','description',payload->'description','technique',payload->'technique','widthCm',payload->'widthCm','heightCm',payload->'heightCm','year',payload->'year','imageWidth',payload->'imageWidth','imageHeight',payload->'imageHeight',
 'image','/api/media/'||id||'?variant=room&v='||coalesce(payload->>'mediaId','1'),'thumbnail','/api/media/'||id||'?variant=thumb&v='||coalesce(payload->>'mediaId','1'),'detailImage','/api/media/'||id||'?variant=detail&v='||coalesce(payload->>'mediaId','1'),'alt',payload->'alt',
 'priceMinor',case when payload->>'priceVisibility'='public' then payload->'priceMinor' else 'null'::jsonb end,'currency',payload->'currency','availability',payload->'availability','roomId',payload->'roomId','slotId',payload->'slotId','frameStyle',payload->'frameStyle','placementOffsetX',coalesce(payload->'placementOffsetX','0'::jsonb),'placementOffsetY',coalesce(payload->'placementOffsetY','0'::jsonb),'displayScale',coalesce(payload->'displayScale','1'::jsonb),'order',payload->'order','collection',payload->'collection') order by (payload->>'order')::int),'[]') from artworks where payload->>'publication'='published'));
$$;
revoke all on function public.get_public_museum() from public;grant execute on function public.get_public_museum() to anon,authenticated;
