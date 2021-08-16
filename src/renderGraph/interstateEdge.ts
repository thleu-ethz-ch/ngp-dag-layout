import RenderEdge from "./renderEdge";
import Color from "../renderer/color";

export default class InterstateEdge extends RenderEdge {
    label(): string {
        return this.attributes.label || "";
    }
    color(): Color {
        return Color.fromNumber(0xBECBD7);
    }
}
