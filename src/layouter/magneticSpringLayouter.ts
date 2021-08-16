import {DEBUG, EPSILON} from "../util/constants";
import * as _ from "lodash";
import Assert from "../util/assert";
import LayoutEdge from "../layoutGraph/layoutEdge";
import LayoutGraph from "../layoutGraph/layoutGraph";
import LayoutNode from "../layoutGraph/layoutNode";
import RecursiveLayouter from "./recursiveLayouter";
import Shuffle from "../util/shuffle";
import Vector from "../geometry/vector";

export default class MagneticSpringLayouter extends RecursiveLayouter {
    constructor(options: object = {}) {
        super();
        this._options = _.defaults(options, this._options, {
            numIterations: 1000,
            stepSize: 1,
            weightSpring: 1,
            weightRepulsive: 1,
            weightMagnetic: 2,
            magneticDistanceExponent: 1,
            magneticAngleExponent: 5,
            forceCap: 100,
            decay: 1,
        });
    }

    layoutSizedGraph(graph: LayoutGraph) {
        //console.log(graph);
        switch (graph.nodes().length) {
            case 1:
                // just one node => place it anywhere
                graph.nodes()[0].updatePosition(new Vector());
                break;

            case 2:
                // two nodes => place them above each other
                const topIndex = Math.round(Math.random());
                const topNode = graph.nodes()[topIndex];
                const bottomNode = graph.nodes()[1 - topIndex];
                const positionTop = new Vector(-topNode.width / 2, -topNode.height / 2);
                if (DEBUG) {
                    Assert.assert(positionTop.isFinite(), "positionTop is not finite");
                }
                topNode.updatePosition(positionTop);
                const positionBottom = new Vector(-bottomNode.width / 2, topNode.height / 2 + this._options.targetEdgeLength);
                if (DEBUG) {
                    Assert.assert(positionBottom.isFinite(), "positionBottom is not finite");
                }
                bottomNode.updatePosition(positionBottom);
                break;

            default:
                // more nodes => place them on a circle
                let chordLengthSum = graph.nodes().length * this._options.targetEdgeLength;
                const nodeDiagonals = [];
                _.forEach(graph.nodes(), (node) => {
                    nodeDiagonals[node.id] = Math.sqrt(node.width * node.width + node.height * node.height);
                    chordLengthSum += nodeDiagonals[node.id];
                });
                // go from sum of chord lengths to sum of arc lengths, assuming maximal angle (2π/3)
                const circumference = chordLengthSum * Math.PI / 2;
                const diameter = circumference / Math.PI;
                const radius = diameter / 2;
                let angle = 0;
                const shuffledNodes = Shuffle.shuffle(graph.nodes());
                _.forEach(shuffledNodes, (node, i) => {
                    const center = new Vector(radius * Math.sin(angle), radius * Math.cos(angle));
                    const topLeft = new Vector(center.x - node.width / 2, center.y - node.height / 2);
                    if (DEBUG) {
                        Assert.assert(topLeft.isFinite(), "topLeft is not finite");
                    }
                    node.updatePosition(topLeft);
                    if (i < graph.nodes().length - 1) {
                        angle += 2 * Math.asin((this._options.targetEdgeLength + nodeDiagonals[node.id] / 2 + nodeDiagonals[shuffledNodes[i + 1].id] / 2) / diameter);
                    }
                });
        }

        // precompute set of neighbors and non-neighbors
        const neighbors = new Array(graph.maxId() + 1);
        const nonNeighbors = new Array(graph.maxId() + 1);
        const forces = new Array(graph.maxId() + 1);
        _.forEach(graph.nodes(), (node) => {
            neighbors[node.id] = new Set();
            nonNeighbors[node.id] = new Set();
        });
        _.forEach(graph.edges(), (edge: LayoutEdge) => {
            if (edge.src !== edge.dst) {
                neighbors[edge.dst].add(graph.node(edge.src));
            }
        });
        _.forEach(graph.nodes(), (nodeA) => {
            _.forEach(graph.nodes(), (nodeB) => {
                if (nodeA !== nodeB && !neighbors[nodeA.id].has(nodeB) && !neighbors[nodeB.id].has(nodeA)) {
                    nonNeighbors[nodeA.id].add(nodeB);
                }
            });
        });

        function xIntersection(src: Vector, dst: Vector, srcToDst: Vector, x: number): Vector {
            if (DEBUG) {
                Assert.assert(srcToDst.x !== 0, "x intersection with vertical line");
            }
            if (Math.sign(dst.x - src.x) === Math.sign(x - dst.x)) {
                return null;
            }
            return srcToDst.clone().setX(x - src.x).add(src);
        }

        function yIntersection(src: Vector, dst: Vector, srcToDst: Vector, y: number): Vector {
            if (DEBUG) {
                Assert.assert(srcToDst.y !== 0, "y intersection with horizontal line");
            }
            if (Math.sign(dst.y - src.y) === Math.sign(y - dst.y)) {
                return null;
            }
            return srcToDst.clone().setY(y - src.y).add(src);
        }

        function distanceVector(srcNode: LayoutNode, dstNode: LayoutNode) {
            const srcBox = srcNode.boundingBox();
            const dstBox = dstNode.boundingBox();
            const srcCenter = srcBox.center();
            const dstCenter = dstBox.center();
            if (srcBox.intersects(dstBox)) {
                if (srcCenter.x === dstCenter.x && srcCenter.y === dstCenter.y) {
                    return new Vector(Math.random(), Math.random()).setLength(0.001);
                }
                return dstCenter.clone().sub(srcCenter).setLength(0.001);
            }
            const srcToDst = dstCenter.sub(srcCenter);
            const x = Math.max(0, Math.abs(srcToDst.x) - (srcNode.width + dstNode.width) / 2);
            const y = Math.max(0, Math.abs(srcToDst.y) - (srcNode.height + dstNode.height) / 2);
            if (x === 0 && y === 0) {
                return dstCenter.clone().sub(srcCenter).setLength(0.001);
            }
            return srcToDst.setLength((new Vector(x, y)).length());
        }

        function edgeDistanceVector(srcNode: LayoutNode, dstNode: LayoutNode) {
            const src = srcNode.boundingBox().bottomCenter();
            const dst = dstNode.boundingBox().topCenter();
            if (src.x === dst.x && src.y === dst.y) {
                const srcCenter = srcNode.boundingBox().center();
                const dstCenter = dstNode.boundingBox().center();
                if (srcCenter.x === dstCenter.x && srcCenter.y === dstCenter.y) {
                    return new Vector(Math.random(), Math.random()).setLength(1E-5);
                }
                return dstCenter.clone().sub(srcCenter).setLength(1E-5);
            }
            return dst.sub(src);
        }

        const fieldVector = new Vector(0, 1);
        const HALF_PI = Math.PI / 2;

        let weightSpring = this._options.weightSpring;
        let weightMagnetic = this._options.weightMagnetic;
        let weightRepulsive = 0;
        for (let iteration = 0; iteration < this._options.numIterations; ++iteration) {
            _.forEach(graph.nodes(), (node: LayoutNode) => {
                forces[node.id] = new Vector();
            });
            let maxOffset = 0;
            _.forEach(graph.nodes(), (node: LayoutNode) => {
                let springForce = new Vector();
                let magneticForce = new Vector();
                let repulsiveForce = new Vector();
                _.forEach(graph.inNeighbors(node.id), (inNeighbor: LayoutNode) => {
                    // spring force
                    const edgeVector = edgeDistanceVector(inNeighbor, node);
                    const strength = Math.log(edgeVector.length() / this._options.targetEdgeLength);
                    springForce.add(edgeVector.clone().normalize().multiplyScalar(-1 * strength));
                    // magnetic force
                    if (edgeVector.x === 0 && edgeVector.y > 0) {
                        return;
                    }
                    let magneticDirection = new Vector(1 / edgeVector.x, 1 / edgeVector.y);
                    if (edgeVector.y < 0) {
                        magneticDirection.y *= -1;
                    } else {
                        magneticDirection.x *= -1;
                    }
                    if (edgeVector.x === 0) {
                        magneticDirection = fieldVector.clone();
                    }
                    let angle = HALF_PI - Math.sign(edgeVector.y) * Math.atan(Math.abs(edgeVector.y / edgeVector.x));
                    let angleFactor = Math.pow(angle / HALF_PI, this._options.magneticAngleExponent);
                    const distanceFactor = Math.pow(edgeVector.length(), this._options.magneticDistanceExponent);
                    const tmpMagneticForce = magneticDirection.clone().normalize().multiplyScalar(angleFactor * distanceFactor);
                    if (DEBUG) {
                        Assert.assert(tmpMagneticForce.isFinite(), "magnetic force is not finite");
                    }
                    magneticForce.add(tmpMagneticForce);
                });
                nonNeighbors[node.id].forEach((nonNeighbor: LayoutNode) => {
                    // repulsive force
                    const edgeVector = distanceVector(node, nonNeighbor);
                    const length = edgeVector.length();
                    const relativeLength = length / this._options.spaceBetweenNodes;
                    const strength = 1 / (relativeLength * relativeLength);
                    const tmpRepulsiveForce = edgeVector.clone().normalize().multiplyScalar(-1 * strength);
                    if (DEBUG) {
                        Assert.assert(tmpRepulsiveForce.isFinite(), "repulsive force is not finite");
                    }
                    repulsiveForce.add(tmpRepulsiveForce);
                });
                if (repulsiveForce.length() > this._options.forceCap) {
                    repulsiveForce.setLength(this._options.forceCap);
                }
                if (springForce.length() > this._options.forceCap) {
                    springForce.setLength(this._options.forceCap);
                }
                if (magneticForce.length() > this._options.forceCap) {
                    magneticForce.setLength(this._options.forceCap);
                }
                repulsiveForce.multiplyScalar(weightRepulsive);
                springForce.multiplyScalar(weightSpring);
                magneticForce.multiplyScalar(weightMagnetic);
                const offset = springForce.clone().add(magneticForce).add(repulsiveForce);
                offset.multiplyScalar(Math.pow(this._options.decay, iteration) * this._options.stepSize);
                maxOffset = Math.max(maxOffset, offset.length());
                if (DEBUG) {
                    Assert.assert(offset.isFinite(), "offset is not finite");
                }
                node.translate(offset.x, offset.y);
            });
            // stop when all nodes in subgraph almost stopped moving
            if (maxOffset < EPSILON) {
                break;
            }
            weightRepulsive += this._options.weightRepulsive / this._options.numIterations;
        }

        // place edges
        _.forEach(graph.edges(), (edge: LayoutEdge) => {
            const srcNode = graph.node(edge.src);
            const srcPoint = new Vector(srcNode.x + srcNode.width / 2, srcNode.y + srcNode.height);
            if (DEBUG) {
                Assert.assert(srcPoint.isFinite(), "srcPoint is not finite");
            }
            const dstNode = graph.node(edge.dst);
            const dstPoint = new Vector(dstNode.x + dstNode.width / 2, dstNode.y);
            if (DEBUG) {
                Assert.assert(dstPoint.isFinite(), "dstPoint is not finite");
            }
            edge.points = [srcPoint, dstPoint];
        });
    }
}
