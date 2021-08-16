import AbstractPolygon from "./abstractPolygon";
import Color from "../renderer/color";

export default class Polygon extends AbstractPolygon
{
    private readonly _points: Array<number>;

    constructor(reference: object, points: Array<number>, backgroundColor: Color = Color.WHITE, borderColor: Color = Color.BLACK) {
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (let i = 0; i < points.length; i += 2) {
            minX = Math.min(minX, points[i]);
            maxX = Math.max(maxX, points[i]);
            minY = Math.min(minY, points[i + 1]);
            maxY = Math.max(minY, points[i + 1]);
        }
        super(reference, minX, minY, maxX - minX, maxY - minY, backgroundColor, borderColor);
        this._points = points;
    }

    getPath(): Array<number> {
        return this._points;
    }
}