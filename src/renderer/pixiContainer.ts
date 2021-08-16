import * as PIXI from "pixi.js";
import {Container, Graphics} from "pixi.js";
import * as _ from "lodash";
import RendererContainer from "./rendererContainer";
import Shape from "../shapes/shape";
import Rectangle from "../shapes/rectangle";
import Circle from "../shapes/circle";
import Ellipse from "../shapes/ellipse";
import Line from "../shapes/line";
import Vector from "../geometry/vector";
import EdgeShape from "../shapes/edgeShape";
import AbstractPolygon from "../shapes/abstractPolygon";
import Text from "../shapes/text";
import ShapeCollection from "../shapes/shapeCollection";

export default class PixiContainer extends RendererContainer
{
    public pixiContainer: Container;

    constructor() {
        super();
        this.pixiContainer = new Container();
    }

    protected _renderShape(shape: Shape) {
        if (shape instanceof Rectangle) {
            const rectangle = new Graphics();
            rectangle.lineStyle(1, shape.borderColor.number(), shape.borderColor.alpha);
            rectangle.beginFill(shape.backgroundColor.number(), shape.backgroundColor.alpha);
            rectangle.drawRect(0, 0, shape.width, shape.height);
            rectangle.endFill();
            rectangle.x = shape.x;
            rectangle.y = shape.y;
            if (shape.zIndex !== null) {
                rectangle.zIndex = shape.zIndex;
            }
            this.pixiContainer.addChild(rectangle);
        } else if (shape instanceof Circle) {
            const circle = new PIXI.Graphics();
            circle.lineStyle(1, shape.borderColor.number(), shape.borderColor.alpha);
            circle.beginFill(shape.backgroundColor.number(), shape.backgroundColor.alpha);
            const box = shape.boundingBox();
            const center = box.center();
            circle.drawCircle(center.x, center.y, shape.width / 2);
            circle.endFill();
            this.pixiContainer.addChild(circle);
        } else if (shape instanceof Ellipse) {
            const ellipse = new PIXI.Graphics();
            ellipse.lineStyle(1, shape.borderColor.number(), shape.borderColor.alpha);
            ellipse.beginFill(shape.backgroundColor.number(), shape.backgroundColor.alpha);
            const box = shape.boundingBox();
            const center = box.center();
            ellipse.drawEllipse(center.x, center.y, shape.width / 2, shape.height / 2);
            ellipse.endFill();
            this.pixiContainer.addChild(ellipse);
        } else if (shape instanceof Line) {
            const line = new Graphics();
            line.lineStyle(shape.lineWidth);
            line.moveTo(shape.x1, shape.y1);
            line.lineTo(shape.x2, shape.y2);
            this.pixiContainer.addChild(line);
        } else if (shape instanceof EdgeShape) {
            let line = new Graphics();
            line.lineStyle(1, shape.color.number(), shape.color.alpha);
            line.moveTo(_.head(shape.points()).x, _.head(shape.points()).y);
            _.forEach(_.tail(shape.points()), (point: Vector) => {
                line.lineTo(point.x, point.y);
            });
            // draw arrow head
            const end = new Vector(_.last(shape.points()).x, _.last(shape.points()).y);
            const dir = end.clone().sub(shape.points()[shape.points().length - 2]);
            const angle = dir.angle();
            const point1 = (new Vector(end.x - 5, end.y + 3)).rotateAround(end, angle);
            line.lineTo(point1.x, point1.y);
            line.moveTo(end.x, end.y);
            const point2 = (new Vector(end.x - 5, end.y - 3)).rotateAround(end, angle);
            line.lineTo(point2.x, point2.y);
            line.zIndex = -1;
            this.pixiContainer.addChild(line);
        } else if (shape instanceof AbstractPolygon) {
            const polygon = new PIXI.Graphics();
            polygon.lineStyle(1, shape.borderColor.number(), shape.borderColor.alpha);
            polygon.beginFill(shape.backgroundColor.number(), shape.backgroundColor.alpha);
            polygon.drawPolygon(shape.getPath());
            polygon.endFill();
            this.pixiContainer.addChild(polygon);
        } else if (shape instanceof Text) {
            const fontStyle = new PIXI.TextStyle({fontFamily: shape.fontFamily, fontSize: shape.fontSize, fill: shape.color.hex()});
            const pixiText = new PIXI.Text(shape.text, fontStyle);
            pixiText.x = shape.x;
            pixiText.y = shape.y;
            this.pixiContainer.addChild(pixiText);
        } else if (shape instanceof ShapeCollection) {
            _.forEach(shape.getShapes(), (childShape: Shape) => {
                this._renderShape(childShape);
            });
        }
    }

    public removeChildren() {
        super.removeChildren();
        this.pixiContainer.removeChildren();
    }
}