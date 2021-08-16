import AbstractPolygon from "./abstractPolygon";

export default class Octagon extends AbstractPolygon {
    getPath(): Array<number> {
        const octSeg = this.height / 3.0;
        return [
            this.x, this.y + octSeg,
            this.x + octSeg, this.y,
            this.x + this.width - octSeg, this.y,
            this.x + this.width, this.y + octSeg,
            this.x + this.width, this.y + 2 * octSeg,
            this.x + this.width - octSeg, this.y + this.height,
            this.x + octSeg, this.y + this.height,
            this.x, this.y + 2 * octSeg,
        ];
    }
}
