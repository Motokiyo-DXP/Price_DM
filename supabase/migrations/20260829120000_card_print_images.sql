alter table public.card_prints
  add column image_key text,
  add column image_width integer,
  add column image_height integer,
  add column image_byte_size integer,
  add column image_updated_at timestamptz;

alter table public.card_prints
  add constraint card_prints_image_key_format check (image_key is null or image_key ~ '^[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*$'),
  add constraint card_prints_image_dimensions check ((image_width is null and image_height is null) or (image_width > 0 and image_height > 0)),
  add constraint card_prints_image_byte_size check (image_byte_size is null or image_byte_size > 0);

create unique index card_prints_image_key_idx on public.card_prints(image_key) where image_key is not null;

comment on column public.card_prints.image_key is
  'Extensionless path below NEXT_PUBLIC_CARD_IMAGE_BASE_URL. The standard derivative is 384px WebP q78.';

update public.card_prints as prints
set
  image_key = samples.image_key,
  image_width = 384,
  image_height = 537,
  image_byte_size = samples.byte_size,
  image_updated_at = pg_catalog.now()
from (values
  (1890::bigint, 'sample/welchius'::text, 69100::integer),
  (1113::bigint, 'sample/dogiragon-gyaku'::text, 66416::integer),
  (639::bigint, 'sample/chakra-delfin'::text, 91768::integer)
) as samples(print_id, image_key, byte_size)
where prints.id = samples.print_id;
