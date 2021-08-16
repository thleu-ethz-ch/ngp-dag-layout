import Parser from "./parser";
import RenderGraph from "../renderGraph/renderGraph";
import {ROOT_DIR} from "../util/constants";

export default class Loader {
    static load(name: string, basePath: string = null): Promise<RenderGraph> {
        if (basePath === null) {
            basePath = Loader.getBasePath();
        }
        return fetch(basePath + name + ".json")
            .then(response => response.json())
            .then(json => Parser.parse(json))
            .catch(() => null);
    }

    static loadXhr(name: string, basePath: string = "./graphs/"): Promise<RenderGraph> {
        const doXhr = (path) => {
            return new Promise(function (resolve, reject) {
                const xhr = new XMLHttpRequest();
                xhr.onload = function () {
                    if (this.status < 400) {
                        resolve(xhr.response);
                    } else {
                        reject({
                            status: this.status,
                            statusText: xhr.statusText
                        });
                    }
                };
                xhr.onerror = function () {
                    reject({status: this.status, statusText: xhr.statusText});
                };
                xhr.open('GET', path);
                xhr.send();
            });
        }
        return doXhr(basePath + name + ".json")
            .then(response => JSON.parse(<string>response))
            .then(json => Parser.parse(json))
            .catch(() => null);
    }

    static getBasePath() {
        let graphDir = '/graphs/';
        let layouterDirPos = window.location.href.indexOf(ROOT_DIR);
        if (layouterDirPos > -1) {
            graphDir = window.location.href.substr(0, layouterDirPos + ROOT_DIR.length) + '/graphs/';
        }
        return graphDir;
    }



}
