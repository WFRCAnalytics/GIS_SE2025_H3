# SE2025 H3 Socioeconomic Data Smoothing

Spatially smooths WFRC 2025 RTP socioeconomic data across H3 hexagonal grid cells using a configurable weighted-neighbor kernel, then visualizes land use diversity before and after smoothing.

## What it does

1. **Reads** the raw hex-level SE data (`wfrc_se_2025_rtp23`) from a zipped File Geodatabase.
2. **Smooths** all numeric fields (households, jobs by type, residential units, etc.) by computing a weighted average of each cell and its H3 neighbors up to ring 3. Weights are user-configurable.
3. **Visualizes** land use diversity (ratio of weighted households to jobs) as a side-by-side swipe map comparing original vs. smoothed data.
4. **Exports** both the original and smoothed layers to a new zipped File Geodatabase in `_output/`.

## Project structure

```
_data/
  wfrc_se_2025_rtp23.gdb.zip   # Input data (read-only, not tracked by git)
_output/
  wfrc_se_2025_rtp23.gdb.zip   # Output: original + smoothed layers (not tracked by git)
index.R                         # Main script
renv.lock                       # Locked package versions
```

## Configuration

At the top of `index.R`, four weights control the spatial smoothing kernel. They must sum to 1.

| Parameter       | Default | Description                                       |
|-----------------|---------|---------------------------------------------------|
| `CENTER_WEIGHT` | `0.50`  | Weight given to the cell itself                   |
| `RING1_WEIGHT`  | `0.50`  | Total weight split equally among ring-1 neighbors |
| `RING2_WEIGHT`  | `0.00`  | Total weight split equally among ring-2 neighbors |
| `RING3_WEIGHT`  | `0.00`  | Total weight split equally among ring-3 neighbors |

Setting a ring weight to `0` effectively excludes that ring from the kernel. Edge cells with fewer neighbors than a full ring are handled correctly — weights are renormalized to the actual number of in-dataset neighbors per ring.

## Diversity metric

Land use diversity is defined as:

```
diversity = min(households × 1.8, total_jobs) / max(households × 1.8, total_jobs)
```

Values range from 0 (pure residential or pure employment) to 1 (perfectly balanced). Cells with zero households or zero jobs are excluded (`NA`). The 1.8 factor converts households to a jobs-equivalent for comparability.

## Setup

This project uses [`renv`](https://rstudio.github.io/renv/) for reproducible package management. To install all dependencies at the correct versions:

```r
renv::restore()
```

This is preferred over manually running `install.packages()`, as it ensures you get exactly the same package versions used during development.

## Running

Open the project in RStudio (or set the working directory to the repo root) and source `index.R`. The swipe comparison map renders in the Viewer pane; the output geodatabase is written to `_output/`.