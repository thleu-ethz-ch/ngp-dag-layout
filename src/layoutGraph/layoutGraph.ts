import {CONNECTOR_SIZE} from "../util/constants";
import * as _ from "lodash";
import Box from "../geometry/box";
import Graph from "../graph/graph";
import LayoutConnector from "./layoutConnector";
import LayoutEdge from "./layoutEdge";
import LayoutNode from "./layoutNode";
import LevelGraph from "../levelGraph/levelGraph";
import LevelNode from "../levelGraph/levelNode";

export default class LayoutGraph extends Graph<LayoutNode, LayoutEdge> {
    public readonly mayHaveCycles: boolean;

    public entryNode: LayoutNode = null;
    public exitNode: LayoutNode = null;

    public minRank: number = 0;
    public numRanks: number = 1;

    private _levelGraph: LevelGraph = null;
    private _maxNodesPerRank: number = null;

    constructor(mayHaveCycles: boolean = false) {
        super();
        this.mayHaveCycles = mayHaveCycles;
    }

    allGraphs(): Array<LayoutGraph> {
        const allGraphs = [<LayoutGraph>this];
        const addSubgraphs = (graph: LayoutGraph) => {
            _.forEach(graph.nodes(), (node: LayoutNode) => {
                if (node.childGraph !== null) {
                    allGraphs.push(node.childGraph);
                    addSubgraphs(node.childGraph);
                }
                _.forEach(node.childGraphs, (childGraph: LayoutGraph) => {
                    allGraphs.push(childGraph);
                    addSubgraphs(childGraph);
                });
            });
        };
        addSubgraphs(this);
        return allGraphs;
    }

    translateElements(x: number, y: number) {
        _.forEach(this.nodes(), (node: LayoutNode) => {
            node.translate(x, y);
        });
        _.forEach(this.edges(), (edge: LayoutEdge) => {
            edge.translate(x, y);
        });
    }

    boundingBox(includeEdges: boolean = true): Box {
        const nodes = this.nodes();
        if (nodes.length === 0) {
            return new Box(0, 0, 0, 0);
        }
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        _.forEach(nodes, (node: LayoutNode) => {
            const box = node.boundingBox();
            if (_.some(node.inConnectors, connector => !connector.isTemporary)) {
                box.y -= CONNECTOR_SIZE / 2;
            }
            if (_.some(node.outConnectors, connector => !connector.isTemporary)) {
                box.height += CONNECTOR_SIZE / 2;
            }
            minX = Math.min(minX, box.x);
            maxX = Math.max(maxX, box.x + box.width);
            minY = Math.min(minY, box.y);
            maxY = Math.max(maxY, box.y + box.height);
        });
        if (includeEdges) {
            _.forEach(this.edges(), (edge: LayoutEdge) => {
                const box = edge.boundingBox();
                minX = Math.min(minX, box.x);
                maxX = Math.max(maxX, box.x + box.width);
                minY = Math.min(minY, box.y);
                maxY = Math.max(maxY, box.y + box.height);
            });
        }
        return new Box(minX, minY, maxX - minX, maxY - minY);
    }

    public ranks(): Array<Array<LayoutNode>> {
        const nodesPerRank = new Array(this.numRanks);
        for (let r = 0; r < this.numRanks; ++r) {
            nodesPerRank[r] = [];
        }
        _.forEach(this.nodes(), (node: LayoutNode) => {
            nodesPerRank[node.rank].push(node);
        });
        return nodesPerRank;
    }

    public globalRanks(): Array<Array<LayoutNode>> {
        const nodesPerRank = new Array(this.numRanks);
        for (let r = 0; r < this.numRanks; ++r) {
            nodesPerRank[r] = [];
        }
        _.forEach(this.allNodes(), (node: LayoutNode) => {
            nodesPerRank[node.rank].push(node);
        });
        return nodesPerRank;
    }

    public offsetRank(offset: number): void {
        this.minRank += offset;
        _.forEach(this.nodes(), node => {
            node.offsetRank(offset);
        });
    }

    public maxNodesPerRank(): number {
        if (this._maxNodesPerRank === null) {
            let max = 0;
            _.forEach(this.levelGraph().ranks(), (rank: Array<LevelNode>) => {
                let num = 0;
                _.forEach(rank, (levelNode: LevelNode) => {
                    if (levelNode.layoutNode.isScopeNode) {
                        num += levelNode.layoutNode.childGraphs[0].maxNodesPerRank();
                    } else {
                        num++;
                    }
                });
                max = Math.max(max, num);
            });
            this._maxNodesPerRank = max;
        }
        return this._maxNodesPerRank;
    }

    public levelGraph(): LevelGraph {
        const addSubgraph = (subgraph: LayoutGraph) => {
            _.forEach(subgraph.nodes(), (node: LayoutNode) => {
                this._levelGraph.addLayoutNode(node);
            });
            _.forEach(this.edges(), (edge: LayoutEdge) => {
                this._levelGraph.addLayoutEdge(edge);
            });
        };
        if (this._levelGraph === null) {
            this._levelGraph = new LevelGraph();
            addSubgraph(this);
        }
        return this._levelGraph;
    }

    public setLevelGraph(levelGraph: LevelGraph) {
        this._levelGraph = levelGraph;
    }

    public copyInto(to: LayoutGraph): void {
        const copySubgraph = (from: LayoutGraph, to: LayoutGraph) => {
            to.minRank = from.minRank;
            to.numRanks = from.numRanks;
            _.forEach(from.levelGraph().nodes(), (levelNode: LevelNode) => {
                const toNode = to.node(levelNode.layoutNode.id);
                if (toNode !== undefined) {
                    levelNode.layoutNode = toNode;
                }
            });
            to.setLevelGraph(from.levelGraph());
            _.forEach(from.nodes(), (fromNode: LayoutNode) => {
                const toNode = to.node(fromNode.id);
                if (toNode === undefined) {
                    to.addNode(fromNode, fromNode.id);
                } else {
                    _.forEach(fromNode.childGraphs, (childGraph: LayoutGraph, i) => {
                        copySubgraph(childGraph, toNode.childGraphs[i]);
                    });
                    toNode.inConnectors = [];
                    _.forEach(fromNode.inConnectors, (inConnector: LayoutConnector) => {
                        toNode.inConnectors.push(toNode.connector("IN", inConnector.name));
                    });
                    toNode.outConnectors = [];
                    _.forEach(fromNode.outConnectors, (outConnector: LayoutConnector) => {
                        toNode.outConnectors.push(toNode.connector("OUT", outConnector.name));
                    });
                    toNode.rank = fromNode.rank;
                    toNode.rankSpan = fromNode.rankSpan;
                    toNode.levelNodes = fromNode.levelNodes;
                }
            });
            _.forEach(from.edges(), (fromEdge: LayoutEdge) => {
                const toEdge = to.edge(fromEdge.id);
                if (toEdge === undefined) {
                    to.addEdge(fromEdge, fromEdge.id);
                } else {
                    to.redirectEdge(toEdge.id, fromEdge.src, fromEdge.dst);
                    toEdge.srcConnector = fromEdge.srcConnector;
                    toEdge.dstConnector = fromEdge.dstConnector;
                }
            });
        };
        copySubgraph(this, to);
    }

    public cloneForOrdering(): LayoutGraph {
        const cloneSubgraph = (subgraph: LayoutGraph) => {
            const graphCopy = new LayoutGraph(subgraph.mayHaveCycles);
            graphCopy.minRank = subgraph.minRank;
            graphCopy.numRanks = subgraph.numRanks;
            _.forEach(subgraph.nodes(), node => {
                const nodeCopy = new LayoutNode(node.size(), node.padding, node.connectorPadding, node.isVirtual, node.isBundle, false);
                nodeCopy.rank = node.rank;
                nodeCopy.rankSpan = node.rankSpan
                nodeCopy.isScopeNode = node.isScopeNode;
                nodeCopy.inConnectorBundles = node.inConnectorBundles;
                nodeCopy.outConnectorBundles = node.outConnectorBundles;
                _.forEach(node.connectors(), (connector: LayoutConnector) => {
                    nodeCopy.addConnector(connector.type, connector.name, connector.isTemporary);
                });
                graphCopy.addNode(nodeCopy, node.id);
                _.forEach(node.childGraphs, childGraph => {
                    const childCopy = cloneSubgraph(childGraph);
                    nodeCopy.childGraphs.push(childCopy);
                    childCopy.parentNode = nodeCopy;
                });
                if (nodeCopy.isScopeNode) {
                    nodeCopy.childGraphs[0].entryNode = nodeCopy.childGraphs[0].node(node.childGraphs[0].entryNode.id);
                    nodeCopy.childGraphs[0].exitNode = nodeCopy.childGraphs[0].node(node.childGraphs[0].exitNode.id);
                }
            });
            _.forEach(subgraph.edges(), edge => {
                const edgeCopy = new LayoutEdge(edge.src, edge.dst, edge.srcConnector, edge.dstConnector);
                edgeCopy.isInverted = edge.isInverted;
                edgeCopy.isReplica = edge.isReplica;
                edgeCopy.weight = edge.weight;
                edgeCopy.srcBundle = edge.srcBundle;
                edgeCopy.dstBundle = edge.dstBundle;
                graphCopy.addEdge(edgeCopy, edge.id);
            });
            return graphCopy;
        }
        return cloneSubgraph(this);
    }

    public clone(): LayoutGraph {
        const graphCopy = <LayoutGraph>this.cloneEmpty();
        _.forEach(this.nodes(), node => {
            const nodeCopy = _.clone(node);
            graphCopy.addNode(nodeCopy, node.id);
            const childGraphs = [];
            _.forEach(node.childGraphs, (childGraph: LayoutGraph) => {
                const childCopy = childGraph.clone();
                childGraphs.push(childCopy);
                childCopy.parentNode = nodeCopy;
            });
            nodeCopy.childGraphs = childGraphs;
        });
        _.forEach(this.edges(), edge => {
            graphCopy.addEdge(_.clone(edge), edge.id);
        });
        return graphCopy;
    }
}
