# Map glyphs (Noto Sans)

MapLibre asks for label glyphs one 256-codepoint range at a time. The style
used to point `glyphs` at `fonts.openmaptiles.org`, which made every map view
depend on the internet; the files here make it self-contained.

**Source:** [openmaptiles/fonts](https://github.com/openmaptiles/fonts)
release `v2.0`, `noto-sans.zip` — the same build the hosted service serves.

**Fontstacks:** `Noto Sans Regular` and `Noto Sans Italic` (place, country and
lake labels, see `src/components/mapStyle.js`) and `Noto Sans Bold` (the
cluster counts in `src/components/PortfolioMap.jsx`).

**Ranges:** only the five the label data actually uses — `0-255`, `256-511`,
`512-767`, `7680-7935` and `8192-8447`. The full set is 34 MB per fontstack;
this subset is 1.4 MB for the three. The ranges were derived from the data
itself:

```sql
select distinct (ascii(c)/256) from (
  select regexp_split_to_table(name,'') as c from ne_place
  union all select regexp_split_to_table(name,'') from ne_country_10m
  union all select regexp_split_to_table(name,'') from ne_country_50m
  union all select regexp_split_to_table(name,'') from ne_lake
  union all select regexp_split_to_table(name,'') from gadm_area
) t order by 1;
```

A label using a codepoint outside those ranges does not break the map: the
range 404s and that label is dropped. If the basemap ever covers scripts
beyond Latin — Cyrillic (`768-1023`, `1024-1279`), Greek, Arabic — re-run the
query and copy the missing `.pbf` files from the same release.
