import Color from "../renderer/color";
import SimpleShape from "./simpleShape";

export default class Ellipse extends SimpleShape {
    public backgroundColor: Color;
    public borderColor: Color;

    constructor(reference: object, x: number, y: number, width: number, height: number, backgroundColor: Color = Color.WHITE, borderColor: Color = Color.BLACK) {
        super(reference, x, y, width, height);
        this.backgroundColor = backgroundColor;
        this.borderColor = borderColor;
    }
}
