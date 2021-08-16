import RenderNode from "./renderNode";
import Color from "../renderer/color";

export default class GenericNode extends RenderNode {
    constructor(label: string = "", backgroundColor: Color = Color.WHITE, borderColor: Color = Color.BLACK) {
        super("GenericNode", label, backgroundColor, borderColor);
    }
}
