# Independent verification: does a correctly-computed (true geodesic ground
# distance, not a distorted-projection buffer) 1/4-mile buffer around each H3
# hex center reproduce Alex/Cascadia's own published numbers?
#
# Every number this script compares against comes straight from his own live
# app (https://preview.apps.cascadia-partners.ai/d5f0a3/) at run time — not
# from anything cached by a prior session. The only local dependency is the
# WFRC Housing Unit Inventory cache this project already fetched (see
# index.R); if you want a fully from-scratch pull with zero local
# dependencies, see the commented-out fetch block below.
#
# Run from the project root: Rscript buffer-mf-share.R

suppressMessages({
  library(sf)
  library(h3o)
  library(dplyr)
  library(jsonlite)
})
sf::sf_use_s2(TRUE)  # required for st_buffer() to produce a true geodesic buffer

# ── 1. Pull Alex's own numbers, live, directly from his app ───────────────────
# This is the exact file his page fetches client-side — see its <script> tag:
#   fetch("dwellings_index.json")
# Format: {"<hex_id>": {"mf": <% 0-100>, "rent": <% 0-100>, "tot": <HUI unit count>, "idx": <0-100>}, ...}
alex_url <- "https://preview.apps.cascadia-partners.ai/d5f0a3/dwellings_index.json"
alex_raw <- jsonlite::fromJSON(alex_url)

alex <- tibble::tibble(
  hex_id    = names(alex_raw),
  alex_mf   = vapply(alex_raw, function(x) x$mf,   numeric(1)),
  alex_rent = vapply(alex_raw, function(x) x$rent, numeric(1)),
  alex_tot  = vapply(alex_raw, function(x) x$tot,  numeric(1)),
  alex_idx  = vapply(alex_raw, function(x) x$idx,  numeric(1))
)
cat("Fetched", nrow(alex), "hexes from Alex's dwellings_index.json\n")

# ── 2. WFRC Housing Unit Inventory (HUI) — the source his own methodology
# text cites. Uses this project's local cache by default (fast, already
# fetched by index.R). To pull a completely independent fresh copy straight
# from WFRC's ArcGIS server instead, uncomment this block:
#
# hui <- arcgislayers::arc_select(
#   arcgislayers::arc_open("https://services1.arcgis.com/taguadKoI1XFwivx/ArcGIS/rest/services/hui_for_web2_gdb/FeatureServer/1"),
#   fields = c("TYPE", "UNIT_COUNT"), crs = sf::st_crs(4326L)
# )
hui_path <- "_data/remote/demographics/hui.gpkg"
if (!file.exists(hui_path)) {
  stop("HUI cache not found at ", hui_path, " -- run index.R once first, ",
       "or uncomment the arcgislayers fetch block above.")
}
hui <- sf::st_read(hui_path, quiet = TRUE) |>
  dplyr::mutate(is_mf = TYPE == "multi_family")
cat("Loaded", nrow(hui), "HUI records\n")

# ── 3. True H3 cell centers for every hex Alex reports — derived directly
# from the H3 IDs themselves (h3o::h3_to_points), independent of any of this
# project's own hex geometry files.
hex_ids    <- alex$hex_id
h3_pts     <- h3o::h3_to_points(h3o::h3_from_strings(hex_ids))  # WGS84 lon/lat
centers_sf <- sf::st_sf(hex_id = hex_ids, geometry = sf::st_sfc(h3_pts, crs = 4326))

# ── 4. A true geodesic 1/4-mile (402.336 m real ground distance) buffer
# around each center, and the sum of HUI units inside it.
RADIUS_M <- 0.25 * 1609.34  # 402.336 m
buf <- sf::st_buffer(centers_sf, units::set_units(RADIUS_M, "m"))

hits <- sf::st_join(buf, hui) |> sf::st_drop_geometry()
ours <- hits |>
  dplyr::group_by(hex_id) |>
  dplyr::summarise(
    mf_units    = sum(UNIT_COUNT[is_mf], na.rm = TRUE),
    total_units = sum(UNIT_COUNT, na.rm = TRUE),
    .groups = "drop"
  ) |>
  dplyr::mutate(mf_share_pct = ifelse(total_units > 0, 100 * mf_units / total_units, NA_real_))

# ── 5. Compare against Alex's numbers ──────────────────────────────────────
cmp <- dplyr::inner_join(ours, alex, by = "hex_id")

cat("\n=== Total HUI units within 1/4 mi (true ground distance): ours vs Alex's ===\n")
print(summary(cmp$total_units - cmp$alex_tot))
cat("correlation:  ", cor(cmp$total_units, cmp$alex_tot), "\n")
cat("exact match:  ", round(100 * mean(cmp$total_units == cmp$alex_tot), 2), "%\n")
cat("within 5%:    ", round(100 * mean(abs(cmp$total_units - cmp$alex_tot) <= 0.05 * pmax(cmp$alex_tot, 1)), 2), "%\n")

cat("\n=== MF share (%): ours vs Alex's ===\n")
print(summary(cmp$mf_share_pct - cmp$alex_mf))
cat("correlation:  ", cor(cmp$mf_share_pct, cmp$alex_mf, use = "complete.obs"), "\n")

cat("\n--- 10 random hexes, side by side ---\n")
set.seed(1)
cmp |>
  dplyr::slice_sample(n = 10) |>
  dplyr::select(hex_id, our_total = total_units, alex_tot, our_mf_pct = mf_share_pct, alex_mf) |>
  as.data.frame() |>
  print(digits = 4)

# ── 6. Scatter plots — ours (y) vs Alex's (x), with a 1:1 reference line.
# Points on the line = exact agreement; the tighter the scatter hugs the
# line, the better the match.
op <- par(mfrow = c(1, 2), mar = c(4, 4, 3, 1))

plot(cmp$alex_tot, cmp$total_units,
     xlab = "Alex's total HUI units", ylab = "Our total HUI units",
     main = "Total units within 1/4 mi", pch = 16, cex = 0.4, col = rgb(0, 0, 0, 0.25))
abline(0, 1, col = "red", lwd = 1.5)

plot(cmp$alex_mf, cmp$mf_share_pct,
     xlab = "Alex's MF share (%)", ylab = "Our MF share (%)",
     main = "Multifamily share", pch = 16, cex = 0.4, col = rgb(0, 0, 0, 0.25))
abline(0, 1, col = "red", lwd = 1.5)

par(op)
