-- Map each application site to its Omada Northbound site identifier.
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS omada_site_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_omada_site_id
  ON sites (omada_site_id)
  WHERE omada_site_id IS NOT NULL;

