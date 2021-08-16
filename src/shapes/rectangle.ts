import Color from "../renderer/color";
import SimpleShape from "./simpleShape";

export default class Rectangle extends SimpleShape {
    zIndex = null;

    public backgroundColor: Color;
    public borderColor: Color;
    public lineStyle: "solid" | "dashed";

    constructor(reference: object, x: number, y: number, width: number, height: number, backgroundColor = new Color(255, 255, 255), borderColor = new Color(0, 0, 0), lineStyle: "solid" | "dashed" = "solid") {
        super(reference, x, y, width, height);
        this.backgroundColor = backgroundColor;
        this.borderColor = borderColor;
        this.lineStyle = lineStyle;
    }
}