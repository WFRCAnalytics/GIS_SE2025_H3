library(dplyr)
library(sf)
library(h3o)
library(here)
library(mapgl)

# ── Parameters ────────────────────────────────────────────────────────────────

GDB_NAME <- "wfrc_se_2025_rtp23"

CENTER_WEIGHT <- 0.50 # weight for the center cell
RING1_WEIGHT <- 0.50 # total weight split equally among k=1 neighbors
RING2_WEIGHT <- 0.00 # total weight split equally among k=2 neighbors
RING3_WEIGHT <- 0.00 # total weight split equally among k=3 neighbors
# Note: CENTER_WEIGHT + RING1_WEIGHT + RING2_WEIGHT + RING3_WEIGHT must equal 1

root <- here::here()

# ── Data ──────────────────────────────────────────────────────────────────────

se_hex <- sf::read_sf(
  paste0("/vsizip/", file.path(root, "_data", paste0(GDB_NAME, ".gdb.zip"))),
  layer = GDB_NAME
)

# ── Smoothing ─────────────────────────────────────────────────────────────────

skip_cols <- c("hex_id", "Shape_Length", "Shape_Area", "Shape")
value_cols <- setdiff(names(se_hex), skip_cols)

id_to_row <- setNames(seq_len(nrow(se_hex)), se_hex$hex_id)

h3_cells <- h3o::h3_from_strings(se_hex$hex_id)

all_disks <- h3o::grid_disk(h3_cells, k = 3)
all_distances <- h3o::grid_distances(h3_cells, k = 3)

pairs <- data.frame(
  center_id = rep(se_hex$hex_id, times = lengths(all_disks)),
  member_id = as.character(h3o::flatten_h3(all_disks)),
  ring = unlist(all_distances)
) |>
  subset(member_id %in% se_hex$hex_id) |>
  transform(
    center_row = id_to_row[center_id],
    member_row = id_to_row[member_id]
  )

# Count actual in-dataset neighbors per center per ring
ring1_counts <- tapply(pairs$ring == 1, pairs$center_id, sum)
ring2_counts <- tapply(pairs$ring == 2, pairs$center_id, sum)
ring3_counts <- tapply(pairs$ring == 3, pairs$center_id, sum)

pairs$weight <- ifelse(
  pairs$ring == 0,
  CENTER_WEIGHT,
  ifelse(
    pairs$ring == 1,
    RING1_WEIGHT / ring1_counts[pairs$center_id],
    ifelse(
      pairs$ring == 2,
      RING2_WEIGHT / ring2_counts[pairs$center_id],
      RING3_WEIGHT / ring3_counts[pairs$center_id]
    )
  )
)

se_vals <- sf::st_drop_geometry(se_hex)[, value_cols]
smoothed_matrix <- rowsum(
  as.matrix(se_vals[pairs$member_row, ]) * pairs$weight,
  group = pairs$center_row
)

se_hex_smoothed <- se_hex
se_hex_smoothed[as.integer(rownames(smoothed_matrix)), value_cols] <-
  as.data.frame(smoothed_matrix)

# ── Visualization: Land Use Diversity Comparison ──────────────────────────────

se_hex_4326 <- sf::st_transform(se_hex, 4326)
se_hex_smoothed_4326 <- sf::st_transform(se_hex_smoothed, 4326)

diversity_score <- function(hh, emp) {
  hw <- hh * 1.8
  ifelse(hw == 0 | emp == 0, NA, pmin(hw, emp) / pmax(hw, emp))
}

se_hex_4326$diversity <- with(
  sf::st_drop_geometry(se_hex_4326),
  diversity_score(households, total_jobs)
)
se_hex_smoothed_4326$diversity <- with(
  sf::st_drop_geometry(se_hex_smoothed_4326),
  diversity_score(households, total_jobs)
)

se_hex_4326$tooltip <- with(
  sf::st_drop_geometry(se_hex_4326),
  sprintf(
    "<b>Diversity:</b> %.2f<br><b>Households:</b> %.0f<br><b>Jobs:</b> %.0f",
    diversity,
    households,
    total_jobs
  )
)
se_hex_smoothed_4326$tooltip <- with(
  sf::st_drop_geometry(se_hex_smoothed_4326),
  sprintf(
    "<b>Diversity:</b> %.2f<br><b>Households:</b> %.0f<br><b>Jobs:</b> %.0f",
    diversity,
    households,
    total_jobs
  )
)

div_colors <- c(
  "#ffffcc",
  "#ffeda0",
  "#fed976",
  "#feb24c",
  "#fd8d3c",
  "#fc4e2a",
  "#e31a1c",
  "#bd0026",
  "#800026"
)

div_scale <- mapgl::step_quantile(
  data_values = c(se_hex_4326$diversity, se_hex_smoothed_4326$diversity),
  column = "diversity",
  n = length(div_colors),
  colors = div_colors,
  na_color = "#cccccc"
)

map_orig <- mapgl::maplibre(style = mapgl::carto_style("positron")) |>
  mapgl::fit_bounds(se_hex_4326, animate = FALSE) |>
  mapgl::add_fill_layer(
    id = "diversity-orig",
    source = se_hex_4326,
    fill_color = div_scale$expression,
    fill_opacity = 0.8,
    fill_outline_color = "transparent",
    tooltip = "tooltip"
  ) |>
  mapgl::add_legend(
    legend_title = "Land Use Diversity",
    classification = div_scale,
    type = "categorical",
    target = "compare",
    position = "top-left",
    patch_shape = "hexagon"
  )

map_smth <- mapgl::maplibre(style = mapgl::carto_style("positron")) |>
  mapgl::fit_bounds(se_hex_smoothed_4326, animate = FALSE) |>
  mapgl::add_fill_layer(
    id = "diversity-smth",
    source = se_hex_smoothed_4326,
    fill_color = div_scale$expression,
    fill_opacity = 0.8,
    fill_outline_color = "transparent",
    tooltip = "tooltip"
  ) |>
  mapgl::add_legend(
    legend_title = "Land Use Diversity",
    classification = div_scale,
    type = "categorical",
    target = "compare",
    position = "top-left",
    patch_shape = "hexagon"
  )

mapgl::compare(map_orig, map_smth, mode = "swipe", mousemove = FALSE)

# ── Export ────────────────────────────────────────────────────────────────────

gdb_path <- file.path(root, "_output", paste0(GDB_NAME, ".gdb"))
zip_path <- file.path(root, "_output", paste0(GDB_NAME, ".gdb.zip"))

if (!dir.exists(file.path(root, "_output"))) {
  dir.create(file.path(root, "_output"))
}

se_hex |>
  sf::write_sf(
    gdb_path,
    layer = GDB_NAME,
    driver = "OpenFileGDB",
    append = FALSE
  )

se_hex_smoothed |>
  sf::write_sf(
    gdb_path,
    layer = paste0(GDB_NAME, "_smoothed"),
    driver = "OpenFileGDB",
    append = TRUE
  )

zip(zip_path, files = gdb_path, flags = "-r9X")
unlink(gdb_path, recursive = TRUE)
