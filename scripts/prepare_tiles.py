"""
Tile-based preprocessing for dynamic LOD visualization.

Divides embedding space into spatial tiles and pre-computes cells at
different density levels. Output structure:
  public/data/tiles/
    manifest.json       - Tile metadata (bounds, levels, tile grid)
    {z}/{x}_{y}.json    - Cells for tile (x,y) at LOD level z
"""

import h5py
import numpy as np
import pandas as pd
import json
import os
from pathlib import Path

DATA_PATH = "./data/HumanFetalBrainPool.h5"
OUTPUT_DIR = Path("./public/data/tiles")
SEED = 42

# Grid configuration
GRID_SIZE = 8  # 8x8 = 64 tiles
LOD_LEVELS = [
    {"level": 0, "fraction": 0.015},   # ~25k total
    {"level": 1, "fraction": 0.005},   # ~33k cumulative
    {"level": 2, "fraction": 0.022},   # ~67k cumulative
    {"level": 3, "fraction": 0.043},   # ~130k cumulative
    {"level": 4, "fraction": 0.18},    # ~400k cumulative
]

MARKER_GENES = ["SOX2", "NES", "EOMES", "DCX", "STMN2", "GAD1", "GAD2", "MBP", "AQP4", "PDGFRA", "MKI67"]


def load_data():
    """Load all required data from HDF5."""
    print(f"Opening {DATA_PATH}...")
    with h5py.File(DATA_PATH, "r") as f:
        g = f["/shoji"]
        
        n_cells = g["Expression"].shape[0]
        print(f"Total cells: {n_cells}")
        
        print("Loading Embedding...")
        embedding = g["Embedding"][:]
        
        print("Loading Attributes...")
        age = g["Age"][:]
        region = g["Region"][:].astype("U")
        mito_frac = g["MitoFraction"][:]
        
        print("Mapping Classes...")
        all_clusters = g["Clusters"][:]
        cluster_ids = g["ClusterID"][:]
        cluster_classes = g["Class"][:].astype("U")
        
        if all_clusters.min() >= 0 and all_clusters.max() < len(cluster_ids):
            cluster_indices = all_clusters.astype(int)
        else:
            id2row = {cid: i for i, cid in enumerate(cluster_ids)}
            cluster_indices = np.array([id2row[cid] for cid in all_clusters], dtype=int)
        
        classes = cluster_classes[cluster_indices]
        
        print("Loading Marker Genes...")
        gene_names = g["Gene"][:].astype("U")
        name_to_idx = {name: i for i, name in enumerate(gene_names)}
        
        gene_data = {}
        found_genes = []
        
        for gene in MARKER_GENES:
            if gene in name_to_idx:
                idx = name_to_idx[gene]
                print(f"  Reading {gene}...")
                gene_data[gene] = g["Expression"][:, idx]
                found_genes.append(gene)
            else:
                print(f"  Warning: Gene {gene} not found.")
    
    return {
        "embedding": embedding,
        "age": age,
        "region": region,
        "mito": mito_frac,
        "class": classes,
        "genes": gene_data,
        "found_genes": found_genes,
        "unique_classes": sorted(list(set(cluster_classes)))
    }


def assign_tiles(embedding, grid_size, bounds):
    """Assign each cell to a tile based on its position."""
    x_min, x_max, y_min, y_max = bounds
    
    # Normalize to [0, grid_size)
    x_norm = (embedding[:, 0] - x_min) / (x_max - x_min) * grid_size
    y_norm = (embedding[:, 1] - y_min) / (y_max - y_min) * grid_size
    
    # Clip to valid tile indices
    tile_x = np.clip(x_norm.astype(int), 0, grid_size - 1)
    tile_y = np.clip(y_norm.astype(int), 0, grid_size - 1)
    
    return tile_x, tile_y


def subsample_indices_by_fraction(indices, fraction, rng):
    """Subsample indices by fraction to maintain uniform density."""
    if fraction >= 1.0 or len(indices) == 0:
        return indices
    target_count = max(1, int(len(indices) * fraction))
    if target_count >= len(indices):
        return indices
    return rng.choice(indices, size=target_count, replace=False)


def create_cell_record(idx, data):
    """Create a cell record dict for JSON output."""
    record = {
        "x": round(float(data["embedding"][idx, 0]), 2),
        "y": round(float(data["embedding"][idx, 1]), 2),
        "class": data["class"][idx],
        "age": round(float(data["age"][idx]), 1) if not np.isnan(data["age"][idx]) else -1,
        "region": data["region"][idx] if data["region"][idx] else "Unknown",
        "mito": round(float(data["mito"][idx]), 3)
    }
    for gene in data["found_genes"]:
        record[gene] = round(float(data["genes"][gene][idx]), 2)
    return record


def main():
    rng = np.random.default_rng(SEED)
    
    # Load all data
    data = load_data()
    embedding = data["embedding"]
    n_cells = len(embedding)
    
    # Calculate bounds with padding
    x_min, x_max = embedding[:, 0].min(), embedding[:, 0].max()
    y_min, y_max = embedding[:, 1].min(), embedding[:, 1].max()
    padding = 0.01
    x_range = x_max - x_min
    y_range = y_max - y_min
    bounds = (
        x_min - x_range * padding,
        x_max + x_range * padding,
        y_min - y_range * padding,
        y_max + y_range * padding
    )
    
    print(f"\nEmbedding bounds: x=[{bounds[0]:.2f}, {bounds[1]:.2f}], y=[{bounds[2]:.2f}, {bounds[3]:.2f}]")
    
    # Assign cells to tiles
    print(f"Assigning cells to {GRID_SIZE}x{GRID_SIZE} grid...")
    tile_x, tile_y = assign_tiles(embedding, GRID_SIZE, bounds)
    
    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # For each LOD level, subsample and assign a "level" to each cell
    # Cells at level 0 appear at all zoom levels
    # Cells at level N appear only when zoomed in past level N
    
    # Strategy: Progressive sampling
    # - Level 0: Sample max_per_tile from each tile
    # - Level 1: Sample additional cells (not in level 0)
    # - etc.
    
    all_indices = np.arange(n_cells)
    cell_levels = np.full(n_cells, -1, dtype=int)  # -1 means not included in any level
    
    for lod in LOD_LEVELS:
        level = lod["level"]
        fraction = lod["fraction"]
        
        print(f"\nProcessing LOD level {level} ({fraction*100:.1f}% per tile)...")
        
        level_count = 0
        for tx in range(GRID_SIZE):
            for ty in range(GRID_SIZE):
                # Get ALL cells in this tile (not yet assigned)
                tile_mask = (tile_x == tx) & (tile_y == ty) & (cell_levels == -1)
                tile_indices = all_indices[tile_mask]
                
                if len(tile_indices) == 0:
                    continue
                
                # Sample fraction of remaining cells for this level
                sampled = subsample_indices_by_fraction(tile_indices, fraction, rng)
                cell_levels[sampled] = level
                level_count += len(sampled)
        
        print(f"  Level {level}: {level_count} cells")
    
    # Generate tile files for each LOD level
    print("\nGenerating tile files...")
    
    for lod in LOD_LEVELS:
        level = lod["level"]
        level_dir = OUTPUT_DIR / str(level)
        level_dir.mkdir(exist_ok=True)
        
        print(f"\nLOD {level}:")
        total_cells = 0
        
        for tx in range(GRID_SIZE):
            for ty in range(GRID_SIZE):
                # Get cells for this tile at this level or lower (cumulative)
                tile_mask = (tile_x == tx) & (tile_y == ty) & (cell_levels >= 0) & (cell_levels <= level)
                tile_indices = all_indices[tile_mask]
                
                if len(tile_indices) == 0:
                    continue
                
                # Create cell records
                cells = [create_cell_record(idx, data) for idx in tile_indices]
                total_cells += len(cells)
                
                # Save tile file
                tile_path = level_dir / f"{tx}_{ty}.json"
                with open(tile_path, "w") as f:
                    json.dump(cells, f)
        
        print(f"  Total cells at level {level}: {total_cells}")
    
    # Create manifest
    manifest = {
        "bounds": {
            "xMin": float(bounds[0]),
            "xMax": float(bounds[1]),
            "yMin": float(bounds[2]),
            "yMax": float(bounds[3])
        },
        "gridSize": GRID_SIZE,
        "levels": len(LOD_LEVELS),
        "levelConfig": [{"level": l["level"], "fraction": l["fraction"]} for l in LOD_LEVELS],
        "classes": data["unique_classes"],
        "genes": data["found_genes"],
        "totalCells": int(n_cells)
    }
    
    with open(OUTPUT_DIR / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    
    print(f"\nTile generation complete!")
    print(f"  Output: {OUTPUT_DIR}")
    print(f"  Manifest: {OUTPUT_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main()
