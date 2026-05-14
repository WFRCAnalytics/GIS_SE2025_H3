# SE2025 H3 Socioeconomic Data Smoothing

Spatially smooths WFRC 2025 RTP socioeconomic data across H3 hexagonal grid cells using a configurable weighted-neighbor kernel, then visualizes land use diversity before and after smoothing.

## What it does

1. **Reads** the raw hex-level SE data (`wfrc_se_2025_rtp23`) from a zipped File Geodatabase.
2. **Smooths** all numeric fields (households, jobs by type, residential units, etc.) by computing a weighted average of each cell and its H3 neighbors up to ring 2. Weights are user-configurable.
3. **Visualizes** land use diversity (ratio of weighted households to jobs) as a side-by-side swipe map comparing original vs. smoothed data.
4. **Exports** both the original and smoothed layers to a new zipped File Geodatabase in `_output/`.

## Project structure

```
_data/
  wfrc_se_2025_rtp23.gdb.zip   # Input data (read-only)
_output/
  wfrc_se_2025_rtp23.gdb.zip   # Output: original + smoothed layers
index.R                         # Main script
```

## Configuration

At the top of `index.R`, three weights control the spatial smoothing kernel. They must sum to 1.

| Parameter       | Default | Description                                      |
|-----------------|---------|--------------------------------------------------|
| `CENTER_WEIGHT` | `0.50`  | Weight given to the cell itself                  |
| `RING1_WEIGHT`  | `0.50`  | Total weight split equally among ring-1 neighbors |
| `RING2_WEIGHT`  | `0.00`  | Total weight split equally among ring-2 neighbors |

Setting `RING2_WEIGHT = 0` reduces to a k=1 kernel. Edge cells with fewer than 6 neighbors are handled correctly — weights are renormalized to the actual number of in-dataset neighbors per ring.

## Diversity metric

Land use diversity is defined as:

```
diversity = min(households × 1.8, total_jobs) / max(households × 1.8, total_jobs)
```

Values range from 0 (pure residential or pure employment) to 1 (perfectly balanced). Cells with zero households or zero jobs are excluded (`NA`). The 1.8 factor converts households to a jobs-equivalent for comparability.

## Dependencies

```r
install.packages(c("dplyr", "sf", "h3o", "here", "mapgl"))
```

## Running

Open the project in RStudio (or set the working directory to the repo root) and source `index.R`. The swipe comparison map renders in the Viewer pane; the output geodatabase is written to `_output/`.