import RenderNode from "./renderNode";
import Color from "../renderer/color";

export default class GenericContainerNode extends RenderNode {
    public readonly childPadding: number = 30;
    constructor(label: string = "", backgroundColor: Color = Color.WHITE, borderColor: Color = Color.BLACK) {
        super("GenericContainerNode", label, backgroundColor, borderColor);
    }
}
