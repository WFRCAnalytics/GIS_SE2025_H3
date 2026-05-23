# ── Parameters ────────────────────────────────────────────────────────────────

GDB_NAME      <- "wfrc_se_2025_rtp23"
J2H           <- 1.8      # Jobs-to-Household ratio for WFRC/MAG region
HEX_AREA_SQMI <- 0.0406   # Fixed area of H3 level-9 hex in square miles

CENTER_WEIGHT <- 0.4
RING1_WEIGHT  <- 0.3
RING2_WEIGHT  <- 0.2
RING3_WEIGHT  <- 0.1

stopifnot(isTRUE(all.equal(CENTER_WEIGHT + RING1_WEIGHT + RING2_WEIGHT + RING3_WEIGHT, 1)))

# Edit rows to add, remove, or reclassify center types for the Destinations score
WC_CENTER_WEIGHTS <- c(
  "Metropolitan Center" = 1.0,
  "Urban Center"        = 0.8,
  "City Center"         = 0.6,
  "Neighborhood Center" = 0.4,
  "Employment District" = 0.2,
  "Retail District"     = 0.2,
  "Education District"  = 0.2,
  "Special District"    = 0.0,
  "Industrial District" = 0.0
)

root <- here::here()

# ── Libraries ─────────────────────────────────────────────────────────────────

library(sf)
library(h3o)
library(here)
library(mapgl)
library(tidycensus)
library(tigris)
library(arcgislayers)

# ── Helper Functions ───────────────────────────────────────────────────────────

fetch_or_cache <- function(url, cache_path, layer = NULL) {
  full_path <- file.path(root, cache_path)
  if (file.exists(full_path))
    return(if (is.null(layer)) sf::read_sf(full_path) else sf::read_sf(full_path, layer = layer))
  dir.create(dirname(full_path), recursive = TRUE, showWarnings = FALSE)
  data <- tryCatch(
    arcgislayers::arc_select(arcgislayers::arc_open(url)),
    error = function(e) stop("Failed to fetch '", cache_path, "': ", conditionMessage(e))
  )
  if (is.na(sf::st_crs(data))) sf::st_crs(data) <- 4326L
  sf::write_sf(data, full_path, driver = "GPKG")
  data
}

build_neighbor_index <- function(hex_ids, k = 3L) {
  h3_cells  <- h3o::h3_from_strings(hex_ids)
  all_disks <- h3o::grid_disk(h3_cells, k = k)
  all_dists <- h3o::grid_distances(h3_cells, k = k)
  pairs <- data.frame(
    center_id = rep(hex_ids, times = lengths(all_disks)),
    member_id = as.character(h3o::flatten_h3(all_disks)),
    ring      = unlist(all_dists),
    stringsAsFactors = FALSE
  )
  pairs <- pairs[pairs$member_id %in% hex_ids, ]
  ring_n <- lapply(1:3, function(r) tapply(pairs$ring == r, pairs$center_id, sum))
  pairs$weight <- ifelse(
    pairs$ring == 0L, CENTER_WEIGHT,
    ifelse(pairs$ring == 1L, RING1_WEIGHT / ring_n[[1L]][pairs$center_id],
    ifelse(pairs$ring == 2L, RING2_WEIGHT / ring_n[[2L]][pairs$center_id],
                             RING3_WEIGHT / ring_n[[3L]][pairs$center_id]))
  )
  pairs
}

# NAs in `values` are treated as 0 in the weighted sum (rowsum na.rm = TRUE).
# Effective weight for a hex is < 1 when any neighbor has NA; results are not
# renormalized, so smoothed values near NA regions are pulled slightly toward 0.
smooth_by_neighbors <- function(hex_ids, values, neighbor_index) {
  val_map        <- setNames(values, hex_ids)
  idx            <- neighbor_index
  idx$weighted   <- val_map[idx$member_id] * idx$weight
  agg            <- rowsum(idx$weighted, idx$center_id, na.rm = TRUE)
  agg[hex_ids, , drop = TRUE]
}

# 1 if any feature from features_sf touches the hex, 0 otherwise
flag_presence <- function(hex_sf, features_sf) {
  ft <- sf::st_transform(features_sf, sf::st_crs(hex_sf))
  as.integer(lengths(sf::st_intersects(hex_sf, ft)) > 0L)
}

# ── Remote Data Fetch & Cache ──────────────────────────────────────────────────

# Design
intersection_hex <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/Street_Intersection_Density_2025/FeatureServer/3",
  cache_path = "_data/remote/design/intersection_hex.gpkg"
)

# Destinations
center_boundaries <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/ArcGIS/rest/services/WCV_Centers_and_Regional_Land_Uses/FeatureServer/0",
  cache_path = "_data/remote/destinations/center_boundaries.gpkg"
)
health_care <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/LicensedHealthCareFacilities/FeatureServer/0",
  cache_path = "_data/remote/destinations/health_care.gpkg"
)
schools <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/Schools_PreKto12/FeatureServer/0",
  cache_path = "_data/remote/destinations/schools.gpkg"
)
grocery_stores <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/UtahGroceryAndFoodStores_DAF/FeatureServer/0",
  cache_path = "_data/remote/destinations/grocery_stores.gpkg"
)
city_halls <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/CommunityServices_gdb/FeatureServer/0",
  cache_path = "_data/remote/destinations/city_halls.gpkg"
)
parks_local <- fetch_or_cache(
  url        = "https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/UtahParksLocal/FeatureServer/0",
  cache_path = "_data/remote/destinations/parks_local.gpkg"
)
parks_wfrc <- fetch_or_cache(
  url        = "https://services1.arcgis.com/taguadKoI1XFwivx/arcgis/rest/services/AccessToParks_082024_gdb/FeatureServer/2",
  cache_path = "_data/remote/destinations/parks_wfrc.gpkg"
)

# Demographics: ACS BG median income
bg_income_path <- file.path(root, "_data/remote/demographics/bg_income.gpkg")
if (!file.exists(bg_income_path)) {
  dir.create(dirname(bg_income_path), recursive = TRUE, showWarnings = FALSE)
  bg_income <- tidycensus::get_acs(
    geography = "block group",
    variables = "B19013_001",
    state     = "UT",
    county    = c("Box Elder", "Davis", "Weber", "Salt Lake", "Utah",
                  "Tooele", "Morgan", "Summit", "Wasatch"),
    year      = 2023,
    geometry  = TRUE
  )
  sf::write_sf(bg_income, bg_income_path, driver = "GPKG")
} else {
  bg_income <- sf::read_sf(bg_income_path)
}

# Demographics: 2020 Census block-level occupied housing units (interpolation weights)
blocks_hh_path <- file.path(root, "_data/remote/demographics/blocks_2020_hh.gpkg")
if (!file.exists(blocks_hh_path)) {
  dir.create(dirname(blocks_hh_path), recursive = TRUE, showWarnings = FALSE)
  blocks_hh <- tidycensus::get_decennial(
    geography = "block",
    variables = "H1_002N",
    state     = "UT",
    county    = c("Box Elder", "Davis", "Weber", "Salt Lake", "Utah",
                  "Tooele", "Morgan", "Summit", "Wasatch"),
    year      = 2020,
    geometry  = TRUE
  )
  sf::write_sf(blocks_hh, blocks_hh_path, driver = "GPKG")
} else {
  blocks_hh <- sf::read_sf(blocks_hh_path)
}

# Transit: UTA GTFS
gtfs_zip <- file.path(root, "_data/remote/transit/GTFS.zip")
gtfs_dir <- file.path(root, "_data/remote/transit/gtfs")
if (!file.exists(gtfs_zip) || !dir.exists(gtfs_dir)) {
  dir.create(dirname(gtfs_zip), recursive = TRUE, showWarnings = FALSE)
  if (!file.exists(gtfs_zip))
    download.file("https://gtfsfeed.rideuta.com/GTFS.zip", gtfs_zip, mode = "wb")
  unzip(gtfs_zip, exdir = gtfs_dir)
}

# County boundaries (for density NA flagging) — tigris guarantees a NAME column
utah_counties_path <- file.path(root, "_data/remote/boundaries/utah_counties.gpkg")
if (!file.exists(utah_counties_path)) {
  dir.create(dirname(utah_counties_path), recursive = TRUE, showWarnings = FALSE)
  utah_counties <- tigris::counties(state = "UT", cb = TRUE, year = 2022)
  sf::write_sf(utah_counties, utah_counties_path, driver = "GPKG")
} else {
  utah_counties <- sf::read_sf(utah_counties_path)
}

# ── SE Data Import ─────────────────────────────────────────────────────────────

se_hex <- sf::read_sf(
  paste0("/vsizip/", file.path(root, "_data", paste0(GDB_NAME, ".gdb.zip"))),
  layer = GDB_NAME
)
hex_ids <- se_hex$hex_id
hex_crs <- sf::st_crs(se_hex)

# ── Neighbor Index ─────────────────────────────────────────────────────────────

neighbor_index <- build_neighbor_index(hex_ids)

# ── 1. Density ─────────────────────────────────────────────────────────────────

res_s  <- smooth_by_neighbors(hex_ids, se_hex$residential_units, neighbor_index)
jobs_s <- smooth_by_neighbors(hex_ids, se_hex$total_jobs, neighbor_index)
density <- (res_s + jobs_s / J2H) / HEX_AREA_SQMI

# Flag hexes in Tooele Valley, Morgan, Summit, and Wasatch counties as NA
# TODO: pending TBD methodology for these areas per supervisor guidance
# inspect names(utah_counties) to confirm the county name field before running
na_county_names <- c("Tooele", "Morgan", "Summit", "Wasatch")
county_join <- sf::st_join(
  sf::st_centroid(se_hex["hex_id"]),
  sf::st_transform(utah_counties["NAME"], hex_crs),
  join = sf::st_within
)
density[county_join$NAME %in% na_county_names] <- NA_real_

# ── 2. Diversity ───────────────────────────────────────────────────────────────

hh_s  <- smooth_by_neighbors(hex_ids, se_hex$households, neighbor_index)
emp_s <- smooth_by_neighbors(hex_ids, se_hex$total_jobs,  neighbor_index)
hw    <- hh_s * J2H
diversity <- ifelse(hw == 0 | emp_s == 0, NA_real_, pmin(hw, emp_s) / pmax(hw, emp_s))

# ── 3. Design ──────────────────────────────────────────────────────────────────

# inspect class(intersection_hex$hex_id) and class(se_hex$hex_id) before joining;
# both layers use H3 string IDs → direct join on hex_id
design_lookup <- merge(
  data.frame(hex_id = hex_ids, stringsAsFactors = FALSE),
  sf::st_drop_geometry(intersection_hex)[, c("hex_id", "IntPtsPerM")],
  by = "hex_id", all.x = TRUE
)
design <- smooth_by_neighbors(hex_ids, design_lookup$IntPtsPerM, neighbor_index)

# ── 4. Destinations ────────────────────────────────────────────────────────────

## Step 1: WC Center score

cb_proj <- sf::st_transform(center_boundaries, hex_crs) |> sf::st_make_valid()
# inspect names(cb_proj) to confirm the center type field; adjust if needed
cb_proj$tier_weight <- WC_CENTER_WEIGHTS[cb_proj$CenterType]
cb_proj <- cb_proj[!is.na(cb_proj$tier_weight) & cb_proj$tier_weight > 0, ]

hex_area_m2 <- setNames(as.numeric(sf::st_area(se_hex)), hex_ids)

cb_int    <- sf::st_intersection(se_hex["hex_id"], cb_proj[, c("CenterType", "tier_weight")])
cb_int_df <- sf::st_drop_geometry(cb_int)
cb_int_df$int_area <- as.numeric(sf::st_area(cb_int))
cb_int_df$contrib  <- cb_int_df$int_area / hex_area_m2[cb_int_df$hex_id] * cb_int_df$tier_weight

wc_raw   <- tapply(cb_int_df$contrib, cb_int_df$hex_id, sum)
wc_score <- setNames(numeric(length(hex_ids)), hex_ids)
wc_score[names(wc_raw)] <- pmin(as.numeric(wc_raw), 1.0)

## Step 2: Amenity presence flags

# inspect names(schools) — filter field and value may differ from "SchoolLevel"/"high"
high_schools    <- schools[grepl("high", schools$SchoolLevel, ignore.case = TRUE), ]
# inspect names(grocery_stores) — confirm TYPE field name
grocery_filt    <- grocery_stores[
  grocery_stores$TYPE %in% c("Grocery Store", "Specialty Grocery", "Supermarket"), ]
# inspect names(city_halls) — confirm Facility field name
city_halls_filt <- city_halls[
  grepl("City Hall|County Office", city_halls$Facility, ignore.case = TRUE), ]

healthcare_flag <- flag_presence(se_hex, health_care)
highschool_flag <- flag_presence(se_hex, high_schools)
grocery_flag    <- flag_presence(se_hex, grocery_filt)
cityhall_flag   <- flag_presence(se_hex, city_halls_filt)
park_flag       <- pmax(flag_presence(se_hex, parks_local), flag_presence(se_hex, parks_wfrc))

amenity_score <- (healthcare_flag + highschool_flag + grocery_flag + cityhall_flag + park_flag) / 5

## Step 3: Combine and smooth

raw_destinations <- 0.6 * wc_score + 0.4 * amenity_score
destinations     <- smooth_by_neighbors(hex_ids, raw_destinations, neighbor_index)

# ── 5. Demographics ────────────────────────────────────────────────────────────

# Household-weighted interpolation from BG → hex using 2020 Census blocks as
# the weights layer (occupied HH = H1_002N). income is intensive → extensive = FALSE
demographics_interp <- tidycensus::interpolate_pw(
  from             = sf::st_transform(bg_income, hex_crs),
  to               = se_hex,
  to_id            = "hex_id",
  extensive        = FALSE,
  weights          = sf::st_transform(blocks_hh, hex_crs),
  weight_column    = "value",
  weight_placement = "surface"
)

# match() guards against any row-order differences in the interpolate_pw output
demographics_raw <- demographics_interp$estimate[match(hex_ids, demographics_interp$hex_id)]
demographics_raw[se_hex$households == 0] <- NA_real_
demographics <- smooth_by_neighbors(hex_ids, demographics_raw, neighbor_index)

# ── 6. Distance to Transit ─────────────────────────────────────────────────────

stop_times <- read.csv(file.path(gtfs_dir, "stop_times.txt"), stringsAsFactors = FALSE)
trips      <- read.csv(file.path(gtfs_dir, "trips.txt"),      stringsAsFactors = FALSE)
routes     <- read.csv(file.path(gtfs_dir, "routes.txt"),     stringsAsFactors = FALSE)
calendar   <- read.csv(file.path(gtfs_dir, "calendar.txt"),   stringsAsFactors = FALSE)
stops_txt  <- read.csv(file.path(gtfs_dir, "stops.txt"),      stringsAsFactors = FALSE)

weekday_trips <- merge(
  trips[trips$service_id %in% calendar$service_id[calendar$monday == 1L], ],
  routes[, c("route_id", "route_type")],
  by = "route_id"
)
st_wd <- merge(stop_times, weekday_trips[, c("trip_id", "route_type")], by = "trip_id")

# Parse HH:MM:SS → decimal minutes (handles GTFS times > 24:00)
arr_mat       <- do.call(rbind, strsplit(st_wd$arrival_time, ":"))
st_wd$arr_min <- as.integer(arr_mat[, 1L]) * 60 +
                 as.integer(arr_mat[, 2L]) +
                 as.integer(arr_mat[, 3L]) / 60

st_wd <- st_wd[order(st_wd$stop_id, st_wd$arr_min), ]

# Compute inter-arrival diffs; null out cross-group positions
stop_rle <- rle(st_wd$stop_id)
diffs    <- diff(st_wd$arr_min)
diffs[cumsum(stop_rle$lengths)[-length(stop_rle$lengths)]] <- NA_real_
st_wd$headway <- c(diffs, NA_real_)

stop_headway    <- tapply(st_wd$headway,    st_wd$stop_id, median, na.rm = TRUE)
stop_route_type <- tapply(st_wd$route_type, st_wd$stop_id, min)

# Frequent: headway <= 15 min OR commuter/heavy rail (route_type 1 or 2)
frequent_ids <- names(stop_headway)[
  !is.na(stop_headway) &
  (stop_headway <= 15 | stop_route_type[names(stop_headway)] %in% c(1L, 2L))
]

frequent_stops <- sf::st_as_sf(
  stops_txt[stops_txt$stop_id %in% frequent_ids, ],
  coords = c("stop_lon", "stop_lat"), crs = 4326L
) |> sf::st_transform(hex_crs)

centroids        <- sf::st_centroid(sf::st_geometry(se_hex))
dist_mat         <- sf::st_distance(centroids, frequent_stops)
nearest_col      <- apply(dist_mat, 1L, which.min)
transit_dist_raw <- as.numeric(dist_mat[cbind(seq_len(nrow(se_hex)), nearest_col)]) / 1609.34
transit_dist     <- smooth_by_neighbors(hex_ids, transit_dist_raw, neighbor_index)

# ── Output Assembly ────────────────────────────────────────────────────────────

se_hex$density      <- density
se_hex$diversity    <- diversity
se_hex$design       <- design
se_hex$destinations <- destinations
se_hex$demographics <- demographics
se_hex$transit_dist <- transit_dist

# ── Visualization: Diversity — smoothed vs raw ─────────────────────────────────

se_hex_4326 <- sf::st_transform(se_hex, 4326L)

hw_raw              <- se_hex$households * J2H
diversity_unsmoothed <- ifelse(
  hw_raw == 0 | se_hex$total_jobs == 0, NA_real_,
  pmin(hw_raw, se_hex$total_jobs) / pmax(hw_raw, se_hex$total_jobs)
)

se_hex_4326$tooltip <- sprintf(
  "<b>Diversity (smoothed):</b> %.2f<br><b>Diversity (raw):</b> %.2f<br><b>HH:</b> %.0f<br><b>Jobs:</b> %.0f",
  se_hex$diversity, diversity_unsmoothed, se_hex$households, se_hex$total_jobs
)

se_hex_raw_4326           <- se_hex_4326
se_hex_raw_4326$diversity <- diversity_unsmoothed

div_colors <- c("#ffffcc","#ffeda0","#fed976","#feb24c","#fd8d3c",
                "#fc4e2a","#e31a1c","#bd0026","#800026")
div_scale  <- mapgl::step_quantile(
  data_values = c(se_hex_4326$diversity, diversity_unsmoothed),
  column      = "diversity",
  n           = length(div_colors),
  colors      = div_colors,
  na_color    = "#cccccc"
)

map_smth <- mapgl::maplibre(style = mapgl::carto_style("positron")) |>
  mapgl::fit_bounds(se_hex_4326, animate = FALSE) |>
  mapgl::add_fill_layer(
    id = "diversity-smoothed", source = se_hex_4326,
    fill_color = div_scale$expression, fill_opacity = 0.8,
    fill_outline_color = "transparent", tooltip = "tooltip"
  ) |>
  mapgl::add_legend(
    legend_title   = "Diversity (neighbor-smoothed)",
    classification = div_scale,
    type           = "categorical",
    target         = "compare",
    position       = "top-left",
    patch_shape    = "hexagon"
  )

map_raw <- mapgl::maplibre(style = mapgl::carto_style("positron")) |>
  mapgl::fit_bounds(se_hex_4326, animate = FALSE) |>
  mapgl::add_fill_layer(
    id = "diversity-raw", source = se_hex_raw_4326,
    fill_color = div_scale$expression, fill_opacity = 0.8,
    fill_outline_color = "transparent", tooltip = "tooltip"
  ) |>
  mapgl::add_legend(
    legend_title   = "Diversity (no smoothing)",
    classification = div_scale,
    type           = "categorical",
    target         = "compare",
    position       = "top-left",
    patch_shape    = "hexagon"
  )

mapgl::compare(map_smth, map_raw, mode = "swipe", mousemove = FALSE)

# ── Export ─────────────────────────────────────────────────────────────────────

if (!dir.exists(file.path(root, "_output"))) dir.create(file.path(root, "_output"))

gdb_path <- file.path(root, "_output", paste0(GDB_NAME, ".gdb"))
zip_path <- file.path(root, "_output", paste0(GDB_NAME, ".gdb.zip"))

sf::write_sf(se_hex, gdb_path, layer = GDB_NAME, driver = "OpenFileGDB", append = FALSE)

zip(zip_path, files = gdb_path, flags = "-r9X")
unlink(gdb_path, recursive = TRUE)
