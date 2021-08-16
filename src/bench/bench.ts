import LayoutAnalysis from "./layoutAnalysis";
import LayoutGraph from "../layoutGraph/layoutGraph";
import Layouter from "../layouter/layouter";
import PerformanceAnalysis from "./performanceAnalysis";
import RenderGraph from "../renderGraph/renderGraph";
import Renderer from "../renderer/renderer";
import Serializer from "../util/serializer";
import Timer from "../util/timer";

export default class Bench {
    public static GRAPHS_POLY = ["npbench/polybench/adi", "npbench/polybench/atax", "npbench/polybench/bicg", "npbench/polybench/cholesky", "npbench/polybench/correlation", "npbench/polybench/covariance", "npbench/polybench/deriche", "npbench/polybench/doitgen", "npbench/polybench/durbin", "npbench/polybench/fdtd_2d", "npbench/polybench/floyd_warshall", "npbench/polybench/gemm", "npbench/polybench/gemver", "npbench/polybench/gesummv", "npbench/polybench/gramschmidt", "npbench/polybench/heat_3d", "npbench/polybench/jacobi_1d", "npbench/polybench/jacobi_2d", "npbench/polybench/k2mm", "npbench/polybench/k3mm", "npbench/polybench/lu", "npbench/polybench/ludcmp", "npbench/polybench/mvt", "npbench/polybench/nussinov", "npbench/polybench/seidel_2d", "npbench/polybench/symm", "npbench/polybench/syr2k", "npbench/polybench/syrk", "npbench/polybench/trisolv", "npbench/polybench/trmm"];
    public static GRAPHS_POLY_DAGRE = ["npbench/polybench/atax", "npbench/polybench/bicg", "npbench/polybench/cholesky", "npbench/polybench/correlation", "npbench/polybench/covariance", "npbench/polybench/deriche", "npbench/polybench/doitgen", "npbench/polybench/fdtd_2d", "npbench/polybench/floyd_warshall", "npbench/polybench/gemm", "npbench/polybench/gemver", "npbench/polybench/gesummv", "npbench/polybench/gramschmidt", "npbench/polybench/heat_3d", "npbench/polybench/jacobi_1d", "npbench/polybench/jacobi_2d", "npbench/polybench/k2mm", "npbench/polybench/k3mm", "npbench/polybench/lu", "npbench/polybench/ludcmp", "npbench/polybench/mvt", "npbench/polybench/nussinov", "npbench/polybench/seidel_2d", "npbench/polybench/symm", "npbench/polybench/syrk", "npbench/polybench/trisolv", "npbench/polybench/trmm"];
    public static GRAPHS_WIDE = ["bert", "eos", "linformer"];
    public static GRAPHS_TALL = ["bert2", "yolov4-fused"];
    public static GRAPHS_PORT = ["deriche2", "lulesh", "va-gpu"];
    public static GRAPHS_DSW1 = ["d_sw1", "d_sw1-fused"];
    public static GRAPHS_ALL = [...Bench.GRAPHS_POLY, ...Bench.GRAPHS_WIDE, ...Bench.GRAPHS_TALL, ...Bench.GRAPHS_PORT, ...Bench.GRAPHS_DSW1];

    public static FN_VALIDATE = "validate";
    public static FN_COST = "cost";
    public static FN_CROSSINGS = "crossings";
    public static FN_AREA = "area";
    public static FN_RANKS = "ranks";

    public static runtime(loadFunction: (name: string, basePath: string) => Promise<RenderGraph>, layouter: Layouter, graphs: Array<string> = Bench.GRAPHS_ALL, renderer: Renderer = null, runs: number = 10, breakdown: boolean = false, basePath: string = "/graphs/", count: boolean = false) {
        const promises = graphs.map(name => {
            return () => loadFunction(name, basePath).then(async (renderGraph: RenderGraph) => {
                if (renderGraph === null) {
                    throw new Error('could not load graph');
                }
                if (renderer !== null) {
                    renderer.setSizes(renderGraph);
                }
                if (count) {
                    await layouter.layout(renderGraph);
                    return Timer.getCountPerPath();
                }
                const performanceAnalysis = new PerformanceAnalysis(layouter);
                return performanceAnalysis.measure(renderGraph, runs, breakdown);
            }).catch(e => new Error(e.message));
        });
        return Serializer.serializePromises(promises);
    }

    public static run(f: string, loadFunction: (name: string, basePath: string) => Promise<RenderGraph>, layouter: Layouter, graphs: Array<string> = Bench.GRAPHS_ALL, renderer: Renderer = null, basePath: string = "/graphs/") {
        const promises = graphs.map(name => {
            return () => loadFunction(name, basePath).then(async (renderGraph: RenderGraph) => {
                if (renderer !== null) {
                    renderer.setSizes(renderGraph);
                }
                return await layouter.layout(renderGraph).then((layout: LayoutGraph) => {
                    let layoutAnalysis;
                    switch (f) {
                        case Bench.FN_VALIDATE:
                            layoutAnalysis = new LayoutAnalysis(layout, layouter.getOptionsForAnalysis());
                            return layoutAnalysis.validate();
                        case Bench.FN_COST:
                            layoutAnalysis = new LayoutAnalysis(layout, layouter.getOptionsForAnalysis());
                            return layoutAnalysis.cost();
                        case Bench.FN_CROSSINGS:
                            layoutAnalysis = new LayoutAnalysis(layout, layouter.getOptionsForAnalysis());
                            return layoutAnalysis.segmentCrossings();
                        case Bench.FN_AREA:
                            const box = layout.boundingBox();
                            return box.width * box.height / 1000000;
                        case Bench.FN_RANKS:
                            return layout.numRanks;
                    }
                    throw new Error("unknown function " + f);
                });
            });
        });
        return Serializer.serializePromises(promises);
    }
}
