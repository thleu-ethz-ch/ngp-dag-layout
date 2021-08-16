import {EPSILON} from "../util/constants";
import * as _ from "lodash";
import Box from "../geometry/box";
import Edge from "../graph/edge";
import LayoutBundle from "./layoutBundle";
import LayoutGraph from "./layoutGraph";
import LayoutNode from "./layoutNode";
import Segment from "../geometry/segment";
import Vector from "../geometry/vector";

export default class LayoutEdge extends Edge<LayoutGraph, LayoutNode> {
    public srcConnector: string;
    public dstConnector: string;
    public points: Array<Vector> = [];
    public srcBundle: LayoutBundle = null;
    public dstBundle: LayoutBundle = null;
    public isReplica: boolean = false;

    constructor(src: number, dst: number, srcConnector: string = null, dstConnector: string = null) {
        super(src, dst);
        this.srcConnector = srcConnector;
        this.dstConnector = dstConnector;
    }

    translate(x: number, y: number): void {
        _.forEach(this.points, (point) => {
            point.x += x;
            point.y += y;
        });
    }

    boundingBox(): Box {
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        _.forEach(this.points, (point: Vector) => {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        });
        return new Box(minX, minY, maxX - minX, maxY - minY);
    }

    rawSegments(): Array<Segment> {
        const segments = [];
        for (let i = 1; i < this.points.length; ++i) {
            segments.push(new Segment(_.clone(this.points[i - 1]), _.clone(this.points[i])));
        }
        return segments;
    }

    segments(): Array<Segment> {
        const segments = [];
        let start = this.points[0].clone();
        let end = this.points[1].clone();
        for (let i = 2; i < this.points.length; ++i) {
            const deltaXPrev = end.x - start.x;
            const deltaYPrev = end.y - start.y;
            const deltaXNext = this.points[i].x - end.x;
            const deltaYNext = this.points[i].y - end.y;
            if (Math.abs(deltaXPrev * deltaYNext - deltaXNext * deltaYPrev) < EPSILON) {
                end = this.points[i].clone();
            } else {
                segments.push(new Segment(start, end));
                start = end.clone();
                end = this.points[i].clone();
            }
        }
        segments.push(new Segment(start.clone(), end.clone()));
        return segments;
    }
}
