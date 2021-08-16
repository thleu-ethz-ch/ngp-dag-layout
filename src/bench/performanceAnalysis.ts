import * as _ from "lodash";
import Layouter from "../layouter/layouter";
import Timer from "../util/timer";
import RenderGraph from "../renderGraph/renderGraph";

export default class PerformanceAnalysis {
    private _layouter: Layouter = null;

    constructor(layouter: Layouter) {
        this._layouter = layouter;
    }

    public async measure(graph: RenderGraph, runs: number = 10, breakdown: boolean = false): Promise<any> {
        const graphCopy = _.cloneDeep(graph);
        const times = [];
        for (let run = 0; run < runs; ++run) {
            Timer.reset();
            const start = Date.now();
            await this._layouter.layout(graphCopy);
            const end = Date.now();
            if (breakdown) {
                if (runs === 1) {
                    return Timer.getTimesPerPath();
                }
                times.push(Timer.getTimes());
            } else {
                times.push(end - start);
                if (runs > 1 && _.sum(times) < 1000) {
                    runs++;
                }
            }
        }
        if (breakdown) {
            return Timer.combineTimes(times);
        } else {
            return times;
            //return _.sortBy(times)[Math.floor(runs / 2)] + " (" + "±" + (2 * this.sd(times)).toFixed(0) + ")";
        }
    }
}
