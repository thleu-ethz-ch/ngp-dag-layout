import * as _ from "lodash";
import AccessNode from "../renderGraph/accessNode";
import Box from "../geometry/box";
import Color from "./color";
import DownwardTrapezoid from "../shapes/downwardTrapezoid";
import EdgeShape from "../shapes/edgeShape";
import Ellipse from "../shapes/ellipse";
import FoldedCornerRectangle from "../shapes/foldedCornerRectangle";
import GenericContainerNode from "../renderGraph/genericContainerNode";
import GenericNode from "../renderGraph/genericNode";
import LayoutAnalysis from "../bench/layoutAnalysis";
import LayoutGraph from "../layoutGraph/layoutGraph";
import Layouter from "../layouter/layouter";
import Loader from "../parse/loader";
import Octagon from "../shapes/octagon";
import Rectangle from "../shapes/rectangle";
import RenderConnector from "../renderGraph/renderConnector";
import RenderEdge from "../renderGraph/renderEdge";
import RenderGraph from "../renderGraph/renderGraph";
import RenderNode from "../renderGraph/renderNode";
import RendererContainer from "./rendererContainer";
import Shape from "../shapes/shape";
import Size from "../geometry/size";
import Tasklet from "../renderGraph/tasklet";
import Text from "../shapes/text";
import UpwardTrapezoid from "../shapes/upwardTrapezoid";
import Vector from "../geometry/vector";
import SugiyamaLayouter from "../layouter/sugiyamaLayouter";

export default abstract class Renderer {
    protected _container: RendererContainer;
    protected _additionalShapes: Array<Shape> = [];

    protected abstract _render(graph: RenderGraph, view?: any): void;

    public abstract getTextSize(text: string, fontSize: number, fontFamily: string): Size;

    show(layouter: Layouter, name: string, validate: boolean = false, printCost: boolean = false, loadFunction: (name: string, basePath?: string) => Promise<RenderGraph> = Loader.loadXhr): void {
        loadFunction(name).then((graph: RenderGraph) => {
            this.layoutAndRender(graph, layouter, validate, printCost);
        });
    }

    public layoutAndRender(graph: RenderGraph, layouter: Layouter = new SugiyamaLayouter(), validate: boolean = false, printCost: boolean = false) {
        this.setSizes(graph);
        layouter.layout(graph).then((layout: LayoutGraph) => {
            if (validate) {
                const layoutAnalysis = new LayoutAnalysis(layout);
                if (layoutAnalysis.validate()) {
                    console.log("Layout satisfies constraints.");
                } else {
                    console.log("Layout violates constraints.");
                }
            }
            if (printCost) {
                const layoutAnalysis = new LayoutAnalysis(layout);
                console.log("Weighted cost: " + layoutAnalysis.cost(true).toFixed(0));
            }
            this._render(graph);
        });
    }

    public setSizes(graph: RenderGraph) {
        // set node sizes
        _.forEach(graph.allNodes(), (node: RenderNode) => {
            node.labelSize = this.labelSize(node);
            node.updateSize(node.labelSize);
        });
        // set edge label sizes
        _.forEach(graph.allEdges(), (edge: RenderEdge) => {
            edge.labelSize = this.edgeLabelSize(edge);
        });
    }

    public labelSize(node: RenderNode): Size {
        const textBox = (new Text(this, 0, 0, node.label(), node.labelFontSize)).boundingBox();
        return {
            width: textBox.width + 2 * node.labelPaddingX,
            height: textBox.height + 2 * node.labelPaddingY,
        }
    }

    public edgeLabelSize(edge: RenderEdge): Size {
        return (new Text(this, 0, 0, edge.label(), edge.labelFontSize)).boundingBox().size();
    }

    /**
     * Adds an offset to center the label within the node (if necessary).
     */
    private _labelPosition(node: RenderNode): Vector {
        const labelSize = node.labelSize;
        const labelBox = new Box(
            node.x + node.labelPaddingX,
            node.y + node.labelPaddingY,
            labelSize.width,
            labelSize.height,
        );
        return labelBox.centerIn(node.boundingBox()).topLeft();
    }

    protected _getShapesForGraph(graph: RenderGraph): Array<Shape> {
        const shapes = [];
        _.forEach(graph.nodes(), (node: RenderNode) => {
            _.forEach(this._getShapesForNode(node), shape => shapes.push(shape));
        });
        _.forEach(graph.edges(), (edge: RenderEdge) => {
            _.forEach(this._getShapesForEdge(edge), shape => shapes.push(shape));
        });
        return shapes;
    }

    private _getShapesForNode(node: RenderNode): Array<Shape> {
        const shapes = [];
        switch (node.type()) {
            case "AccessNode":
            case "GenericNode":
                shapes.push(new Ellipse(node, node.x, node.y, node.width, node.height, node.backgroundColor || Color.BLACK, node.borderColor || Color.BLACK));
                shapes.push(new Text(this, this._labelPosition(node).x, this._labelPosition(node).y, node.label()));
                break;
            case "LibraryNode":
                shapes.push(new FoldedCornerRectangle(node, node.x, node.y, node.width, node.height));
                shapes.push(new Text(this, this._labelPosition(node).x, this._labelPosition(node).y, node.label()))
                break;
            case "NestedSDFG":
                shapes.push(new Rectangle(node, node.x, node.y, node.width, node.height));
                break;
            case "SDFGState":
                const color = new Color(0xDE, 0xEB, 0xF7);
                shapes.push(new Rectangle(node, node.x, node.y, node.width, node.height, color, color));
                shapes.push(new Text(this, node.x + 5, node.y + 5, node.label()));
                break;
            case "Tasklet":
                shapes.push(new Octagon(node, node.x, node.y, node.width, node.height));
                shapes.push(new Text(this, this._labelPosition(node).x, this._labelPosition(node).y, node.label()));
                break;
            case "GenericContainerNode":
                shapes.push(new Rectangle(node, node.x, node.y, node.width, node.height, node.backgroundColor, node.borderColor));
                shapes.push(new Text(this, node.x + 5, node.y + 5, node.label()));
                break;
        }
        if (node.type().endsWith("Entry")) {
            shapes.push(new UpwardTrapezoid(node, node.x, node.y, node.width, node.height));
            shapes.push(new Text(this, this._labelPosition(node).x, this._labelPosition(node).y, node.label()));
        }
        if (node.type().endsWith("Exit")) {
            shapes.push(new DownwardTrapezoid(node, node.x, node.y, node.width, node.height));
            shapes.push(new Text(this, this._labelPosition(node).x, this._labelPosition(node).y, node.label()));
        }

        // add child graph shapes
        if (node.childGraph !== null) {
            _.forEach(this._getShapesForGraph(node.childGraph), (shape: Shape) => {
                shapes.push(shape);
            });
        }

        // add connector shapes
        const backgroundColorUnscoped = Color.fromNumber(0xf0fdff);
        const backgroundColorScoped = Color.fromNumber(0xc1dfe6).fade(0.56);
        const borderColorUnscoped = Color.BLACK;
        const borderColorScoped = Color.BLACK.fade(0.56);
        _.forEach(node.inConnectors, (connector: RenderConnector) => {
            const backgroundColor = (connector.name.startsWith('IN_') ? backgroundColorScoped : backgroundColorUnscoped);
            const borderColor = (connector.name.startsWith('IN_') ? borderColorScoped : borderColorUnscoped);
            shapes.push(new Ellipse(connector, connector.x, connector.y, connector.width, connector.height, backgroundColor, borderColor));
        });
        _.forEach(node.outConnectors, (connector: RenderConnector) => {
            const backgroundColor = (connector.name.startsWith('OUT_') ? backgroundColorScoped : backgroundColorUnscoped);
            const borderColor = (connector.name.startsWith('OUT_') ? borderColorScoped : borderColorUnscoped);
            shapes.push(new Ellipse(connector, connector.x, connector.y, connector.width, connector.height, backgroundColor, borderColor));
        });
        return shapes;
    }

    private _getShapesForEdge(edge: RenderEdge): Array<Shape> {
        const shapes: Array<Shape> = [new EdgeShape(edge, _.clone(edge.points), edge.color(), edge.lineWidth(), edge.lineStyle())];
        if (edge.labelX) {
            const labelSize = this.edgeLabelSize(edge);
            const labelBackground = new Rectangle(null, edge.labelX - 3, edge.labelY - 3, labelSize.width + 6, labelSize.height + 6, Color.WHITE.fade(0.8), Color.TRANSPARENT);
            labelBackground.zIndex = 2;
            shapes.push(new Text(this, edge.labelX, edge.labelY, edge.label(), edge.labelFontSize, Color.fromNumber(0x666666)));
        }
        return shapes;
    }
}
