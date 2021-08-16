import {CONNECTOR_SIZE, CONNECTOR_SPACING, DEBUG, ROOT_DIR} from "../util/constants";
import {inPlaceSort} from "fast-sort";
import * as _ from "lodash";
import * as seedrandom from "seedrandom";
import Assert from "../util/assert";
import Box from "../geometry/box";
import Edge from "../graph/edge";
import Layouter from "./layouter";
import LayoutBundle from "../layoutGraph/layoutBundle";
import LayoutConnector from "../layoutGraph/layoutConnector";
import LayoutEdge from "../layoutGraph/layoutEdge";
import LayoutGraph from "../layoutGraph/layoutGraph";
import LayoutNode from "../layoutGraph/layoutNode";
import LevelGraph from "../levelGraph/levelGraph";
import LevelNode from "../levelGraph/levelNode";
import OrderGraph from "../order/orderGraph";
import OrderGroup from "../order/orderGroup";
import OrderNode from "../order/orderNode";
import OrderRank from "../order/orderRank";
import RankGraph from "../rank/rankGraph";
import RankNode from "../rank/rankNode";
import Segment from "../geometry/segment";
import Shuffle from "../util/shuffle";
import Timer from "../util/timer";
import Vector from "../geometry/vector";
import Wasm from "../wasm/wasm";
import WorkerPool from "../util/workerPool";

export default class SugiyamaLayouter extends Layouter {
    protected _wasm: Wasm;
    protected _pool: WorkerPool = null;
    protected _bufferClass: any;

    constructor(options: object = {}) {
        super(options);
        this._options = _.defaults(options, this._options, {
            preorderPorts: true,
            compactRanks: true,
            numShuffles: 0,
            optimizeAngles: false,
            bundle: false,
            spaceBetweenComponents: 50,
            webAssembly: false,
            webWorkers: false,
            maxWorkers: (typeof(navigator) !== "undefined" ? (navigator.hardwareConcurrency - 1) : 0),
            sharedArrayBuffer: false,
        });
        if (this._options.webWorkers && this._options.maxWorkers > 0) {
            let workerPath = '/worker/worker.js';
            let layouterDirPos = window.location.href.indexOf(ROOT_DIR);
            if (layouterDirPos > -1) {
                workerPath = window.location.href.substr(0, layouterDirPos + ROOT_DIR.length) + '/worker/worker.js';
            }
            this._pool = new WorkerPool(workerPath, Math.min(Math.max(this._options.numShuffles, 4), this._options.maxWorkers), this);
        }
        if (this._options.webAssembly) {
            let wasmPath = '/wasm/countCrossings.js';
            let layouterDirPos = window.location.href.indexOf('npg-dag-layout');
            if (layouterDirPos > -1) {
                wasmPath = window.location.href.substr(0, layouterDirPos + 'npg-dag-layout'.length) + '/wasm/countCrossings.js';
            }
            try {
                this._wasm = new Wasm(wasmPath, this);
            } catch (e) {
                this._wasm = null;
            }
        }
        if (this._options.sharedArrayBuffer && typeof(SharedArrayBuffer) === "undefined") {
            this._options.sharedArrayBuffer = false;
        }
        this._bufferClass = this._options.sharedArrayBuffer ? SharedArrayBuffer : ArrayBuffer;
    }

    public cleanUp(): void {
        if (this._pool !== null) {
            this._pool.cleanUp();
        }
    }

    public disableWasm(): void {
        this._wasm = null;
    }

    public disableWorkers(): void {
        this._options["webWorkers"] = false;
    }

    protected async doLayout(graph: LayoutGraph): Promise<void> {
        if (graph.numNodes() === 0) {
            return;
        }

        Timer.start(["doLayout"]);

        // STEP 1: ASSIGN RANKS
        Timer.start(["doLayout", "assignRanks"]);
        this._assignRanks(graph);
        Timer.stop(["doLayout", "assignRanks"]);

        // STEP 2: ADD VIRTUAL NODES
        Timer.start(["doLayout", "addVirtualNodes"]);
        this._addVirtualNodes(graph);
        Timer.stop(["doLayout", "addVirtualNodes"]);

        // STEP 3: ORDER RANKS
        Timer.start(["doLayout", "orderRanks"]);
        await this._orderRanks(graph);
        Timer.stop(["doLayout", "orderRanks"]);

        // STEP 4: ASSIGN COORDINATES & REMOVE VIRTUAL NODES
        const rankTops = [];
        const segmentsPerRank = [];
        const crossingsPerRank = [];

        Timer.start(["doLayout", "assignCoordinates"]);
        await this._assignCoordinates(graph, rankTops, segmentsPerRank, crossingsPerRank);
        Timer.stop(["doLayout", "assignCoordinates"]);

        // STEP 5 (OPTIONAL): OPTIMIZE ANGLES
        if (this._options.optimizeAngles) {
            Timer.start(["doLayout", "optimizeAngles"]);
            this._optimizeAngles(graph, rankTops, segmentsPerRank, crossingsPerRank);
            Timer.stop(["doLayout", "optimizeAngles"]);
        }

        Timer.stop(["doLayout"]);
    }

    private _assignRanks(graph: LayoutGraph): void {
        const assignRanksForSubgraph = (subgraph: LayoutGraph) => {
            if (subgraph.numNodes() === 0) {
                return; // do nothing for empty subgraphs
            }

            // first determine the rank span of all nodes
            _.forEach(subgraph.nodes(), (node: LayoutNode) => {
                _.forEach(node.childGraphs, (childGraph: LayoutGraph) => {
                    assignRanksForSubgraph(childGraph);
                });
            });

            const rankGraph = new RankGraph();
            _.forEach(subgraph.nodes(), node => {
                rankGraph.addNode(new RankNode(node.label()), node.id);
            });
            _.forEach(subgraph.edges(), edge => {
                rankGraph.addEdge(new Edge(edge.src, edge.dst, subgraph.node(edge.src).rankSpan));
            });
            rankGraph.rank();

            _.forEach(subgraph.nodes(), node => {
                node.rank = rankGraph.node(node.id).rank;
                subgraph.numRanks = Math.max(subgraph.numRanks, node.rank + node.rankSpan);
            });

            if (subgraph.parentNode !== null && this._options.compactRanks) {
                subgraph.parentNode.rankSpan = Math.max(subgraph.parentNode.rankSpan, subgraph.numRanks);
            }
        };
        assignRanksForSubgraph(graph);

        // transform ranking from local to global
        const makeRanksAbsoluteCompact = (subgraph: LayoutGraph, offset: number) => {
            subgraph.minRank = offset;
            _.forEach(subgraph.nodes(), (node: LayoutNode) => {
                node.rank += offset;
                _.forEach(node.childGraphs, (childGraph: LayoutGraph) => {
                    makeRanksAbsoluteCompact(childGraph, node.rank);
                });
                subgraph.numRanks = Math.max(subgraph.numRanks, node.rank + node.rankSpan - subgraph.minRank);
            });
        }
        const makeRanksAbsolute = (subgraph: LayoutGraph, offset: number) => {
            subgraph.minRank = offset;
            let newRanks = 0;
            _.forEach(subgraph.ranks(), (rank: Array<LayoutNode>) => {
                let maxChild = 1;
                _.forEach(rank, (node: LayoutNode) => {
                    node.rank += offset + newRanks;
                    _.forEach(node.childGraphs, (childGraph: LayoutGraph) => {
                        makeRanksAbsolute(childGraph, node.rank);
                        node.rankSpan = Math.max(node.rankSpan, childGraph.numRanks);
                        maxChild = Math.max(maxChild, node.rankSpan);
                    });
                    subgraph.numRanks = Math.max(subgraph.numRanks, node.rank + node.rankSpan - subgraph.minRank);
                });
                newRanks += maxChild - 1;
            });
        }

        if (this._options.compactRanks) {
            makeRanksAbsoluteCompact(graph, 0);
        } else {
            makeRanksAbsolute(graph, 0);
        }

    }

    private _addVirtualNodes(graph: LayoutGraph, addToLevelGraph: boolean = false): void {
        // place intermediate nodes between long edges
        _.forEach(graph.allEdges(), (edge: LayoutEdge) => {
            if (edge.isReplica) {
                return;
            }
            let srcNode = edge.graph.node(edge.src);
            let dstNode = edge.graph.node(edge.dst);
            if (srcNode.rank + srcNode.rankSpan < dstNode.rank) {
                let tmpSrcId = srcNode.id;
                let tmpDstId;
                const dstConnector = edge.dstConnector;
                let bundle = ((edge.srcBundle !== null) && (edge.srcBundle.edges.length > 1));
                for (let tmpDstRank = srcNode.rank + srcNode.rankSpan; tmpDstRank < dstNode.rank; ++tmpDstRank) {
                    const newNode = new LayoutNode({width: 0, height: 0}, 0, 0, !bundle, bundle);
                    bundle = ((edge.dstBundle !== null) && (edge.dstBundle.edges.length > 1) && (tmpDstRank === dstNode.rank - 2));
                    newNode.rank = tmpDstRank;
                    tmpDstId = edge.graph.addNode(newNode, null);
                    if (addToLevelGraph) {
                        const levelNode = newNode.graph.levelGraph().addLayoutNode(newNode);
                        levelNode.position = _.last(srcNode.levelNodes).position;
                    }
                    if (tmpDstRank === srcNode.rank + srcNode.rankSpan) {
                        // original edge is redirected from source to first virtual node
                        edge.graph.redirectEdge(edge.id, edge.src, tmpDstId);
                        edge.dstConnector = null;
                        // add bundle edges
                        if (edge.srcBundle !== null && edge.srcBundle.edges.length > 1) {
                            _.forEach(edge.srcBundle.edges, (bundleEdge: LayoutEdge) => {
                                if (bundleEdge.isReplica) {
                                    bundleEdge.graph.redirectEdge(bundleEdge.id, bundleEdge.src, tmpDstId);
                                }
                            });
                        }
                        if (addToLevelGraph) {
                            const levelEdge = edge.graph.levelGraph().edgeBetween(_.last(srcNode.levelNodes).id, _.first(dstNode.levelNodes).id);
                            if (levelEdge !== undefined) {
                                levelEdge.graph.removeEdge(levelEdge.id);
                            }
                            edge.graph.levelGraph().addLayoutEdge(edge);
                        }
                    } else {
                        const tmpEdge = new LayoutEdge(tmpSrcId, tmpDstId);
                        if (!bundle) {
                            tmpEdge.weight = Number.POSITIVE_INFINITY;
                        }
                        tmpEdge.isInverted = edge.isInverted;
                        edge.graph.addEdge(tmpEdge, null);
                        if (addToLevelGraph) {
                            edge.graph.levelGraph().addLayoutEdge(tmpEdge);
                        }
                    }
                    tmpSrcId = tmpDstId;
                }
                // last virtual edge has the original dstConnector
                const tmpEdge = new LayoutEdge(tmpSrcId, dstNode.id, null, dstConnector);
                tmpEdge.isInverted = edge.isInverted;
                edge.graph.addEdge(tmpEdge, null);
                if (addToLevelGraph) {
                    edge.graph.levelGraph().addLayoutEdge(tmpEdge);
                }
                // add bundle edges
                if ((edge.dstBundle !== null) && (edge.dstBundle.edges.length > 1)) {
                    _.forEach(edge.dstBundle.edges, (bundleEdge: LayoutEdge) => {
                        if (bundleEdge.isReplica) {
                            bundleEdge.graph.redirectEdge(bundleEdge.id, tmpSrcId, bundleEdge.dst);
                        }
                    });
                }
            }
        });
    }

    private _updateLevelNodeRanks(graph: LayoutGraph): void {
        _.forEach(graph.allNodes(), (layoutNode: LayoutNode) => {
            _.forEach(layoutNode.levelNodes, (levelNode: LevelNode, r: number) => {
                levelNode.rank = layoutNode.rank + r;
            });
        });
    }

    public async countCrossings(graph: LayoutGraph): Promise<number> {
        const orderGraph = this._createConnectorGraph(graph, true, false, false, true);
        return await orderGraph.order({
            resolveConflicts: false,
            countInitial: true,
            countOnly: true,
        });
    }

    private _createConnectorGraph(graph: LayoutGraph, isPreorder: boolean, shuffleNodes: boolean = false, shuffleConnectors: boolean = false, isCounting: boolean = false): OrderGraph {
        const orderGraph = new OrderGraph(this._wasm);
        const orderRank = [];
        for (let r = 0; r < graph.numRanks; ++r) {
            orderRank[r] = new OrderRank(r);
            orderGraph.addRank(orderRank[r]);
        }

        const connectorMap = new Map();
        const levelNodeMap = new Map();

        const addConnector = (connectorGroup, connector) => {
            const connectorNode = new OrderNode(connector, false, false);
            connectorGroup.addNode(connectorNode);
            connectorMap.set(connector, connectorNode.id);
            if (connector.isScoped) {
                connectorMap.set(connector.counterpart, connectorNode.id);
            }
        };

        // add nodes
        const addConnectorsForSubgraph = (subgraph: LayoutGraph, indizes: Array<number> = null) => {
            _.forEach(subgraph.levelGraph().ranks(), (rank: Array<LevelNode>, r) => {
                let index = (indizes === null ? 0 : indizes[r]);
                if (shuffleNodes) {
                    rank = Shuffle.shuffle(rank);
                }
                _.forEach(rank, (levelNode: LevelNode) => {
                    if (isPreorder && !isCounting) {
                        levelNode.position = index;
                    }
                    const node = levelNode.layoutNode;
                    if (levelNode.isLast) {
                        let childIndizes = null;
                        if (node.isScopeNode) {
                            childIndizes = _.map(node.levelNodes, "position");
                        }
                        _.forEach(node.childGraphs, (childGraph: LayoutGraph) => {
                            addConnectorsForSubgraph(childGraph, childIndizes);
                        });
                    }
                    if (node.isScopeNode) {
                        index += node.childGraphs[0].maxNodesPerRank();
                        return; // do not add connectors for scope nodes
                    }
                    let connectorGroup;
                    if (isCounting && node.hasScopedConnectors) {
                        connectorGroup = new OrderGroup(levelNode);
                        orderRank[levelNode.rank].addGroup(connectorGroup);
                        connectorGroup.position = index;
                        let inPointer = 0;
                        let outPointer = 0;
                        while (inPointer < node.inConnectors.length || outPointer < node.outConnectors.length) {
                            if (inPointer === node.inConnectors.length) {
                                // only out connectors left
                                addConnector(connectorGroup, node.outConnectors[outPointer++]);
                            } else if (outPointer === node.outConnectors.length) {
                                // only in connectors left
                                addConnector(connectorGroup, node.inConnectors[inPointer++]);
                            } else {
                                let scoped = false;
                                if (node.inConnectors[inPointer].isScoped) {
                                    scoped = true;
                                    while (!node.outConnectors[outPointer].isScoped) {
                                        addConnector(connectorGroup, node.outConnectors[outPointer++]);
                                    }
                                } else if (node.outConnectors[outPointer].isScoped) {
                                    scoped = true;
                                    while (!node.inConnectors[inPointer].isScoped) {
                                        addConnector(connectorGroup, node.inConnectors[inPointer++]);
                                    }
                                } else {
                                    addConnector(connectorGroup, node.inConnectors[inPointer++]);
                                    addConnector(connectorGroup, node.outConnectors[outPointer++]);
                                }
                                if (scoped) {
                                    addConnector(connectorGroup, node.inConnectors[inPointer++]);
                                    outPointer++;
                                }
                            }
                        }
                    } else {
                        if (isPreorder || levelNode.isFirst) {
                            connectorGroup = new OrderGroup(levelNode);
                            orderRank[levelNode.rank].addGroup(connectorGroup);
                            connectorGroup.position = index;
                            if (levelNode.isFirst) {
                                // add input connectors
                                let connectors = node.inConnectors;
                                if (shuffleConnectors) {
                                    connectors = Shuffle.shuffle(connectors);
                                }
                                _.forEach(connectors, (connector: LayoutConnector) => {
                                    addConnector(connectorGroup, connector);
                                });
                            }
                        }
                        if (isPreorder || levelNode.isLast) {
                            if (!isPreorder && !node.hasScopedConnectors) {
                                connectorGroup = new OrderGroup(levelNode);
                                orderRank[levelNode.rank].addGroup(connectorGroup);
                                connectorGroup.position = index;
                            }
                            if (levelNode.isLast) {
                                // add output connectors
                                let connectors = node.outConnectors;
                                if (shuffleConnectors) {
                                    connectors = Shuffle.shuffle(connectors);
                                }
                                _.forEach(connectors, (connector: LayoutConnector) => {
                                    if (!connector.isScoped) {
                                        const connectorNode = new OrderNode(connector, false, false);
                                        connectorGroup.addNode(connectorNode, node.hasScopedConnectors ? null : null);
                                        connectorMap.set(connector, connectorNode.id);
                                    }
                                });
                            }
                        }
                        if (isPreorder && node.rankSpan > 1) {
                            const orderNode = new OrderNode(null, false, false);
                            connectorGroup.addNode(orderNode);
                            levelNodeMap.set(levelNode, orderNode);
                        }
                    }
                    index++;
                });
            });
        };
        addConnectorsForSubgraph(graph);

        // add edges
        _.forEach(graph.allEdges(), (edge: LayoutEdge) => {
            let srcNode = edge.graph.node(edge.src);
            if (srcNode.isScopeNode) {
                srcNode = srcNode.childGraphs[0].exitNode;
            }
            let dstNode = edge.graph.node(edge.dst);
            if (dstNode.isScopeNode) {
                dstNode = dstNode.childGraphs[0].entryNode;
            }
            if (DEBUG) {
                Assert.assert(dstNode.rank > srcNode.rank, "edge not between neighboring ranks", edge, srcNode, dstNode);
            }

            let srcOrderNodeId = connectorMap.get(srcNode.connector("OUT", edge.srcConnector));
            let dstOrderNodeId = connectorMap.get(dstNode.connector("IN", edge.dstConnector));
            orderGraph.addEdge(new Edge(srcOrderNodeId, dstOrderNodeId, 1));
        });

        if (isPreorder) {
            // add intranode edges
            _.forEach(graph.allNodes(), (node: LayoutNode) => {
                if (!node.isScopeNode && node.rankSpan > 1) {
                    for (let r = 0; r < node.levelNodes.length - 1; ++r) {
                        const srcNode = node.levelNodes[r];
                        const dstNode = node.levelNodes[r + 1];
                        let srcOrderNode = levelNodeMap.get(srcNode);
                        let dstOrderNode = levelNodeMap.get(dstNode);
                        orderGraph.addEdge(new Edge(srcOrderNode.id, dstOrderNode.id, 1));
                    }
                }
            });
        }

        return orderGraph;
    }

    public async doOrder(graph: LayoutGraph, shuffle: boolean = false): Promise<void> {
        Timer.start(["doLayout", "orderRanks", "doOrder"]);
        /**
         * STEP 1 (OPTIONAL): ORDER NODES BASED ON CONNECTORS
         * In this step, scope insides and outsides are handled in the same order graph.
         * If there are nested scopes, they are flattened.
         */
        if (this._options.preorderPorts) {
            Timer.start(["doLayout", "orderRanks", "doOrder", "preorder"]);
            // order
            const connectorOrderGraph = this._createConnectorGraph(graph, true, shuffle, shuffle);
            await connectorOrderGraph.order({
                orderGroups: true,
                resolveConflicts: false,
            });

            // copy order information from order graph to layout graph
            _.forEach(connectorOrderGraph.groups(), (orderGroup: OrderGroup) => {
                const levelNode = orderGroup.reference;
                if (levelNode !== null) {
                    levelNode.position = orderGroup.position;
                    let tmpNode = levelNode;
                    while (tmpNode.layoutNode.graph.entryNode !== null) {
                        tmpNode = tmpNode.layoutNode.graph.parentNode.levelNodes[tmpNode.rank - tmpNode.layoutNode.graph.parentNode.rank];
                        tmpNode.position = levelNode.position;
                    }
                }
            });
            Timer.stop(["doLayout", "orderRanks", "doOrder", "preorder"]);
        }

        /**
         * STEP 2: ORDER NODES (OPTIONAL) & RESOLVE CONFLICTS
         * This is done strictly hierarchically.
         * Child graphs are represented as a chain over multiple ranks in their parent.
         */

        const nodeMap: Map<number, number> = new Map(); // map from level node to corresponding order node

        // child graphs are visited before their parents
        const allGraphs = graph.allGraphs();
        for (let i = allGraphs.length - 1; i >= 0; --i) {
            Timer.start(["doLayout", "orderRanks", "doOrder", "orderNodes"]);

            const subgraph = allGraphs[i];
            this._addVirtualNodes(subgraph, true);

            const levelGraph = subgraph.levelGraph();
            levelGraph.invalidateRankOrder();

            // init graph and ranks
            const orderGraph = new OrderGraph(this._wasm);
            const orderGroups = new Array(subgraph.numRanks);
            for (let r = subgraph.minRank; r < subgraph.minRank + subgraph.numRanks; ++r) {
                const orderRank = new OrderRank(r);
                orderGraph.addRank(orderRank);
                orderGroups[r] = new OrderGroup(null);
                orderRank.addGroup(orderGroups[r]);
            }

            // add nodes
            let levelNodes = _.clone(levelGraph.nodes());
            if (shuffle && !this._options.preorderPorts) {
                Shuffle.shuffle(levelNodes);
            }
            _.forEach(levelNodes, (levelNode: LevelNode) => {
                const orderNode = new OrderNode(levelNode, levelNode.layoutNode.isVirtual || levelNode.layoutNode.isBundle, levelNode.layoutNode.rankSpan > 1, levelNode.layoutNode.label());
                orderGroups[levelNode.rank].addNode(orderNode, levelNode.id);
                nodeMap.set(levelNode.id, orderNode.id);
                if (this._options.preorderPorts) {
                    orderNode.position = levelNode.position;
                }
            });

            // add edges
            // for each pair of nodes, sum up the weights of edges in-between
            _.forEach(levelGraph.edges(), (edge: Edge<any, any>) => {
                const existingEdge = orderGraph.edgeBetween(edge.src, edge.dst);
                if (existingEdge === undefined) {
                    orderGraph.addEdge(new Edge(edge.src, edge.dst, edge.weight));
                } else {
                    existingEdge.weight += edge.weight;
                }
            });

            if (DEBUG) {
                Assert.assertAll(orderGraph.edges(), edge => {
                    const srcNode = edge.graph.node(edge.src);
                    const dstNode = edge.graph.node(edge.dst);
                    return (srcNode.group.rank.rank + 1 === dstNode.group.rank.rank);
                }, "order graph edge not between neighboring ranks");
            }

            // do order
            await orderGraph.order({
                debug: false,
                resolveX: true,
                countInitial: this._options.preorderPorts,
            });

            Timer.stop(["doLayout", "orderRanks", "doOrder", "orderNodes"]);

            Timer.start(["doLayout", "orderRanks", "doOrder", "insertNodes"]);

            // copy node order into layout graph
            const newOrderNodes: Set<OrderNode> = new Set();

            _.forEach(orderGraph.nodes(), (orderNode: OrderNode) => {
                let levelNode: LevelNode = orderNode.reference;
                if (levelNode === null) {
                    // virtual node was created by orderGraph.order() => add this node to layout graph
                    const newLayoutNode = new LayoutNode({width: 0, height: 0}, 0, 0, true);
                    newLayoutNode.rank = orderNode.rank;
                    subgraph.addNode(newLayoutNode, null);
                    newOrderNodes.add(orderNode);
                    levelNode = levelGraph.addLayoutNode(newLayoutNode);
                    orderNode.reference = levelNode;
                } else {
                    if (levelNode.isFirst) {
                        levelNode.layoutNode.updateRank(orderNode.rank);
                    }
                }
                subgraph.numRanks = Math.max(subgraph.numRanks, levelNode.rank - subgraph.minRank + 1);
                levelNode.position = orderNode.position;
            });

            let tmpSubgraph = subgraph;
            while (tmpSubgraph.parentNode !== null) {
                const parent = tmpSubgraph.parentNode;
                const prevRankSpan = parent.rankSpan;
                const newRankSpan = Math.max(prevRankSpan, tmpSubgraph.numRanks);
                const diff = newRankSpan - prevRankSpan;
                if (diff !== 0) {
                    const levelGraph = parent.graph.levelGraph();
                    parent.rankSpan = newRankSpan;

                    /**
                     * UPDATE LEVEL NODES REPRESENTATION IN PARENT
                     */
                    let positions = _.map(parent.levelNodes, "position");
                    positions.length = newRankSpan;
                    _.fill(positions, positions[prevRankSpan - 1], prevRankSpan);
                    const lastLevelNode = _.last(parent.levelNodes);
                    // add new nodes
                    const newLevelNodes: Array<LevelNode> = [];
                    for (let r = 0; r < diff; ++r) {
                        const newNode = new LevelNode(parent, lastLevelNode.rank + r, 0);
                        levelGraph.addNode(newNode);
                        newLevelNodes.push(newNode);
                    }
                    parent.levelNodes.length--;
                    Array.prototype.push.apply(parent.levelNodes, newLevelNodes);
                    parent.levelNodes.push(lastLevelNode);
                    lastLevelNode.rank += diff;
                    // redirect last edge
                    const lastEdge = levelGraph.inEdges(lastLevelNode.id)[0];
                    levelGraph.redirectEdge(lastEdge.id, _.last(newLevelNodes).id, lastLevelNode.id);
                    // update positions
                    _.forEach(parent.levelNodes, (levelNode: LevelNode, r: number) => {
                        levelNode.position = positions[r];
                    });
                    // add edges between new nodes
                    for (let r = prevRankSpan - 2; r < newRankSpan - 2; ++r) {
                        levelGraph.addEdge(new Edge(parent.levelNodes[r].id, parent.levelNodes[r + 1].id, Number.POSITIVE_INFINITY));
                    }
                    /////////////////////////////////////////////////////

                    _.forEach(parent.graph.bfs(parent.id), (node: LayoutNode) => {
                        if (node !== parent) {
                            node.offsetRank(diff);
                        }
                        node.graph.numRanks = Math.max(node.graph.numRanks, node.rank + node.rankSpan - node.graph.minRank);
                    });
                }
                tmpSubgraph = parent.graph;
            }

            // find for all new nodes the dominating and dominated non-new node
            const visited = _.fill(new Array(orderGraph.maxId() + 1), false);
            const newLevelNodesPerEdge: Map<string, Array<LevelNode>> = new Map();
            newOrderNodes.forEach((orderNode: OrderNode) => {
                if (visited[orderNode.id]) {
                    return; // start and end node already set
                }
                visited[orderNode.id] = true;
                let tmpOrderNode = orderNode;
                const nodes = [orderNode.reference];
                while (newOrderNodes.has(tmpOrderNode) && orderGraph.inEdges(tmpOrderNode.id).length > 0) {
                    tmpOrderNode = orderGraph.node(orderGraph.inEdges(tmpOrderNode.id)[0].src);
                    if (newOrderNodes.has(tmpOrderNode)) {
                        nodes.push(tmpOrderNode.reference);
                        if (DEBUG) {
                            Assert.assert(!visited[tmpOrderNode.id], "new node on multiple paths");
                        }
                        visited[tmpOrderNode.id] = true;
                    }
                }
                const startNode = tmpOrderNode;
                _.reverse(nodes);
                tmpOrderNode = orderNode;
                while (newOrderNodes.has(tmpOrderNode) && orderGraph.outEdges(tmpOrderNode.id).length > 0) {
                    tmpOrderNode = orderGraph.node(orderGraph.outEdges(tmpOrderNode.id)[0].dst);
                    if (newOrderNodes.has(tmpOrderNode)) {
                        nodes.push(tmpOrderNode.reference);
                        if (DEBUG) {
                            Assert.assert(!visited[tmpOrderNode.id], "new node on multiple paths");
                        }
                        visited[tmpOrderNode.id] = true;
                    }
                }
                const endNode = tmpOrderNode;
                const key = startNode.id + "_" + endNode.id;
                newLevelNodesPerEdge.set(key, nodes);
            });

            levelGraph.invalidateRankOrder();
            const ranks = levelGraph.ranks();

            // reroute edges that were intermitted by new virtual nodes
            _.forEach(levelGraph.edges(), levelEdge => {
                const orderSrcNodeId = nodeMap.get(levelEdge.src);
                const orderDstNodeId = nodeMap.get(levelEdge.dst);
                if (DEBUG) {
                    Assert.assertFiniteNumber(orderSrcNodeId, "orderSrcNodeId is not a number");
                    Assert.assertFiniteNumber(orderSrcNodeId, "orderSrcNodeId is not a number");
                }
                if (orderGraph.edgeBetween(orderSrcNodeId, orderDstNodeId) === undefined) {
                    levelGraph.removeEdge(levelEdge.id);
                    const srcLayoutNode = levelGraph.node(levelEdge.src).layoutNode;
                    const dstLayoutNode = levelGraph.node(levelEdge.dst).layoutNode;
                    const key = orderSrcNodeId + "_" + orderDstNodeId;
                    _.forEach(subgraph.edgesBetween(srcLayoutNode.id, dstLayoutNode.id), (layoutEdge: LayoutEdge, e) => {
                        if (layoutEdge.isReplica) {
                            return;
                        }
                        let newNodes = _.clone(newLevelNodesPerEdge.get(key));
                        const dstConnector = layoutEdge.dstConnector;
                        if (e > 0) {
                            let clonedNewNodes = [];
                            // create a copy of all new nodes because each edge needs its own virtual nodes
                            _.forEach(newNodes, (levelNode: LevelNode) => {
                                const newLayoutNode = new LayoutNode({width: 0, height: 0}, 0, 0, true);
                                newLayoutNode.rank = levelNode.layoutNode.rank;
                                subgraph.addNode(newLayoutNode, null);
                                const newLevelNode = levelGraph.addLayoutNode(newLayoutNode);
                                const rank = ranks[newLayoutNode.rank - subgraph.minRank];
                                for (let pos = levelNode.position; pos < rank.length; ++pos) {
                                    rank[pos].position++;
                                }
                                rank.splice(levelNode.position - 1, 0, newLevelNode);
                                newLevelNode.position = levelNode.position - 1;
                                clonedNewNodes.push(newLevelNode);
                            });
                            newNodes = clonedNewNodes;
                        }
                        newNodes.push(orderGraph.node(orderDstNodeId).reference);
                        // original edge gets rerouted to first new node
                        subgraph.removeEdge(layoutEdge.id);
                        layoutEdge.dst = newNodes[0].layoutNode.id;
                        layoutEdge.dstConnector = null;
                        subgraph.addEdge(layoutEdge, layoutEdge.id);
                        levelGraph.addLayoutEdge(layoutEdge);
                        for (let n = 1; n < newNodes.length; ++n) {
                            const tmpSrcLayoutNodeId = newNodes[n - 1].layoutNode.id;
                            const tmpDstLayoutNodeId = newNodes[n].layoutNode.id;
                            // last edge gets the original dst connector
                            const tmpDstConnector = ((n === newNodes.length - 1) ? dstConnector : null);
                            const newLayoutEdge = new LayoutEdge(tmpSrcLayoutNodeId, tmpDstLayoutNodeId, null, tmpDstConnector);
                            subgraph.addEdge(newLayoutEdge, null);
                            levelGraph.addLayoutEdge(newLayoutEdge);
                        }
                    });
                }
            });
            Timer.stop(["doLayout", "orderRanks", "doOrder", "insertNodes"]);
        }

        this._updateLevelNodeRanks(graph);

        if (DEBUG) {
            Assert.assertAll(graph.allEdges(), edge => edge.graph.node(edge.src).rank + edge.graph.node(edge.src).rankSpan === edge.graph.node(edge.dst).rank, "edge not between neighboring ranks");
        }

        /**
         * STEP 3: ORDER CONNECTORS
         */

        // order connectors
        Timer.start(["doLayout", "orderRanks", "doOrder", "orderConnectors"]);
        const connectorOrderGraph = this._createConnectorGraph(graph, false, false, shuffle && !this._options.preorderPorts);

        await connectorOrderGraph.order({
            resolveConflicts: false,
        });

        // copy order information from order graph to layout graph
        _.forEach(connectorOrderGraph.groups(), (orderGroup: OrderGroup) => {
            const levelNode = orderGroup.reference;
            if (levelNode !== null) {
                const layoutNode = levelNode.layoutNode;
                const connectors = {"IN": [], "OUT": []};
                _.forEach(orderGroup.orderedNodes(), (orderNode: OrderNode) => {
                    if (orderNode.reference !== null) {
                        const connector = orderNode.reference;
                        connectors[connector.type].push(connector);
                        if (connector.isScoped) {
                            connectors["OUT"].push(connector.counterpart);
                        }
                    }
                });
                if (connectors["IN"].length > 0 || connectors["OUT"].length > 0) {
                    if (connectors["IN"].length > 0 && layoutNode.inConnectorBundles.length > 0) {
                        this._bundleConnectors(connectors["IN"], connectors["OUT"], layoutNode.inConnectorBundles);
                    }
                    if (connectors["OUT"].length > 0 && layoutNode.outConnectorBundles.length > 0) {
                        this._bundleConnectors(connectors["OUT"], connectors["IN"], layoutNode.outConnectorBundles);
                    }
                    if (connectors["IN"].length > 0) {
                        layoutNode.inConnectors = connectors["IN"];
                    }
                    if (connectors["OUT"].length > 0) {
                        layoutNode.outConnectors = connectors["OUT"];
                    }
                }
            }
        });
        Timer.stop(["doLayout", "orderRanks", "doOrder", "orderConnectors"]);

        Timer.stop(["doLayout", "orderRanks", "doOrder"]);
    }

    private async _orderAndCount(graph: LayoutGraph): Promise<number> {
        const graphCopy = graph.cloneForOrdering();
        await this.doOrder(graphCopy);
        return await this.countCrossings(graphCopy);
    }

    private async _orderRanks(graph: LayoutGraph): Promise<void> {
        if (this._options.numShuffles === 0) {
            await this.doOrder(graph);
        } else {
            if (!this._options.bundle && this._options.webWorkers) {
                const allGraphs = graph.allGraphs();
                const numNodesTotal = _.sum(_.map(allGraphs, subgraph => subgraph.numNodes()));
                const numInConnectorsTotal = _.sum(_.map(allGraphs, subgraph => _.sum(_.map(subgraph.nodes(), node => node.numInConnectors()))))
                const numOutConnectorsTotal = _.sum(_.map(allGraphs, subgraph => _.sum(_.map(subgraph.nodes(), node => node.numOutConnectors()))))
                const numEdgesTotal = _.sum(_.map(allGraphs, subgraph => subgraph.numEdges()));
                // DATA PASSED TO WORKER
                // metadata: level, parentNodeId, #nodes, #in-connectors, #out-connectors, #edges, minRank, numRanks
                // nodes: id, rank, rankSpan, isVirtual, isScopeNode
                // inConnectors: nodeId, counterPartId
                // outConnectors: nodeId, counterPartId
                // edges: id, srcId, dstId, srcConnectorId, dstConnectorId, weight
                const sizeMetadata = 8 * allGraphs.length;
                const sizeNodes = 5 * numNodesTotal;
                const sizeInConnectors = numInConnectorsTotal;
                const sizeOutConnectors = 2 * numOutConnectorsTotal;
                const sizeEdges = 8 * numEdgesTotal;
                const metadataBuf = new this._bufferClass(Int32Array.BYTES_PER_ELEMENT * sizeMetadata);
                const metadata = new Int32Array(metadataBuf);
                const nodesBuf = new this._bufferClass(Int32Array.BYTES_PER_ELEMENT * sizeNodes);
                const nodes = new Int32Array(nodesBuf);
                const inConnectorsBuf = new this._bufferClass(Int32Array.BYTES_PER_ELEMENT * sizeInConnectors);
                const inConnectors = new Int32Array(inConnectorsBuf);
                const outConnectorsBuf = new this._bufferClass(Int32Array.BYTES_PER_ELEMENT * sizeOutConnectors);
                const outConnectors = new Int32Array(outConnectorsBuf);
                const edgesBuf = new this._bufferClass(Int32Array.BYTES_PER_ELEMENT * sizeEdges);
                const edges = new Int32Array(edgesBuf);
                let n = 0;
                let i = 0;
                let o = 0;
                let e = 0;
                _.forEach(allGraphs, (subgraph: LayoutGraph, g: number) => {
                    const graphNodes = subgraph.nodes();
                    let numInConnectors = 0;
                    let numOutConnectors = 0;
                    _.forEach(graphNodes, (node: LayoutNode) => {
                        _.forEach(node.inConnectors, (connector: LayoutConnector) => {
                            inConnectors[i++] = connector.node.id;
                            numInConnectors++;
                        });
                        _.forEach(node.outConnectors, (connector: LayoutConnector) => {
                            outConnectors[o++] = connector.node.id;
                            outConnectors[o++] = (connector.isScoped ? connector.node.connectorIndex("IN", connector.counterpart.name) : -1);
                            numOutConnectors++;
                        });
                    });
                    const graphEdges = subgraph.edges();
                    metadata[8 * g] = (subgraph.parentNode === null ? 0 : subgraph.parentNode.parents().length + 1);
                    metadata[8 * g + 1] = (subgraph.parentNode === null ? -1 : subgraph.parentNode.id);
                    metadata[8 * g + 2] = graphNodes.length;
                    metadata[8 * g + 3] = numInConnectors;
                    metadata[8 * g + 4] = numOutConnectors;
                    metadata[8 * g + 5] = graphEdges.length;
                    metadata[8 * g + 6] = subgraph.minRank;
                    metadata[8 * g + 7] = subgraph.numRanks;
                    _.forEach(graphNodes, (node: LayoutNode) => {
                        nodes[n++] = node.id;
                        nodes[n++] = node.rank;
                        nodes[n++] = node.rankSpan;
                        nodes[n++] = node.isVirtual ? 1 : 0;
                        nodes[n++] = node.isScopeNode ? 1 : 0;
                    });
                    _.forEach(graphEdges, (edge: LayoutEdge) => {
                        edges[e++] = edge.id; // id
                        edges[e++] = edge.src; // srcNodeId
                        edges[e++] = edge.dst; // dstNodeId
                        let srcNode = subgraph.node(edge.src);
                        let dstNode = subgraph.node(edge.dst);
                        if (srcNode.isScopeNode) {
                            srcNode = srcNode.childGraphs[0].exitNode;
                        }
                        if (dstNode.isScopeNode) {
                            dstNode = dstNode.childGraphs[0].entryNode;
                        }
                        edges[e++] = srcNode.connectorIndex("OUT", edge.srcConnector) // srcConnectorId
                        edges[e++] = dstNode.connectorIndex("IN", edge.dstConnector) // dstConnectorId
                        edges[e++] = (edge.weight === Number.POSITIVE_INFINITY ? -1 : edge.weight); // weight
                    });
                });
                const startedPromises = [];
                const donePromises = [null];
                for (let s = 0; s < this._options.numShuffles; ++s) {
                    const [startedPromise, donePromise] = this._pool.exec("orderRanks", [s + 1, allGraphs.length, metadata.buffer, nodes.buffer, inConnectors.buffer, outConnectors.buffer, edges.buffer, this._options.webAssembly]);
                    startedPromises.push(startedPromise);
                    donePromises.push(donePromise);
                }
                await Promise.all(startedPromises);
                donePromises[0] = this._orderAndCount(graph);
                const results = await Promise.all(donePromises);
                let minCrossings = results[0];
                let minIndex = 0;
                _.forEach(results, (result: number, index: number) => {
                    if (result < minCrossings) {
                        minCrossings = result;
                        minIndex = index;
                    }
                });
                seedrandom(minIndex, {global: true});
                await this.doOrder(graph, minIndex > 0);
            } else {
                const graphCopy = graph.cloneForOrdering();
                await this.doOrder(graphCopy);
                let minCrossings = await this.countCrossings(graphCopy);
                let bestGraphCopy = graphCopy;
                for (let i = 0; i < this._options.numShuffles; ++i) {
                    if (minCrossings === 0) {
                        break;
                    }
                    const graphCopy = graph.cloneForOrdering();
                    await this.doOrder(graphCopy, true);
                    let numCrossings = await this.countCrossings(graphCopy);
                    if (numCrossings < minCrossings) {
                        minCrossings = numCrossings;
                        bestGraphCopy = graphCopy;
                    }
                }
                bestGraphCopy.copyInto(graph);
            }
        }
    }

    private _bundleConnectors(connectors: Array<LayoutConnector>, counterPartConnectors: Array<LayoutConnector>, bundles: Array<LayoutBundle>): void {
        // order bundles by the mean of their connectors positions
        // within a bundle, the connectors do not change their relative position
        let connectorByName = new Map();
        let indexByConnector = new Map();
        _.forEach(connectors, (connector: LayoutConnector, pos: number) => {
            connectorByName.set(connector.name, connector);
            indexByConnector.set(connector.name, pos);
        });
        let bundleMeans = [];
        _.forEach(bundles, (bundle: LayoutBundle) => {
            bundle.connectors = _.sortBy(bundle.connectors, (name: string) => indexByConnector.get(name));
            bundleMeans.push([bundle, _.mean(_.map(bundle.connectors, (name: string) => indexByConnector.get(name)))]);
        });
        connectors.length = 0;
        _.forEach(_.sortBy(bundleMeans, "1"), ([bundle, mean]) => {
            _.forEach(bundle.connectors, (name: string) => {
                const connector = connectorByName.get(name);
                connectors.push(connector);
            });
        });

        // reflect unbroken sequences of scoped connectors on other side
        const scopeGroups = [];
        let group = [];
        _.forEach(connectors, (connector: LayoutConnector, pos: number) => {
            if (connector.isScoped) {
                group.push(connector);
            }
            if ((pos === connectors.length - 1) || !connectors[pos + 1].isScoped) {
                scopeGroups.push(group);
                group = [];
            }
        });
        const counterMeans = [];
        let scopeCount = 0;
        let scopeSum = 0;
        let scopeGroupPointer = 0;
        _.forEach(counterPartConnectors, (connector: LayoutConnector, pos: number) => {
            if (connector.isScoped) {
                scopeSum += pos;
                if (++scopeCount === scopeGroups[scopeGroupPointer].length) {
                    counterMeans.push([_.map(scopeGroups[scopeGroupPointer++], "counterpart"), pos / scopeCount]);
                    scopeCount = 0;
                    scopeSum = 0;
                }
            } else {
                counterMeans.push([[connector], pos]);
            }
        });
        counterPartConnectors.length = 0;
        _.forEach(_.sortBy(counterMeans, "1"), ([connectors, mean]) => {
            _.forEach(connectors, (connector: LayoutConnector) => {
                counterPartConnectors.push(connector);
            });
        });
    }

    /**
     * Assigns coordinates to the nodes, the connectors and the edges.
     * @param graph
     * @param rankTops
     * @param segmentsPerRank
     * @param crossingsPerRank
     * @private
     */
    private async _assignCoordinates(graph: LayoutGraph, rankTops: Array<number>, segmentsPerRank: Array<Array<Segment>>, crossingsPerRank: Array<Array<[Segment, Segment]>>): Promise<void> {
        // assign y
        Timer.start(["doLayout", "assignCoordinates", "assignY"]);
        rankTops.length = graph.numRanks + 1;
        _.fill(rankTops, Number.POSITIVE_INFINITY);
        const rankBottoms = _.fill(new Array(graph.numRanks), Number.NEGATIVE_INFINITY);

        const globalRanks = graph.globalRanks();

        rankTops[0] = 0;
        for (let r = 0; r < globalRanks.length; ++r) {
            crossingsPerRank[r] = [];
            segmentsPerRank[r] = [];
            let maxBottom = 0;
            _.forEach(globalRanks[r], (node: LayoutNode) => {
                node.y = rankTops[r];
                _.forEach(node.parents(), (parent: LayoutNode) => {
                    if (parent.rank === node.rank) {
                        node.y += parent.padding;
                    }
                });
                node.updateSize({width: 2 * node.padding, height: 2 * node.padding});
                let height = node.height;
                if (_.some(node.inConnectors, connector => !connector.isTemporary)) {
                    node.y += CONNECTOR_SIZE / 2;
                }
                if (_.some(node.outConnectors, connector => !connector.isTemporary)) {
                    height += CONNECTOR_SIZE / 2;
                }
                _.forEach(node.parents(), (parent: LayoutNode) => {
                    if (parent.rank + parent.rankSpan - 1 === node.rank) {
                        height += parent.padding;
                        if (_.some(parent.outConnectors, connector => !connector.isTemporary)) {
                            height += CONNECTOR_SIZE / 2;
                        }
                    }
                });
                maxBottom = Math.max(maxBottom, node.y + height);
            });
            rankBottoms[r] = maxBottom;
            rankTops[r + 1] = maxBottom + this._options.targetEdgeLength;
        }
        Timer.stop(["doLayout", "assignCoordinates", "assignY"]);

        const nodeHasInProxies = [];
        const nodeHasOutProxies = [];

        // assign x and set size; assign edge and connector coordinates
        const placeSubgraph = async (subgraph: LayoutGraph, offset: number): Promise<void> => {
            Timer.start(["doLayout", "assignCoordinates", "placeSubgraph"]);

            // place all subgraphs in order to know their size
            const nodes = subgraph.nodes();
            for (let n = 0; n < nodes.length; ++n) {
                let childOffset = 0;
                for (let c = 0; c < nodes[n].childGraphs.length; ++c) {
                    const childGraph = nodes[n].childGraphs[c];
                    if (childGraph.numNodes() > 0) {
                        await placeSubgraph(childGraph, childOffset);
                        childOffset += childGraph.boundingBox().width + this._options.spaceBetweenComponents;
                    }
                }
            }

            // assign x
            await this._assignX(subgraph, offset + (subgraph.parentNode !== null ? subgraph.parentNode.padding : 0));

            Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "changeParentSize"]);

            Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "placeConnectors"]);
            // place connectors
            _.forEach(subgraph.nodes(), (node: LayoutNode) => {
                this._placeConnectors(node, rankTops, rankBottoms);
            });
            Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "placeConnectors"]);

            /**
             * PLACE EDGES
             * (self-loops handled above)
             */

            const getInPoint = (node: LayoutNode, edge: LayoutEdge): Vector => {
                node = (node.isScopeNode ? node.childGraphs[0].entryNode : node);
                const dstConnector = node.connector("IN", edge.dstConnector);
                return dstConnector.boundingBox().topCenter();
            };

            const getInProxyPoint = (node: LayoutNode, inPoint: Vector): Vector => {
                const proxyPoint = inPoint.clone();
                proxyPoint.y = rankTops[node.rank];
                return proxyPoint;
            };

            const getOutPoint = (node: LayoutNode, edge: LayoutEdge): Vector => {
                node = (node.isScopeNode ? node.childGraphs[0].exitNode : node);
                const srcConnector = node.connector("OUT", edge.srcConnector);
                return srcConnector.boundingBox().bottomCenter();
            };

            const getOutProxyPoint = (node: LayoutNode, outPoint: Vector): Vector => {
                const proxyPoint = outPoint.clone();
                proxyPoint.y = rankBottoms[node.rank + node.rankSpan - 1];
                return proxyPoint;
            };

            Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "placeEdges"]);

            // mark nodes that do not need proxies
            Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "placeEdges", "markNoProxies"]);
            nodeHasInProxies.length = subgraph.maxId() + 1;
            nodeHasOutProxies.length = subgraph.maxId() + 1;
            _.forEach(subgraph.nodes(), (node: LayoutNode) => {
                nodeHasInProxies[node.id] = true;
                nodeHasOutProxies[node.id] = true;
            });
            _.forEach(subgraph.levelGraph().ranks(), (rank: Array<LevelNode>) => {
                _.forEach(rank, (levelNode: LevelNode, pos: number) => {
                    const node = levelNode.layoutNode;
                    if (node.isVirtual) {
                        return;
                    }

                    let leftBoundary = Number.NEGATIVE_INFINITY;
                    if (pos > 0) {
                        leftBoundary = rank[pos - 1].layoutNode.boundingBox().right();
                    }
                    let rightBoundary = Number.POSITIVE_INFINITY;
                    if (pos < rank.length - 1) {
                        rightBoundary = rank[pos + 1].layoutNode.boundingBox().left();
                    }

                    if (node.graph.numInEdges(node.id) > 0 && node.inConnectorBundles.length === 0 && (!node.isScopeNode || node.childGraphs[0].entryNode.inConnectorBundles.length === 0)) {
                        let minPos = Number.POSITIVE_INFINITY;
                        let maxPos = Number.NEGATIVE_INFINITY
                        _.forEach(node.graph.inEdges(node.id), (edge: LayoutEdge) => {
                            const dstPoint = getInPoint(node, edge);
                            const dstProxyPoint = getInProxyPoint(node, dstPoint);
                            if (dstPoint.y === dstProxyPoint.y) {
                                return;
                            }
                            const srcPoint = getOutPoint(node.graph.node(edge.src), edge);
                            const intersection = dstPoint.clone().sub(dstPoint.clone().sub(srcPoint).setY(dstPoint.y - dstProxyPoint.y));
                            minPos = Math.min(minPos, intersection.x);
                            maxPos = Math.max(maxPos, intersection.x);
                        });
                        if (minPos > leftBoundary && maxPos < rightBoundary) {
                            nodeHasInProxies[node.id] = false;
                        }
                    }
                    if (node.graph.numOutEdges(node.id) > 0 && node.outConnectorBundles.length === 0 && (!node.isScopeNode || node.childGraphs[0].exitNode.outConnectorBundles.length === 0)) {
                        let minPos = Number.POSITIVE_INFINITY;
                        let maxPos = Number.NEGATIVE_INFINITY
                        _.forEach(node.graph.outEdges(node.id), (edge: LayoutEdge) => {
                            const srcPoint = getOutPoint(node, edge);
                            const srcProxyPoint = getOutProxyPoint(node, srcPoint);
                            if (srcPoint.y === srcProxyPoint.y) {
                                return;
                            }
                            const dstPoint = getInPoint(node.graph.node(edge.dst), edge);
                            const intersection = srcPoint.clone().add(dstPoint.clone().sub(srcPoint).setY(srcProxyPoint.y - srcPoint.y));
                            minPos = Math.min(minPos, intersection.x);
                            maxPos = Math.max(maxPos, intersection.x);
                        });
                        if (minPos > leftBoundary && maxPos < rightBoundary) {
                            nodeHasOutProxies[node.id] = false;
                        }
                    }
                });
            });
            Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "placeEdges", "markNoProxies"]);

            _.forEach(subgraph.edges(), (edge: LayoutEdge) => {
                if (edge.isReplica) {
                    return; // replica edges are added with their primary
                }
                let startNode = subgraph.node(edge.src);
                if (startNode.isVirtual) {
                    return; // do not assign points to this edge
                }

                let startHasOutProxies = nodeHasOutProxies[startNode.id];
                if (startNode.isScopeNode) {
                    startNode = startNode.childGraphs[0].exitNode;
                }

                const startPoint = getOutPoint(startNode, edge);
                const startProxyPoint = (edge.srcBundle !== null ? edge.srcBundle.position() : getOutProxyPoint(startNode, startPoint));
                edge.points = [startPoint];
                if (startPoint.y !== startProxyPoint.y) {
                    if (startHasOutProxies) {
                        edge.points.push(startProxyPoint);
                    } else if (_.some(startNode.outConnectors, connector => !connector.isTemporary)) {
                        edge.points.push(startPoint.clone().add(new Vector(0, CONNECTOR_SIZE / 2)));
                    }
                }
                let nextNode = subgraph.node(edge.dst);
                let tmpEdge = null;
                while (nextNode.isVirtual || nextNode.isBundle) {
                    const nextPoint = getInPoint(nextNode, edge);
                    const nextInProxyPoint = getInProxyPoint(nextNode, nextPoint);
                    const nextOutProxyPoint = getOutProxyPoint(nextNode, nextPoint);
                    if (nextInProxyPoint.y !== nextPoint.y) {
                        edge.points.push(nextInProxyPoint);
                    }
                    edge.points.push(nextPoint);
                    if (nextOutProxyPoint.y !== nextPoint.y) {
                        edge.points.push(nextOutProxyPoint);
                    }
                    tmpEdge = subgraph.outEdges(nextNode.id)[0];
                    nextNode = subgraph.node(tmpEdge.dst);
                }
                let endNode = nextNode;
                let endHasInProxies = nodeHasInProxies[endNode.id];
                if (endNode.isScopeNode) {
                    endNode = endNode.childGraphs[0].entryNode;
                }
                if (tmpEdge !== null) {
                    edge.dstConnector = tmpEdge.dstConnector;
                }
                const endPoint = getInPoint(endNode, edge);
                const endProxyPoint = (edge.dstBundle !== null ? edge.dstBundle.position() : getInProxyPoint(endNode, endPoint));
                if (endProxyPoint.y !== endPoint.y) {
                    if (endHasInProxies) {
                        edge.points.push(endProxyPoint);
                    } else if (_.some(endNode.inConnectors, connector => !connector.isTemporary)) {
                        edge.points.push(endPoint.clone().sub(new Vector(0, CONNECTOR_SIZE / 2)));
                    }
                }

                edge.points.push(endPoint);

                // redirect edge from start to end
                if (tmpEdge !== null) {
                    edge.graph.removeEdge(edge.id);
                    edge.dst = tmpEdge.dst;
                    edge.graph.addEdge(edge, edge.id);
                }

                // place replicas
                if (edge.srcBundle !== null) {
                    _.forEach(edge.srcBundle.edges, (bundleEdge: LayoutEdge) => {
                        if (bundleEdge.isReplica) {
                            bundleEdge.points = _.cloneDeep(edge.points);
                            bundleEdge.points[0] = getOutPoint(startNode, bundleEdge);
                        }
                    });
                }
                if (edge.dstBundle !== null) {
                    _.forEach(edge.dstBundle.edges, (bundleEdge: LayoutEdge) => {
                        if (bundleEdge.isReplica) {
                            bundleEdge.points = _.cloneDeep(edge.points);
                            bundleEdge.points[bundleEdge.points.length - 1] = getInPoint(endNode, bundleEdge);
                        }
                    });
                }
            });
            Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "placeEdges", "removeVirtual"]);
            _.forEach(_.clone(subgraph.nodes()), (node: LayoutNode) => {
                // remove virtual nodes and edges
                if (node.isVirtual) {
                    _.forEach(subgraph.inEdgesIds(node.id), (inEdgeId: number) => {
                        subgraph.removeEdge(inEdgeId);
                    });
                    _.forEach(subgraph.outEdgesIds(node.id), (outEdgeId: number) => {
                        subgraph.removeEdge(outEdgeId);
                    });
                    subgraph.removeNode(node.id);
                }
            });
            Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "placeEdges", "removeVirtual"]);

            Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "placeEdges"]);

            // mark crossings for later angle optimization
            if (this._options.optimizeAngles) {
                this._markCrossings(subgraph, segmentsPerRank, crossingsPerRank, rankTops, rankBottoms);
            }

            // set parent bounding box on last component
            const parent = subgraph.parentNode;
            if (parent !== null && subgraph === _.last(parent.childGraphs)) {
                let width = 0;
                let height = 0;
                let boundingBox;
                _.forEach(parent.childGraphs, (childGraph: LayoutGraph) => {
                    boundingBox = childGraph.boundingBox();
                    if (DEBUG) {
                        Assert.assertFiniteNumber(boundingBox.width, "boundingBox has invalid width");
                    }
                    if (_.some(parent.outConnectors, connector => !connector.isTemporary)) {
                        boundingBox.height -= CONNECTOR_SIZE / 2;
                    }
                    width += boundingBox.width + this._options.spaceBetweenComponents;
                    height = Math.max(height, boundingBox.height);
                });

                width += 2 * parent.padding - this._options.spaceBetweenComponents;
                if (parent.selfLoop !== null) {
                    // add space for self loop on right side
                    width += this._options.targetEdgeLength;
                }
                height += 2 * subgraph.parentNode.padding;
                parent.updateSize({width: width, height: height});
                if (parent.isScopeNode) {
                    const left = boundingBox.x;
                    subgraph.entryNode.setWidth(boundingBox.width);
                    subgraph.entryNode.setPosition(new Vector(left, subgraph.entryNode.y));
                    subgraph.exitNode.setWidth(boundingBox.width);
                    subgraph.exitNode.setPosition(new Vector(left, subgraph.exitNode.y));
                }
            }
            Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "changeParentSize"]);

            Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph"]);
        }

        await placeSubgraph(graph, 0);
    }

    private async _assignX(subgraph: LayoutGraph, offset = 0) {
        Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "assignX"]);
        Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "getRanks"]);
        const levelGraph = subgraph.levelGraph();
        const ranks = levelGraph.ranks();
        Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "getRanks"]);
        Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "alignMedian"]);
        let xAssignments: Array<Array<number>>;
        if (this._options.webWorkers && this._options.maxWorkers >= 4) {
            let numNodesPerRank, levelNodes, levelEdges;

            const numNodesPerRankBuf = new this._bufferClass(Int32Array.BYTES_PER_ELEMENT * ranks.length);
            numNodesPerRank = new Int32Array(numNodesPerRankBuf);
            const levelNodesBuf = new this._bufferClass(Float64Array.BYTES_PER_ELEMENT * 4 * levelGraph.numNodes());
            levelNodes = new Float64Array(levelNodesBuf);
            const levelEdgesBuf = new this._bufferClass(Float64Array.BYTES_PER_ELEMENT * 3 * levelGraph.numEdges());
            levelEdges = new Float64Array(levelEdgesBuf);

            let n = 0;
            _.forEach(ranks, (rank: Array<LevelNode>, r: number) => {
                numNodesPerRank[r] = rank.length;
                _.forEach(rank, (node: LevelNode) => {
                    levelNodes[n++] = node.id;
                    levelNodes[n++] = node.layoutNode.width;
                    levelNodes[n++] = node.isFirst;
                    levelNodes[n++] = node.isLast;
                });
            });
            let e = 0;
            _.forEach(levelGraph.edges(), (edge: Edge<any, any>) => {
                levelEdges[e++] = edge.src;
                levelEdges[e++] = edge.dst;
                levelEdges[e++] = edge.weight;
            });

            xAssignments = await Promise.all([
                this._pool.exec("alignMedian", [ranks.length, numNodesPerRankBuf, levelNodesBuf, levelGraph.numEdges(), levelEdgesBuf, "UP", "LEFT", this._options.spaceBetweenNodes])[1],
                this._pool.exec("alignMedian", [ranks.length, numNodesPerRankBuf, levelNodesBuf, levelGraph.numEdges(), levelEdgesBuf, "UP", "RIGHT", this._options.spaceBetweenNodes])[1],
                this._pool.exec("alignMedian", [ranks.length, numNodesPerRankBuf, levelNodesBuf, levelGraph.numEdges(), levelEdgesBuf, "DOWN", "LEFT", this._options.spaceBetweenNodes])[1],
                this._pool.exec("alignMedian", [ranks.length, numNodesPerRankBuf, levelNodesBuf, levelGraph.numEdges(), levelEdgesBuf, "DOWN", "RIGHT", this._options.spaceBetweenNodes])[1],
            ]);
        } else {
            xAssignments = ([
                this._alignMedian(levelGraph, "UP", "LEFT"),
                this._alignMedian(levelGraph, "UP", "RIGHT"),
                this._alignMedian(levelGraph, "DOWN", "LEFT"),
                this._alignMedian(levelGraph, "DOWN", "RIGHT"),
            ]);
        }

        Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "alignMedian"]);

        // align left-most and right-most nodes
        Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "merge"]);
        let minMaxX = Number.POSITIVE_INFINITY;
        _.forEach(xAssignments, (xAssignment: Array<number>) => {
            minMaxX = Math.min(minMaxX, _.max(xAssignment));
        });
        _.forEach([1, 3], (i: number) => {
            const xAssignment = xAssignments[i];
            const maxX = _.max(xAssignment);
            if (maxX === minMaxX) {
                return; // no need to adjust this graph
            }
            const diff = minMaxX - maxX;
            for (let i = 0; i < xAssignment.length; ++i) {
                xAssignment[i] += diff;
            }
        });

        let minX = Number.POSITIVE_INFINITY;
        _.forEach(levelGraph.nodes(), (node: LevelNode) => {
            if (node.isFirst) {
                const xs = _.map(xAssignments, xAssignment => xAssignment[node.id]);
                inPlaceSort(xs).asc();
                let x = (xs[1] + xs[2]) / 2;
                //x = xs[0]; // comment inPlaceSort and uncomment this line to see 1 of the 4 merged layouts
                x -= node.layoutNode.width / 2;
                minX = Math.min(minX, x);
                node.x = offset + x;
            }
        });
        const diff = 0 - minX;
        _.forEach(levelGraph.nodes(), (node: LevelNode) => {
            if (node.isFirst) {
                node.x += diff;
                node.layoutNode.updatePosition(new Vector(node.x, node.layoutNode.y));
            }
        });
        Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "merge"]);

        Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "assignX"]);
    }

    private _alignMedian(levelGraph: LevelGraph, neighborDir: "UP" | "DOWN", preference: "LEFT" | "RIGHT"): Array<number> {
        const ranks = levelGraph.ranks();
        const firstRank = (neighborDir === "UP" ? 1 : (ranks.length - 2));
        const lastRank = (neighborDir === "UP" ? (ranks.length - 1) : 0);
        const verticalDir = (neighborDir === "UP" ? 1 : -1);
        const neighborOutMethod = (neighborDir === "UP" ? "outEdges" : "inEdges");
        const neighborInMethod = (neighborDir === "UP" ? "inEdges" : "outEdges");
        const neighborEdgeInAttr = (neighborDir === "UP" ? "dst" : "src");

        const blockPerNode = new Array(levelGraph.maxId() + 1);
        const nodesPerBlock = new Array(levelGraph.maxId() + 1);
        const blockWidths = new Array(levelGraph.maxId() + 1);
        const blockGraph = new RankGraph();

        const maxWidth = levelGraph.maxWidth();
        const neighbors: Array<Array<number>> = new Array(maxWidth);
        const neighborsUsable: Array<Array<boolean>> = new Array(maxWidth);
        for (let n = 0; n < maxWidth; ++n) {
            neighbors[n] = [];
            neighborsUsable[n] = [];
        }

        // every node of the first rank is a block on its own
        const r = firstRank - verticalDir;
        let blockId = 0;
        for (let n = 0; n < ranks[r].length; ++n) {
            blockGraph.addNode(new RankNode(blockId.toString()));
            blockPerNode[ranks[r][n].id] = blockId;
            nodesPerBlock[blockId] = [ranks[r][n].id];
            blockWidths[blockId] = ranks[r][n].layoutNode.width;
            blockId++;
        }
        for (let n = 1; n < ranks[r].length; ++n) {
            const edgeLength = (ranks[r][n - 1].layoutNode.width + ranks[r][n].layoutNode.width) / 2 + this._options.spaceBetweenNodes;
            blockGraph.addEdge(new Edge(blockPerNode[ranks[r][n - 1].id], blockPerNode[ranks[r][n].id], edgeLength));
        }
        for (let r = firstRank; r - verticalDir !== lastRank; r += verticalDir) {
            Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "alignMedian", "createNeighborList"]);
            // create sorted list of neighbors
            _.forEach(ranks[r], (node: LevelNode, n) => {
                neighbors[n].length = 0;
                neighborsUsable[n].length = 0;
            });
            _.forEach(ranks[r - verticalDir], (neighbor: LevelNode, n) => {
                _.forEach(levelGraph[neighborOutMethod](neighbor.id), (edge: Edge<any, any>) => {
                    const node = levelGraph.node(edge[neighborEdgeInAttr]);
                    neighbors[node.position].push(n);
                });
            });
            Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "alignMedian", "createNeighborList"]);

            Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "alignMedian", "markConflicts"]);

            // mark segments that cross a heavy segment as non-usable
            let heavyLeft = -1;
            let n = 0;
            for (let tmpN = 0; tmpN < ranks[r].length; ++tmpN) {
                const hasHeavy = _.some(levelGraph[neighborInMethod](ranks[r][tmpN].id), edge => edge.weight === Number.POSITIVE_INFINITY);
                if (tmpN === ranks[r].length - 1 || hasHeavy) {
                    let heavyRight = ranks[r - verticalDir].length;
                    if (hasHeavy) {
                        heavyRight = neighbors[tmpN][0];
                    }
                    while (n <= tmpN) {
                        _.forEach(neighbors[n], (neighborPos: number, neighborIndex: number) => {
                            neighborsUsable[n][neighborIndex] = neighborPos >= heavyLeft && neighborPos <= heavyRight;
                        });
                        n++;
                    }
                    heavyLeft = heavyRight;
                }
            }
            Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "alignMedian", "markConflicts"]);

            Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "alignMedian", "findNeighbor"]);

            let maxNeighborTaken = (preference === "LEFT" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
            const compare = (preference === "LEFT" ? ((a, b) => a < b) : ((a, b) => a > b));
            const nMin = (preference === "LEFT" ? 0 : ranks[r].length - 1);
            const nMax = (preference === "LEFT" ? ranks[r].length - 1 : 0);
            const horizontalDir = (preference === "LEFT" ? 1 : -1);
            for (let n = nMin; n - horizontalDir !== nMax; n += horizontalDir) {
                let neighbor = null;
                if (neighbors[n].length > 0) {
                    const leftMedian = Math.floor((neighbors[n].length - 1) / 2);
                    const rightMedian = Math.floor((neighbors[n].length) / 2);
                    const tryOrder = (preference === "LEFT" ? [leftMedian, rightMedian] : [rightMedian, leftMedian]);
                    _.forEach(tryOrder, (neighborIndex: number) => {
                        if (neighbor !== null) {
                            return; // already found
                        }
                        if (neighborsUsable[n][neighborIndex] && compare(maxNeighborTaken, neighbors[n][neighborIndex])) {
                            neighbor = ranks[r - verticalDir][neighbors[n][neighborIndex]];
                            maxNeighborTaken = neighbors[n][neighborIndex];
                        }
                    });
                }
                if (neighbor === null) {
                    blockGraph.addNode(new RankNode(blockId.toString()));
                    blockPerNode[ranks[r][n].id] = blockId;
                    nodesPerBlock[blockId] = [ranks[r][n].id];
                    blockWidths[blockId] = ranks[r][n].layoutNode.width;
                    blockId++;
                } else {
                    const blockId = blockPerNode[neighbor.id];
                    blockPerNode[ranks[r][n].id] = blockId;
                    nodesPerBlock[blockId].push(ranks[r][n].id);
                    blockWidths[blockId] = Math.max(blockWidths[blockId], ranks[r][n].layoutNode.width);
                }
            }
            for (let n = 1; n < ranks[r].length; ++n) {
                const edgeLength = (ranks[r][n - 1].layoutNode.width + ranks[r][n].layoutNode.width) / 2 + this._options.spaceBetweenNodes;
                blockGraph.addEdge(new Edge(blockPerNode[ranks[r][n - 1].id], blockPerNode[ranks[r][n].id], edgeLength));
            }
            Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "alignMedian", "findNeighbor"]);
        }

        const xAssignment = new Array(levelGraph.maxId() + 1);

        // compact
        Timer.start(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "alignMedian", "rank"]);
        blockGraph.rank();
        _.forEach(levelGraph.nodes(), (node: LevelNode) => {
            xAssignment[node.id] = blockGraph.node(blockPerNode[node.id]).rank;
        });
        Timer.stop(["doLayout", "assignCoordinates", "placeSubgraph", "assignX", "alignMedian", "rank"]);

        return xAssignment;
    }

    private _placeConnectors(node: LayoutNode, rankTops: Array<number>, rankBottoms: Array<number>): void {
        if (node.inConnectors.length === 0 && node.outConnectors.length === 0) {
            return; // no connectors
        }
        let tmpInConnectors = [];
        let tmpOutConnectors = [];
        const SPACE = CONNECTOR_SPACING;
        const SIZE = CONNECTOR_SIZE;
        const inY = node.y - SIZE / 2;
        const outY = node.y + node.height - SIZE / 2;
        let inPointer = 0;
        let outPointer = 0;
        let x = node.x;

        /**
         * Places simple in- and out-connectors between tunnel connectors
         * @param x
         * @param tmpInConnectors
         * @param tmpOutConnectors
         */
        const placeTmpConnectors = (x, tmpInConnectors: Array<LayoutConnector>, tmpOutConnectors: Array<LayoutConnector>) => {
            let length = Math.max(tmpInConnectors.length, tmpOutConnectors.length) * (SIZE + SPACE) - SPACE;
            let inSpace = SPACE;
            let inOffset = 0;
            if (tmpInConnectors.length < tmpOutConnectors.length) {
                inSpace = (length - (tmpInConnectors.length * SIZE)) / (tmpInConnectors.length + 1);
                inOffset = inSpace;
            }
            let outSpace = SPACE;
            let outOffset = 0;
            if (tmpOutConnectors.length < tmpInConnectors.length) {
                outSpace = (length - (tmpOutConnectors.length * SIZE)) / (tmpOutConnectors.length + 1);
                outOffset = outSpace;
            }
            _.forEach(tmpInConnectors, (connector, i) => {
                connector.x = x + inOffset + i * (inSpace + SIZE);
                connector.y = inY;
            });
            _.forEach(tmpOutConnectors, (connector, i) => {
                connector.x = x + outOffset + i * (outSpace + SIZE);
                connector.y = outY;
            });
            return x + length + SPACE;
        }
        while (inPointer < node.inConnectors.length || outPointer < node.outConnectors.length) {
            if (inPointer === node.inConnectors.length) {
                // only out connectors left
                tmpOutConnectors.push(node.outConnectors[outPointer++]);
            } else if (outPointer === node.outConnectors.length) {
                // only in connectors left
                tmpInConnectors.push(node.inConnectors[inPointer++]);
            } else {
                let scoped = false;
                if (node.inConnectors[inPointer].isScoped) {
                    scoped = true;
                    while (!node.outConnectors[outPointer].isScoped) {
                        tmpOutConnectors.push(node.outConnectors[outPointer++]);
                    }
                } else if (node.outConnectors[outPointer].isScoped) {
                    scoped = true;
                    while (!node.inConnectors[inPointer].isScoped) {
                        tmpInConnectors.push(node.inConnectors[inPointer++]);
                    }
                } else {
                    tmpInConnectors.push(node.inConnectors[inPointer++]);
                    tmpOutConnectors.push(node.outConnectors[outPointer++]);
                }
                if (scoped) {
                    x = placeTmpConnectors(x, tmpInConnectors, tmpOutConnectors);
                    let scopedConnectorIn = node.inConnectors[inPointer++];
                    scopedConnectorIn.x = x;
                    scopedConnectorIn.y = inY;
                    let scopedConnectorOut = node.outConnectors[outPointer++];
                    scopedConnectorOut.x = x;
                    scopedConnectorOut.y = outY;
                    x += SIZE + SPACE;
                    tmpInConnectors = [];
                    tmpOutConnectors = [];
                }
            }
        }
        placeTmpConnectors(x, tmpInConnectors, tmpOutConnectors);
        let auxBox = new Box(
            node.x,
            node.y,
            Math.max(node.inConnectors.length, node.outConnectors.length) * (SPACE + SIZE) - SPACE,
            SIZE
        ).centerIn(node.boundingBox());
        _.forEach(node.connectors(), (connector: LayoutConnector) => {
            connector.translate(auxBox.x - node.x + (connector.isTemporary ? SPACE / 2 : 0), connector.isTemporary ? SPACE / 2 : 0);
        });

        // place bundles
        _.forEach(node.inConnectorBundles, (inBundle: LayoutBundle) => {
            const top = rankTops[node.rank];
            inBundle.y = Math.min(top, node.y - CONNECTOR_SIZE / 2 - this._options.targetEdgeLength / 3);
            inBundle.x = _.mean(_.map(inBundle.connectors, (name: string) => node.connector("IN", name).x)) + SIZE / 2;
        });
        _.forEach(node.outConnectorBundles, (outBundle: LayoutBundle) => {
            const bottom = rankBottoms[node.rank + node.rankSpan - 1];
            outBundle.y = Math.max(bottom, node.y + node.height + CONNECTOR_SIZE / 2 + this._options.targetEdgeLength / 3);
            outBundle.x = _.mean(_.map(outBundle.connectors, (name: string) => node.connector("OUT", name).x)) + SIZE / 2;
        });
    }

    private _markCrossings(subgraph: LayoutGraph, segmentsPerRank: Array<Array<Segment>>,
                           crossingsPerRank: Array<Array<[Segment, Segment]>>, rankTops: Array<number>,
                           rankBottoms: Array<number>): void {
        const endpointsPerRank = new Array(rankTops.length);
        for (let r = 1; r < rankTops.length; ++r) {
            endpointsPerRank[r] = [];
        }

        _.forEach(subgraph.edges(), (edge: LayoutEdge) => {
            _.forEach(edge.rawSegments(), (segment: Segment) => {
                let startRank = _.sortedIndex(rankBottoms, segment.start.y);
                if ((startRank < rankTops.length - 1) && (segment.end.y >= rankTops[startRank + 1])) {
                    let start = segment.start.clone();
                    if (segment.start.y < rankBottoms[startRank]) {
                        start.add(segment.vector().setY(rankBottoms[startRank] - segment.start.y));
                    }
                    let end = segment.end.clone();
                    if (segment.end.y > rankTops[startRank + 1]) {
                        end = start.clone().add(segment.vector().setY(this._options.targetEdgeLength));
                    }
                    segment = new Segment(start, end);
                    endpointsPerRank[startRank + 1].push([segment.start, segment]);
                    endpointsPerRank[startRank + 1].push([segment.end, segment]);
                    segmentsPerRank[startRank + 1].push(segment);
                }
            });
        });

        for (let r = 1; r < rankTops.length; ++r) {
            const pointsSorted = _.sortBy(endpointsPerRank[r], ([point, segment]) => point.x); // sort by x
            const openSegments: Set<Segment> = new Set();
            _.forEach(pointsSorted, ([point, segment]) => {
                if (openSegments.has(segment)) {
                    openSegments.delete(segment);
                } else {
                    openSegments.forEach((otherSegment) => {
                        if ((segment.start.x !== otherSegment.start.x) && (segment.end.x !== otherSegment.end.x) &&
                            (Math.sign(segment.start.x - otherSegment.start.x) !== Math.sign(segment.end.x - otherSegment.end.x))) {
                            crossingsPerRank[r].push([segment, otherSegment]);
                        }
                    });
                    openSegments.add(segment);
                }
            });
        }
    }

    private _optimizeAngles(layoutGraph: LayoutGraph, rankTops: Array<number>, segmentsPerRank: Array<Array<Segment>>,
                            crossingsPerRank: Array<Array<[Segment, Segment]>>): void {
        const forces = [];
        _.forEach(crossingsPerRank, (crossings, r) => {
            if (crossings.length > 0) {
                const deltaXs = [];
                _.forEach(crossings, ([segmentA, segmentB]) => {
                    const vectorA = segmentA.vector();
                    const vectorB = segmentB.vector();
                    deltaXs.push([vectorA.x, vectorB.x]);
                });
                const allDeltaXsSquared = [];
                _.forEach(segmentsPerRank[r], (segment: Segment) => {
                    const vector = segment.vector();
                    allDeltaXsSquared.push(vector.x * vector.x);
                });
                let min = this._options.targetEdgeLength / 2;
                let max = 2 * this._options.targetEdgeLength;
                let minCost = Number.POSITIVE_INFINITY;
                let best;
                for (let deltaY = min; deltaY <= max; ++deltaY) {
                    let cost = 0;
                    _.forEach(deltaXs, ([deltaXA, deltaXB]) => {
                        const angle = Math.atan2(deltaY, deltaXA) - Math.atan2(deltaY, deltaXB);
                        cost += this._options.weightCrossings * (Math.cos(2 * angle) + 1) / 2;
                    });
                    const deltaYSquared = deltaY * deltaY;
                    _.forEach(allDeltaXsSquared, deltaXSquared => {
                        cost += this._options.weightLengths * Math.sqrt(deltaYSquared + deltaXSquared) / this._options.targetEdgeLength;
                    });
                    if (cost < minCost) {
                        minCost = cost;
                        best = deltaY;
                    }
                }
                const diff = best - this._options.targetEdgeLength;
                if (diff >= 1) {
                    forces.push([rankTops[r] - 1, diff]);
                }
            }
        });

        const points = [];
        const oldTops = new Map();
        _.forEach(layoutGraph.allNodes(), (node: LayoutNode) => {
            points.push([node.y, "NODE", node, "TOP"]);
            points.push([node.y + node.height, "NODE", node, "BOTTOM"]);
            oldTops.set(node, node.y);
        });
        _.forEach(layoutGraph.allEdges(), (edge: LayoutEdge) => {
            _.forEach(edge.points, (point: Vector, i: number) => {
                points.push([point.y, "EDGE", edge, i]);
            });
        });
        const pointsSorted = _.sortBy(points, "0"); // sort by y
        let forcePointer = 0;
        let totalForce = 0;
        _.forEach(pointsSorted, ([pointY, type, object, position]) => {
            while (forcePointer < forces.length && forces[forcePointer][0] < pointY) {
                totalForce += forces[forcePointer][1];
                forcePointer++;
            }
            if (type === "NODE") {
                if (position === "TOP") {
                    object.translateWithoutChildren(0, totalForce);
                } else { // "BOTTOM"
                    const oldHeight = object.height;
                    // new height = old height + total force + old top - new top
                    object.height += totalForce + oldTops.get(object) - object.y;
                    const heightDiff = object.height - oldHeight;
                    _.forEach(object.outConnectors, (connector: LayoutConnector) => {
                        connector.y += heightDiff;
                    });
                }
            } else { // "EDGE"
                object.points[position].y += totalForce;
            }
        });
    }
}
