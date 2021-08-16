import Color from "../renderer/color";
import Polygon from "./polygon";
import ShapeCollection from "./shapeCollection";

export default class FoldedCornerRectangle extends ShapeCollection {
    public backgroundColor: Color;
    public borderColor: Color;
    public width: number;
    public height: number;

    constructor(reference: object, x: number, y: number, width: number, height: number, backgroundColor: Color = Color.WHITE, borderColor: Color = Color.BLACK) {
        super(reference, x, y);
        this.width = width;
        this.height = height;
        this.backgroundColor = backgroundColor;
        this.borderColor = borderColor;
        const cornerLength = this.height / 6;
        this.addShape(new Polygon(this.reference, [
            this.x, this.y,
            this.x, this.y + this.height,
            this.x + this.width, this.y + this.height,
            this.x + this.width, this.y + cornerLength,
            this.x + this.width - cornerLength, this.y,
        ], this.backgroundColor, this.borderColor));
        this.addShape(new Polygon(this.reference, [
            this.x + this.width - cornerLength, this.y,
            this.x + this.width - cornerLength, this.y + cornerLength,
            this.x + this.width, this.y + cornerLength,
        ], this.backgroundColor, this.borderColor));
    }
}
