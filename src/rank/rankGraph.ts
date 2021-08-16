import {DEBUG} from "../util/constants";
import * as _ from "lodash";
import Assert from "../util/assert";
import Component from "../graph/component";
import Edge from "../graph/edge";
import Graph from "../graph/graph";
import RankNode from "./rankNode";

export default class RankGraph extends Graph<RankNode, Edge<any, any>> {
    rank(): void {
        if (DEBUG) {
            Assert.assert(this.components().length === 1, "rank graph has more than one component");
            Assert.assert(!this.hasCycle(), "rank graph has cycle");
        }

        const sources = this.sources();
        let source = sources[0];
        const upwardBorderEdgesQueue = [];  
        let upwardBorderEdgesQueuePointer = 0;
        const visitedDownwards = _.fill(new Array(this.maxId() + 1), false);
        const visitedUpwards = _.fill(new Array(this.maxId() + 1), false);
        const visitedEdges = _.fill(new Array(this.maxEdgeId() + 1), false);
        const tmpRankPerNode = _.fill(new Array(this.maxId() + 1), 0);

        for (let s = 0; s < sources.length; ++s) {
            let minDiff = (s === 0 ? 0 : Number.POSITIVE_INFINITY);
            const sourceComponent = new Component(this);
            const borderEdges = [];

            // bfs starting at source
            // this is for finding the set of nodes reachable from the source
            let queue = [];
            let queuePointer = 0;
            queue.push(source);
            visitedDownwards[source.id] = true;
            while (queuePointer < queue.length) {
                const node = queue[queuePointer++];
                sourceComponent.addNode(node.id);
                if (node.rank === null) {
                    _.forEach(this.outEdges(node.id), outEdge => {
                        if (!visitedDownwards[outEdge.dst]) {
                            queue.push(this.node(outEdge.dst));
                            visitedDownwards[outEdge.dst] = true;
                        } else if (this.node(outEdge.dst).rank !== null) {
                            borderEdges.push(outEdge);
                        }
                        visitedEdges[outEdge.id] = true;
                    });
                }
            }

            if (DEBUG) {
                Assert.assertImplies(s > 0, borderEdges.length > 0, "no common sink");
            }

            sourceComponent.induceEdges();

            _.forEach(sourceComponent.toposort(), (node: RankNode) => {
                _.forEach(this.outEdges(node.id), outEdge => {
                    let nextRank = tmpRankPerNode[node.id] + outEdge.weight;
                    if (outEdge.weight === Number.POSITIVE_INFINITY) {
                        throw new Error("INFINITE WEIGHT");
                    }
                    tmpRankPerNode[outEdge.dst] = Math.max(tmpRankPerNode[outEdge.dst], nextRank);
                });
            });

            // find difference through looking at all border edges
            _.forEach(borderEdges, (borderEdge: Edge<any, any>) => {
                minDiff = Math.min(minDiff, this.node(borderEdge.dst).rank - tmpRankPerNode[borderEdge.src]  - borderEdge.weight);
            });

            if (DEBUG) {
                Assert.assert(minDiff !== Number.POSITIVE_INFINITY, "minDiff is infinity", sourceComponent);
            }

            _.forEach(sourceComponent.nodes(), (node: RankNode) => {
                node.rank = tmpRankPerNode[node.id] + minDiff;
                // find unranked neighbors
                _.forEach(this.inEdges(node.id), inEdge => {
                    if (!visitedEdges[inEdge.id]) {
                        upwardBorderEdgesQueue.push(inEdge);
                    }
                });
            });

            if (s < sources.length - 1) {
                // bfs from an arbitrary unranked neighbor upwards to find next source
                let newSourceFound = false;
                while (!newSourceFound) {
                    const queue = [];
                    let queuePointer = 0;
                    let upwardsStartNode;
                    do {
                        let edge = upwardBorderEdgesQueue[upwardBorderEdgesQueuePointer++];
                        upwardsStartNode = this.node(edge.src);
                    } while (upwardsStartNode.rank !== null || visitedUpwards[upwardsStartNode.id]);
                    queue.push(upwardsStartNode);
                    while (queuePointer < queue.length) {
                        const node = queue[queuePointer++];
                        if (visitedUpwards[node.id]) {
                            continue;
                        }
                        visitedUpwards[node.id] = true;
                        const inEdges = this.inEdges(node.id);
                        if (inEdges.length === 0) {
                            newSourceFound = true;
                            source = node;
                            break;
                        } else {
                            _.forEach(inEdges, (inEdge: Edge<any, any>) => {
                                const inNeighbor = this.node(inEdge.src);
                                if (inNeighbor.rank === null && !visitedUpwards[inNeighbor.id]) {
                                    queue.push(this.node(inNeighbor.id));
                                    upwardBorderEdgesQueue.push(inEdge);
                                }
                            });
                        }
                    }
                }
            }
            if (DEBUG) {
                Assert.assertImplies(s < sources.length - 1, source.rank === null, "no new source found");
            }
        }

        let minRank = Number.POSITIVE_INFINITY;
        _.forEach(this.nodes(), (node: RankNode) => {
            if (DEBUG) {
                Assert.assertFiniteNumber(node.rank, "rank is not a valid number");
            }
            minRank = Math.min(minRank, node.rank);
        });
        const difference = 0 - minRank;
        _.forEach(this.nodes(), (node) => {
            node.rank += difference;
        });
    }
}
