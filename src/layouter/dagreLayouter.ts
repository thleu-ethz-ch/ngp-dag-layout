import * as _ from "lodash";
import dagre from "dagre";
import Box from "../geometry/box";
import LayoutEdge from "../layoutGraph/layoutEdge";
import LayoutGraph from "../layoutGraph/layoutGraph";
import LayoutNode from "../layoutGraph/layoutNode";
import RecursiveLayouter from "./recursiveLayouter";
import Vector from "../geometry/vector";

export default class DagreLayouter extends RecursiveLayouter {
    public static RANKER_NETWORK_SIMPLEX = "network-simplex";
    public static RANKER_TIGHT_TREE = "tight-tree";
    public static RANKER_LONGEST_PATH = "longest-path";

    constructor(options: object = {}) {
        super();
        this._options = _.defaults(options, this._options, {
            ranker: DagreLayouter.RANKER_NETWORK_SIMPLEX,
        });
    }

    layoutSizedGraph(graph: LayoutGraph): void {
        // create dagre graph
        const dagreGraph = new dagre.graphlib.Graph({multigraph: true});
        dagreGraph.setGraph(this.graphOptions());
        dagreGraph.setDefaultEdgeLabel(function () {
            return {};
        });

        _.forEach(graph.nodes(), (node: LayoutNode) => {
            dagreGraph.setNode(node.id, node.size());
        });

        const generalEdgeOptions: any = {};
        _.forEach(graph.edges(), (edge: LayoutEdge) => {
            const edgeOptions = _.assign({}, generalEdgeOptions);
            dagreGraph.setEdge(edge.src, edge.dst, edgeOptions, edge.id);
        });

        // call dagre layouter
        dagre.layout(dagreGraph, {debugTiming: this._options.printTimes});

        // store layout information in layout graph
        _.forEach(graph.nodes(), (node: LayoutNode) => {
            const dagreNode = dagreGraph.node(node.id);
            const box = new Box(dagreNode.x, dagreNode.y, dagreNode.width, dagreNode.height, true);
            node.updatePosition(box.topLeft());
        });
        _.forEach(graph.edges(), (edge: LayoutEdge) => {
            const dagreEdge = dagreGraph.edge(edge.src, edge.dst, edge.id);
            _.forEach(dagreEdge.points, point => {
                edge.points.push(new Vector(point.x, point.y));
            });
        });
    }

    graphOptions(): object {
        return {
            ranker: this._options.ranker,
            ranksep: this._options.targetEdgeLength,
            nodesep: this._options.spaceBetweenNodes,
        }
    }
}
