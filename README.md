#Scalable Drawing of Nested Directed Acyclic Graphs With Gates and Ports

The code in this repository is part of the master thesis of Thomas Leu.

The thesis is based on [Ben-Nun, et al., "Stateful Dataflow Multigraphs - A Data-Centric Model for Performance Portability on Heterogeneous Architectures"](http://www.arxiv.org/abs/1902.10345) and the [SDFG Viewer](https://github.com/spcl/dace-webclient) of the Scalable Parallel Computing Lab, ETH Zurich.

## Providing SDFGs
To run any experiments with SDFGs, they first need to be placed in the `graphs` directory of this repository with `.json` extension. 
For example, you can store an SDFG in `graphs/gemm.json`. You can then open `sugiyama.html?graph=gemm` in the browser to see a drawing of the SDFG with the *SugiyamaLayouter*, `dagre.html?graph=gemm` with the *DagreLayouter* and `magnetic.html?graph=gemm` with the *MagneticSpringLayouter*.

## Accessing Local Files
By default, browsers do not allow access to local files. This can be mitigated in Google Chrome by opening it with the flag '--allow-file-access-from-files' and in Mozilla Firefox by setting the flag `security.fileuri.strict_origin_policy` to `false` (in `about:config`). However, the easiest way to run everything is to clone the repository to a webserver and run it from there.

## Drawing Non-SDFGs
The library can be used to draw arbitrary Nested Directed Acyclic Graphs With Gates and Ports (NGP-DAGs).
An example is given in `graph.html`.

## Layouter Options
There are 3 different layouters, the *SugiyamaLayouter*, the *DagreLayouter* and the *MagneticSpringLayouter*.
They can be instantiated with
```
const layouter = new layoutLib.layouter.SugiyamaLayouter(options);
```
In the following, we describe the options for each layouter.

### General Options for the Layouter
| **Parameter**        | **Default Value** | **Possible Values** | **Description**                                                                                            |
|----------------------|-------------------|---------------------|------------------------------------------------------------------------------------------------------------|
| `targetEdgeLength`   | `50`              | integer             | Ideal edge length. In the DagreLayouter and the SugiyamaLayouter, this defines the distance between ranks. |
| `spaceBetweenNodes:` | `30`              | integer             | Minimum distance between non-neighbors. In the MagneticSpringLayouter, it cannot always be adhered to.     |
| `weightBends`        | `1`               | float               | Relative weight of the 'edge bendiness' penalty in the cost function.                                      |
| `weightCrossings`    | `1`               | float               | Relative weight of the 'edge crossings' penalty in the cost function.                                      |
| `weightLengths`      | `1`               | float               | Relative weight of the 'edge lengths' penal (neighbors).                                                   |
| `printTimes`         | `false`           | boolean             | If set to `true`, the console will show how much time the layouter has spent in each step.                 |

### Options Specifict to the SugiyamaLayouter

| **Parameter**            | **Default Value**                   | **Possible Values** | **Description**                                                                                                                                           |
|--------------------------|-------------------------------------|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `preorderPorts`          | `true`                              | boolean             | Whether nodes and ports should be jointly preordered. This is always followed by a separate node order and a port order phase.                            |
| `compactRanks`           | `true`                              | boolean             | Only affects nested graphs. When set to `false`, a pseudo-hierarchical ranking is used. This is typically faster but results in larger drawings.          |
| `numShuffles`            | `0`                                 | integer             | Number of random permutations from which an ordering attempt is made. Higher numbers result in fewer crossings but increased time.                        |
| `optimizeAngles`         | `false`                             | boolean             | Whether the distances between ranks should be adjusted to increase the angles of edge crossings.                                                          |
| `bundle`                 | `false`                             | boolean             | Whether edges between the same pair of nodes should be drawn as one edge.                                                                                 |
| `spaceBetweenComponents` | `50`                                | integer             | The space between two components of subgraphs with the same parent.                                                                                       |
| `spaceBetweenNodes`      | `30`                                | integer             | The space between two neighboring nodes on the same rank.                                                                                                 |
| `webAssembly`            | `false`                             | boolean             | Whether WebAssembly should be used for the ordering of nodes and ports.                                                                                   |
| `webWorkers`             | `true`                              | boolean             | Whether Web Workers (multithreading) should be used for a) the shuffling (if `numShuffles` larger than 0 enabled and b) assigning x-coordinates to nodes. |
| `maxWorkers`             | `navigator.hardwareConcurrency - 1` | integer             | Maximum number of Web Workers. Using too many may result in a browser crash.                                                                              |
| `sharedArrayBuffer`      | `false`                             | boolean             | Whether a SharedArrayBuffer should be used rather than normal ArrayBuffer. This requires special HTTP headers and the the time saved is minimal.          |

### Options Specific to the DagreLayouter
| **Parameter**       | **Default Value**                      | **Possible Values**                                                  | **Description**                                                                                                                    |
|---------------------|----------------------------------------|----------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `ranker`            | `DagreLayouter.RANKER_NETWORK_SIMPLEX` | `RANKER_NETWORK_SIMPLEX`, `RANKER_TIGHT_TREE`, `RANKER_LONGEST_PATH` | Defines which ranking algorithm is used.                                                                                           |

### Options Specific to the MagneticSpringLayouter
| **Parameter**              | **Default Value** | **Possible Values** | **Description**                                                                   |
|----------------------------|-------------------|---------------------|-----------------------------------------------------------------------------------|
| `numIterations`            | `1000`            | integer             | Number of times every node's position gets updated.                               |
| `stepSize`                 | `1`               | float               | Multiplicator for the total force.                                                |
| `weightSpring`             | `1`               | float               | Relative weight of the spring force (neighbors).                                  |
| `weightRepulsive`          | `1`               | float               | Relative weight of the repulsive force (non-neighbors).                           |
| `weightMagnetic`           | `1`               | float               | Relative weight of the magnetic force (neighbors).                                |
| `magneticDistanceExponent` | `1`               | float               | Exponent to the edge length in the magnetic force.                                |
| `magneticAngleExponent`    | `5`               | float               | Exponent to the relative angle in the magnetic force.                             |
| `forceCap`                 | `100`             | float               | Maximum value for each of the separate forces.                                    |
| `decay`                    | `1`               | float               | When set to a value in (0, 1), the total force exponentially decays at this rate. |

## Renderers
There are 2 different layouters, the *PixiRenderer* and the *SvgRenderer*.
They can be instantiated with
```
const renderer = new renderLib.renderer.PixiRenderer(domElement);
```
where domElement is the HTML element that should contain the renderer, e. g. `document.body`.
The *PixiRenderer* is based on [PixiJs](https://pixijs.com/) and has good performance, but text does not scale nicely.
The *SvgRenderer* is based on vector graphics that scale nicely, but has bad performance for large graphs.
In both renderers, the *Ctrl. + S* shortcut will save an image of the graph, either a png or an svg.

## Compiling
Changes to TypeScript (.ts) files will only take effect after recompiling the code with webpack.
To this end, it is easiest to use *Node.js* and *npm*. 
Install the dependencies with `npm i --save-dev`.
Then call the webpack compiler with `npx webpack`. 
An additional flag `--watch` activates automatic recompilation on file changes.

Note that changes to files outside of the `src` directory will not recompilation, i.e. webpack or Node.js, at all.
