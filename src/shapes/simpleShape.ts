import Box from "../geometry/box";
import EdgeShape from "./edgeShape";
import Shape from "./shape";

export default abstract class SimpleShape extends Shape {
    public width: number;
    public height: number;

    protected constructor(reference: object, x: number, y: number, width: number, height: number) {
        super(reference, x, y);
        this.width = width;
        this.height = height;
    }

    intersects(otherShape: Shape): boolean {
        if (otherShape instanceof EdgeShape) {
            return otherShape.intersects(this);
        }
        return super.intersects(otherShape);
    }

    boundingBox(): Box {
        return new Box(this.x, this.y, this.width, this.height);
    }
}
