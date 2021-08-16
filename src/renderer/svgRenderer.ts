import * as _ from "lodash";
import RenderGraph from "../renderGraph/renderGraph";
import Renderer from "./renderer";
import SvgContainer from "./svgContainer";
import Shape from "../shapes/shape";
import Size from "../geometry/size";
import Vector from "../geometry/vector";

export default class SvgRenderer extends Renderer {
    protected _container: SvgContainer;
    private readonly _weightExponent: number;
    private readonly _friction: number;

    constructor(domContainer) {
        super();
        this._weightExponent = 2;
        this._friction = 0.999;
        this._container = new SvgContainer(domContainer);
        document.addEventListener("keydown", (e) => {
            if (e.ctrlKey && e.key === "s") {
                e.preventDefault();
                let fileName = prompt("Save as:", "screenshot");
                if (fileName !== null && fileName !== "") {
                    if (!fileName.endsWith(".svg")) {
                        fileName += ".svg";
                    }
                    this._container.saveSvg(fileName);
                }
            }
        });
        const history = [];
        let isMouseDown = false;
        let x, y, mouseDownX, mouseDownY, mouseDownTopLeft;
        let v = new Vector(0, 0);
        document.addEventListener("mousedown", (e) => {
            isMouseDown = true;
            mouseDownX = e.clientX;
            mouseDownY = e.clientY;
            mouseDownTopLeft = this._container.getContentTopLeft();
            v = new Vector(0, 0);
        });
        document.addEventListener("mouseup", (e) => {
            const now = performance.now();
            isMouseDown = false;
            if (history.length < 2) {
                return;
            }
            v = new Vector(0, 0);
            let divisor = 0;
            for (let i = 1; i <= Math.min(10, history.length - 1); ++i) {
                let index = history.length - i - 1;
                let element = history[index];
                let nextElement = history[index + 1];
                if (now - nextElement[0] > 100) {
                    break;
                }
                const multiplier = 1 / Math.pow(i, this._weightExponent);
                const diff = (nextElement[1].clone()).sub(element[1].clone()).multiplyScalar((1 / (nextElement[0] - element[0])) * multiplier);
                divisor += multiplier;
                v.add(diff);
            }
            v.multiplyScalar(1 / divisor);
            v = this._container.toWorld(v);
            history.length = 0;
        });
        document.addEventListener("mousemove", (e) => {
            const now = performance.now();
            x = e.clientX;
            y = e.clientY;
            if (isMouseDown) {
                history.push([now, new Vector(x, y)]);
                if (history.length === 100) {
                    history.splice(0, 89);
                }
            }
        });
        document.addEventListener("wheel", (e) => {
            const mouse = new Vector(e.clientX, e.clientY)
            const worldMouseBefore = this._container.toWorld(mouse.clone());
            this._container.setZoom(this._container.getZoom() * (1 + e.deltaY * -0.002));
            const worldMouseAfter = this._container.toWorld(mouse.clone());
            this._container.translate(worldMouseAfter.sub(worldMouseBefore).invert());
        });
        let prevTime = performance.now();
        const step = () => {
            const now = performance.now();
            if (v.length() > 0.1) {
                this._container.translate(v.clone().multiplyScalar(now - prevTime).invert());
                v.multiplyScalar(Math.pow(this._friction, now - prevTime));
            } else if (isMouseDown) {
                const newCenter = this._container.getContentTopLeft();
                this._container.translate(newCenter.sub(mouseDownTopLeft).add(this._container.toWorld(new Vector(x - mouseDownX, y - mouseDownY).invert())));
            }
            prevTime = now;
            window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }

    protected _render(graph: RenderGraph): void {
        this._container.removeChildren();
        const shapes = this._getShapesForGraph(graph);
        _.forEach(shapes, (shape: Shape) => {
            this._container.addChild(shape);
        });
        _.forEach(this._additionalShapes, (shape: Shape) => {
            this._container.addChild(shape);
        });
        const box = this._container.contentBoundingBox();
        const zoom = Math.min(1, this._container.width() / box.width, this._container.height() / box.height);
        this._container.setZoom(zoom, false);
        this._container.translate(new Vector((box.width - this._container.width() / zoom) / 2, (box.height - this._container.height() / zoom) / 2));
        this._container.render();
    }

    getTextSize(text: string, fontSize: number, fontFamily: string): Size {
        const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
        node.appendChild(document.createTextNode(text));
        node.setAttribute('font-family', fontFamily);
        node.setAttribute('font-size', fontSize.toString());
        (<SvgContainer>this._container).addElement(node);
        const size = node.getBBox();
        node.remove();
        return size;
    }
}
