# ── Scatter: Renter Affordability vs. Median HH Income ─────────────────────
# For L9/L8, smoothed/unsmoothed: attain_renter_afford (y) vs demographics /
# median HH income (x), restricted to hexes with population (hhpop) > 0.
# Each panel is a density-colored scatter with an OLS trend line + R^2.

library(sf)
library(dplyr)
library(ggplot2)
library(ggpointdensity)
library(ggpmisc)
library(patchwork)
library(viridisLite)

root <- here::here()
gpkg <- file.path(root, "_output", "wfrc_se_2025_rtp23.gpkg")

l9 <- st_read(gpkg, layer = "wfrc_se_2025_rtp23_l9", quiet = TRUE) |> st_drop_geometry()
l8 <- st_read(gpkg, layer = "wfrc_se_2025_rtp23_l8", quiet = TRUE) |> st_drop_geometry()

# ── Build the four (resolution x smoothing) subsets ─────────────────────────
panel_specs <- tibble::tribble(
  ~title,             ~data, ~x_col,                  ~y_col,
  "L9 — Unsmoothed",   "l9",  "demographics_raw",      "attain_renter_afford_raw",
  "L9 — Smoothed",     "l9",  "demographics_smoothed", "attain_renter_afford_smoothed",
  "L8 — Unsmoothed",   "l8",  "demographics_raw",      "attain_renter_afford_raw",
  "L8 — Smoothed",     "l8",  "demographics_smoothed", "attain_renter_afford_smoothed"
)

make_panel_data <- function(df_name, x_col, y_col) {
  df <- get(df_name)
  df |>
    filter(hhpop > 0) |>
    transmute(x = .data[[x_col]], y = .data[[y_col]]) |>
    filter(!is.na(x), !is.na(y))
}

make_plot <- function(title, df_name, x_col, y_col) {
  d <- make_panel_data(df_name, x_col, y_col)

  ggplot(d, aes(x, y)) +
    ggpointdensity::geom_pointdensity(size = 0.6, adjust = 4) +
    scale_color_viridis_c(option = "magma", name = "Density") +
    geom_smooth(
      method = "lm", formula = y ~ x,
      color = "#1b1b1b", linewidth = 0.8, se = TRUE, fill = "grey70"
    ) +
    ggpmisc::stat_poly_eq(
      formula = y ~ x,
      mapping = ggpmisc::use_label(c("eq", "R2")),
      label.x = "right", label.y = "bottom",
      size = 3.4, color = "red"
    ) +
    scale_x_continuous(labels = scales::label_dollar(scale = 1e-3, suffix = "k")) +
    scale_y_continuous(labels = scales::label_percent()) +
    labs(
      title = title,
      subtitle = sprintf("n = %s hexes (population > 0)", scales::comma(nrow(d))),
      x = "Median household income",
      y = "Renter affordability (share <30% income on rent)"
    ) +
    theme_minimal(base_size = 11) +
    theme(
      plot.title = element_text(face = "bold"),
      panel.grid.minor = element_blank(),
      legend.position = "right"
    )
}

plots <- purrr::pmap(panel_specs, function(title, data, x_col, y_col) {
  make_plot(title, data, x_col, y_col)
})
names(plots) <- panel_specs$title

# ── Individual panel PNGs ────────────────────────────────────────────────────
slug <- function(x) tolower(gsub("[^a-z0-9]+", "_", x, ignore.case = TRUE))
purrr::iwalk(plots, function(p, title) {
  out_path <- file.path(root, "_output", sprintf("scatter_renter_afford_vs_income_%s.png", slug(title)))
  ggsave(out_path, p, width = 7.5, height = 6, dpi = 300, bg = "white")
  message("Saved: ", out_path)
})

# ── Combined 2x2 grid ─────────────────────────────────────────────────────
combined <- wrap_plots(plots, ncol = 2) +
  plot_annotation(
    title = "Rental Housing Attainability: Renter Affordability vs. Median Household Income",
    subtitle = "H3 hexes with population > 0 — WFRC/MAG region",
    theme = theme(
      plot.title = element_text(face = "bold", size = 15),
      plot.subtitle = element_text(size = 11, color = "grey30")
    )
  )

combined_path <- file.path(root, "_output", "scatter_renter_afford_vs_income.png")
ggsave(combined_path, combined, width = 13, height = 10, dpi = 300, bg = "white")

message("Saved: ", combined_path)
