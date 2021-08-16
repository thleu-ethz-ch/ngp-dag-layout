import Color from "../renderer/color";
import SimpleShape from "./simpleShape";

export default class Arc extends SimpleShape {
    public radius: number;
    public startAngle: number;
    public endAngle: number;
    public backgroundColor: Color;
    public borderColor: Color;
    public lineStyle: "solid" | "dashed";

    constructor(reference: object, x: number, y: number, radius: number, startAngle: number, endAngle: number, backgroundColor: Color = Color.TRANSPARENT, borderColor: Color = Color.BLACK, lineStyle: "solid" | "dashed" = "solid") {
        super(reference, x - radius, y - radius, radius * 2, radius * 2);
        this.radius = radius;
        this.startAngle = startAngle;
        this.endAngle = endAngle;
        this.backgroundColor = backgroundColor;
        this.borderColor = borderColor;
        this.lineStyle = lineStyle;
    }
}
