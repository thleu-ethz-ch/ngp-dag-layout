import Color from "../renderer/color";
import SimpleShape from "./simpleShape";

export default class Circle extends SimpleShape {
    public backgroundColor: Color;
    public borderColor: Color;

    constructor(reference: object, x: number, y: number, radius: number, backgroundColor: Color = Color.WHITE, borderColor: Color = Color.BLACK) {
        super(reference, x - radius, y - radius, radius * 2, radius * 2);
        this.backgroundColor = backgroundColor;
        this.borderColor = borderColor;
    }
}
