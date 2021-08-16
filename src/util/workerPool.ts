import SugiyamaLayouter from "../layouter/sugiyamaLayouter";

export default class WorkerPool
{
    private _ready: boolean = true;
    private _workers: Array<Worker> = [];
    private _inUse: Array<boolean> = [];
    private _startedCallbacks: Array<() => any> = [];
    private _doneCallbacks: Array<(any) => any> = [];
    private _queue: Array<[number, string, Array<any>, Array<Transferable>]> = [];
    private _queuePointer: number = 0;

    constructor(workerPath: string, numWorkers: number, layouter: SugiyamaLayouter) {
        for (let i = 0; i < numWorkers; ++i) {
            let tmpI = i;
            try {
                this._workers[i] = new Worker(workerPath);
            } catch (e) {
                layouter.disableWorkers();
                return;
            }
            this._inUse[i] = false;
            this._workers[i].onmessage = e => {
                const taskId = e.data[0];
                if (e.data[1] === "strt") {
                    this._startedCallbacks[taskId]();
                } else {
                    this._inUse[tmpI] = false;
                    this._ready = true;
                    this._doneCallbacks[taskId](e.data[2]);
                    this.tryDispatch();
                }
            }
        }
    }

    public cleanUp() {
        for (let i = 0; i < this._workers.length; ++i) {
            this._workers[i].terminate();
            delete this._workers[i];
        }
    }

    public tryDispatch() {
        if (!this._ready) {
            return;
        }
        if (this._queuePointer < this._queue.length) {
            const [taskId, functionName, args, transferables] = this._queue[this._queuePointer];
            let started = false;
            for (let i = 0; i < this._workers.length; ++i) {
                if (!this._inUse[i]) {
                    this._inUse[i] = true;
                    this._workers[i].postMessage(["exec", taskId, functionName, ...args], transferables);
                    this._queuePointer++;
                    started = true;
                }
                if (i === this._workers.length - 1) {
                    this._ready = false;
                }
                if (started) {
                    break;
                }
            }
            this.tryDispatch();
        }
    }

    public exec(functionName: string, args: Array<any> = [], transferables: Array<Transferable> = []): [Promise<void>, Promise<any>] {
        const taskId = this._queue.length;
        const readyCallback = new Promise<void>(resolve => {
            this._startedCallbacks[taskId] = resolve;
        });
        const doneCallback = new Promise(resolve => {
            this._doneCallbacks[taskId] = resolve;
        });
        this._queue.push([taskId, functionName, args, transferables]);
        this.tryDispatch();
        return [readyCallback, doneCallback];
    }

    public static async apply(functionName, args: Array<any> = []) {
        let context;
        if (typeof(window) !== "undefined") {
            context = window;
        } else{
            context = global;
        }
        return await context[functionName].apply(context, args);
    }

    public static async registerWorker() {
        let context;
        if (typeof(window) !== "undefined") {
            context = window;
        } else{
            context = global;
        }
        context.onmessage = async function(e) {
            if (e.data[0] === "exec") {
                context.taskId = e.data[1];
                context.postMessage([context.taskId, "strt"]);
                const result = await WorkerPool.apply(e.data[2], e.data.slice(3));
                context.postMessage([context.taskId, "done", result]);
            }
        }
    }
}
