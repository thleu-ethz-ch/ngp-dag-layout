import * as _ from "lodash";
import Box from "../geometry/box";
import Vector from "../geometry/vector";

export default abstract class Shape {
    public reference = null;

    public x: number = 0;
    public y: number = 0;

    protected constructor(reference: object, x: number, y: number) {
        this.reference = reference;
        this.x = x;
        this.y = y;
    }

    offset(x: number, y: number): void {
        this.x += x;
        this.y += y;
    }

    position(): Vector {
        return new Vector(this.x, this.y);
    }

    clone(): Shape {
        const clone = new (this.constructor as { new() })();
        _.assign(clone, <Shape>this);
        return clone;
    }

    intersects(otherShape: Shape) {
        return this.boundingBox().intersects(otherShape.boundingBox());
    }

    abstract boundingBox(): Box;
}
