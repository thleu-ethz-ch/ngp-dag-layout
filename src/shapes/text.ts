import Color from "../renderer/color";
import Renderer from "../renderer/renderer";
import SimpleShape from "./simpleShape";

export default class Text extends SimpleShape {
    public text: string;
    public color: Color;
    public fontSize: number;
    public fontFamily: string;

    constructor(renderer: Renderer, x: number, y: number, text, fontSize = 12, color: Color = Color.BLACK, fontFamily: string = 'Arial') {
        const size = renderer.getTextSize(text, fontSize, fontFamily);
        super(null, x, y, size.width, size.height);
        this.text = text;
        this.color = color;
        this.fontSize = fontSize;
        this.fontFamily = fontFamily;
    }
}
