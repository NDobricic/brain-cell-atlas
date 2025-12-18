import h5py
import numpy as np
import pandas as pd
import json
import os

# Constants
DATA_PATH = "./data/HumanFetalBrainPool.h5"
OUTPUT_DIR = "./public/data"
SAMPLE_SIZE = 50000  # Number of cells to sample
SEED = 42
MARKER_GENES = ["SOX2","NES","EOMES","DCX","STMN2","GAD1","GAD2","MBP","AQP4","PDGFRA","MKI67"]

def main():
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print(f"Opening {DATA_PATH}...")
    with h5py.File(DATA_PATH, "r") as f:
        g = f["/shoji"]
        
        # Read total number of cells
        n_cells = g["Expression"].shape[0]
        print(f"Total cells: {n_cells}")
        
        # Random sampling
        rng = np.random.default_rng(SEED)
        if n_cells > SAMPLE_SIZE:
            indices = rng.choice(n_cells, size=SAMPLE_SIZE, replace=False)
            indices.sort() # Reading in order is usually faster/safer for HDF5
        else:
            indices = np.arange(n_cells)
            
        print(f"Sampling {len(indices)} cells...")
        
        # Load Embedding
        print("Loading Embedding...")
        embedding = g["Embedding"][indices]
        
        # Load Attributes
        print("Loading Attributes...")
        age = g["Age"][indices]
        region = g["Region"][indices].astype("U")
        mito_frac = g["MitoFraction"][indices]
        
        # Handle Clusters and Classes
        print("Mapping Classes...")
        all_clusters = g["Clusters"][:] 
        cluster_ids = g["ClusterID"][:]
        cluster_classes = g["Class"][:].astype("U")
        
        if all_clusters.min() >= 0 and all_clusters.max() < len(cluster_ids):
             sampled_cluster_indices = all_clusters[indices].astype(int)
        else:
            id2row = {cid: i for i, cid in enumerate(cluster_ids)}
            sampled_cluster_ids = all_clusters[indices]
            sampled_cluster_indices = np.array([id2row[cid] for cid in sampled_cluster_ids], dtype=int)

        sampled_classes = cluster_classes[sampled_cluster_indices]
        
        # Load Genes
        print("Loading Marker Genes...")
        gene_names = g["Gene"][:].astype("U")
        name_to_idx = {name: i for i, name in enumerate(gene_names)}
        
        gene_data = {}
        found_genes = []
        
        for gene in MARKER_GENES:
            if gene in name_to_idx:
                idx = name_to_idx[gene]
                # Expression is (n, p), we need (sample, 1)
                # Reading random columns from HDF5 can be slow if not careful
                # But for 50k rows it's okay-ish to read column by column
                # or read full column then sample (might be memory intensive if p is huge)
                # Expression is 1.6M x 60k. Reading one column is 1.6M floats = 6.4MB. Totally fine.
                print(f"  Reading {gene}...")
                # Use [:, idx] to read full column then slice is better for HDF5 chunking usually
                # unless chunks are row-based. Shoji/HDF5 usually row-based.
                # If we use [indices, idx], H5PY might be smart or slow. 
                # Let's try reading just the column for the indices.
                
                # Safe bet: Read full column if it fits in memory (1.6M floats is tiny), then index.
                col_data = g["Expression"][:, idx] 
                gene_data[gene] = col_data[indices]
                found_genes.append(gene)
            else:
                print(f"  Warning: Gene {gene} not found.")

    # Create DataFrame
    data_dict = {
        "x": np.round(embedding[:, 0], 2),
        "y": np.round(embedding[:, 1], 2),
        "class": sampled_classes,
        "age": np.round(age, 1),
        "region": region,
        "mito": np.round(mito_frac, 3)
    }
    
    # Add genes
    for gene in found_genes:
        # Round to save space, counts are integers usually but could be normalized
        # If raw counts, keep as is or int. If normalized, round.
        # Assuming UMI counts (integers)
        data_dict[gene] = np.round(gene_data[gene], 2)
    
    df = pd.DataFrame(data_dict)
    
    # Handle missing/NaN
    df["age"] = df["age"].fillna(-1)
    df["region"] = df["region"].replace("", "Unknown")
    
    # Save to CSV
    output_path = os.path.join(OUTPUT_DIR, "cells.csv")
    print(f"Saving to {output_path}...")
    df.to_csv(output_path, index=False)
    
    # Save Metadata
    unique_classes = sorted(list(set(cluster_classes)))
    metadata = {
        "classes": unique_classes,
        "genes": found_genes,
        "total_cells_sampled": len(df)
    }
    
    with open(os.path.join(OUTPUT_DIR, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    
    # Export cluster-level data for heatmap and dendrogram
    print("Preparing cluster data...")
    with h5py.File(DATA_PATH, "r") as f:
        g = f["/shoji"]
        
        # Get cluster info
        cluster_ids = g["ClusterID"][:]
        cluster_classes = g["Class"][:].astype("U")
        n_cells_per_cluster = g["NCells"][:]
        
        # 1. Export Linkage for Dendrogram
        if "Linkage" in g:
            print("  Exporting linkage matrix...")
            linkage = g["Linkage"][:].tolist()
            with open(os.path.join(OUTPUT_DIR, "clusters_linkage.json"), "w") as f_link:
                json.dump(linkage, f_link)
        
        # Get mean expression for marker genes
        gene_names = g["Gene"][:].astype("U")
        name_to_idx = {name: i for i, name in enumerate(gene_names)}
        
        gene_indices = [name_to_idx[g] for g in found_genes if g in name_to_idx]
        gene_indices_sorted = sorted(gene_indices)
        
        # MeanExpression is (n_clusters, n_genes)
        mean_expr = g["MeanExpression"][:, gene_indices_sorted]
        
        # Reorder to match found_genes order
        reorder = [gene_indices_sorted.index(idx) for idx in gene_indices]
        mean_expr = mean_expr[:, reorder]
        
        # Z-score per gene for heatmap
        mean_expr_z = (mean_expr - mean_expr.mean(axis=0, keepdims=True)) / (mean_expr.std(axis=0, keepdims=True) + 1e-9)
        mean_expr_z = np.clip(mean_expr_z, -3, 3)
        
        # Order clusters by class, then size (for heatmap default)
        order = np.lexsort((-n_cells_per_cluster, cluster_classes))
        
        # Create cluster dataframe
        df_clusters = pd.DataFrame({
            "cluster_id": cluster_ids[order],
            "class": cluster_classes[order],
            "n_cells": n_cells_per_cluster[order]
        })
        
        # Add z-scored expression for each gene
        for i, gene in enumerate(found_genes):
            df_clusters[gene] = mean_expr_z[order, i]
        
        df_clusters.to_csv(os.path.join(OUTPUT_DIR, "clusters.csv"), index=False)
        print(f"  Saved clusters.csv with {len(df_clusters)} clusters")

        # 2. Export Class-level Stats for Dot Plot
        print("  Preparing class-level stats for Dot Plot...")
        # We need Nonzeros (k, p) to calculate fraction expressing
        nonzeros = g["Nonzeros"][:, gene_indices_sorted]
        nonzeros = nonzeros[:, reorder]
        
        # Aggregate to class level
        unique_classes = sorted(list(set(cluster_classes)))
        class_stats = []
        
        for cls in unique_classes:
            cls_mask = (cluster_classes == cls)
            cls_n_cells = n_cells_per_cluster[cls_mask].sum()
            
            # Weighted mean expression for the class
            # (MeanExpr * NCells) gives total expression in cluster
            cls_total_expr = (mean_expr[cls_mask] * n_cells_per_cluster[cls_mask, np.newaxis]).sum(axis=0)
            cls_mean_expr = cls_total_expr / cls_n_cells
            
            # Total non-zero cells in the class
            cls_total_nonzeros = nonzeros[cls_mask].sum(axis=0)
            cls_frac_expressing = cls_total_nonzeros / cls_n_cells
            
            for i, gene in enumerate(found_genes):
                class_stats.append({
                    "class": cls,
                    "gene": gene,
                    "mean_expr": cls_mean_expr[i],
                    "frac_expressing": cls_frac_expressing[i]
                })
        
        df_class_stats = pd.DataFrame(class_stats)
        
        # Z-score class mean expression for color coding
        for gene in found_genes:
            gene_mask = (df_class_stats["gene"] == gene)
            vals = df_class_stats.loc[gene_mask, "mean_expr"]
            df_class_stats.loc[gene_mask, "mean_expr_z"] = (vals - vals.mean()) / (vals.std() + 1e-9)
            
        df_class_stats["mean_expr_z"] = np.clip(df_class_stats["mean_expr_z"], -3, 3)
        
        df_class_stats.to_csv(os.path.join(OUTPUT_DIR, "class_gene_stats.csv"), index=False)
        print(f"  Saved class_gene_stats.csv for {len(unique_classes)} classes")
        
    print("Done!")

if __name__ == "__main__":
    main()
