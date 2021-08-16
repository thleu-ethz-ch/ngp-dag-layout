import Edge from "../graph/edge";
import LayoutNode from "../layoutGraph/layoutNode";
import LevelGraph from "./levelGraph";
import Node from "../graph/node";

export default class LevelNode extends Node<LevelGraph, Edge<any, any>> {
    public rank: number;
    public position: number;
    public width: number;
    public x: number;

    public layoutNode: LayoutNode;
    public isFirst: boolean;
    public isLast: boolean;

    constructor(layoutNode: LayoutNode, rank: number, width: number = null, isFirst: boolean = false) {
        super();
        this.layoutNode = layoutNode;
        this.rank = rank;
        this.width = width;
        this.isFirst = isFirst;
    }
}
