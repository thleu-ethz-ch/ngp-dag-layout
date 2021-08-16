import * as _ from "lodash";
import SugiyamaLayouter from "../layouter/sugiyamaLayouter";

interface Neighbor {
    end: number;
    weight: number;
}

declare var Module;

export default class Wasm
{
    moduleReady: boolean = false;
    waiting: Array<(bool) => void> = [];

    constructor(wasmPath: string, layouter: SugiyamaLayouter) {
        const script = document.createElement('script');
        script.onload = () => {
            Module.onRuntimeInitialized = () => {
                this.moduleReady = true;
                _.forEach(this.waiting, (resolve) => {
                    resolve(true);
                });
            }
            Module.onAbort = () => {
                layouter.disableWasm();
            }
            Module.run();
        }
        script.src = wasmPath;
        document.head.appendChild(script);
    }

    async waitUntilReady(): Promise<void> {
        if (!this.moduleReady) {
            await new Promise((resolve: (bool) => void) => {
                this.waiting.push(resolve);
            });
        }
        return Promise.resolve();
    }

    async reorder(order: Array<Array<number>>, neighborsUp: Array<Array<Neighbor>>, maxId: number, numEdgesPerRank: Array<number>): Promise<void> {
        await this.waitUntilReady();
        let pointer = 0;
        const heap = Module["HEAP32"];
        let numNodes = 0;
        for (let r = 0; r < order.length; ++r) {
            heap[pointer++] = order[r].length;
            numNodes += order[r].length;
            _.forEach(order[r], (n: number) => {
                heap[pointer++] = n;
            });
        }
        let numEdges = 0;
        for (let r = 1; r < order.length; ++r) {
            heap[pointer] = numEdgesPerRank[r];
            numEdges += heap[pointer++];
            _.forEach(order[r], (nodeId: number) => {
                _.forEach(neighborsUp[nodeId], (neighbor: Neighbor) => {
                    let weight = neighbor.weight;
                    if (weight === Number.POSITIVE_INFINITY) {
                        weight = 1;
                    }
                    heap[pointer++] = neighbor.end;
                    heap[pointer++] = nodeId;
                    heap[pointer++] = weight;
                });
            });
        }
        // commented out: download file for testing with native binary
        // Download.download("test.txt", order.length + "," + numNodes + "," + maxId + "," + numEdges + "," + _.slice(heap, 0, pointer).toString())
        Module._reorder(order.length, numNodes, maxId, numEdges, heap.byteOffset);
        pointer = 0;
        for (let r = 0; r < order.length; ++r) {
            for (let pos = 0; pos < order[r].length; ++pos) {
                order[r][pos] = heap[pointer++]
            }
        }
    }
}
