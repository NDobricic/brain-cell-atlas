# Brain Cell Atlas Visualization

An interactive visualization of single-cell transcriptomic data from the first-trimester developing human brain, based on the [Human Cell Atlas project](https://explore.data.humancellatlas.org/projects/cbd2911f-252b-4428-abde-69e270aefdfc).

## Dataset Overview

- **1.66 million cells** from first-trimester human brain samples
- **59,480 genes** profiled via single-cell RNA sequencing
- **617 clusters** representing distinct cell types and states
- Includes 2D UMAP embedding, cell class annotations, regional information, and quality metrics

## Requirements

- Python 3.10+
- Dependencies listed in `requirements.txt`

Install dependencies:
```bash
pip install -r requirements.txt
```

## Data Setup

Download the following files and place them in the `data/` directory:

| File | Description |
|------|-------------|
| `HumanFetalBrainPool.h5` | Main HDF5 dataset (~10 GB) containing expression matrix, embeddings, and annotations |
| `FetalEmbryonicBrain_metadata_24-01-2023.xlsx` | (Optional) Additional sample metadata |

Data source: [Human Cell Atlas Data Portal](https://explore.data.humancellatlas.org/projects/cbd2911f-252b-4428-abde-69e270aefdfc)

## Running the Visualization

### 1. Preprocess the Data

Generate the processed CSV and tile files required by the frontend:

```bash
# Generate main visualization data (50k cell sample + cluster data)
python scripts/prepare_viz_data.py

# Generate tile-based data for dynamic LOD
python scripts/prepare_tiles.py
```

This creates files in `public/data/`:
- `cells.csv` — 50k sampled cells with embedding coordinates and metadata
- `clusters.csv` — Cluster-level statistics for all 617 clusters
- `class_gene_stats.csv` — Class-level gene expression statistics
- `clusters_linkage.json` — Hierarchical clustering linkage matrix
- `metadata.json` — Dataset metadata (classes, genes, sample size)
- `tiles/` — (Optional) Pre-computed spatial tiles for LOD rendering

### 2. Start the Server

The visualization must be served via HTTP (opening `index.html` directly won't work due to browser security):

```bash
python run_server.py
```

This starts a local server at [http://localhost:8000](http://localhost:8000) and opens your browser automatically.

## Features

### Interactive Cell Embedding
- **Scatter Plot**: UMAP embedding of 50,000 sampled cells rendered via HTML5 Canvas
- **Color By**:
  - Cell Class — categorical coloring by cell type
  - Age — sequential coloring by post-conception weeks
  - Region — categorical coloring by brain region
  - Mitochondrial Fraction — quality metric visualization

### Interaction
- **Zoom/Pan**: Mouse wheel to zoom, drag to pan
- **Hover**: Hover over any cell to see detailed metadata in the sidebar

## Technical Details

### Frontend
- Plain HTML5, CSS, and JavaScript (no build step required)
- [D3.js v7](https://d3js.org/) — scales, data loading, color schemes, zoom behavior, quadtree search
- HTML5 Canvas — high-performance rendering of 50k+ points

### Data Processing
- Python scripts using `h5py`, `pandas`, `numpy`
- Extracts a random subset of cells from the HDF5 dataset
- Pre-computes cluster and class-level statistics

### HDF5 Data Structure

Key datasets in `/shoji`:
| Dataset | Shape | Description |
|---------|-------|-------------|
| `Expression` | (n, p) | UMI counts matrix |
| `Embedding` | (n, 2) | 2D visualization coordinates |
| `Clusters` | (n,) | Cluster membership per cell |
| `Age`, `Region`, `CellClass` | (n,) | Cell-level annotations |
| `MeanExpression` | (k, p) | Mean expression per cluster |
| `Linkage` | (k-1, 4) | Hierarchical clustering tree |

See `.cursor/rules/project-context.mdc` for complete data documentation.

## Project Structure

```
brain-cell-atlas/
├── data/                    # Raw data (not tracked)
│   └── HumanFetalBrainPool.h5
├── public/                  # Frontend assets
│   ├── index.html
│   ├── main.js
│   ├── style.css
│   └── data/                # Generated data (not tracked)
│       ├── cells.csv
│       ├── clusters.csv
│       └── tiles/
├── scripts/                 # Data preprocessing
│   ├── prepare_viz_data.py
│   └── prepare_tiles.py
├── run_server.py            # Development server
├── requirements.txt
└── README.md
```

## License

MIT License — see [LICENSE](LICENSE) for details.

## References

- Braun, E., et al. (2022). "A cell atlas of the first-trimester developing human brain." *bioRxiv*.
- Original analysis code: [linnarsson-lab/developing-human-brain](https://github.com/linnarsson-lab/developing-human-brain)
