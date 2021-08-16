import * as _ from "lodash";

export default class Timer {
    private static _timers: Map<string, Array<number>> = new Map();
    private static _measurements: Map<string, Array<number>> = new Map();

    public static reset(): void {
        Timer._timers = new Map();
        Timer._measurements = new Map();
    }

    public static start(path: Array<string>): void {
        const id = path.join("|");
        let timers = Timer._timers.get(id);
        if (timers === undefined) {
            timers = [];
            Timer._timers.set(id, timers);
        }
        timers.push(performance.now());
    }

    public static stop(path: Array<string>): void {
        const stopTime = performance.now();
        const id = path.join("|");
        const timers = Timer._timers.get(id);
        const startTime = timers[timers.length - 1];
        timers.length = timers.length - 1;
        let measurements = Timer._measurements.get(id);
        if (measurements === undefined) {
            measurements = [];
            Timer._measurements.set(id, measurements);
        }
        if (timers.length === 0) {
            measurements.push(stopTime - startTime); // for recursive calls, only add outermost
        }
    }

    public static getTimes(): object {
        const timePerPath = {children: {}};
        Timer._measurements.forEach((measurements, id) => {
            const path = id.split("|");
            let slot = timePerPath;
            _.forEach(path, part => {
                if (slot.children[part] === undefined) {
                    slot.children[part] = {
                        children: {},
                    }
                }
                slot = slot.children[part];
            });
            slot["sum"] = _.sum(measurements);
            slot["mean"] = _.mean(measurements);
            slot["min"] = _.min(measurements);
            slot["max"] = _.max(measurements);
            slot["count"] = measurements.length;
        });
        return timePerPath;
    }

    public static getTimesPerPath(): object {
        const timesPerPath = {};
        Timer._measurements.forEach((measurements, id) => {
            timesPerPath[id] = _.sum(measurements);
        });
        return timesPerPath;
    }

    public static getCountPerPath(): object {
        const countPerPath = {};
        Timer._measurements.forEach((measurements, id) => {
            countPerPath[id] = measurements.length;
        });
        return countPerPath;
    }

    public static printTimes(times: object = null): void {
        const printTimes = (slot, name = "", level = 0, parentTime = 0) => {
            if (level > 0) {
                let timeString = (slot.sum > 1000 ? ((slot.sum / 1000).toFixed(1) + " s") : (slot.sum.toFixed(1) + " ms"));
                if (level > 1) {
                    timeString += "; " + (100 * slot.sum / parentTime).toFixed(0) + "% of parent";
                }
                timeString += "; called " + slot.count + " times; average: ";
                timeString += (slot.mean > 1000 ? ((slot.mean / 1000).toFixed(1) + " s") : (slot.mean.toFixed(1) + " ms"));
                timeString += "; min: ";
                timeString += (slot.min > 1000 ? ((slot.min / 1000).toFixed(1) + " s") : (slot.min.toFixed(1) + " ms"));
                timeString += "; max: ";
                timeString += (slot.max > 1000 ? ((slot.max / 1000).toFixed(1) + " s") : (slot.max.toFixed(1) + " ms"));
                console.log(_.repeat("| ", level - 1) + name + ": " + timeString);
            }
            for (let name in slot.children) {
                printTimes(slot.children[name], name, level + 1, slot.sum);
            }
        };
        if (times === null) {
            times = Timer.getTimes()
        }
        printTimes(times);
    }

    public static combineTimes(times:Array<object>): object {
        const summary = {children: {}};
        const combineTimes = (summarySlot, timeSlots, level = 0) => {
            if (level > 0) {
                summarySlot["times"] = _.map(timeSlots, "sum");
            }
            for (let name in timeSlots[0].children) {
                summarySlot.children[name] = {
                    children: {},
                };
                combineTimes(summarySlot.children[name], _.map(timeSlots, slot => slot.children[name]), level + 1);
            }
        };
        combineTimes(summary, times);
        return summary;
    }
}
