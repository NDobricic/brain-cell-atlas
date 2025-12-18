async function init() {
    const container = document.getElementById('plot-container');
    
    // --- State ---
    let manifest = null;
    let loadedTiles = new Map(); // Map<"x_y", cells[]>
    let visibleCells = [];
    let clusterData = [];
    let currentView = 'embedding';
    let colorMode = 'class';
    let violinMetric = 'age';
    let transform = d3.zoomIdentity;
    let currentLOD = 0;
    
    // --- Data ---
    let classGeneStats = [];
    let linkageData = null;

    // --- Plot Descriptions ---
    const plotDescriptions = {
        embedding: {
            title: "Cell Embedding",
            body: `
                <p>This plot shows <strong>1.6 million brain cells</strong> from the developing human brain, each represented as a single point.</p>
                
                <h3>What am I looking at?</h3>
                <p>The position of each cell is calculated using a technique that places similar cells close together. Cells that look alike (based on which genes they use) cluster together, forming distinct groups.</p>
                
                <h3>Color coding</h3>
                <ul>
                    <li><strong>Cell Class:</strong> Major cell types like neurons, glia, and immune cells</li>
                    <li><strong>Age:</strong> When the sample was collected (weeks after conception)</li>
                    <li><strong>Region:</strong> Which part of the brain the cell came from</li>
                    <li><strong>Mitochondrial Fraction:</strong> Cellular energy activity - can indicate cell health or metabolic state</li>
                    <li><strong>Gene expression:</strong> How active a specific gene is in each cell</li>
                </ul>
                
                <h3>Interacting</h3>
                <p>Scroll to zoom, drag to pan. Hover over cells to see details. As you zoom in, more cells become visible.</p>
            `
        },
        composition_age: {
            title: "Composition by Age",
            body: `
                <p>This stacked area chart shows how the <strong>mixture of cell types changes</strong> as the brain develops.</p>
                
                <h3>What am I looking at?</h3>
                <p>Each vertical slice represents a different developmental age (in weeks after conception). The colored areas show what fraction of cells belong to each cell class at that age.</p>
                
                <h3>Why it matters</h3>
                <p>The developing brain doesn't just grow - it <strong>changes composition</strong>. Early on, you see more stem cells and progenitors. As development progresses, mature neurons and support cells (glia) become more abundant.</p>
                
                <h3>Reading the chart</h3>
                <p>Look for colors that expand or shrink across ages. A growing segment means that cell type is becoming more common; a shrinking one means it's becoming rarer.</p>
            `
        },
        composition_region: {
            title: "Composition by Region",
            body: `
                <p>This stacked bar chart shows how <strong>cell type mixtures differ</strong> across brain regions.</p>
                
                <h3>What am I looking at?</h3>
                <p>Each bar represents a different brain region (like cortex, cerebellum, or thalamus). The colored segments show the proportion of each cell class in that region.</p>
                
                <h3>Why it matters</h3>
                <p>Different brain regions do different jobs, so they're built from different cell types. The cortex (thinking, planning) has lots of excitatory neurons. The cerebellum (movement coordination) has its own specialized neurons.</p>
                
                <h3>Reading the chart</h3>
                <p>Compare bars to see which regions are similar and which are unique. Regions with similar color patterns likely share functional characteristics.</p>
            `
        },
        heatmap: {
            title: "Cluster × Marker Gene Heatmap",
            body: `
                <p>This heatmap shows <strong>gene activity patterns</strong> across 617 cell clusters, organized by their hierarchical relationships.</p>
                
                <h3>What am I looking at?</h3>
                <p>Each row is a cluster of similar cells. Each column is a marker gene - a gene known to identify specific cell types. The color shows how strongly that gene is expressed (active) in that cluster.</p>
                
                <h3>The tree on the left</h3>
                <p>The branching tree (dendrogram) groups clusters by similarity. Clusters that branch together have similar gene patterns. The colored bar shows the cell class each cluster belongs to.</p>
                
                <h3>Color scale</h3>
                <ul>
                    <li><strong>Yellow:</strong> High expression (gene is very active)</li>
                    <li><strong>Blue/Purple:</strong> Low expression (gene is quiet)</li>
                </ul>
                
                <h3>Key marker genes</h3>
                <ul>
                    <li><strong>SOX2, NES:</strong> Stem cells and progenitors</li>
                    <li><strong>EOMES:</strong> Intermediate progenitors</li>
                    <li><strong>DCX, STMN2:</strong> Young neurons</li>
                    <li><strong>GAD1, GAD2:</strong> Inhibitory neurons</li>
                    <li><strong>MBP, PDGFRA:</strong> Oligodendrocytes (insulation cells)</li>
                    <li><strong>AQP4:</strong> Astrocytes (support cells)</li>
                    <li><strong>MKI67:</strong> Dividing cells</li>
                </ul>
            `
        },
        dotplot: {
            title: "Class × Marker Gene Dot Plot",
            body: `
                <p>This dot plot summarizes gene activity for each <strong>major cell class</strong>, giving a bird's-eye view of what makes each class unique.</p>
                
                <h3>What am I looking at?</h3>
                <p>Each dot represents one cell class (row) and one gene (column). Two things are encoded:</p>
                <ul>
                    <li><strong>Dot size:</strong> What fraction of cells in that class express the gene</li>
                    <li><strong>Dot color:</strong> How strongly the gene is expressed on average</li>
                </ul>
                
                <h3>How to read it</h3>
                <p>A <strong>large, yellow dot</strong> means most cells in that class strongly express the gene - it's a good marker. A <strong>small, dark dot</strong> means the gene is rarely used or weakly expressed.</p>
                
                <h3>Example patterns</h3>
                <ul>
                    <li><strong>GAD1/GAD2:</strong> Large yellow dots in Neuron class - these genes mark inhibitory neurons that use GABA signaling</li>
                    <li><strong>SOX2:</strong> Strong in Radial glia (stem cells) but weak in mature neurons</li>
                </ul>
            `
        },
        violin: {
            title: "Violin Plot",
            body: `
                <p>These violin plots show the <strong>distribution of values</strong> for a chosen metric across all cell classes.</p>
                
                <h3>What am I looking at?</h3>
                <p>Each "violin" shape shows how values are distributed within one cell class. Wider sections mean more cells have that value. The shape reveals whether values are clustered, spread out, or have multiple peaks.</p>
                
                <h3>Available metrics</h3>
                <ul>
                    <li><strong>Age (PCW):</strong> When cells were sampled - shows if certain cell types appear only at specific developmental stages</li>
                    <li><strong>Mitochondrial Fraction:</strong> Cellular energy activity - can indicate cell health or metabolic state</li>
                    <li><strong>Gene expression:</strong> Activity level of specific marker genes</li>
                </ul>
                
                <h3>Reading the shapes</h3>
                <ul>
                    <li><strong>Wide middle:</strong> Most cells cluster around that value</li>
                    <li><strong>Long tail:</strong> Some cells have extreme values</li>
                    <li><strong>Multiple bulges:</strong> Cells fall into subgroups</li>
                </ul>
            `
        }
    };

    // --- Info Sidebar ---
    const infoTitle = document.getElementById('info-title');
    const infoBody = document.getElementById('info-body');

    function updateInfoSidebar(view) {
        const desc = plotDescriptions[view];
        if (desc) {
            infoTitle.textContent = desc.title;
            infoBody.innerHTML = desc.body;
        }
    }
    updateInfoSidebar(currentView);

    // --- Elements ---
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    const context = canvas.getContext('2d');

    // --- Load Manifest and Cluster Data ---
    const [manifestData, clusters, classStats, linkage] = await Promise.all([
        d3.json('data/tiles/manifest.json'),
        d3.csv('data/clusters.csv', d3.autoType),
        d3.csv('data/class_gene_stats.csv', d3.autoType),
        d3.json('data/clusters_linkage.json').catch(() => null) // Optional linkage
    ]);
    manifest = manifestData;
    clusterData = clusters;
    classGeneStats = classStats;
    linkageData = linkage;
    
    document.getElementById('total-count').textContent = manifest.totalCells.toLocaleString();

    // Populate Gene Options
    const geneSelect = document.getElementById('gene-options');
    const violinGeneSelect = document.getElementById('violin-gene-options');
    if (manifest.genes) {
        manifest.genes.forEach(gene => {
            const opt = document.createElement('option');
            opt.value = gene;
            opt.textContent = gene;
            geneSelect.appendChild(opt);
            
            const optV = document.createElement('option');
            optV.value = gene;
            optV.textContent = gene;
            violinGeneSelect.appendChild(optV);
        });
    }

    // --- Scales & Ranges (Global) ---
    const uniqueClasses = manifest.classes;
    const uniqueRegions = new Set();
    const ageExtent = [5, 14]; // Will update dynamically
    const mitoExtent = [0, 0.1]; // Will update dynamically
    
    // Color Scales
    const colorScaleClass = d3.scaleOrdinal(d3.schemeTableau10).domain(uniqueClasses);
    if (uniqueClasses.length > 10) {
        colorScaleClass.range([...d3.schemeTableau10, ...d3.schemeSet3]);
    }
    let colorScaleRegion = d3.scaleOrdinal(d3.schemeSet3);
    const colorScaleAge = d3.scaleSequential(d3.interpolateViridis).domain(ageExtent);
    const colorScaleMito = d3.scaleSequential(d3.interpolatePlasma).domain(mitoExtent);
    const geneColorScale = d3.scaleSequential(t => d3.interpolateMagma(t * 0.85)).clamp(true);

    function getColor(d, mode) {
        if (uniqueClasses.includes(mode)) return colorScaleClass(mode);
        switch (mode) {
            case 'class': return colorScaleClass(d.class);
            case 'age': return d.age === -1 ? '#ccc' : colorScaleAge(d.age);
            case 'region': return colorScaleRegion(d.region);
            case 'mito': return colorScaleMito(d.mito);
            default: 
                if (d[mode] !== undefined) {
                    return geneColorScale(d[mode]); 
                }
                return 'steelblue';
        }
    }

    // --- Tile Management ---
    const tileCache = new Map(); // Cache for loaded tiles
    const pendingTiles = new Set(); // Tiles currently being fetched
    
    function getTileKey(x, y) {
        return `${x}_${y}`;
    }
    
    function getLODForZoom(zoomLevel) {
        // Adjusted thresholds so ~20k cells visible at each transition
        if (zoomLevel < 2) return 0;
        if (zoomLevel < 4) return 1;
        if (zoomLevel < 8) return 2;
        if (zoomLevel < 20) return 3;
        return Math.min(4, manifest.levels - 1);
    }
    
    function getVisibleTiles(transform, width, height) {
        const { xMin, xMax, yMin, yMax } = manifest.bounds;
        const gridSize = manifest.gridSize;
        
        // Transform viewport bounds to data coordinates
        const viewXMin = xScale.invert((0 - transform.x) / transform.k);
        const viewXMax = xScale.invert((width - transform.x) / transform.k);
        const viewYMin = yScale.invert((height - transform.y) / transform.k);
        const viewYMax = yScale.invert((0 - transform.y) / transform.k);
        
        // Calculate tile indices
        const tileWidth = (xMax - xMin) / gridSize;
        const tileHeight = (yMax - yMin) / gridSize;
        
        const startTileX = Math.max(0, Math.floor((viewXMin - xMin) / tileWidth));
        const endTileX = Math.min(gridSize - 1, Math.ceil((viewXMax - xMin) / tileWidth));
        const startTileY = Math.max(0, Math.floor((viewYMin - yMin) / tileHeight));
        const endTileY = Math.min(gridSize - 1, Math.ceil((viewYMax - yMin) / tileHeight));
        
        const tiles = [];
        for (let tx = startTileX; tx <= endTileX; tx++) {
            for (let ty = startTileY; ty <= endTileY; ty++) {
                tiles.push({ x: tx, y: ty });
            }
        }
        return tiles;
    }
    
    async function loadTile(lod, tileX, tileY) {
        const key = `${lod}_${tileX}_${tileY}`;
        
        if (tileCache.has(key)) {
            return tileCache.get(key);
        }
        
        if (pendingTiles.has(key)) {
            return null; // Already loading
        }
        
        pendingTiles.add(key);
        
        try {
            const url = `data/tiles/${lod}/${tileX}_${tileY}.json`;
            const response = await fetch(url);
            
            if (!response.ok) {
                // Tile might be empty (no cells in that region)
                tileCache.set(key, []);
                return [];
            }
            
            const cells = await response.json();
            tileCache.set(key, cells);
            
            // Update region set
            cells.forEach(c => uniqueRegions.add(c.region));
            colorScaleRegion.domain(Array.from(uniqueRegions).sort());
            
            return cells;
        } catch (e) {
            console.warn(`Failed to load tile ${key}:`, e);
            tileCache.set(key, []);
            return [];
        } finally {
            pendingTiles.delete(key);
        }
    }
    
    async function updateVisibleCells() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        
        const targetLOD = getLODForZoom(transform.k);
        const tiles = getVisibleTiles(transform, w, h);
        
        // Show loading indicator if we need to fetch new tiles
        const loadingIndicator = document.getElementById('loading-indicator');
        const needsFetch = tiles.some(t => !tileCache.has(`${targetLOD}_${t.x}_${t.y}`));
        if (needsFetch) {
            loadingIndicator.style.display = 'block';
        }
        
        // Load all visible tiles at the target LOD
        const loadPromises = tiles.map(t => loadTile(targetLOD, t.x, t.y));
        const loadedData = await Promise.all(loadPromises);
        
        loadingIndicator.style.display = 'none';
        
        // Combine all cells from visible tiles
        visibleCells = loadedData.flat().filter(Boolean);
        currentLOD = targetLOD;
        
        // Update display count and LOD
        document.getElementById('total-count').textContent = 
            `${visibleCells.length.toLocaleString()} / ${manifest.totalCells.toLocaleString()}`;
        document.getElementById('lod-level').textContent = targetLOD;
        
        return visibleCells;
    }
    
    function updateZoomDisplay() {
        document.getElementById('zoom-level').textContent = `${transform.k.toFixed(1)}x`;
    }

    // --- View: Embedding ---
    let xScale, yScale;
    let quadtree;
    
    function updateEmbeddingScales() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        const padding = 0.05;
        const { xMin, xMax, yMin, yMax } = manifest.bounds;
        
        const xRange = xMax - xMin;
        const yRange = yMax - yMin;
        
        let xMinPad = xMin - xRange * padding;
        let xMaxPad = xMax + xRange * padding;
        let yMinPad = yMin - yRange * padding;
        let yMaxPad = yMax + yRange * padding;
        
        const dataW = xMaxPad - xMinPad;
        const dataH = yMaxPad - yMinPad;
        const viewAspect = w / h;
        const dataAspect = dataW / dataH;
        
        if (viewAspect > dataAspect) {
            const targetWidth = dataH * viewAspect;
            const extra = (targetWidth - dataW) / 2;
            xMinPad -= extra; xMaxPad += extra;
        } else {
            const targetHeight = dataW / viewAspect;
            const extra = (targetHeight - dataH) / 2;
            yMinPad -= extra; yMaxPad += extra;
        }

        xScale = d3.scaleLinear().domain([xMinPad, xMaxPad]).range([0, w]);
        yScale = d3.scaleLinear().domain([yMinPad, yMaxPad]).range([h, 0]);
    }

    function rebuildQuadtree() {
        quadtree = d3.quadtree()
            .x(d => xScale(d.x))
            .y(d => yScale(d.y))
            .addAll(visibleCells);
    }

    function drawEmbedding() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        
        context.save();
        context.clearRect(0, 0, w, h);
        context.translate(transform.x, transform.y);
        context.scale(transform.k, transform.k);
        
        const r = 2 / transform.k; // Constant 2px on screen
        
        let drawOrder = visibleCells;
        if (!['class', 'age', 'region', 'mito'].includes(colorMode) && visibleCells.length > 0) {
            const values = visibleCells.map(d => d[colorMode]).filter(v => v !== undefined);
            if (values.length > 0) {
                const p99 = d3.quantile(values.sort(d3.ascending), 0.99);
                geneColorScale.domain([0, p99]);
                drawOrder = [...visibleCells].sort((a, b) => (a[colorMode] || 0) - (b[colorMode] || 0));
            }
        }

        drawOrder.forEach(d => {
            context.fillStyle = getColor(d, colorMode);
            context.beginPath();
            context.arc(xScale(d.x), yScale(d.y), r, 0, 2 * Math.PI);
            context.fill();
        });
        context.restore();
    }

    // --- View: Composition (Stacked Bar) ---
    const svg = d3.select(container).append('svg')
        .style('position', 'absolute')
        .style('top', 0)
        .style('left', 0)
        .style('width', '100%')
        .style('height', '100%')
        .style('display', 'none')
        .attr("xmlns", "http://www.w3.org/2000/svg");

    const tooltip = d3.select('body').append('div')
        .attr('id', 'tooltip')
        .style('position', 'absolute')
        .style('display', 'none')
        .style('background', 'white')
        .style('padding', '8px')
        .style('border', '1px solid #ccc')
        .style('border-radius', '4px')
        .style('pointer-events', 'none')
        .style('font-size', '0.9rem')
        .style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)')
        .style('z-index', '1000');

    function updateSidebarInfo(content) {
        document.getElementById('hover-info').textContent = content;
    }

    function buildHierarchy(linkage, clusters) {
        const k = clusters.length;
        const nodes = clusters.map((c, i) => ({
            id: i,
            data: c,
            cluster_id: c.cluster_id,
            class: c.class,
            name: `Cluster ${c.cluster_id}`,
            isLeaf: true
        }));
        
        linkage.forEach((l, i) => {
            const child1 = nodes[l[0]];
            const child2 = nodes[l[1]];
            const newNode = {
                id: k + i,
                children: [child1, child2],
                distance: l[2],
                isLeaf: false,
                class: (child1.class === child2.class) ? child1.class : 'mixed'
            };
            nodes.push(newNode);
        });
        
        return d3.hierarchy(nodes[nodes.length - 1]);
    }

    function drawHeatmap() {
        const rect = container.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        
        svg.attr("width", w).attr("height", h);
        svg.selectAll('*').remove();
        
        const showDendrogram = !!linkageData;
        const dendroWidth = showDendrogram ? 150 : 0;
        const classBarWidth = 20;
        const margin = {top: 100, right: 200, bottom: 120, left: 20 + dendroWidth + classBarWidth + 10};
        
        const genes = manifest.genes || [];
        const nClusters = clusterData.length;
        const nGenes = genes.length;
        
        let orderedClusters = [...clusterData];
        let root = null;
        
        if (showDendrogram) {
            root = buildHierarchy(linkageData, clusterData);
            const leaves = root.leaves();
            orderedClusters = leaves.map(d => d.data.data);
        }
        
        const cellWidth = (w - margin.left - margin.right) / nGenes;
        const cellHeight = (h - margin.top - margin.bottom) / nClusters;
        const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([-3, 3]);
        
        if (showDendrogram) {
            const clusterLayout = d3.cluster().size([nClusters * cellHeight, dendroWidth - 20]);
            clusterLayout(root);
            
            const dendroG = svg.append('g')
                .attr('transform', `translate(20, ${margin.top})`);
                
            const link = d3.linkHorizontal().x(d => d.y).y(d => d.x);
            dendroG.selectAll('.link').data(root.links()).join('path')
                .attr('d', link).attr('fill', 'none')
                .attr('stroke', d => d.target.data.class === 'mixed' ? '#ccc' : colorScaleClass(d.target.data.class))
                .attr('stroke-width', 1);
        }
        
        const classBarX = margin.left - classBarWidth - 10;
        orderedClusters.forEach((cluster, i) => {
            svg.append('rect')
                .attr('x', classBarX).attr('y', margin.top + i * cellHeight)
                .attr('width', classBarWidth).attr('height', cellHeight)
                .attr('fill', colorScaleClass(cluster.class));
        });
        
        const heatmapG = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
        orderedClusters.forEach((cluster, i) => {
            genes.forEach((gene, j) => {
                const value = cluster[gene];
                heatmapG.append('rect')
                    .attr('x', j * cellWidth).attr('y', i * cellHeight)
                    .attr('width', cellWidth).attr('height', cellHeight)
                    .attr('fill', colorScale(value))
                    .on('mousemove', function(event) {
                        const info = `Gene: ${gene}\nCluster: ${cluster.cluster_id}\nClass: ${cluster.class}\nZ-score: ${value.toFixed(2)}`;
                        updateSidebarInfo(info);
                        tooltip.style('display', 'block').style('left', (event.pageX + 10) + 'px').style('top', (event.pageY + 10) + 'px')
                            .html(`<strong>${gene}</strong><br>Cluster: ${cluster.cluster_id}<br>Class: ${cluster.class}<br>Z-score: ${value.toFixed(2)}`);
                    })
                    .on('mouseleave', () => {
                        updateSidebarInfo('Hover over a cell in the heatmap');
                        tooltip.style('display', 'none');
                    });
            });
        });
        
        genes.forEach((gene, j) => {
            const labelX = margin.left + j * cellWidth + cellWidth / 2;
            const labelY = margin.top - 10;
            svg.append('text').attr('x', labelX).attr('y', labelY).attr('text-anchor', 'start')
                .attr('transform', `rotate(-45, ${labelX}, ${labelY})`).style('font-size', '16px').text(gene);
        });

        svg.append('text').attr('x', w / 2).attr('y', 35).attr('text-anchor', 'middle')
            .style('font-size', '20px').text('Cluster Hierarchy × Marker Gene Heatmap');
            
        const plotWidth = nGenes * cellWidth;
        const plotHeight = nClusters * cellHeight;
        const legendWidth = plotWidth, legendHeight = 15, legendX = margin.left, legendY = margin.top + plotHeight + 40;
        const legendScale = d3.scaleLinear().domain([-3, 3]).range([0, legendWidth]);
        
        const grad = svg.append('defs').append('linearGradient').attr('id', 'h-grad');
        [0, 0.5, 1].forEach(t => grad.append('stop').attr('offset', `${t*100}%`).attr('stop-color', colorScale(d3.interpolate(-3, 3)(t))));
        svg.append('rect').attr('x', legendX).attr('y', legendY).attr('width', legendWidth).attr('height', legendHeight).style('fill', 'url(#h-grad)');
        svg.append('g').attr('transform', `translate(${legendX},${legendY + legendHeight})`)
            .call(d3.axisBottom(legendScale).ticks(5))
            .style('font-size', '14px');
    }

    function drawDotPlot() {
        const rect = container.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        
        svg.attr("width", w).attr("height", h);
        svg.selectAll('*').remove();
        
        const margin = {top: 100, right: 200, bottom: 50, left: 150};
        const genes = manifest.genes || [];
        const classes = uniqueClasses;
        
        const cellWidth = (w - margin.left - margin.right) / genes.length;
        const cellHeight = (h - margin.top - margin.bottom) / classes.length;
        
        const dotPlotG = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);
            
        const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([-2, 2]);
        const maxRadius = Math.min(20, Math.min(cellWidth, cellHeight) / 2 - 2);
        const sizeScale = d3.scaleSqrt().domain([0, 1]).range([0, maxRadius]);
        
        // Rows (Classes)
        classes.forEach((cls, i) => {
            dotPlotG.append('text')
                .attr('x', -10)
                .attr('y', i * cellHeight + cellHeight / 2)
                .attr('text-anchor', 'end')
                .attr('alignment-baseline', 'middle')
                .style('font-size', '16px')
                .text(cls);
                
            // Grid lines
            dotPlotG.append('line')
                .attr('x1', 0)
                .attr('x2', genes.length * cellWidth)
                .attr('y1', i * cellHeight + cellHeight)
                .attr('y2', i * cellHeight + cellHeight)
                .attr('stroke', '#eee');
        });
        
        // Columns (Genes)
        genes.forEach((gene, j) => {
            const labelX = j * cellWidth + cellWidth / 2;
            dotPlotG.append('text')
                .attr('x', labelX)
                .attr('y', -10)
                .attr('text-anchor', 'start')
                .attr('transform', `rotate(-45, ${labelX}, -10)`)
                .style('font-size', '16px')
                .text(gene);
        });
        
        // Dots
        classGeneStats.forEach(d => {
            const i = classes.indexOf(d.class);
            const j = genes.indexOf(d.gene);
            if (i === -1 || j === -1) return;
            
            dotPlotG.append('circle')
                .attr('cx', j * cellWidth + cellWidth / 2)
                .attr('cy', i * cellHeight + cellHeight / 2)
                .attr('r', sizeScale(d.frac_expressing))
                .attr('fill', colorScale(d.mean_expr_z))
                .on('mousemove', function(event) {
                    const info = `Class: ${d.class}\nGene: ${d.gene}\nMean Expr (Z): ${d.mean_expr_z.toFixed(2)}\nFraction expressing: ${(d.frac_expressing * 100).toFixed(1)}%`;
                    updateSidebarInfo(info);
                    tooltip.style('display', 'block')
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY + 10) + 'px')
                        .html(`<strong>${d.class}</strong><br>Gene: ${d.gene}<br>Mean Expr (Z): ${d.mean_expr_z.toFixed(2)}<br>Fraction expressing: ${(d.frac_expressing * 100).toFixed(1)}%`);
                    d3.select(this).attr('stroke', 'black').attr('stroke-width', 1);
                })
                .on('mouseleave', function() {
                    updateSidebarInfo('Hover over a dot');
                    tooltip.style('display', 'none');
                    d3.select(this).attr('stroke', 'none');
                });
        });

        // Legends
        const plotWidth = genes.length * cellWidth;
        const legendX = margin.left + plotWidth + 40;
        const legendG = svg.append('g')
            .attr('transform', `translate(${legendX}, ${margin.top})`);
            
        // Size Legend
        legendG.append('text')
            .text('Fraction Expressing')
            .attr('y', 0)
            .attr('font-size', '14px')
            .attr('font-weight', 'bold');

        [0.1, 0.5, 1.0].forEach((v, i) => {
            const spacing = 45;
            const cy = 15 + i * spacing + spacing/2;
            legendG.append('circle')
                .attr('cx', 15)
                .attr('cy', cy)
                .attr('r', sizeScale(v))
                .attr('fill', '#666');
            legendG.append('text')
                .attr('x', 40)
                .attr('y', cy + 5)
                .text(`${(v * 100).toFixed(0)}%`)
                .attr('font-size', '14px');
        });
        
        // Color Legend
        const colorLegendY = 180;
        legendG.append('text')
            .text('Mean Expr (Z)')
            .attr('x', 0)
            .attr('y', colorLegendY)
            .attr('font-size', '14px')
            .attr('font-weight', 'bold');
        
        const gradWidth = 20;
        const gradHeight = Math.max(100, (classes.length * cellHeight) - (colorLegendY + 10));
        const defs = svg.append('defs');
        const gradId = 'dotplot-color-grad';
        const grad = defs.append('linearGradient').attr('id', gradId).attr('x1', '0%').attr('y1', '100%').attr('x2', '0%').attr('y2', '0%');
        [0, 0.5, 1].forEach(t => {
            grad.append('stop').attr('offset', `${t*100}%`).attr('stop-color', colorScale(d3.interpolate(-2, 2)(t)));
        });
        
        legendG.append('rect')
            .attr('x', 0).attr('y', colorLegendY + 10).attr('width', gradWidth).attr('height', gradHeight)
            .attr('fill', `url(#${gradId})`).attr('stroke', '#ccc');
            
        [-2, 0, 2].forEach(v => {
            const y = colorLegendY + 10 + gradHeight - ((v + 2) / 4) * gradHeight;
            legendG.append('text').attr('x', 25).attr('y', y + 5).text(v).attr('font-size', '12px');
        });
        
        svg.append('text')
            .attr('x', w / 2)
            .attr('y', 35)
            .attr('text-anchor', 'middle')
            .style('font-size', '20px')
            .text('Class × Marker Gene Dot Plot');
    }

    function drawViolinPlot() {
        const rect = container.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        
        svg.attr("width", w).attr("height", h);
        svg.selectAll('*').remove();
        
        const margin = {top: 60, right: 100, bottom: 120, left: 80};
        const data = visibleCells;
        if (data.length === 0) return;
        
        const metric = violinMetric;
        const classes = uniqueClasses;
        
        const x = d3.scaleBand().domain(classes).range([margin.left, w - margin.right]).padding(0.05);
        
        // Filter out cells with missing data for this metric
        const validCells = data.filter(d => d[metric] !== undefined && d[metric] !== -1);
        if (validCells.length === 0) {
            svg.append('text').attr('x', w/2).attr('y', h/2).attr('text-anchor', 'middle').text('No data for this metric');
            return;
        }
        
        const extent = d3.extent(validCells, d => d[metric]);
        // Add some padding to extent
        const pad = (extent[1] - extent[0]) * 0.1;
        const y = d3.scaleLinear().domain([extent[0] - pad, extent[1] + pad]).range([h - margin.bottom, margin.top]);
        
        svg.append('g').attr('transform', `translate(0,${h - margin.bottom})`)
            .call(d3.axisBottom(x))
            .style('font-size', '14px')
            .selectAll("text").style("text-anchor", "end").attr("dx", "-.8em").attr("dy", ".15em").attr("transform", "rotate(-45)");
            
        svg.append('g').attr('transform', `translate(${margin.left},0)`)
            .call(d3.axisLeft(y))
            .style('font-size', '14px');

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -h / 2)
            .attr('y', 25)
            .attr('text-anchor', 'middle')
            .style('font-size', '16px')
            .text(metric === 'age' ? 'Post-conception weeks' : metric === 'mito' ? 'Mitochondrial Fraction' : `${metric} Expression (UMI)`);
        
        // KDE function
        function kernelEpanechnikov(k) {
            return v => Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
        }
        function kde(kernel, thresholds, data) {
            return thresholds.map(t => [t, d3.mean(data, d => kernel(t - d))]);
        }
        
        const thresholds = y.ticks(50);
        const densityScale = d3.scaleLinear().range([0, x.bandwidth() / 2 - 2]);
        
        classes.forEach(cls => {
            const clsCells = validCells.filter(d => d.class === cls).map(d => d[metric]);
            if (clsCells.length < 5) return;
            
            const density = kde(kernelEpanechnikov( (extent[1] - extent[0]) / 20 ), thresholds, clsCells);
            const maxDensity = d3.max(density, d => d[1]);
            densityScale.domain([0, maxDensity]);
            
            const area = d3.area()
                .x0(d => x(cls) + x.bandwidth() / 2 - densityScale(d[1]))
                .x1(d => x(cls) + x.bandwidth() / 2 + densityScale(d[1]))
                .y(d => y(d[0]))
                .curve(d3.curveBasis);
                
            // Inner Box Plot stats
            const sorted = clsCells.sort(d3.ascending);
            const q1 = d3.quantile(sorted, 0.25);
            const median = d3.quantile(sorted, 0.5);
            const q3 = d3.quantile(sorted, 0.75);

            svg.append('path')
                .datum(density)
                .attr('fill', colorScaleClass(cls))
                .attr('opacity', 0.7)
                .attr('d', area)
                .on('mousemove', function(event) {
                    const info = `Class: ${cls}\nMetric: ${metric}\nMedian: ${median.toFixed(2)}\nIQR: ${q1.toFixed(2)} - ${q3.toFixed(2)}\nN: ${clsCells.length}`;
                    updateSidebarInfo(info);
                    d3.select(this).attr('opacity', 1);
                })
                .on('mouseleave', function() {
                    updateSidebarInfo('Hover over a violin');
                    d3.select(this).attr('opacity', 0.7);
                });
                
            const boxWidth = 4;
            const centerX = x(cls) + x.bandwidth() / 2;
            
            // IQR Box
            svg.append('rect')
                .attr('x', centerX - boxWidth / 2)
                .attr('y', y(q3))
                .attr('width', boxWidth)
                .attr('height', y(q1) - y(q3))
                .attr('fill', '#333')
                .style('pointer-events', 'none');
                
            // Median dot
            svg.append('circle')
                .attr('cx', centerX)
                .attr('cy', y(median))
                .attr('r', 2)
                .attr('fill', 'white')
                .style('pointer-events', 'none');
        });
        
        svg.append('text')
            .attr('x', w / 2).attr('y', 30).attr('text-anchor', 'middle')
            .style('font-size', '20px')
            .text(`Distribution of ${metric} by Cell Class`);
    }

    function drawComposition(variable) {
        const rect = container.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        
        svg.attr("width", w).attr("height", h);
        svg.selectAll('*').remove();
        
        const margin = {top: 40, right: 100, bottom: 100, left: 80};
        
        // Use visible cells for composition
        const data = visibleCells;
        if (data.length === 0) {
            svg.append("text")
                .attr("x", w / 2)
                .attr("y", h / 2)
                .attr("text-anchor", "middle")
                .text("Loading data...");
            return;
        }
        
        const regions = Array.from(new Set(data.map(d => d.region))).sort();
        const ages = data.map(d => d.age).filter(a => a !== -1);
        const localAgeExtent = d3.extent(ages);
        
        let grouped;
        let keys = uniqueClasses;
        let isArea = false;

        if (variable === 'age') {
            isArea = true;
            const bins = d3.range(Math.floor(localAgeExtent[0]), Math.ceil(localAgeExtent[1]) + 1);
            const rolled = d3.rollup(data, 
                v => {
                    const counts = {};
                    uniqueClasses.forEach(c => counts[c] = 0);
                    v.forEach(d => counts[d.class]++);
                    return counts;
                },
                d => Math.floor(d.age)
            );
            
            grouped = bins.map(age => {
                const c = rolled.get(age) || {};
                let total = d3.sum(Object.values(c)) || 0;
                if (total === 0) return null;
                
                const obj = { x: age };
                uniqueClasses.forEach(cls => obj[cls] = (c[cls] || 0) / total);
                return obj;
            }).filter(d => d);
        } else if (variable === 'region') {
            const rolled = d3.rollup(data,
                v => {
                    const counts = {};
                    uniqueClasses.forEach(c => counts[c] = 0);
                    v.forEach(d => counts[d.class]++);
                    return counts;
                },
                d => d.region
            );
            
            grouped = regions.map(reg => {
                const c = rolled.get(reg) || {};
                let total = d3.sum(Object.values(c)) || 0;
                if (total === 0) return null;
                const obj = { x: reg };
                uniqueClasses.forEach(cls => obj[cls] = (c[cls] || 0) / total);
                return obj;
            }).filter(d => d);
        }
        
        if (!grouped || grouped.length === 0) {
            svg.append("text")
                .attr("x", w / 2)
                .attr("y", h / 2)
                .attr("text-anchor", "middle")
                .text("No data available for this view");
            return;
        }

        const stack = d3.stack().keys(uniqueClasses)(grouped);
        const color = colorScaleClass;

        if (isArea) {
            const x = d3.scaleLinear()
                .domain(d3.extent(grouped, d => d.x))
                .range([margin.left, w - margin.right]);
                
            const y = d3.scaleLinear()
                .domain([0, 1])
                .range([h - margin.bottom, margin.top]);

            const area = d3.area()
                .x(d => x(d.data.x))
                .y0(d => y(d[0]))
                .y1(d => y(d[1]));

            svg.append('g')
                .attr('transform', `translate(0,${h - margin.bottom})`)
                .call(d3.axisBottom(x).ticks(10))
                .style('font-size', '14px');

            svg.append('g')
                .attr('transform', `translate(${margin.left},0)`)
                .call(d3.axisLeft(y).ticks(10, "%"))
                .style('font-size', '14px');

            svg.append('g')
                .selectAll('path')
                .data(stack)
                .join('path')
                .attr('fill', d => color(d.key))
                .attr('d', area)
                .style('opacity', 0.8);
                
            svg.append('text')
                .attr('x', w / 2)
                .attr('y', margin.top / 2)
                .attr('text-anchor', 'middle')
                .style('font-size', '20px')
                .text('Cell-class composition over developmental age');
                
            svg.append('text')
                .attr('x', w / 2)
                .attr('y', h - 30)
                .attr('text-anchor', 'middle')
                .style('font-size', '16px')
                .text('Post-conception weeks');
                
            svg.append('text')
                .attr('transform', 'rotate(-90)')
                .attr('x', -h / 2)
                .attr('y', 25)
                .attr('text-anchor', 'middle')
                .style('font-size', '16px')
                .text('Proportion');
                
            svg.append('rect')
                .attr('x', margin.left)
                .attr('y', margin.top)
                .attr('width', w - margin.left - margin.right)
                .attr('height', h - margin.top - margin.bottom)
                .style('fill', 'none')
                .style('pointer-events', 'all')
                .on('mousemove', function(event) {
                    const [mx] = d3.pointer(event, this);
                    const value = x.invert(mx + margin.left);
                    const idx = d3.bisector(d => d.x).left(grouped, value);
                    const d0 = grouped[idx - 1];
                    const d1 = grouped[idx];
                    let d_data = d0;
                    let index = idx - 1;
                    
                    if (d0 && d1) {
                        if (value - d0.x > d1.x - value) {
                            d_data = d1;
                            index = idx;
                        }
                    } else if (!d0) {
                        d_data = d1;
                        index = idx;
                    }
                    
                    if (d_data) {
                        const my = d3.pointer(event, this)[1];
                        const yValue = y.invert(my);
                        
                        let hoveredClass = null;
                        let hoveredValue = 0;
                        
                        for (const layer of stack) {
                            const point = layer[index];
                            if (point && yValue >= point[0] && yValue <= point[1]) {
                                hoveredClass = layer.key;
                                hoveredValue = d_data[hoveredClass];
                                break;
                            }
                        }
                        
                        let tooltipHtml = `<strong>Age: ${d_data.x} PCW</strong><br>`;
                        if (hoveredClass) {
                            tooltipHtml += `${hoveredClass}: ${(hoveredValue * 100).toFixed(1)}%`;
                        }
                        
                        tooltip.style('display', 'block')
                            .style('left', (event.pageX + 10) + 'px')
                            .style('top', (event.pageY + 10) + 'px')
                            .html(tooltipHtml);
                        
                        svg.selectAll('.hover-line').remove();
                        svg.append('line')
                            .attr('class', 'hover-line')
                            .attr('x1', x(d_data.x))
                            .attr('x2', x(d_data.x))
                            .attr('y1', margin.top)
                            .attr('y2', h - margin.bottom)
                            .attr('stroke', '#333')
                            .attr('stroke-dasharray', '4')
                            .style('pointer-events', 'none');
                    }
                })
                .on('mouseleave', () => {
                    svg.selectAll('.hover-line').remove();
                    updateSidebarInfo('Hover over the plot');
                    tooltip.style('display', 'none');
                });
        } else {
            const x = d3.scaleBand()
                .domain(grouped.map(d => d.x))
                .range([margin.left, w - margin.right])
                .padding(0.1);
                
            const y = d3.scaleLinear()
                .domain([0, 1])
                .range([h - margin.bottom, margin.top]);

            svg.append('g')
                .attr('transform', `translate(0,${h - margin.bottom})`)
                .call(d3.axisBottom(x))
                .style('font-size', '14px')
                .selectAll("text")
                .style("text-anchor", "end")
                .attr("dx", "-.8em")
                .attr("dy", ".15em")
                .attr("transform", "rotate(-45)");

            svg.append('g')
                .attr('transform', `translate(${margin.left},0)`)
                .call(d3.axisLeft(y).ticks(10, "%"))
                .style('font-size', '14px');

            svg.append('g')
                .selectAll('g')
                .data(stack)
                .join('g')
                .attr('fill', d => color(d.key))
                .selectAll('rect')
                .data(d => d)
                .join('rect')
                .attr('x', d => x(d.data.x))
                .attr('y', d => y(d[1]))
                .attr('height', d => y(d[0]) - y(d[1]))
                .attr('width', x.bandwidth())
                .on('mousemove', function(event, d) {
                    const key = d3.select(this.parentNode).datum().key;
                    const region = d.data.x;
                    const val = d.data[key];
                    
                    let info = `Region: ${region}\nClass: ${key}\nProportion: ${(val * 100).toFixed(1)}%`;
                    info += `\n\nFull Composition:`;
                    const sortedClasses = uniqueClasses
                        .map(c => ({ key: c, value: d.data[c] }))
                        .sort((a, b) => b.value - a.value)
                        .filter(item => item.value > 0.01);
                        
                    sortedClasses.forEach(item => {
                        info += `\n${item.key}: ${(item.value * 100).toFixed(1)}%`;
                    });

                    updateSidebarInfo(info);
                    d3.select(this).style('stroke', 'black').style('stroke-width', 1);

                    tooltip.style('display', 'block')
                        .style('left', (event.pageX + 10) + 'px')
                        .style('top', (event.pageY + 10) + 'px')
                        .html(`<strong>${region}</strong><br>${key}<br>${(val * 100).toFixed(1)}%`);
                })
                .on('mouseleave', function() {
                    updateSidebarInfo('Hover over a bar');
                    d3.select(this).style('stroke', 'none');
                    tooltip.style('display', 'none');
                });
                
            svg.append('text')
                .attr('x', w / 2)
                .attr('y', margin.top / 2)
                .attr('text-anchor', 'middle')
                .style('font-size', '20px')
                .text('Class Composition by Region');
        }
    }

    // --- Interaction & Rendering Loop ---
    let renderPending = false;
    let tilesNeedUpdate = true;
    
    async function render() {
        if (currentView === 'embedding') {
            canvas.style.display = 'block';
            svg.style('display', 'none');
            document.getElementById('color-control').style.display = 'block';
            document.getElementById('violin-control').style.display = 'none';
            document.getElementById('embedding-stats').style.display = 'block';
            document.getElementById('hover-info').textContent = 'Hover over a cell';
            
            updateEmbeddingScales();
            
            if (tilesNeedUpdate) {
                await updateVisibleCells();
                rebuildQuadtree();
                tilesNeedUpdate = false;
            }
            
            drawEmbedding();
        } else if (currentView === 'heatmap') {
            canvas.style.display = 'none';
            svg.style('display', 'block');
            document.getElementById('color-control').style.display = 'none';
            document.getElementById('violin-control').style.display = 'none';
            document.getElementById('embedding-stats').style.display = 'none';
            document.getElementById('hover-info').textContent = 'Hover over a cell in the heatmap';
            drawHeatmap();
        } else if (currentView === 'dotplot') {
            canvas.style.display = 'none';
            svg.style('display', 'block');
            document.getElementById('color-control').style.display = 'none';
            document.getElementById('violin-control').style.display = 'none';
            document.getElementById('embedding-stats').style.display = 'none';
            document.getElementById('hover-info').textContent = 'Hover over a dot';
            drawDotPlot();
        } else if (currentView === 'violin') {
            canvas.style.display = 'none';
            svg.style('display', 'block');
            document.getElementById('color-control').style.display = 'none';
            document.getElementById('violin-control').style.display = 'block';
            document.getElementById('embedding-stats').style.display = 'none';
            document.getElementById('hover-info').textContent = 'Viewing distribution distributions';
            
            if (tilesNeedUpdate) {
                // Load LOD 2 for good statistics
                const compositionLOD = 2;
                const allTilePromises = [];
                for (let tx = 0; tx < manifest.gridSize; tx++) {
                    for (let ty = 0; ty < manifest.gridSize; ty++) {
                        allTilePromises.push(loadTile(compositionLOD, tx, ty));
                    }
                }
                const allTileData = await Promise.all(allTilePromises);
                visibleCells = allTileData.flat().filter(Boolean);
                tilesNeedUpdate = false;
            }
            drawViolinPlot();
        } else {
            canvas.style.display = 'none';
            svg.style('display', 'block');
            document.getElementById('color-control').style.display = 'none';
            document.getElementById('violin-control').style.display = 'none';
            document.getElementById('embedding-stats').style.display = 'none';
            document.getElementById('hover-info').textContent = 'Hover over the chart';
            
            // Load all tiles at LOD 2 for composition views
            if (tilesNeedUpdate) {
                const compositionLOD = 2;
                const allTilePromises = [];
                for (let tx = 0; tx < manifest.gridSize; tx++) {
                    for (let ty = 0; ty < manifest.gridSize; ty++) {
                        allTilePromises.push(loadTile(compositionLOD, tx, ty));
                    }
                }
                const allTileData = await Promise.all(allTilePromises);
                visibleCells = allTileData.flat().filter(Boolean);
                tilesNeedUpdate = false;
            }
            
            if (currentView === 'composition_age') {
                drawComposition('age');
            }
            if (currentView === 'composition_region') {
                drawComposition('region');
            }
        }
        
        updateLegend();
    }

    // Debounced tile update
    let tileUpdateTimeout = null;
    function scheduleTileUpdate() {
        if (tileUpdateTimeout) {
            clearTimeout(tileUpdateTimeout);
        }
        tileUpdateTimeout = setTimeout(() => {
            tilesNeedUpdate = true;
            render();
        }, 150); // Wait for zoom/pan to settle
    }

    // Zoom
    const zoom = d3.zoom()
        .scaleExtent([0.5, 50])
        .on('zoom', e => {
            if (currentView === 'embedding') {
                transform = e.transform;
                updateZoomDisplay();
                drawEmbedding(); // Immediate redraw with current cells
                scheduleTileUpdate(); // Schedule tile update
            }
        });
    d3.select(canvas).call(zoom);

    // Resize
    window.addEventListener('resize', () => {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        tilesNeedUpdate = true;
        render();
    });
    
    // Initial Size
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Hover
    d3.select(canvas).on('mousemove', (event) => {
        if (currentView !== 'embedding' || !quadtree) return;
        
        const [mx, my] = d3.pointer(event);
        const tx = (mx - transform.x) / transform.k;
        const ty = (my - transform.y) / transform.k;
        const found = quadtree.find(tx, ty, 20 / transform.k);

        if (found) {
            let info = `Class: ${found.class}\nAge: ${found.age}\nRegion: ${found.region}\nMito: ${found.mito}`;
            if (!['class', 'age', 'region', 'mito'].includes(colorMode)) {
                info += `\n${colorMode}: ${found[colorMode]}`;
            }
            updateSidebarInfo(info);
        } else {
            updateSidebarInfo('Hover over a cell');
        }
    });

    // Controls
    document.getElementById('view-select').addEventListener('change', (e) => {
        currentView = e.target.value;
        tilesNeedUpdate = true;
        updateInfoSidebar(currentView);
        render();
    });
    
    document.getElementById('color-by').addEventListener('change', (e) => {
        colorMode = e.target.value;
        render();
    });

    document.getElementById('violin-metric').addEventListener('change', (e) => {
        violinMetric = e.target.value;
        render();
    });

    function createGradientLegend(interpolator, minLabel, maxLabel) {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.style.width = "100%";
        svg.style.height = "20px";
        svg.style.border = "1px solid #ccc";
        svg.style.display = "block";
        svg.style.boxSizing = "border-box";
        
        const defs = document.createElementNS(svgNS, "defs");
        const gradient = document.createElementNS(svgNS, "linearGradient");
        const gradientId = `gradient-${Math.random().toString(36).substr(2, 9)}`;
        gradient.setAttribute("id", gradientId);
        gradient.setAttribute("x1", "0%");
        gradient.setAttribute("x2", "100%");
        
        for (let i = 0; i <= 20; i++) {
            const t = i / 20;
            const color = interpolator(t);
            const stop = document.createElementNS(svgNS, "stop");
            stop.setAttribute("offset", `${t * 100}%`);
            stop.setAttribute("stop-color", color);
            gradient.appendChild(stop);
        }
        
        defs.appendChild(gradient);
        svg.appendChild(defs);
        
        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", "0");
        rect.setAttribute("y", "0");
        rect.setAttribute("width", "100%");
        rect.setAttribute("height", "100%");
        rect.setAttribute("fill", `url(#${gradientId})`);
        svg.appendChild(rect);
        
        const container = document.createElement('div');
        container.appendChild(svg);
        
        const labels = document.createElement('div');
        labels.style.display = 'flex';
        labels.style.justifyContent = 'space-between';
        labels.style.fontSize = '0.8em';
        labels.style.marginTop = '2px';
        labels.innerHTML = `<span>${minLabel}</span><span>${maxLabel}</span>`;
        container.appendChild(labels);
        
        return container;
    }

    function updateLegend() {
        const legend = document.getElementById('legend');
        const legendContainer = document.getElementById('legend-container');
        legend.innerHTML = '';
        
        legendContainer.style.display = 'block';
        
        if (currentView === 'embedding') {
            if (colorMode === 'class') {
                uniqueClasses.forEach(cls => {
                    const item = document.createElement('div');
                    item.className = 'legend-item';
                    item.innerHTML = `<div class="legend-color" style="background-color: ${colorScaleClass(cls)}"></div><span>${cls}</span>`;
                    legend.appendChild(item);
                });
            } else if (colorMode === 'region') {
                Array.from(uniqueRegions).sort().forEach(reg => {
                    const item = document.createElement('div');
                    item.className = 'legend-item';
                    item.innerHTML = `<div class="legend-color" style="background-color: ${colorScaleRegion(reg)}"></div><span>${reg}</span>`;
                    legend.appendChild(item);
                });
            } else if (colorMode === 'age') {
                const title = document.createElement('p');
                title.textContent = 'Age (PCW)';
                legend.appendChild(title);
                const gradientLegend = createGradientLegend(
                    d3.interpolateViridis,
                    `${ageExtent[0].toFixed(1)}`,
                    `${ageExtent[1].toFixed(1)}`
                );
                legend.appendChild(gradientLegend);
            } else if (colorMode === 'mito') {
                const title = document.createElement('p');
                title.textContent = 'Mitochondrial Fraction';
                legend.appendChild(title);
                const gradientLegend = createGradientLegend(
                    d3.interpolatePlasma,
                    `${mitoExtent[0].toFixed(3)}`,
                    `${mitoExtent[1].toFixed(3)}`
                );
                legend.appendChild(gradientLegend);
            } else {
                const values = visibleCells.map(d => d[colorMode]).filter(v => v !== undefined).sort(d3.ascending);
                const p99 = values.length > 0 ? d3.quantile(values, 0.99) : 1;
                
                const title = document.createElement('p');
                title.textContent = `${colorMode} Expression`;
                legend.appendChild(title);
                const gradientLegend = createGradientLegend(
                    t => d3.interpolateMagma(t * 0.85),
                    `0`,
                    `${p99.toFixed(1)}`
                );
                legend.appendChild(gradientLegend);
            }
        } else {
            uniqueClasses.forEach(cls => {
                const item = document.createElement('div');
                item.className = 'legend-item';
                item.innerHTML = `<div class="legend-color" style="background-color: ${colorScaleClass(cls)}"></div><span>${cls}</span>`;
                legend.appendChild(item);
            });
        }
    }

    // Start
    await render();
}

init();
