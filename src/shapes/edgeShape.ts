import * as _ from "lodash";
import Box from "../geometry/box";
import Color from "../renderer/color";
import Shape from "./shape";
import Vector from "../geometry/vector";

export default class EdgeShape extends Shape {
    private _points: Array<Vector>;
    public color: Color;
    public lineWidth: number;
    public lineStyle: "solid" | "dashed";

    constructor(reference: object, points: Array<Vector>, color: Color = Color.BLACK, lineWidth: number = 1, lineStyle: "solid" | "dashed" = "solid") {
        super(reference, 0, 0);
        this._points = _.cloneDeep(points);
        this.color = color;
        this.lineWidth = lineWidth;
        this.lineStyle = lineStyle;
    }

    boundingBox(): Box {
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        _.forEach(this._points, (point: Vector) => {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        });
        return new Box(minX, minY, maxX - minX, maxY - minY);
    }

    clear(): void {
        this._points = [];
    }

    addPoint(point: Vector): void {
        this._points.push(point.clone());
    }

    points(): Array<Vector> {
        return _.cloneDeep(this._points);
    }

    offset(x: number, y: number): void {
        _.forEach(this._points, (point: Vector) => {
            point.x += x;
            point.y += y;
        });
    }
}
