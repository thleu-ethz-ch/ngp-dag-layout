import * as _ from "lodash";
import RendererContainer from "./rendererContainer";
import Shape from "../shapes/shape";
import Rectangle from "../shapes/rectangle";
import Circle from "../shapes/circle";
import Ellipse from "../shapes/ellipse";
import Line from "../shapes/line";
import EdgeShape from "../shapes/edgeShape";
import Vector from "../geometry/vector";
import AbstractPolygon from "../shapes/abstractPolygon";
import Text from "../shapes/text";
import ShapeCollection from "../shapes/shapeCollection";
import Color from "./color";
import MathText from "../shapes/mathText";
import Arc from "../shapes/arc";

export default class SvgContainer extends RendererContainer {
    private readonly _svg: SVGElement;
    private readonly _svgContainer: SVGGraphicsElement;
    private readonly _width: number;
    private readonly _height: number;
    private _contentWidth: number = 0;
    private _contentHeight: number = 0;
    private _zoom: number = 1;
    private _translate: Vector = new Vector(0, 0);
    private _transitionTimeout;

    constructor(domContainer) {
        super();
        this._svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this._svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        this._svg.style.width = "100%";
        this._svg.style.height = "100%";
        this._svg.style.display = "block";
        domContainer.appendChild(this._svg);
        this._svgContainer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        this._svg.appendChild(this._svgContainer);
        const size = this._svg.getBoundingClientRect();
        this._width = size.width;
        this._height = size.height;
    }

    public saveSvg(fileName) {
        const svgStyle = this._svg.getAttribute('style');
        const svgContainerStyle = this._svgContainer.getAttribute('style');
        this._svg.removeAttribute('style');
        this._svgContainer.removeAttribute('style');
        const size = this._svgContainer.getBoundingClientRect();
        this._svg.setAttribute('width', size.width.toString());
        this._svg.setAttribute('height', size.height.toString());
        const serializer = new XMLSerializer();
        const data = '<?xml version="1.0" standalone="no"?>' + serializer.serializeToString(this._svg);
        const a = document.createElement('a');
        document.body.append(a);
        a.download = fileName;
        a.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);
        a.click();
        a.remove();
        this._svg.setAttribute('style', svgStyle);
        this._svgContainer.setAttribute('style', svgContainerStyle);
    }

    public addElement(element: Node) {
        this._svgContainer.appendChild(element);
    }

    protected _renderShape(shape: Shape): void {
        if (shape instanceof Rectangle) {
            const rectangle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rectangle.setAttribute('x', shape.x.toString());
            rectangle.setAttribute('y', shape.y.toString());
            rectangle.setAttribute('width', shape.width.toString());
            rectangle.setAttribute('height', shape.height.toString());
            if (shape.lineStyle === "dashed") {
                rectangle.setAttribute('stroke-dasharray', '4');
            }
            this._addBackgroundAndBorder(rectangle, shape.backgroundColor, shape.borderColor);
            if (shape.zIndex !== null) {
            }
            this._svgContainer.appendChild(rectangle);
        } else if (shape instanceof Circle) {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            const box = shape.boundingBox();
            const center = box.center();
            circle.setAttribute('cx', center.x.toString());
            circle.setAttribute('cy', center.y.toString());
            circle.setAttribute('r', (shape.width / 2).toString());
            this._addBackgroundAndBorder(circle, shape.backgroundColor, shape.borderColor);
            this._svgContainer.appendChild(circle);
        } else if (shape instanceof Arc) {
            // adapted from opsb: https://stackoverflow.com/a/18473154
            const polarToCartesian = (centerX, centerY, radius, angle) => {
                return {
                    x: centerX + (radius * Math.cos(angle)),
                    y: centerY + (radius * Math.sin(angle)),
                };
            }
            const describeArc = (x, y, radius, startAngle, endAngle) => {
                const start = polarToCartesian(x, y, radius, endAngle);
                const end = polarToCartesian(x, y, radius, startAngle);
                const largeArcFlag = (endAngle - startAngle <= Math.PI ? "0" : "1");
                return [
                    "M", start.x, start.y,
                    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
                ].join(" ");
            }
            const arc = document.createElementNS("http://www.w3.org/2000/svg", "path");
            arc.setAttribute('d', describeArc(shape.x + shape.radius, shape.y + shape.radius, shape.radius, shape.startAngle, shape.endAngle));
            if (shape.lineStyle === "dashed") {
                arc.setAttribute('stroke-dasharray', '4');
            }
            this._addBackgroundAndBorder(arc, shape.backgroundColor, shape.borderColor);
            this._svgContainer.appendChild(arc);
        } if (shape instanceof Ellipse) {
            const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
            const box = shape.boundingBox();
            const center = box.center();
            ellipse.setAttribute('cx', center.x.toString());
            ellipse.setAttribute('cy', center.y.toString());
            ellipse.setAttribute('rx', (shape.width / 2).toString());
            ellipse.setAttribute('ry', (shape.height / 2).toString());
            this._addBackgroundAndBorder(ellipse, shape.backgroundColor, shape.borderColor);
            this._svgContainer.appendChild(ellipse);
        } else if (shape instanceof Line) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute('x1', shape.x1.toString());
            line.setAttribute('y1', shape.y1.toString());
            line.setAttribute('x2', shape.x2.toString());
            line.setAttribute('y2', shape.y2.toString());
            line.setAttribute('stroke-width', shape.lineWidth.toString());
            line.setAttribute('stroke', shape.color.hex());
            line.setAttribute('stroke-opacity', shape.color.alpha.toString());
            this._svgContainer.appendChild(line);
            if (shape.style === "dashed") {
                line.setAttribute('stroke-dasharray', '4');
            }
        } else if (shape instanceof EdgeShape) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute('stroke-width', shape.lineWidth.toString());
            path.setAttribute('stroke', shape.color.hex());
            path.setAttribute('stroke-opacity', shape.color.alpha.toString());
            path.setAttribute('fill', 'none');
            let description = "M " + _.head(shape.points()).x.toString() + "," + _.head(shape.points()).y.toString() + " ";
            _.forEach(_.tail(shape.points()), (point: Vector) => {
                description += "L " + point.x.toString() + "," + point.y.toString() + " ";
            });
            path.setAttribute('d', description);
            if (shape.lineStyle === "dashed") {
                path.setAttribute('stroke-dasharray', '4');
            }
            this._svgContainer.appendChild(path);

            // draw arrow head
            const headPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            headPath.setAttribute('stroke-width', shape.lineWidth.toString());
            headPath.setAttribute('stroke', shape.color.hex());
            headPath.setAttribute('stroke-opacity', shape.color.alpha.toString());
            headPath.setAttribute('fill', 'none');
            const end = new Vector(_.last(shape.points()).x, _.last(shape.points()).y);
            const dir = end.clone().sub(shape.points()[shape.points().length - 2]);
            const angle = dir.angle();
            const point1 = (new Vector(end.x - 5, end.y + 3)).rotateAround(end, angle);
            let headDescription = "M " + point1.x.toString() + "," + point1.y.toString() + " ";
            headDescription += "L " + end.x.toString() + "," + end.y.toString() + " ";
            const point2 = (new Vector(end.x - 5, end.y - 3)).rotateAround(end, angle);
            headDescription += "L " + point2.x.toString() + "," + point2.y.toString();
            headPath.setAttribute('d', headDescription);
            this._svgContainer.appendChild(headPath);
        } else if (shape instanceof AbstractPolygon) {
            const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            this._addBackgroundAndBorder(polygon, shape.backgroundColor, shape.borderColor);
            const points = shape.getPath();
            let description = "";
            for (let i = 0; i < points.length; i += 2) {
                description += points[i] + "," + points[i + 1] + " ";
            }
            polygon.setAttribute('points', description);
            this._svgContainer.appendChild(polygon);
        } else if (shape instanceof Text) {
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute('x', shape.x.toString());
            text.setAttribute('y', (shape.y + shape.fontSize).toString());
            text.setAttribute('font-family', shape.fontFamily);
            text.setAttribute('font-size', shape.fontSize.toString());
            text.appendChild(document.createTextNode(shape.text));
            this._svgContainer.appendChild(text);
        } else if (shape instanceof MathText) {
            const foreignObject = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
            foreignObject.setAttribute('x', shape.x.toString());
            foreignObject.setAttribute('y', shape.y.toString());
            foreignObject.setAttribute('width', shape.width.toString());
            foreignObject.setAttribute('height', shape.height.toString());
            foreignObject.setAttribute('color', shape.color.hex());
            foreignObject.style.overflow = 'visible';
            this._svgContainer.appendChild(foreignObject);
            shape.svg.style.position = 'absolute';
            foreignObject.appendChild(shape.svg);
        } else if (shape instanceof ShapeCollection) {
            _.forEach(shape.getShapes(), (childShape: Shape) => {
                this._renderShape(childShape);
            });
        }
    }

    public width(): number {
        return this._width;
    }

    public height(): number {
        return this._height;
    }

    public toWorld(vector: Vector): Vector {
        return vector.multiplyScalar(1 / this._zoom);
    }

    public toScreen(vector: Vector): Vector {
        return vector.multiplyScalar(this._zoom);
    }

    public setZoom(zoom: number, animate: boolean = true): void {
        if (zoom !== this._zoom) {
            this._zoom = zoom;
            this._updateTransform();
            if (animate) {
                this._svgContainer.style.transition = 'transform 100ms linear';
            } else {
                this._svgContainer.style.transition = '';
            }
            clearTimeout(this._transitionTimeout);
            this._transitionTimeout = setTimeout(() => {
                this._svgContainer.style.transition = 'transform 10ms linear';
            }, 100);
        }
    }

    public getZoom(): number {
        return this._zoom;
    }

    public translate(offset: Vector) {
        this._translate.sub(offset);
        this._updateTransform();
    }

    public getContentTopLeft(): Vector {
        return this._translate.clone();
    }

    public getContentCenter(): Vector {
        return this._translate.clone().add(new Vector(this._contentWidth / 2, this._contentHeight / 2));
    }

    public getCenter(): Vector {
        return new Vector(this._width / 2, this._height / 2);
    }

    public render() {
        super.render();
        const size = this._svgContainer.getBBox();
        this._contentWidth = size.width;
        this._contentHeight = size.height;
        requestAnimationFrame(() => {
            this._svgContainer.style.transition = 'transform 10ms linear';
        });
    }

    private _updateTransform() {
        this._svgContainer.style.transform = 'matrix(' + this._zoom + ',0,0,' + this._zoom + ',' + this._translate.x * this._zoom + ',' + this._translate.y * this._zoom + ')';
    }

    private _addBackgroundAndBorder(element, backgroundColor: Color, borderColor: Color) {
        element.setAttribute('fill', backgroundColor.hex());
        element.setAttribute('fill-opacity', backgroundColor.alpha.toString());
        element.setAttribute('stroke', borderColor.hex());
        element.setAttribute('stroke-opacity', borderColor.alpha.toString());
    }
}