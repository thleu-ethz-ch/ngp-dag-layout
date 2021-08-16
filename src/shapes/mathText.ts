import Color from "../renderer/color";
import SimpleShape from "./simpleShape";
import Size from "../geometry/size";

export default class MathText extends SimpleShape {
    public svg: HTMLElement;

    private static _isLoaded: boolean = false;
    public color: Color;

    constructor(reference: any, x: number, y: number, text, color: Color = Color.BLACK) {
        const svg = MathText._getSvg(text);
        const size = MathText._getSize(svg);
        super(reference, x, y, size.width, size.height);
        this.svg = svg;
        this.color = color;
    }

    private static _getSize(svg): Size {
        document.body.append(svg);
        const size = svg.getBoundingClientRect();
        svg.remove();
        return {
            width: size.width,
            height: size.height,
        };
    }

    private static _getSvg(text) {
        return globalThis.MathJax.tex2svg(text).firstChild;
    }

    public static load(): Promise<void> {
        if (MathText._isLoaded) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.onload = () => {
                MathText._isLoaded = true;
                resolve();
            }
            script.onerror = reject;
            script.async = true;
            script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
            document.head.appendChild(script);
        });
    }
}
