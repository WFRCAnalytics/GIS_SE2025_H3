# ── MUC (Metropolitan / Urban / City Center) Hex Flags ─────────────────────────
# Flags each L9 hex by its spatial relationship to WFRC/MAG MUC center polygons.
# Depends on outputs already produced by index.R:
#   - _output/<GDB_NAME>.gpkg (layer "<GDB_NAME>_l9") for the final L9 hex set
#   - _data/remote/destinations/center_boundaries.gpkg (Wasatch Choice centers cache)

GDB_NAME  <- "wfrc_se_2025_rtp23"
MUC_TYPES <- c("Metropolitan Center", "Urban Center", "City Center")
BUFFER_M  <- 50
HEX_CRS   <- 26912   # NAD83 / UTM zone 12N — meters, used for all geometry ops and buffers

root <- here::here()

library(sf)
library(dplyr)

# ── Inputs ───────────────────────────────────────────────────────────────────

se_hex_path <- file.path(root, "_output", paste0(GDB_NAME, ".gpkg"))
cb_path     <- file.path(root, "_data/remote/destinations/center_boundaries.gpkg")

if (!file.exists(se_hex_path)) stop("L9 hex output not found — run index.R first.")
if (!file.exists(cb_path))     stop("center_boundaries.gpkg not found — run index.R first to populate the remote data cache.")

se_hex <- sf::read_sf(se_hex_path, layer = paste0(GDB_NAME, "_l9")) |>
  sf::st_transform(HEX_CRS)
hex_crs <- sf::st_crs(se_hex)

hex_poly  <- se_hex |> dplyr::select(hex_id) |> sf::st_make_valid()
centroids <- sf::st_centroid(hex_poly)

cb_layer <- sf::st_layers(cb_path)$name[[1L]]
cb_where <- sprintf("CenterType IN (%s)", paste(sprintf("'%s'", MUC_TYPES), collapse = ", "))

muc <- sf::read_sf(cb_path, query = sprintf('SELECT * FROM "%s" WHERE %s', cb_layer, cb_where)) |>
  sf::st_transform(hex_crs) |>
  sf::st_make_valid() |>
  dplyr::transmute(muc_id = dplyr::row_number(), CenterName, CenterType)

# ── 1. Hex entirely within a MUC polygon ────────────────────────────────────

within_muc <- lengths(sf::st_within(hex_poly, muc)) > 0L

# ── 2. Hex intersects a MUC polygon ─────────────────────────────────────────

intersects_muc <- lengths(sf::st_intersects(hex_poly, muc)) > 0L

# ── 3. Hex centroid within a MUC polygon, with Name/Type ───────────────────
# A level-9 hex is small enough that its centroid falls within at most one
# MUC polygon in practice, even though MUC polygons themselves can overlap
# (verified: 0 of 1537 matched hexes have >1 candidate). The stopifnot below
# fails loudly if a future MUC dataset update ever breaks that assumption,
# rather than silently duplicating hex rows.

centroid_best <- sf::st_join(centroids, muc, join = sf::st_within) |>
  sf::st_drop_geometry() |>
  dplyr::filter(!is.na(muc_id)) |>
  dplyr::select(hex_id, muc_name = CenterName, muc_type = CenterType)

stopifnot(!anyDuplicated(centroid_best$hex_id))

# ── 4-5. Hex centroid within a +/-50m buffer of a MUC polygon ──────────────
# +50m buffers of adjacent MUC polygons (e.g. downtown SLC) can overlap even
# when the source polygons don't — 36 hexes land in such an overlap. That's
# fine here: these flags are plain booleans (OR across all matches), unlike
# predicate 3, so overlap can't create an ambiguous/wrong result.

muc_buf_pos <- sf::st_buffer(muc, BUFFER_M)
muc_buf_neg <- sf::st_buffer(muc, -BUFFER_M)
muc_buf_neg <- dplyr::filter(muc_buf_neg, !sf::st_is_empty(muc_buf_neg))

centroid_in_muc_buf50     <- lengths(sf::st_intersects(centroids, muc_buf_pos)) > 0L
centroid_in_muc_buf_neg50 <- lengths(sf::st_intersects(centroids, muc_buf_neg)) > 0L

# ── Assemble & Export ────────────────────────────────────────────────────────

# Retain all original L9 columns (SE data, raw D variables, smoothed D
# variables) and swap in the validated geometry used for the predicates above.
muc_flags <- se_hex |>
  sf::st_set_geometry(sf::st_geometry(hex_poly)) |>
  dplyr::mutate(
    within_muc                 = within_muc,
    intersects_muc             = intersects_muc,
    centroid_in_muc            = hex_id %in% centroid_best$hex_id,
    centroid_in_muc_buf50      = centroid_in_muc_buf50,
    centroid_in_muc_buf_neg50  = centroid_in_muc_buf_neg50
  ) |>
  dplyr::left_join(centroid_best, by = "hex_id")

OUT_NAME  <- "wf_centers_h3"
gdb_path  <- file.path(root, "_output", paste0(OUT_NAME, ".gdb"))
zip_path  <- file.path(root, "_output", paste0(OUT_NAME, ".gdb.zip"))
gpkg_path <- file.path(root, "_output", paste0(OUT_NAME, ".gpkg"))

sf::write_sf(muc_flags, gdb_path, layer = OUT_NAME, driver = "OpenFileGDB", append = FALSE)

# GDAL's OpenFileGDB writer produces .spx spatial index files that ArcGIS and
# QGIS can fail to query correctly at small extents (features vanish when
# zoomed in; see https://github.com/OSGeo/gdal/issues/5888). Deleting them
# makes readers fall back to a correct in-memory index instead.
unlink(list.files(gdb_path, pattern = "\\.spx$", full.names = TRUE))

if (file.exists(zip_path)) unlink(zip_path)
old_wd <- setwd(file.path(root, "_output"))
on.exit(setwd(old_wd), add = TRUE)
zip(basename(zip_path), files = basename(gdb_path), flags = "-r9X")
setwd(old_wd)
unlink(gdb_path, recursive = TRUE)

if (file.exists(gpkg_path)) unlink(gpkg_path)
sf::write_sf(muc_flags, gpkg_path, layer = OUT_NAME, driver = "GPKG", append = FALSE)

cat(sprintf(
  "MUC flags written to %s and %s (%d hexes)\n  within_muc: %d\n  intersects_muc: %d\n  centroid_in_muc: %d\n  centroid_in_muc_buf50: %d\n  centroid_in_muc_buf_neg50: %d\n",
  zip_path, gpkg_path, nrow(muc_flags),
  sum(muc_flags$within_muc), sum(muc_flags$intersects_muc), sum(muc_flags$centroid_in_muc),
  sum(muc_flags$centroid_in_muc_buf50), sum(muc_flags$centroid_in_muc_buf_neg50)
))
