import * as _ from "lodash";
import Box from "../geometry/box";
import LayoutBundle from "./layoutBundle";
import LayoutConnector from "./layoutConnector";
import LayoutEdge from "./layoutEdge";
import LayoutGraph from "./layoutGraph";
import LevelNode from "../levelGraph/levelNode";
import Node from "../graph/node";
import Size from "../geometry/size";
import Vector from "../geometry/vector";

export default class LayoutNode extends Node<LayoutGraph, LayoutEdge> {
    public inConnectors: Array<LayoutConnector> = [];
    public outConnectors: Array<LayoutConnector> = [];
    public inConnectorBundles: Array<LayoutBundle> = [];
    public outConnectorBundles: Array<LayoutBundle> = [];

    public x: number = 0;
    public y: number = 0;
    public width: number = 0;
    public height: number = 0;

    public selfLoop: LayoutEdge = null;

    public isScopeNode: boolean = false;
    public hasScopedConnectors: boolean = false;
    public rank: number = null; // global rank (level) of the node
    public rankSpan: number = 1;
    public index: number = 0;
    public isVirtual: boolean = false;

    public levelNodes: Array<LevelNode> = [];

    public childGraphs: Array<LayoutGraph> = [];

    public readonly padding: number;
    public readonly connectorPadding: number;
    public readonly isBundle: boolean;

    private readonly _inConnectors: Map<string, LayoutConnector> = new Map();
    private readonly _outConnectors: Map<string, LayoutConnector> = new Map();

    constructor(size: Size = null, padding: number = 0, connectorPadding: number = 0, isVirtual: boolean = false, isBundle: boolean = false, addConnectors: boolean = true) {
        super();
        if (size !== null) {
            this.width = size.width;
            this.height = size.height;
        }
        this.padding = padding;
        this.connectorPadding = connectorPadding;
        this.isVirtual = isVirtual;
        this.isBundle = isBundle;
        if (addConnectors && (isVirtual || isBundle)) {
            this.addConnector("IN", null);
            this.addConnector("OUT", null);
        }
    }

    numInConnectors() {
        return this.inConnectors.length;
    }

    numOutConnectors() {
        return this.outConnectors.length;
    }

    connectors() {
        return _.concat(this.inConnectors, this.outConnectors);
    }

    connector(type: "IN" | "OUT", name: string): LayoutConnector {
        if (type === "IN") {
            return this._inConnectors.get(name);
        } else {
            return this._outConnectors.get(name);
        }
    }

    connectorIndex(type: "IN" | "OUT", name: string): number {
        const connectors = (type === "IN" ? this.inConnectors : this.outConnectors);
        for (let i = 0; i < connectors.length; ++i) {
            if (connectors[i].name === name) {
                return i;
            }
        }
        return -1;
    }

    addConnector(type: "IN" | "OUT", name: string, temporary: boolean = false): void {
        const connector = new LayoutConnector(this, type, name, temporary);
        if (type === "IN") {
            this._inConnectors.set(name, connector);
            this.inConnectors.push(connector);
        } else {
            this._outConnectors.set(name, connector);
            this.outConnectors.push(connector);
        }
    }

    removeConnector(type: "IN" | "OUT", name: string): void {
        if (type === "IN") {
            const connector = this._inConnectors.get(name);
            this._inConnectors.delete(name);
            _.pull(this.inConnectors, connector);
        } else {
            const connector = this._outConnectors.get(name);
            this._outConnectors.delete(name);
            _.pull(this.outConnectors, connector);
        }
    }

    translate(x: number, y: number): void {
        this.x += x;
        this.y += y;
        if (this.selfLoop !== null) {
            this.selfLoop.translate(x, y);
        }        _.forEach(this.childGraphs, (childGraph: LayoutGraph) => {
            childGraph.translateElements(x, y);
        });
        _.forEach(this.inConnectors, (connector: LayoutConnector) => {
            connector.translate(x, y);
        });
        _.forEach(this.outConnectors, (connector: LayoutConnector) => {
            connector.translate(x, y);
        });
        _.forEach(this.inConnectorBundles, (inBundle: LayoutBundle) => {
            inBundle.x += x;
            inBundle.y += y;
        });
        _.forEach(this.outConnectorBundles, (outBundle: LayoutBundle) => {
            outBundle.x += x;
            outBundle.y += y;
        });
    }

    translateWithoutChildren(x: number, y: number): void {
        this.x += x;
        this.y += y;
        _.forEach(this.inConnectors, (connector: LayoutConnector) => {
            connector.translate(x, y);
        });
        _.forEach(this.outConnectors, (connector: LayoutConnector) => {
            connector.translate(x, y);
        });
    }

    setPosition(position: Vector): void {
        this.x = position.x;
        this.y = position.y;
    }

    updatePosition(position: Vector): void {
        const prevX = this.x;
        const prevY = this.y;
        const offsetX = position.x - prevX;
        const offsetY = position.y - prevY;
        this.x = position.x;
        this.y = position.y;
        _.forEach(this.childGraphs, (childGraph: LayoutGraph) => {
            childGraph.translateElements(offsetX, offsetY);
        });
    }

    setSize(size: Size): void {
        this.width = size.width;
        this.height = size.height;
    }

    updateSize(size: Size): void {
        this.width = Math.max(this.width, size.width);
        this.height = Math.max(this.height, size.height);
        _.forEach(this.levelNodes, (levelNode: LevelNode) => {
            levelNode.width = this.width;
        })
    }

    setWidth(width: number): void {
        this.width = width;
    }

    position(): Vector {
        return (new Vector(this.x, this.y));
    }

    size(): Size {
        return {
            width: this.width,
            height: this.height,
        };
    }

    boundingBox(): Box {
        return new Box(this.x, this.y, this.width, this.height);
    }

    offsetRank(offset: number): void {
        this.rank += offset;
        if (offset !== 0) {
            _.forEach(this.childGraphs, (childGraph: LayoutGraph) => {
                childGraph.offsetRank(offset);
            });
            _.forEach(this.levelNodes, (levelNode: LevelNode, r: number) => {
                levelNode.rank = this.rank + r;
            });
        }
    }

    updateRank(newRank: number): void {
        if (this.rank !== newRank) {
            this.offsetRank(newRank - this.rank);
        }
    }
}
