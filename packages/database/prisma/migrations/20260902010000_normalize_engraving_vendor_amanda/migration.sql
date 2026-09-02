-- Normaliza Gravador: só "Amanda" (case-insensitive) permanece; o restante vira null.
UPDATE "PurchaseRequest"
SET "engravingVendor" = 'Amanda'
WHERE "engravingVendor" IS NOT NULL
  AND LOWER("engravingVendor") LIKE '%amanda%';

UPDATE "PurchaseRequest"
SET "engravingVendor" = NULL
WHERE "engravingVendor" IS NOT NULL
  AND "engravingVendor" <> 'Amanda';
