import Node from "../graph/node";
import OrderGroup from "./orderGroup";

export default class OrderNode extends Node<any, any>
{
    public reference: any;
    public group: OrderGroup;
    public position: number = 0;
    public rank: number = 0;
    public x: number;
    public y: number;
    public readonly isVirtual: boolean;
    public readonly isIntranode: boolean;

    constructor(reference: any, isVirtual: boolean, isIntranode: boolean, label: string = "") {
        super(label);
        this.reference = reference;
        this.isVirtual = isVirtual;
        this.isIntranode = isIntranode;
    }
}
