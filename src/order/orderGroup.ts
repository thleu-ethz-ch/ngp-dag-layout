import * as _ from "lodash";
import Edge from "../graph/edge";
import Graph from "../graph/graph";
import Node from "../graph/node";
import OrderNode from "./orderNode";
import OrderRank from "./orderRank";
import {inPlaceSort} from "fast-sort";

export default class OrderGroup extends Node<Graph<any, any>, Edge<any, any>> {
    public readonly reference: any;
    public nodes: Array<OrderNode> = [];

    public order: Array<number> = [];
    public position: number = 0;
    public rank: OrderRank;
    public x: number;
    public y: number;
    public index: number = 0; // the index within the rank, used as an id, other than position this does not change

    constructor(reference: any, label: string = null) {
        super(label);
        this.reference = reference;
    }

    addNode(node: OrderNode, id: number = null): number {
        this.nodes.push(node);
        node.group = this;
        node.rank = this.rank.rank;
        if (id === null || this.rank.orderGraph.node(id) === undefined) {
            id = this.rank.orderGraph.addNode(node, id);
        }
        return id;
    }

    clear(): void {
        this.nodes.length = 0;
    }

    orderNodes(): void {
        const nodes = _.map(this.nodes, (node: OrderNode, n: number) => {
            return [n, node.position];
        });
        inPlaceSort(nodes).asc(node => node[1]);
        this.order = _.map(nodes, "0");
    }

    orderNodesByX(): void {
        const nodes = _.map(this.nodes, (node: OrderNode, n: number) => {
            return [n, node.x];
        });
        inPlaceSort(nodes).asc(node => node[1]);
        this.order = _.map(nodes, "0");
    }

    orderedNodes(): Array<OrderNode> {
        const nodes = [];
        if (this.order.length !== this.nodes.length) {
            this.orderNodes();
        }
        _.forEach(this.order, (pos: number) => {
            nodes.push(this.nodes[pos]);
        });
        return nodes;
    }
}
