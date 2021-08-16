import * as _ from "lodash";
import Box from "../geometry/box";
import Shape from "./shape";

export default class ShapeCollection extends Shape {
    private _shapes: Array<Shape> = [];

    addShape(shape: Shape) {
        this._shapes.push(shape);
    }

    boundingBox(): Box {
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        _.forEach(this._shapes, (shape: Shape) => {
            const childBox = shape.boundingBox();
            minX = Math.min(minX, childBox.x);
            maxX = Math.max(maxX, childBox.x + childBox.width);
            minY = Math.min(minY, childBox.y);
            maxY = Math.max(maxY, childBox.y + childBox.height);
        });
        return new Box(this.x + minX, this.x + maxX, this.y + maxX - minX, this.y + maxY - minY);
    }

    getShapes(): Array<Shape> {
        return this._shapes;
    }
}