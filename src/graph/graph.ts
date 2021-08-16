import * as _ from "lodash";
import Component from "./component";
import Edge from "./edge";
import Node from "./node";

export default class Graph<NodeT extends Node<any, any>, EdgeT extends Edge<any, any>> {
    public parentNode: NodeT = null;

    protected _nodes: Array<NodeT>;
    protected _nodesDense: Array<NodeT>;
    protected _edges: Array<EdgeT>;
    protected _edgesDense: Array<EdgeT>;
    protected _outEdges: Array<Array<number>>;
    protected _inEdges: Array<Array<number>>;

    private _nodesDenseOutdated: boolean;
    private _edgesDenseOutdated: boolean;

    public constructor() {
        this._init();
    }

    clone(): Graph<NodeT, EdgeT> {
        const graphCopy = this.cloneEmpty();
        _.forEach(this.nodes(), node => {
            const nodeCopy = _.clone(node);
            graphCopy.addNode(nodeCopy, node.id);
            if (node.childGraph !== null) {
                node.childGraph = nodeCopy.childGraph.clone();
            }
        });
        _.forEach(this.edges(), edge => {
            graphCopy.addEdge(_.clone(edge), edge.id);
        });
        return graphCopy;
    }

    cloneEmpty(): Graph<NodeT, EdgeT> {
        const clone = _.clone(this);
        clone._init();
        return clone;
    }

    addNode(node: NodeT, id: number = null): number {
        this._updateNodesDense();
        if (id === null) {
            id = this._nodes.length;
        }
        node.id = id;
        node.graph = this;

        this._nodes[id] = node;
        this._nodesDense.push(node);
        if (this._outEdges[id] === undefined) {
            this._outEdges[id] = [];
            this._inEdges[id] = [];
        }
        return id;
    }

    /**
     * Assumption: Both end nodes of the edge have been added before.
     */
    addEdge(edge: EdgeT, id: number = null): number {
        this._updateEdgesDense();
        if (id === null) {
            id = this._edges.length;
        }
        edge.id = id;
        edge.graph = this;
        this._edges[id] = edge;
        this._edgesDense.push(edge);
        this._outEdges[edge.src].push(id);
        this._inEdges[edge.dst].push(id);
        return id;
    }

    invertEdge(edgeId: number): void {
        const edge = this._edges[edgeId];
        _.pull(this._outEdges[edge.src], edgeId);
        _.pull(this._inEdges[edge.dst], edgeId);
        const tmpSrc = edge.src;
        edge.src = edge.dst;
        edge.dst = tmpSrc;
        this._outEdges[edge.src].push(edgeId);
        this._inEdges[edge.dst].push(edgeId);
        edge.isInverted = true;
    }

    redirectEdge(edgeId: number, newSrc: number, newDst: number): void {
        const edge = this._edges[edgeId];
        if (newSrc !== edge.src) {
            _.pull(this._outEdges[edge.src], edgeId);
            this._outEdges[newSrc].push(edgeId);
            edge.src = newSrc;
        }
        if (newDst !== edge.dst) {
            _.pull(this._inEdges[edge.dst], edgeId);
            this._inEdges[newDst].push(edgeId);
            edge.dst = newDst;
        }
    }

    node(id: number): NodeT {
        return this._nodes[id];
    }

    edge(id: number): EdgeT {
        return this._edges[id];
    }

    hasEdge(srcId: number, dstId: number): boolean {
        const numOutEdges = this._outEdges[srcId].length;
        for (let i = 0; i < numOutEdges; ++i) {
            if (this._edges[this._outEdges[srcId][i]].dst === dstId) {
                return true;
            }
        }
        return false;
    }

    edgeBetween(srcId: number, dstId: number): EdgeT {
        const numOutEdges = this._outEdges[srcId].length;
        for (let i = 0; i < numOutEdges; ++i) {
            if (this._edges[this._outEdges[srcId][i]].dst === dstId) {
                return this._edges[this._outEdges[srcId][i]];
            }
        }
        return undefined;
    }

    edgesBetween(srcId: number, dstId: number): Array<EdgeT> {
        return _.filter(this.edges(), edge => edge.src === srcId && edge.dst === dstId);
    }

    removeNode(id: number): void {
        this._nodes[id] = undefined;
        this._nodesDenseOutdated = true;
    }

    removeEdge(id: number): void {
        const edge = this.edge(id);
        _.pull(this._outEdges[edge.src], id);
        _.pull(this._inEdges[edge.dst], id);
        this._edges[id] = undefined;
        this._edgesDenseOutdated = true;
    }

    numNodes(): number {
        this._updateNodesDense();
        return this._nodesDense.length;
    }

    nodes(): Array<NodeT> {
        this._updateNodesDense();
        return this._nodesDense;
    }

    maxId(): number {
        return this._nodes.length - 1;
    }

    maxEdgeId(): number {
        return this._edges.length - 1;
    }

    numEdges(): number {
        this._updateEdgesDense();
        return this._edgesDense.length;
    }

    edges(): Array<EdgeT> {
        this._updateEdgesDense();
        return this._edgesDense;
    }

    allGraphs(): Array<Graph<NodeT, EdgeT>> {
        const allGraphs = [this];

        const addSubgraphs = (graph: this) => {
            _.forEach(graph.nodes(), (node: NodeT) => {
                if (node.childGraph !== null) {
                    allGraphs.push(node.childGraph);
                    addSubgraphs(node.childGraph);
                }
            });
        };
        addSubgraphs(this);

        return allGraphs;
    }

    allNodes(): Array<NodeT> {
        const allNodes = [];
        _.forEach(this.allGraphs(), (subgraph: Graph<NodeT, EdgeT>) => {
            _.forEach(subgraph.nodes(), (node: NodeT) => {
                allNodes.push(node);
            });
        });
        return allNodes;
    }

    allEdges(): Array<EdgeT> {
        const allEdges = [];
        _.forEach(this.allGraphs(), (subgraph: Graph<NodeT, EdgeT>) => {
            _.forEach(subgraph.edges(), (edge: EdgeT) => {
                allEdges.push(edge);
            });
        });
        return allEdges;
    }

    numInEdges(id: number): number {
        return this._inEdges[id].length;
    }

    inEdges(id: number): Array<EdgeT> {
        return _.map(this._inEdges[id], edgeId => this.edge(edgeId));
    }

    inEdgesIds(id: number): Array<number> {
        return this._inEdges[id];
    }

    numOutEdges(id: number): number {
        return this._outEdges[id].length;
    }

    outEdges(id: number): Array<EdgeT> {
        return _.map(this._outEdges[id], edgeId => this.edge(edgeId));
    }

    outEdgesIds(id: number): Array<number> {
        return this._outEdges[id];
    }

    incidentEdges(id: number): Array<EdgeT> {
        return _.uniq(_.concat(this.inEdges(id), this.outEdges(id)));
    }

    inNeighbors(id: number): Array<NodeT> {
        return _.map(this.inEdges(id), inEdge => this._nodes[inEdge.src]);
    }

    outNeighbors(id: number): Array<NodeT> {
        return _.map(this.outEdges(id), outEdge => this._nodes[outEdge.dst]);
    }

    neighbors(id: number): Array<NodeT> {
        return _.uniq(_.concat(this.inNeighbors(id), this.outNeighbors(id)));
    }

    clear(): void {
        this._init();
    }

    hasCycle(): boolean {
        return (this.toposort().length < this.nodes().length);
    }

    removeCycles(): Array<EdgeT> {
        const invertedEdges = [];
        const predecessors = new Array(this._nodes.length);
        const queue = [];
        const queue2 = [];
        const visited = _.fill(new Array(this.maxId() + 1), false);
        let queuePointer = 0;
        let queuePointer2 = 0;
        _.forEach(this.nodes(), (node: NodeT) => {
            const numInEdges = this.inEdges(node.id).length;
            predecessors[node.id] = numInEdges;
            if (numInEdges === 0) {
                queue.push(node);
            }
        });
        do {
            // toposort
            while (queuePointer < queue.length) {
                const node = queue[queuePointer++];
                visited[node.id] = true;
                _.forEach(this.outEdges(node.id), (edge: EdgeT) => {
                    predecessors[edge.dst]--;
                    if (predecessors[edge.dst] === 0) {
                        queue.push(this.node(edge.dst));
                    } else {
                        queue2.push(this.node(edge.dst));
                    }
                });
            }

            // break cycle
            if (queuePointer2 < queue2.length) {
                let nextNode;
                do {
                    nextNode = queue2[queuePointer2++];
                } while (queuePointer2 < queue2.length && (visited[nextNode.id] || this.numOutEdges(nextNode.id) === 0));
                if (!visited[nextNode.id] && this.numOutEdges(nextNode.id) > 0) {
                    _.forEach(this.inEdges(nextNode.id), (inEdge: EdgeT) => {
                        if (!visited[inEdge.src]) {
                            predecessors[inEdge.src]++;
                            this.invertEdge(inEdge.id);
                            invertedEdges.push(this._edges[inEdge.id]);
                        }
                    });
                    queue.push(nextNode);
                }
            }
        } while (queuePointer < queue.length || queuePointer2 < queue2.length);

        return invertedEdges;
    }

    public bfs(startId: number = null, ignoreDirections: boolean = false): Array<NodeT> {
        const nodes = this.nodes();
        if (nodes.length === 0) {
            return [];
        }

        const sortedNodes = [];
        const visited = _.fill(new Array(this.maxId() + 1), false);
        const queue = [];
        let queuePointer = 0;
        if (startId === null) {
            queue.push(nodes[0]);
            visited[nodes[0].id] = true;
        } else {
            queue.push(this.node(startId));
            visited[startId] = true;
        }
        while (queuePointer < queue.length) {
            const node = queue[queuePointer++];
            sortedNodes.push(node);
            _.forEach(this.outEdges(node.id), (outEdge: EdgeT) => {
                if (!visited[outEdge.dst]) {
                    queue.push(this.node(outEdge.dst));
                    visited[outEdge.dst] = true;
                }
            });
            if (ignoreDirections) {
                _.forEach(this.inEdges(node.id), (inEdge: EdgeT) => {
                    if (!visited[inEdge.src]) {
                        queue.push(this.node(inEdge.src));
                        visited[inEdge.src] = true;
                    }
                });
            }
        }
        return sortedNodes;
    }

    toposort(): Array<NodeT> {
        const sortedNodes = [];
        const predecessors = new Array(this._nodes.length);
        const queue = [];
        let queuePointer = 0;
        _.forEach(this._nodes, (node: NodeT) => {
            if (node === undefined) {
                return; // skip deleted nodes
            }
            const numInEdges = this.inEdges(node.id).length;
            predecessors[node.id] = numInEdges;
            if (numInEdges === 0) {
                queue.push(node);
            }
        });
        while (queuePointer < queue.length) {
            const node = queue[queuePointer++];
            sortedNodes.push(node);
            _.forEach(this.outEdges(node.id), (edge: EdgeT) => {
                predecessors[edge.dst]--;
                if (predecessors[edge.dst] === 0) {
                    queue.push(this.node(edge.dst));
                }
            });
        }
        return sortedNodes;
    }

    sources(): Array<NodeT> {
        return _.filter(this.nodes(), (node: NodeT) => {
            return (this.inEdges(node.id).length === 0);
        });
    }

    sinks(): Array<NodeT> {
        return _.filter(this.nodes(), (node: NodeT) => {
            return (this.outEdges(node.id).length === 0);
        });
    }

    components(): Array<Component<NodeT, EdgeT>> {
        const nodes = this.nodes();
        if (nodes.length === 0) {
            return [];
        }
        const componentNumbers = _.fill(new Array(this._nodes.length), null);
        let currentNumber = 0;
        _.forEach(nodes, (node: NodeT) => {
            if (componentNumbers[node.id] !== null) {
                return;
            }
            componentNumbers[node.id] = currentNumber;
            const queue = [node];
            let queuePointer = 0;
            while (queuePointer < queue.length) {
                const node = queue[queuePointer++];
                _.forEach(this.neighbors(node.id), (neighbor: NodeT) => {
                    if (componentNumbers[neighbor.id] === null) {
                        componentNumbers[neighbor.id] = currentNumber;
                        queue.push(neighbor);
                    }
                });
            }
            currentNumber++;
        });

        const components: Array<Component<NodeT, EdgeT>> = [];
        // create components
        for (let i = 0; i < currentNumber; ++i) {
            components.push(new Component(this));
        }
        // add nodes
        _.forEach(nodes, (node: NodeT) => {
            const componentId = componentNumbers[node.id];
            components[componentId].addNode(node.id);
        });
        // add edges
        _.forEach(nodes, (node: NodeT) => {
            _.forEach(this.outEdges(node.id), (edge: EdgeT) => {
                const componentId = componentNumbers[node.id];
                components[componentId].addEdge(edge.id);
            });
        });

        return components;
    }

    toString(): string {
        const subgraphToObj = (subgraph: Graph<NodeT, EdgeT>) => {
            const obj = {
                nodes: {},
                edges: [],
            };
            _.forEach(subgraph.nodes(), (node: NodeT) => {
                obj.nodes[node.id] = {
                    label: node.label(),
                    child: node.childGraph !== null ? subgraphToObj(node.childGraph) : null
                };
            });
            _.forEach(subgraph.edges(), (edge: EdgeT) => {
                obj.edges.push({src: edge.src, dst: edge.dst, weight: edge.weight});
            });
            return obj;
        };
        return JSON.stringify(subgraphToObj(this));
    }

    private _init(): void {
        this._nodes = [];
        this._nodesDense = [];
        this._edges = [];
        this._edgesDense = [];
        this._outEdges = [];
        this._inEdges = [];
        this._nodesDenseOutdated = false;
        this._edgesDenseOutdated = false;
    }

    private _updateNodesDense(): void {
        if (this._nodesDenseOutdated) {
            this._nodesDense = _.compact(this._nodes);
            this._nodesDenseOutdated = false;
        }
    }

    private _updateEdgesDense(): void {
        if (this._edgesDenseOutdated) {
            this._edgesDense = _.compact(this._edges);
            this._edgesDenseOutdated = false;
        }
    }
}
