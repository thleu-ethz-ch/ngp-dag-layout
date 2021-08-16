import {Viewport} from "pixi-viewport";
import * as _ from "lodash";
import * as PIXI from "pixi.js";
import PixiContainer from "./pixiContainer";
import RenderGraph from "../renderGraph/renderGraph";
import Renderer from "./renderer";
import Shape from "../shapes/shape";
import Size from "../geometry/size";

export default class PixiRenderer extends Renderer {
    private readonly _app;
    private readonly _viewport;
    protected _container: PixiContainer;

    constructor(domContainer) {
        super();
        this._app = new PIXI.Application({
            width: domContainer.clientWidth,
            height: domContainer.clientHeight,
            antialias: true,
        });
        this._app.renderer.backgroundColor = 0xFFFFFF;
        domContainer.appendChild(this._app.view);

        this._viewport = new Viewport({
            screenWidth: domContainer.clientWidth,
            screenHeight: domContainer.clientHeight,
            worldWidth: domContainer.clientWidth,
            worldHeight: domContainer.clientHeight,
            interaction: this._app.renderer.plugins.interaction, // the interaction module is important for wheel to work properly when renderer.view is placed or scaled
        });
        this._app.stage.addChild(this._viewport);

        this._container = new PixiContainer();
        this._viewport.addChild(this._container.pixiContainer);

        this._viewport.interactive = true;

        this._viewport.drag().pinch().wheel().decelerate();

        document.addEventListener("keydown", (e) => {
            if (e.ctrlKey && e.key === "s") {
                e.preventDefault();
                let fileName = prompt("Save as:", "screenshot");
                if (fileName !== null && fileName !== "") {
                    if (!fileName.endsWith(".png")) {
                        fileName += ".png";
                    }
                    this.savePng(fileName);
                }
            }
        });
    }

    /**
     * Adapted from https://www.html5gamedevs.com/topic/31190-saving-pixi-content-to-image/.
     */
    savePng(fileName): void {
        this._app.renderer.extract.canvas(this._viewport.children[0]).toBlob(function (b) {
            const a = document.createElement('a');
            document.body.append(a);
            a.download = fileName;
            a.href = URL.createObjectURL(b);
            a.click();
            a.remove();
        }, 'image/png');
    }

    /**
     * Shows a graph in the designated container.
     * @param graph Graph with layout information for all nodes and edges (x, y, width, height).
     */
    _render(graph: RenderGraph): void {
        this._container.removeChildren();

        const box = graph.boundingBox();
        this._viewport.moveCenter(box.width / 2, box.height / 2);
        this._viewport.setZoom(Math.min(1, this._viewport.worldWidth / box.width, this._viewport.worldHeight / box.height), true);

        const shapes = this._getShapesForGraph(graph);
        _.forEach(shapes, (shape: Shape) => {
            this._container.addChild(shape)
        });
        _.forEach(this._additionalShapes, (shape: Shape) => {
            this._container.addChild(shape)
        });

        this._container.render();
    }

    public getTextSize(text: string, fontSize: number, fontFamily: string): Size {
        const fontStyle = new PIXI.TextStyle({fontFamily: fontFamily, fontSize: fontSize});
        return PIXI.TextMetrics.measureText(text, fontStyle);
    }
}
