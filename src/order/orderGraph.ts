import {DEBUG} from "../util/constants";
import {inPlaceSort} from "fast-sort";
import * as _ from "lodash";
import Assert from "../util/assert";
import Edge from "../graph/edge";
import Graph from "../graph/graph";
import OrderGroup from "./orderGroup";
import OrderNode from "./orderNode";
import OrderRank from "./orderRank";
import Timer from "../util/timer";
import Wasm from "../wasm/wasm";

interface Neighbor {
    end: number;
    weight: number;
}

export default class OrderGraph {
    private _rankGraph: Graph<OrderRank, Edge<any, any>>;
    private _groupGraph: Graph<OrderGroup, Edge<any, any>>;
    private _nodeGraph: Graph<OrderNode, Edge<any, any>>;

    private _groupEdgesAdded: boolean = false;
    private readonly _wasm: Wasm;

    constructor(wasm: Wasm = null) {
        this._rankGraph = new Graph<OrderRank, Edge<any, any>>();
        this._groupGraph = new Graph<OrderGroup, Edge<any, any>>();
        this._nodeGraph = new Graph<OrderNode, Edge<any, any>>();
        this._wasm = wasm;
    }

    toString(): string {
        const obj = {
            nodes: {},
            edges: [],
        };
        _.forEach(_.sortBy(this.groups(), "position"), (group: OrderGroup) => {
            obj.nodes[group.id] = {
                label: group.label(),
                child: {
                    nodes: {},
                    edges: [],
                },
            };
            _.forEach(group.orderedNodes(), (node: OrderNode) => {
                obj.nodes[group.id].child.nodes[node.id] = {
                    label: node.label(),
                    child: null
                };
            });
        });
        _.forEach(this.groupEdges(), (edge: Edge<any, any>) => {
            obj.edges.push({src: edge.src, dst: edge.dst, weight: edge.weight});
        });
        return JSON.stringify(obj);
    }

    public addRank(rank: OrderRank, id: number = null): number {
        rank.orderGraph = this;
        return this._rankGraph.addNode(rank, id);
    }

    public addGroup(group: OrderGroup, id: number = null): number {
        return this._groupGraph.addNode(group, id);
    }

    public addNode(node: OrderNode, id: number = null): number {
        return this._nodeGraph.addNode(node, id);
    }

    public addEdge(edge: Edge<any, any>, id: number = null): number {
        return this._nodeGraph.addEdge(edge, id);
    }

    public removeEdge(id: number): void {
        this._nodeGraph.removeEdge(id);
    }

    private _addGroupEdges(): void {
        if (!this._groupEdgesAdded) {
            this._groupEdgesAdded = true;
            _.forEach(this._nodeGraph.edges(), (edge: Edge<any, any>) => {
                const srcGroupId = this._nodeGraph.node(edge.src).group.id;
                const dstGroupId = this._nodeGraph.node(edge.dst).group.id;
                const groupEdge = this._groupGraph.edgeBetween(srcGroupId, dstGroupId);
                if (groupEdge === undefined) {
                    this._groupGraph.addEdge(new Edge(srcGroupId, dstGroupId, edge.weight));
                } else {
                    groupEdge.weight += edge.weight;
                }
            });
        }
    }

    private _addRankEdges(): void {
        _.forEach(this._groupGraph.edges(), (edge: Edge<any, any>) => {
            const srcRankId = this._groupGraph.node(edge.src).rank.id;
            const dstRankId = this._groupGraph.node(edge.dst).rank.id;
            if (!this._rankGraph.hasEdge(srcRankId, dstRankId)) {
                this._rankGraph.addEdge(new Edge(srcRankId, dstRankId));
            }
        });
    }

    public node(id: number): OrderNode {
        return this._nodeGraph.node(id);
    }

    public group(id: number): OrderGroup {
        return this._groupGraph.node(id);
    }

    public nodes(): Array<OrderNode> {
        return this._nodeGraph.nodes();
    }

    public groups(): Array<OrderGroup> {
        return this._groupGraph.nodes();
    }

    public ranks(): Array<OrderRank> {
        return this._rankGraph.toposort();
    }

    public edges(): Array<Edge<any, any>> {
        return this._nodeGraph.edges();
    }

    public inEdges(id: number): Array<Edge<any, any>> {
        return this._nodeGraph.inEdges(id);
    }

    public outEdges(id: number): Array<Edge<any, any>> {
        return this._nodeGraph.outEdges(id);
    }

    public inNeighbors(id: number): Array<OrderNode> {
        return this._nodeGraph.inNeighbors(id);
    }

    public outNeighbors(id: number): Array<OrderNode> {
        return this._nodeGraph.outNeighbors(id);
    }

    public incidentEdges(id: number): Array<Edge<any, any>> {
        return this._nodeGraph.incidentEdges(id);
    }

    public edgeBetween(srcId: number, dstId: number): Edge<any, any> {
        return this._nodeGraph.edgeBetween(srcId, dstId);
    }

    public maxId(): number {
        return this._nodeGraph.maxId();
    }

    public groupEdges(): Array<Edge<any, any>> {
        this._addGroupEdges();
        return this._groupGraph.edges();
    }

    public async order(options: object = {}): Promise<number> {
        if (this._nodeGraph.numNodes() === 0) {
            return;
        }
        Timer.start(["doLayout", "orderRanks", "doOrder", "order"]);
        options = _.defaults(options, {
            method: "barycenter",
            countOnly: false,
            orderGroups: false,
            countInitial: false,
            resolveConflicts: true,
            resolveX: true,
        });
        let groupOffsetsPos, numNodesPerGroup, groupOrder, groupPositions, order, positions, neighbors, crossings, virtual, intranode, intranodePathEnd, moving, sink, rankWidths, numEdgesPerRank, moved, tmpOrder;

        const doOrderSprings = async (graph: OrderGraph) => {
            // store new positions
            const ranks = graph._rankGraph.toposort();
            _.forEach(ranks, (rank: OrderRank) => {
                _.forEach(rank.groups, (group: OrderGroup) => {
                    group.orderNodesByX();
                });
                rank.orderGroupsByX();
            });
        };

        const doOrder = async (graph: OrderGraph) => {
            const assertOrderAndPositionCoherence = (r: number = null) => {
                if (r === null) {
                    _.forEach(_.range(ranks.length), r => assertOrderAndPositionCoherence(r));
                    return;
                }
                Assert.assertAll(order[r], (nodeId, pos) => positions[nodeId] === pos, "positions and orders do not match");
            }

            const assertEdgesBetweenNeighboringRanks = () => {
                Assert.assertAll(this.edges(), edge => {
                    return this.node(edge.src).rank + 1 === this.node(edge.dst).rank;
                }, "edge not between neighboring ranks");
            }

            Timer.start(["doLayout", "orderRanks", "doOrder", "order", "doOrder"]);
            Timer.start(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "setup"]);

            const numRanks = graph._rankGraph.numNodes();

            let minRank = Number.POSITIVE_INFINITY;
            const ranks = graph._rankGraph.toposort();
            groupOrder.length = numRanks;
            order.length = numRanks;
            crossings.length = numRanks;
            numEdgesPerRank.length = numRanks;

            let maxEdgesPerRank = 0;
            let maxEdgeWeight = 0;
            // set neighbors
            _.forEach(ranks, (rank: OrderRank, r: number) => {
                let offset = 0;
                minRank = Math.min(minRank, rank.rank);
                order[r] = new Array(_.sum(_.map(rank.groups, group => numNodesPerGroup[group.id])));
                groupOrder[r] = new Array(rank.groups.length);
                crossings[r] = Number.POSITIVE_INFINITY;
                numEdgesPerRank[r] = 0;
                _.forEach(rank.orderedGroups(), (group: OrderGroup, groupPos: number) => {
                    groupOffsetsPos[group.id] = offset;
                    numNodesPerGroup[group.id] = group.nodes.length;
                    offset += group.nodes.length;
                    groupOrder[r][groupPos] = group.id;
                    groupPositions[group.id] = groupPos;
                    _.forEach(group.orderedNodes(), (node: OrderNode, posInGroup: number) => {
                        node.rank = r;
                        const pos = groupOffsetsPos[group.id] + posInGroup;
                        order[r][pos] = node.id;
                        positions[node.id] = pos;
                        neighbors[0][node.id] = [];
                        neighbors[1][node.id] = [];
                        _.forEach(graph._nodeGraph.inEdges(node.id), (edge: Edge<any, any>) => {
                            neighbors[0][node.id].push({
                                end: edge.src,
                                weight: edge.weight,
                            });
                            maxEdgeWeight = Math.max(maxEdgeWeight, edge.weight === Number.POSITIVE_INFINITY ? 1 : edge.weight);
                        });
                        _.forEach(graph._nodeGraph.outEdges(node.id), (edge: Edge<any, any>) => {
                            neighbors[1][node.id].push({
                                end: edge.dst,
                                weight: edge.weight,
                            });
                        });
                        numEdgesPerRank[r] += graph._nodeGraph.numInEdges(node.id);
                    });
                });
                maxEdgesPerRank = Math.max(maxEdgesPerRank, numEdgesPerRank[r]);

                if (DEBUG) {
                    assertOrderAndPositionCoherence(r);
                }
            });

            crossings[0] = 0;

            Timer.stop(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "setup"]);

            const countCrossings = (testOrder: Array<number>, r: number, direction: number = 0, preventConflicts: boolean = false) => {
                if (preventConflicts) {
                    const originalOrder = _.clone(order[r]);
                    order[r] = _.clone(testOrder);
                    _.forEach(order[r], (nodeId: number, pos: number) => {
                        positions[nodeId] = pos;
                    });
                    let hasConflict = false;
                    if (r > 0) {
                        hasConflict = hasConflict || (getConflict("HEAVYHEAVY", r) !== null) || (getConflict("HEAVYLIGHT", r) !== null);
                    }
                    if (r < ranks.length - 1) {
                        hasConflict = hasConflict || (getConflict("HEAVYHEAVY", r + 1) !== null) || (getConflict("HEAVYLIGHT", r + 1) !== null);
                    }
                    order[r] = _.clone(originalOrder);
                    _.forEach(order[r], (nodeId: number, pos: number) => {
                        positions[nodeId] = pos;
                    });
                    if (hasConflict) {
                        return Number.POSITIVE_INFINITY;
                    }
                }
                const edges = [];
                const northR = (direction === 0 ? (r - 1) : (r + 1));

                for (let southPos = 0; southPos < testOrder.length; ++southPos) {
                    const southNodeId = testOrder[southPos];
                    for (let neighbor = 0; neighbor < neighbors[direction][southNodeId].length; ++neighbor) {
                        let weight = neighbors[direction][southNodeId][neighbor].weight;
                        if (weight === Number.POSITIVE_INFINITY) {
                            weight = 1;
                        }
                        edges.push([southPos, positions[neighbors[direction][southNodeId][neighbor].end], weight]);
                    }
                }
                // north and south are swapped compared to the _countCrossings signature
                // result is the same, but this is faster in ordering the edges
                return this._countCrossings(testOrder.length, order[northR].length, edges);
            };

            const changeNodePosInOrder = (oldOrder: Array<number>, oldPos: number, newPos: number) => {
                const newOrder = new Array(oldOrder.length);
                if (oldPos < newPos) {
                    for (let pos = 0; pos < oldPos; ++pos) {
                        newOrder[pos] = oldOrder[pos];
                    }
                    for (let pos = oldPos + 1; pos <= newPos; ++pos) {
                        newOrder[pos - 1] = oldOrder[pos];
                    }
                    newOrder[newPos] = oldOrder[oldPos];
                    for (let pos = newPos + 1; pos < oldOrder.length; ++pos) {
                        newOrder[pos] = oldOrder[pos];
                    }
                } else {
                    for (let pos = 0; pos < newPos; ++pos) {
                        newOrder[pos] = oldOrder[pos];
                    }
                    newOrder[newPos] = oldOrder[oldPos];
                    for (let pos = newPos; pos < oldPos; ++pos) {
                        newOrder[pos + 1] = oldOrder[pos];
                    }
                    for (let pos = oldPos + 1; pos < oldOrder.length; ++pos) {
                        newOrder[pos] = oldOrder[pos];
                    }
                }
                return newOrder;
            };

            /**
             * Sweeps the ranks up and down and reorders the nodes according to the barycenter heuristic
             * @param preventConflicts
             */
            const reorder = (preventConflicts: boolean = false) => {
                Timer.start(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "reorder"]);
                const multiplicator = maxEdgeWeight * maxEdgesPerRank + 1;

                let boolDirection = 1;
                let boolOppositeDirection = 0;
                let signDirection = 1;
                let minCrossings = _.sum(crossings);
                let improveCounter = 2;
                while (improveCounter > 0) {
                    improveCounter--;
                    let firstRank = boolDirection ? 1 : ranks.length - 2;
                    let lastRank = boolDirection ? ranks.length - 1 : 0;
                    const crossingOffsetNorth = boolDirection ? 0 : 1;
                    const crossingOffsetSouth = boolDirection ? 1 : 0;
                    const northDirection = boolDirection ? 0 : 1;
                    const southDirection = boolDirection ? 1 : 0;
                    for (let r = firstRank; r - signDirection !== lastRank; r += signDirection) {
                        if (DEBUG) {
                            assertOrderAndPositionCoherence(r);
                        }

                        if (crossings[r + crossingOffsetNorth] === 0) {
                            // no need to reorder
                            continue;
                        }

                        const tryNewOrder = (newOrder) => {
                            // count crossings with new order
                            const prevCrossingsNorth = crossings[r + crossingOffsetNorth];
                            const newCrossingsNorth = countCrossings(newOrder, r, northDirection, preventConflicts);

                            let newCrossingsSouth = 0;
                            let prevCrossingsSouth = 0;
                            if (r !== lastRank) {
                                prevCrossingsSouth = crossings[r + crossingOffsetSouth];
                                newCrossingsSouth = countCrossings(newOrder, r, southDirection, preventConflicts);
                            }
                            const fewerCrossingsNorth = newCrossingsNorth < prevCrossingsNorth;
                            if (fewerCrossingsNorth) {
                                crossings[r + crossingOffsetNorth] = newCrossingsNorth;
                                if (r !== lastRank) {
                                    crossings[r + crossingOffsetSouth] = newCrossingsSouth;
                                }
                                order[r] = _.cloneDeep(newOrder);
                                _.forEach(order[r], (nodeId: number, pos: number) => {
                                    positions[nodeId] = pos;
                                });
                                const fewerCrossingsTotal = (newCrossingsNorth + newCrossingsSouth < prevCrossingsNorth + prevCrossingsSouth);
                                return (1 + (fewerCrossingsTotal ? 1 : 0));
                            } else {
                                return 0;
                            }
                        };

                        const newNodeOrder = new Array(order[r].length);
                        let hasChanged = true;
                        while (hasChanged) {
                            hasChanged = false;
                            let groupMeans = [];
                            _.forEach(groupOrder[r], (groupId: number) => {
                                // calculate mean position of neighbors
                                let nodeMeans = [];
                                let groupSum = 0;
                                let groupNum = 0;
                                for (let pos = groupOffsetsPos[groupId]; pos < groupOffsetsPos[groupId] + numNodesPerGroup[groupId]; ++pos) {
                                    const nodeId = order[r][pos];
                                    let sum = 0;
                                    let num = 0;
                                    for (let neighbor = 0; neighbor < neighbors[boolOppositeDirection][nodeId].length; ++neighbor) {
                                        let weight = neighbors[boolOppositeDirection][nodeId][neighbor].weight;
                                        if (weight === Number.POSITIVE_INFINITY) {
                                            weight = 1;
                                        }
                                        const neighborPos = positions[neighbors[boolOppositeDirection][nodeId][neighbor].end];
                                        sum += weight * neighborPos;
                                        num += weight;
                                    }
                                    if (num > 0) {
                                        nodeMeans.push([nodeId, multiplicator * sum / num + pos]);
                                    } else {
                                        nodeMeans.push([nodeId, multiplicator * pos + pos]);
                                    }
                                    groupSum += sum;
                                    groupNum += num;
                                }

                                // sort by the means
                                inPlaceSort(nodeMeans).asc(pair => pair[1]);

                                for (let posInGroup = 0; posInGroup < numNodesPerGroup[groupId]; ++posInGroup) {
                                    newNodeOrder[groupOffsetsPos[groupId] + posInGroup] = nodeMeans[posInGroup][0];
                                }

                                if (groupNum > 0) {
                                    groupMeans.push([groupId, multiplicator * groupSum / groupNum + groupPositions[groupId]]);
                                } else {
                                    groupMeans.push([groupId, multiplicator * groupPositions[groupId] + groupPositions[groupId]]);
                                }
                            });

                            if (options["orderGroups"]) {
                                // reorder groups
                                inPlaceSort(groupMeans).asc(pair => pair[1]);
                                const newGroupOrder = _.map(groupMeans, "0");
                                const changes = this._getChanges(newGroupOrder, groupPositions);
                                for (let c = 0; c < changes.length; ++c) {
                                    const tmpGroupOrder = new Array(order[r]);
                                    for (let pos = 0; pos < groupOrder[r].length; ++pos) {
                                        tmpGroupOrder[pos] = groupOrder[r][pos];
                                    }
                                    for (let pos = changes[c][0]; pos <= changes[c][1]; ++pos) {
                                        tmpGroupOrder[pos] = newGroupOrder[pos];
                                    }
                                    // transform new group order to node order
                                    const tmpOrder = [];
                                    _.forEach(tmpGroupOrder, (groupId: number) => {
                                        for (let posInGroup = 0; posInGroup < numNodesPerGroup[groupId]; ++posInGroup) {
                                            tmpOrder.push(order[r][groupOffsetsPos[groupId] + posInGroup]);
                                        }
                                    });

                                    const result = tryNewOrder(tmpOrder);
                                    if (result > 0) {
                                        // store new group order
                                        groupOrder[r] = tmpGroupOrder;
                                        this._setGroupPositionAndOffset(groupOrder[r], groupPositions, groupOffsetsPos, numNodesPerGroup);
                                        hasChanged = true;
                                    }
                                }
                            }

                            if (!hasChanged) {
                                // reorder nodes
                                const changes = this._getChanges(newNodeOrder, positions);
                                for (let c = 0; c < changes.length; ++c) {
                                    const tmpOrder = new Array(order[r]);
                                    for (let pos = 0; pos < order[r].length; ++pos) {
                                        tmpOrder[pos] = order[r][pos];
                                    }
                                    for (let pos = changes[c][0]; pos <= changes[c][1]; ++pos) {
                                        tmpOrder[pos] = newNodeOrder[pos];
                                    }
                                    const result = tryNewOrder(tmpOrder);
                                    if (result > 0) {
                                        hasChanged = true;
                                    }
                                }
                            }
                        }
                        if (DEBUG) {
                            assertOrderAndPositionCoherence(r);
                        }
                    }
                    boolDirection = boolOppositeDirection;
                    boolOppositeDirection = boolDirection ? 0 : 1;
                    signDirection *= -1;
                    for (let r = 1; r < ranks.length; ++r) {
                        if (crossings[r]  === Number.POSITIVE_INFINITY) {
                            crossings[r] = countCrossings(order[r], r);
                        }
                    }
                    const newCrossings = _.sum(crossings);
                    if (newCrossings < minCrossings) {
                        minCrossings = newCrossings;
                        improveCounter = 2;
                    }
                }

                for (let r = 0; r < ranks.length; ++r) {
                    _.forEach(order[r], (nodeId: number, pos: number) => {
                        positions[nodeId] = pos;
                    });
                    this._setGroupPositionAndOffset(groupOrder[r], groupPositions, groupOffsetsPos, numNodesPerGroup);
                }

                Timer.stop(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "reorder"]);
            };

            const getConflict = (type: "HEAVYHEAVY" | "HEAVYLIGHT", r: number): [number, number ,number, number, number] => {
                let heavyLeftNorth = -1;
                let heavyLeftSouth = -1;
                let pos = 0;
                for (let tmpPos = 0; tmpPos < order[r].length; ++tmpPos) {
                    const tmpNodeId = order[r][tmpPos];
                    let hasHeavy = _.some(neighbors[0][tmpNodeId], neighbor => neighbor.weight === Number.POSITIVE_INFINITY);
                    if (type === "HEAVYLIGHT") {
                        hasHeavy &&= intranode[tmpNodeId];
                    }
                    if (tmpPos === order[r].length - 1 || hasHeavy) {
                        let heavyRightNorth = order[r - 1].length;
                        let heavyRightSouth = order[r].length;
                        if (hasHeavy) {
                            heavyRightNorth = positions[neighbors[0][tmpNodeId][0].end];
                            heavyRightSouth = tmpPos;
                        }
                        while (pos <= tmpPos) {
                            const nodeId = order[r][pos];
                            for (let neighbor = 0; neighbor < neighbors[0][nodeId].length; ++neighbor) {
                                if (type === "HEAVYLIGHT" || neighbors[0][nodeId][neighbor].weight === Number.POSITIVE_INFINITY) {
                                    const neighborPos = positions[neighbors[0][nodeId][neighbor].end];
                                    if (neighborPos < heavyLeftNorth) {
                                        return [r, heavyLeftNorth, heavyLeftSouth, neighborPos, pos];
                                    }
                                    if (neighborPos > heavyRightNorth) {
                                        return [r, heavyRightNorth, heavyRightSouth, neighborPos, pos];
                                    }
                                }
                            }
                            pos++;
                        }
                        heavyLeftNorth = heavyRightNorth;
                        heavyLeftSouth = heavyRightSouth;
                    }
                }
                return null;
            }

            /**
             * Resolves all heavy-heavy conflicts between rank r-1 and r.
             */
            const heavy = [];
            const resolveHeavyHeavy = (r: number) => {
                Timer.start(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve", "resolveHeavyHeavy"]);
                heavy.length = 0;
                for (let tmpPos = 0; tmpPos < order[r].length; ++tmpPos) {
                    const tmpNodeId = order[r][tmpPos];
                    if (_.some(neighbors[0][tmpNodeId], neighbor => neighbor.weight === Number.POSITIVE_INFINITY)) {
                        heavy.push(tmpNodeId);
                    }
                }
                inPlaceSort(heavy).asc(southNodeId => positions[neighbors[0][southNodeId][0].end]);

                let pointer = 0;
                for (let tmpPos = 0; tmpPos < order[r].length; ++tmpPos) {
                    const tmpNodeId = order[r][tmpPos];
                    if (_.some(neighbors[0][tmpNodeId], neighbor => neighbor.weight === Number.POSITIVE_INFINITY)) {
                        order[r][tmpPos] = heavy[pointer++];
                        positions[order[r][tmpPos]] = tmpPos;
                    }
                }
                Timer.stop(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve", "resolveHeavyHeavy"]);
            }

            /**
             * Resolves all conflicts.
             */
            const resolveConflicts = () => {
                if (DEBUG) {
                    Assert.assertAll(_.range(ranks.length), r => groupOrder[r].length === 1, "conflict resolution with more than one group per rank");
                }
                Timer.start(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve"]);

                for (let r = 0; r < order.length; ++r) {
                    _.forEach(ranks[r].groups[0].nodes, (node: OrderNode) => {
                        virtual[node.id] = node.isVirtual;
                        intranode[node.id] = node.isIntranode;
                        intranodePathEnd[node.id] = node.isIntranode && (neighbors[1][node.id].length === 0 || neighbors[1][node.id][0].weight < Number.POSITIVE_INFINITY);
                        sink[node.id] = (graph._nodeGraph.numOutEdges(node.id) === 0);
                        moving[node.id] = true;
                    });
                    rankWidths[r] = order[r].length;
                }

                const addEdge = (srcNode: OrderNode, dstNode: OrderNode, weight: number) => {
                    if (srcNode.isVirtual && dstNode.isVirtual) {
                        weight = Number.POSITIVE_INFINITY;
                    }
                    const newEdge = new Edge(srcNode.id, dstNode.id, weight);
                    const newEdgeId = this.addEdge(newEdge);
                    graph.addEdge(newEdge, newEdgeId);
                    neighbors[0][dstNode.id].push({end: srcNode.id, weight: weight});
                    neighbors[1][srcNode.id].push({end: dstNode.id, weight: weight});
                };

                const removeEdge = (srcNode: OrderNode, dstNode: OrderNode) => {
                    const edge = graph.edgeBetween(srcNode.id, dstNode.id);
                    graph.removeEdge(edge.id);
                    this.removeEdge(edge.id);
                    let upEdgeIndex;
                    _.forEach(neighbors[0][dstNode.id], (neighbor: Neighbor, i: number) => {
                        if (neighbor.end === srcNode.id) {
                            upEdgeIndex = i;
                        }
                    });
                    neighbors[0][dstNode.id].splice(upEdgeIndex, 1);
                    let downEdgeIndex;
                    _.forEach(neighbors[1][srcNode.id], (neighbor: Neighbor, i: number) => {
                        if (neighbor.end === dstNode.id) {
                            downEdgeIndex = i;
                        }
                    });
                    neighbors[1][srcNode.id].splice(downEdgeIndex, 1);
                };

                const addNodeToRank = (r: number, node: OrderNode) => {
                    order[r].push(node.id);
                    ranks[r].groups[0].addNode(node, node.id);
                    node.rank = r;
                };

                const createNode = (): OrderNode => {
                    const newNode = new OrderNode(null, true, false);
                    this.addNode(newNode);
                    neighbors[0][newNode.id] = [];
                    neighbors[1][newNode.id] = [];
                    virtual[newNode.id] = true;
                    intranode[newNode.id] = false;
                    intranodePathEnd[newNode.id] = false;
                    moving[newNode.id] = true;
                    sink[newNode.id] = false;
                    return newNode;
                };

                const createRank = () => {
                    if (ranks.length > 10000) {
                        throw new Error("halt");
                    }
                    const newR = ranks.length;
                    const newRank = new OrderRank(_.last(ranks).rank + 1);
                    this.addRank(newRank);
                    const newGroup = new OrderGroup(null);
                    newRank.addGroup(newGroup);
                    const newRankComponent = new OrderRank(_.last(ranks).rank + 1);
                    graph.addRank(newRankComponent);
                    ranks.push(newRankComponent);
                    newRankComponent.addGroup(newGroup);
                    this._groupGraph.addEdge(new Edge(ranks[newR - 1].groups[0].id, ranks[newR].groups[0].id));
                    this._rankGraph.addEdge(new Edge(ranks[newR - 1].id, ranks[newR].id));
                    newRankComponent.order = [0];
                    groupOrder[newR] = [newGroup.id];
                    groupPositions[newGroup.id] = 0;
                    groupOffsetsPos[newGroup.id] = 0;
                    numNodesPerGroup[newGroup.id] = 0;
                    order[newR] = [];
                    crossings[newR] = 0;
                    rankWidths[newR] = 0;
                }

                const resolveHeavyLight = (conflict: [number, number, number, number, number]) => {
                    Timer.start(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve", "resolveHeavyLight"]);

                    const [r, crossedNorthPos, crossedSouthPos, crossingNorthPos, crossingSouthPos] = conflict;

                    const crossedNorthNodeId = order[r - 1][crossedNorthPos];
                    const crossedNorthNode = graph.node(crossedNorthNodeId);
                    const crossedSouthNodeId = order[r][crossedSouthPos];
                    const crossedSouthNode = graph.node(crossedSouthNodeId);
                    const crossingNorthNodeId = order[r - 1][crossingNorthPos];
                    let crossingNorthNode = graph.node(crossingNorthNodeId);
                    const crossingSouthNodeId = order[r][crossingSouthPos];
                    let crossingSouthNode = graph.node(crossingSouthNodeId);
                    let crossingEdge;

                    const resolveY = () => {
                        Timer.start(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve", "resolveHeavyLight", "resolveY"]);

                        // mark nodes that must not be moved
                        _.forEach(order[r - 1], (nodeId: number) => {
                            if (intranode[nodeId]) {
                                moving[nodeId] = false;
                                let tmpNodeId = nodeId;
                                while (graph.outEdges(tmpNodeId).length > 0 && graph.outEdges(tmpNodeId)[0].weight === Number.POSITIVE_INFINITY) {
                                    tmpNodeId = graph.outEdges(tmpNodeId)[0].dst;
                                    moving[tmpNodeId] = false;
                                }
                            } else if (sink[nodeId]) {
                                // sink on rank r - 1
                                moving[nodeId] = false;
                            }
                        });

                        // create new rank if necessary
                        if (_.some(order[order.length - 1], nodeId => moving[nodeId])) {
                            if (order.length > 10000) {
                                throw new Error("halt");
                            }
                            createRank();
                        }

                        // move nodes down and create virtual nodes
                        for (let tmpR = ranks.length - 1; tmpR >= r; --tmpR) {
                            _.forEach(order[tmpR - 1], (nodeId: number) => {
                                const node = graph.node(nodeId);
                                if (moving[nodeId]) {
                                    addNodeToRank(tmpR, node);
                                    if (tmpR === r) {
                                        // create a virtual node for each in edge and route edge through new node
                                        const sortedEdges = _.sortBy(graph.inEdges(nodeId), edge => positions[edge.src]);
                                        _.forEach(sortedEdges, inEdge => {
                                            const newNode = createNode();
                                            addNodeToRank(r - 1, newNode);
                                            const srcNode = graph.node(inEdge.src);
                                            removeEdge(srcNode, node);
                                            addEdge(srcNode, newNode, inEdge.weight);
                                            addEdge(newNode, node, inEdge.weight);
                                        });
                                    }
                                } else {
                                    // `node` is non-moving
                                    if (intranodePathEnd[nodeId]) {
                                        if (DEBUG) {
                                            Assert.assertAll(graph.outEdges(node.id), edge => graph.node(edge.dst).rank === tmpR + 1, "edge below intranode path end not spanning two ranks");
                                        }
                                        // create a virtual node for each out edge and route edge through new node
                                        // sort edges to prevent crossings between them
                                        const sortedEdges = _.sortBy(graph.outEdges(nodeId), edge => positions[edge.dst]);
                                        _.forEach(sortedEdges, outEdge => {
                                            const newNode = createNode();
                                            addNodeToRank(tmpR, newNode);
                                            const dstNode = graph.node(outEdge.dst);
                                            removeEdge(node, dstNode);
                                            addEdge(node, newNode, outEdge.weight);
                                            addEdge(newNode, dstNode, outEdge.weight);
                                        });
                                    } else if (!sink[nodeId]) {
                                        // there is a an intranode segment between upper and this rank
                                        // => change order within this rank
                                        const lowerNode = graph.outNeighbors(nodeId)[0];
                                        addNodeToRank(tmpR, lowerNode);
                                    }
                                    if (tmpR === r) {
                                        // readd node
                                        addNodeToRank(r - 1, node);
                                    }
                                    // set as moving (default value) for next resolution
                                    moving[nodeId] = true;
                                }
                            });
                        }
                        for (let tmpR = r - 1; tmpR < ranks.length; ++tmpR) {
                            // keep only nodes that have been (re-)added during y resolution
                            tmpOrder.length = 0;
                            ranks[tmpR].groups[0].clear();
                            for (let pos = rankWidths[tmpR]; pos < order[tmpR].length; ++pos) {
                                const nodeId = order[tmpR][pos];
                                const node = graph.node(nodeId);
                                tmpOrder.push(nodeId);
                                ranks[tmpR].groups[0].addNode(node, nodeId);
                                node.rank = tmpR;
                            }
                            numNodesPerGroup[ranks[tmpR].groups[0].id] = tmpOrder.length;
                            rankWidths[tmpR] = tmpOrder.length;

                            // copy back and update positions
                            order[tmpR].length = 0;
                            _.forEach(tmpOrder, (nodeId: number, pos: number) => {
                                order[tmpR].push(nodeId);
                                positions[nodeId] = pos;
                            });
                        }

                        if (DEBUG) {
                            Assert.assertAll(_.range(1, r + 1), r => getConflict("HEAVYLIGHT", r) === null, "heavy-light conflict after y resolution with r = " + r);
                        }

                        Timer.stop(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve", "resolveHeavyLight", "resolveY"]);
                    }

                    const checkXResolution = (side: "LEFT" | "RIGHT") => {
                        Timer.start(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve", "resolveHeavyLight", "checkX"]);
                        const nodesPerRank = new Array(ranks.length);
                        const minGreenNodePerRank: Array<number> = new Array(ranks.length);
                        const maxRedNodePerRank: Array<number> = new Array(ranks.length);
                        let conflict = false;
                        for (let r = 0; r < ranks.length; ++r) {
                            nodesPerRank[r] = new Map();
                            minGreenNodePerRank[r] = (side === "RIGHT" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
                            maxRedNodePerRank[r] = (side === "RIGHT" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY);
                        }
                        const queue: Array<[OrderNode, string]> = [];
                        let minRank = r - 1;
                        let maxRank = r;
                        const moveDir = (side === "LEFT" ? 1 : -1);
                        const minFun = (side === "RIGHT" ? Math.min : Math.max);
                        const maxFun = (side === "RIGHT" ? Math.max : Math.min);
                        const geFun = (side === "RIGHT" ? ((a, b) => a >= b) : ((a, b) => a <= b));
                        const addNodeToGroup = (r: number, node: OrderNode, group: string) => {
                            nodesPerRank[r].set(node, group);
                            queue.push([node, group]);
                            const addIntermediate = () => {
                                if (geFun(maxRedNodePerRank[r], minGreenNodePerRank[r])) {
                                    const intermediate = [];
                                    for (let pos = maxRedNodePerRank[r]; pos !== minGreenNodePerRank[r]; pos += moveDir) {
                                        const node = graph.node(order[r][pos]);
                                        if (!nodesPerRank[r].has(node)) {
                                            intermediate.push([node, "YELLOW"]);
                                        } else if (node.rank === minRank) {
                                            intermediate.push([node, nodesPerRank[r].get(node)]); // check boundaries again
                                        }
                                    }
                                    _.forEach(intermediate, ([node, group]) => {
                                        addNodeToGroup(r, node, group);
                                    });
                                }
                            }
                            if (group === "RED") {
                                const prev = maxRedNodePerRank[r];
                                maxRedNodePerRank[r] = maxFun(maxRedNodePerRank[r], positions[node.id]);
                                if (maxRedNodePerRank[r] !== prev && minGreenNodePerRank[r] !== Number.POSITIVE_INFINITY && minGreenNodePerRank[r] !== Number.NEGATIVE_INFINITY) {
                                    addIntermediate();
                                }
                            } else {
                                // potentially heavy
                                const prev = minGreenNodePerRank[r];
                                minGreenNodePerRank[r] = minFun(minGreenNodePerRank[r], positions[node.id]);
                                if (minGreenNodePerRank[r] !== prev && maxRedNodePerRank[r] !== Number.POSITIVE_INFINITY && maxRedNodePerRank[r] !== Number.NEGATIVE_INFINITY) {
                                    addIntermediate();
                                }
                            }
                        };
                        addNodeToGroup(r - 1, crossedNorthNode, "GREEN");
                        addNodeToGroup(r, crossedSouthNode, "GREEN");
                        addNodeToGroup(r - 1, crossingNorthNode, "RED");
                        addNodeToGroup(r, crossingSouthNode, "RED");

                        let queuePointer = 0;
                        while (queuePointer < queue.length && !conflict) {
                            const [node, group] = queue[queuePointer++];
                            if (nodesPerRank[node.rank].get(node) !== group) {
                                continue; // group has changed in the meantime
                            }
                            const addNeighbors = (neighborMethod: "inEdges" | "outEdges", neighborProperty: "src" | "dst", rankOffset: 1 | -1) => {
                                _.forEach(graph[neighborMethod](node.id), edge => {
                                    if (edge === crossingEdge) {
                                        return;
                                    }
                                    const neighborRank = node.rank + rankOffset;
                                    const neighbor = graph.node(edge[neighborProperty]);
                                    if (!nodesPerRank[neighborRank].has(neighbor)) {
                                        // add neighbor to same group as this node
                                        addNodeToGroup(neighborRank, neighbor, group);
                                    } else {
                                        // check for conflict or group change
                                        const neighborGroup = nodesPerRank[neighborRank].get(neighbor);
                                        if (neighborGroup !== group) {
                                            if (neighborGroup === "YELLOW") {
                                                addNodeToGroup(neighborRank, neighbor, group);
                                            } else if (group === "YELLOW") {
                                                addNodeToGroup(node.rank, node, neighborGroup);
                                            } else {
                                                // one is "GREEN" and the other is "RED"
                                                conflict = true;
                                            }
                                        }
                                    }
                                });
                            };
                            if (node.rank > minRank) {
                                addNeighbors("inEdges", "src", -1);
                            }
                            if (node.rank === minRank && geFun(positions[node.id], minGreenNodePerRank[node.rank])) {
                                let foundNewMinRank = false;
                                _.forEach(graph.inEdges(node.id), inEdge => {
                                    if (inEdge.weight === Number.POSITIVE_INFINITY) {
                                        foundNewMinRank = true;
                                    }
                                });
                                if (foundNewMinRank) {
                                    minRank--;
                                    nodesPerRank[node.rank].forEach((group, borderNode) => {
                                        queue.push([borderNode, group]);
                                    });
                                }
                            }
                            if (node.rank < maxRank) {
                                addNeighbors("outEdges", "dst", 1);
                            }
                        }
                        if (conflict) {
                            Timer.stop(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve", "resolveHeavyLight", "checkX"]);
                            return null;
                        }
                        // group nodes
                        const nodesPerRankGrouped = [];
                        _.forEach(nodesPerRank, (nodes, r) => {
                            nodesPerRankGrouped[r] = {
                                "GREEN": new Set(),
                                "MOVING": new Set(),
                            };
                            minGreenNodePerRank[r] = (side === "RIGHT" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
                            nodes.forEach((group, node) => {
                                if (group === "GREEN") {
                                    nodesPerRankGrouped[r]["GREEN"].add(node);
                                    minGreenNodePerRank[r] = minFun(minGreenNodePerRank[r], positions[node.id]);
                                }
                            });
                            nodes.forEach((group, node) => {
                                if (group === "RED" && geFun(positions[node.id], minGreenNodePerRank[node.rank])) {
                                    nodesPerRankGrouped[r]["MOVING"].add(node);
                                }
                            });
                        });
                        Timer.stop(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve", "resolveHeavyLight", "checkX"]);
                        return nodesPerRankGrouped;
                    };

                    const resolveX = (side: "LEFT" | "RIGHT", nodesPerRank) => {
                        Timer.start(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve", "resolveHeavyLight", "resolveX"]);

                        _.forEach(nodesPerRank, (rank, r: number) => {
                            if (rank["MOVING"].size === 0 || rank["GREEN"].size === 0) {
                                return;
                            }
                            const green: Array<OrderNode> = _.sortBy(Array.from(rank["GREEN"]), node => positions[node.id]);
                            // `moving` is the subset of red nodes that is on the wrong side of the green nodes
                            const moving: Array<OrderNode> = _.sortBy(Array.from(rank["MOVING"]), node => positions[node.id]);
                            const newOrder = [];
                            _.forEach(order[r], nodeId => {
                                const node = graph.node(nodeId);
                                if (rank["MOVING"].has(node)) {
                                    return; // do nothing
                                }
                                if (side === "RIGHT" && nodeId === green[0].id) {
                                    _.forEach(moving, movingNode => {
                                        newOrder.push(movingNode.id);
                                    });
                                }
                                newOrder.push(nodeId);
                                if (side === "LEFT" && nodeId === _.last(green).id) {
                                    _.forEach(moving, movingNode => {
                                        newOrder.push(movingNode.id);
                                    });
                                }
                            });
                            order[r] = newOrder;
                            _.forEach(order[r], (nodeId: number, pos: number) => {
                                positions[nodeId] = pos;
                            });
                        });

                        if (DEBUG) {
                            Assert.assertAll(_.range(r + 1), r => getConflict("HEAVYHEAVY", r) === null, "heavy-heavy conflict after x resolution");
                        }
                        Timer.stop(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve", "resolveHeavyLight", "resolveX"]);
                    };

                    didResolveY = false;
                    if (options["resolveX"]) {
                        crossingEdge = graph.edgeBetween(crossingNorthNode.id, crossingSouthNode.id);
                        const leftResolution = checkXResolution("LEFT");
                        const rightResolution = checkXResolution("RIGHT");
                        if (leftResolution === null) {
                            if (rightResolution === null) {
                                resolveY();
                                didResolveY = true;
                            } else {
                                resolveX("RIGHT", rightResolution);
                            }
                        } else {
                            if (rightResolution === null) {
                                resolveX("LEFT", leftResolution);
                            } else {
                                const numNodesLeft = _.sum(_.map(leftResolution, rank => rank["MOVING"].size));
                                const numNodesRight = _.sum(_.map(rightResolution, rank => rank["MOVING"].size));
                                if (numNodesLeft < numNodesRight) {
                                    resolveX("LEFT", leftResolution);
                                } else {
                                    resolveX("RIGHT", rightResolution);
                                }
                            }
                        }
                    } else {
                        resolveY();
                        didResolveY = true;
                    }
                    Timer.stop(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve", "resolveHeavyLight"]);
                }

                let didResolveY = false;

                for (let r = 1; r < ranks.length; ++r) {
                    resolveHeavyHeavy(r);
                    while (true) {
                        const conflict = getConflict("HEAVYLIGHT", r);
                        if (conflict === null) {
                            break;
                        }
                        resolveHeavyLight(conflict);
                        if (didResolveY) {
                            break;
                        }
                    }
                }
                for (let r = 1; r < ranks.length; ++r) {
                    resolveHeavyHeavy(r);
                }
                if (DEBUG) {
                    Assert.assertAll(_.range(1, ranks.length), r => getConflict("HEAVYLIGHT", r) === null, "heavy-light conflict after resolution");
                }

                for (let tmpR = 1; tmpR < ranks.length; ++tmpR) {
                    crossings[tmpR] = countCrossings(order[tmpR], tmpR);
                }

                Timer.stop(["doLayout", "orderRanks", "doOrder", "order", "doOrder", "resolve"]);
            }

            if (options["countInitial"]) {
                for (let r = 1; r < ranks.length; ++r) {
                    crossings[r] = countCrossings(order[r], r, 0);
                }
            }
            if (options["countOnly"]) {
                return _.sum(crossings);
            }
            if (this._wasm !== null && options["resolveConflicts"]) {
                await this._wasm.reorder(order, neighbors[0], graph._nodeGraph.maxId(), numEdgesPerRank);
                for (let r = 0; r < ranks.length; ++r) {
                    _.forEach(order[r], (nodeId: number, pos: number) => {
                        positions[nodeId] = pos;
                    });
                }
                for (let r = 1; r < ranks.length; ++r) {
                    crossings[r] = countCrossings(order[r], r, 0);
                }
            } else {
                reorder();
            }

            if (options["resolveConflicts"]) {
                resolveConflicts();
                resolveConflicts();
                if (DEBUG) {
                    Assert.assertAll(_.range(1, ranks.length), r => getConflict("HEAVYHEAVY", r) === null, "heavy-heavy conflict after resolveConflicts");
                    Assert.assertAll(_.range(1, ranks.length), r => getConflict("HEAVYLIGHT", r) === null, "heavy-light conflict after resolveConflicts");
                }
                reorder(true);
                if (DEBUG) {
                    Assert.assertAll(_.range(1, ranks.length), r => getConflict("HEAVYHEAVY", r) === null, "heavy-heavy conflict after reorder with preventConflict");
                    Assert.assertAll(_.range(1, ranks.length), r => getConflict("HEAVYLIGHT", r) === null, "heavy-light conflict after reorder with preventConflict");
                    assertEdgesBetweenNeighboringRanks();
                }
            }

            // transform component ranks to absolute ranks
            if (minRank > 0 && minRank < Number.POSITIVE_INFINITY) {
                _.forEach(graph.nodes(), (node: OrderNode) => {
                    node.rank += minRank;
                });
            }

            // store new positions
            _.forEach(ranks, (rank: OrderRank) => {
                _.forEach(rank.groups, (group: OrderGroup) => {
                    group.position = groupPositions[group.id];
                    _.forEach(group.nodes, (node: OrderNode) => {
                        node.position = positions[node.id];
                    });
                    group.orderNodes();
                });
                rank.orderGroups();
            });

            const numCrossings = _.sum(crossings);

            Timer.stop(["doLayout", "orderRanks", "doOrder", "order", "doOrder"]);

            return numCrossings;
        }

        this._addGroupEdges();

        const numRanks = this._rankGraph.maxId();
        const numGroups = this._groupGraph.maxId();
        const numNodes = this._nodeGraph.maxId();

        groupOffsetsPos = new Array(numGroups); // number of nodes in groups left of this group (reflecting current order) by id
        numNodesPerGroup = new Array(numGroups); // number of nodes in group by id
        groupOrder = new Array(numRanks); // current order of groups on this level (e. g. 2, 0, 1)
        groupPositions = new Array(numGroups);// position of each group by id; roughly inverse of groupOrder (e. g. 1, 2, 0)
        order = new Array(numRanks); // current order of nodes on this level (e. g. 2, 0, 1)
        positions = new Array(numNodes); // inverse of order (e. g. 1, 2, 0)
        neighbors = [
            new Array(numNodes),
            new Array(numNodes),
        ];
        crossings = new Array(numRanks); // number of crossings above each rank
        virtual = new Array(numNodes);
        intranode = new Array(numNodes);
        intranodePathEnd = new Array(numNodes);
        moving = new Array(numNodes);
        sink = new Array(numNodes);
        rankWidths = new Array(numRanks);
        moved = new Array(numNodes);
        numEdgesPerRank = new Array(numRanks);
        tmpOrder = [];

        let numCrossings = 0;
        const groupComponents = this._groupGraph.components();
        for (let i = 0; i < groupComponents.length; ++i) {
            const groupGraphComponent = groupComponents[i];
            const componentGraph = new OrderGraph();
            const ranks: Array<OrderRank> = [];
            _.forEach(groupGraphComponent.nodes(), (group: OrderGroup) => {
                if (ranks[group.rank.id] === undefined) {
                    ranks[group.rank.id] = new OrderRank(group.rank.rank);
                    componentGraph.addRank(ranks[group.rank.id]);
                }
                ranks[group.rank.id].addGroup(group, group.id);
                const groupNodes = group.nodes;
                group.nodes = [];
                _.forEach(groupNodes, (node: OrderNode) => {
                    group.addNode(node, node.id);
                });
            });

            _.forEach(componentGraph.nodes(), (newNode: OrderNode) => {
                _.forEach(this.outEdges(newNode.id), (edge: Edge<any, any>) => {
                    componentGraph.addEdge(edge, edge.id);
                });
            });

            if (componentGraph._rankGraph.numNodes() < 2 || componentGraph._nodeGraph.numEdges() < componentGraph._rankGraph.numNodes()) {
                // with 0 or one edges, there is nothing to reorder
                continue;
            }

            componentGraph._addGroupEdges();
            componentGraph._addRankEdges();

            if (options["method"] === "spring") {
                await doOrderSprings(componentGraph);
            } else {
                numCrossings += await doOrder(componentGraph);
            }
        }
        Timer.stop(["doLayout", "orderRanks", "doOrder", "order"]);

        return numCrossings;
    }

    /**
     * Adapted from Barth, W., Jünger, M., & Mutzel, P. (2002, August). Simple and efficient bilayer cross counting.
     * In International Symposium on Graph Drawing (pp. 130-141). Springer, Berlin, Heidelberg.
     * @param numNorth
     * @param numSouth
     * @param edges
     * @private
     */
    private _countCrossings(numNorth: number, numSouth: number, edges: Array<[number, number, number]>): number {
        // build south sequence
        inPlaceSort(edges).asc([
            e => e[0],
            e => e[1],
        ]);

        // build the accumulator tree
        let firstIndex = 1;
        while (firstIndex < numSouth) {
            firstIndex *= 2; // number of tree nodes
        }
        const treeSize = 2 * firstIndex - 1;
        firstIndex -= 1; // index of leftmost leaf
        const tree = _.fill(new Array(treeSize), 0);

        // compute the total weight of the crossings
        let crossWeight = 0;
        for (let i = 0; i < edges.length; ++i) {
            let index = edges[i][1] + firstIndex;
            tree[index] += edges[i][2];
            let weightSum = 0;
            while (index > 0) {
                if (index % 2) {
                    weightSum += tree[index + 1];
                }
                index = Math.floor((index - 1) / 2);
                tree[index] += edges[i][2];
            }
            crossWeight += edges[i][2] * weightSum;
        }
        return crossWeight;
    }

    private _getChanges(newOrder: Array<number>, positions: Array<number>): Array<[number, number]> {
        const changes = [];
        const permutation = new Array(newOrder.length);
        _.forEach(newOrder, (nodeId: number, pos: number) => {
            permutation[pos] = positions[nodeId];
        });
        let seqStart = null;
        let seqEnd = -1;
        for (let pos = 0; pos < permutation.length; ++pos) {
            if (permutation[pos] > pos) {
                if (seqStart === null) {
                    seqStart = pos;
                    seqEnd = permutation[pos];
                } else {
                    if (seqEnd < pos) {
                        changes.push([seqStart, pos - 1]);
                        seqStart = pos;
                        seqEnd = permutation[pos];
                    } else {
                        seqEnd = Math.max(seqEnd, permutation[pos]);
                    }
                }
            }
            if (permutation[pos] === pos && seqStart !== null && seqEnd < pos) {
                changes.push([seqStart, pos - 1]);
                seqStart = null;
            }
        }
        if (seqStart !== null) {
            changes.push([seqStart, permutation.length - 1]);
        }
        return changes;
    }

    private _setGroupPositionAndOffset(groupOrder: Array<number>, groupPositions: Array<number>, groupOffsetsPos: Array<number>, numNodesPerGroup: Array<number>): void {
        let offset = 0;
        _.forEach(groupOrder, (groupId: number, pos: number) => {
            groupPositions[groupId] = pos;
            groupOffsetsPos[groupId] = offset;
            offset += numNodesPerGroup[groupId];
        });
    }
}
