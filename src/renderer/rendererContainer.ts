import Shape from "../shapes/shape";
import * as _ from "lodash";
import Box from "../geometry/box";

export default abstract class RendererContainer
{
    protected _children: Array<Shape> = [];

    public addChild(shape: Shape) {
        this._children.push(shape);
    }

    public removeChildren() {
        this._children.length = 0;
    }

    public render() {
        _.forEach(this._children, (shape: Shape) => {
            this._renderShape(shape);
        });
    }

    public contentBoundingBox() {
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        _.forEach(this._children, (shape: Shape) => {
            const box = shape.boundingBox();
            minX = Math.min(minX, box.x);
            maxX = Math.max(maxX, box.x + box.width);
            minY = Math.min(minY, box.y);
            maxY = Math.max(maxY, box.y + box.height);
        });
        _.forEach(this._children, (shape: Shape) => {
            shape.offset(-minX, -minY);
        });
        return new Box(0, 0, maxX - minX, maxY - minY);
    }

    protected abstract _renderShape(shape: Shape): void;
}