-- Duel Masters card-image resolution audit (READ ONLY)
-- Assumes public.card_prints in the linked, correctly identified project.
-- Does NOT download images or write to production.

-- 1. Size bands. 384-pixel-wide portrait WebP is the existing standard.
SELECT CASE
  WHEN image_key IS NULL THEN 'no_image_key'
  WHEN image_width IS NULL OR image_height IS NULL THEN 'dimensions_unrecorded'
  WHEN image_width < 200 THEN 'critical_under_200px'
  WHEN image_width < 300 THEN 'small_200_to_299px'
  WHEN image_width < 384 THEN 'below_target_300_to_383px'
  ELSE 'at_least_384px'
END AS resolution_band, COUNT(*) AS prints
FROM public.card_prints
WHERE deleted_at IS NULL
GROUP BY 1 ORDER BY 1;

-- 2. Confirmed small records, one row per print. Do not replace artwork by matching name alone.
SELECT p.id AS print_id, p.canonical_card_id,
       c.name AS card_name, p.official_card_id, p.card_number,
       p.product_name, p.official_url, p.image_key,
       p.image_width, p.image_height, p.image_byte_size,
       p.image_updated_at, p.manually_locked,
       EXISTS (
         SELECT 1 FROM public.card_prints other
         WHERE other.canonical_card_id = p.canonical_card_id
           AND other.deleted_at IS NULL
           AND other.id <> p.id AND other.image_width >= 384
       ) AS higher_resolution_other_print_exists
FROM public.card_prints p
JOIN public.canonical_cards c ON c.id = p.canonical_card_id
WHERE p.deleted_at IS NULL AND p.image_key IS NOT NULL AND p.image_width < 300
ORDER BY p.image_width, p.product_name, p.card_number, p.id;

-- 3. Images lacking recorded dimensions: audit actual R2 assets separately.
SELECT p.id, c.name, p.official_card_id, p.card_number, p.image_key, p.image_byte_size
FROM public.card_prints p
JOIN public.canonical_cards c ON c.id = p.canonical_card_id
WHERE p.deleted_at IS NULL AND p.image_key IS NOT NULL
  AND (p.image_width IS NULL OR p.image_height IS NULL)
ORDER BY p.id;

-- 4. Additional review candidates. Small byte-size alone does NOT prove blurriness.
SELECT p.id, c.name, p.official_card_id, p.card_number, p.image_key,
       p.image_width, p.image_height, p.image_byte_size
FROM public.card_prints p
JOIN public.canonical_cards c ON c.id = p.canonical_card_id
WHERE p.deleted_at IS NULL AND p.image_width >= 300
  AND p.image_byte_size < 15000
ORDER BY p.image_byte_size, p.id;
