import matplotlib.pyplot as plt
import json
import seaborn as sns
import pandas as pd
from matplotlib import rc
import matplotlib.patches as mpatches

rc('text', usetex=True)
pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)

# use one group at a time because we don't know how to reset plt properly
# bert, d_sw-1, d_sw1-fused
for graph in ["bert"]:
    fig, ax = plt.subplots(figsize=(2, 4.8))

    plt.grid(color='#E0E0E0')
    sns.set_theme(style="whitegrid")
    colors = sns.color_palette()
    colors = ["gray", colors[0], colors[2], colors[3]]

    part_dfs = [
        pd.DataFrame(),
        pd.DataFrame(),
        pd.DataFrame(),
        pd.DataFrame(),
    ]
    bars = []
    for i in range(1, 6):
        with open('../results/' + graph + '/' + 'run' + str(i) + '.txt') as file:
            run_df = pd.DataFrame(pd.read_csv(file, sep=":", names=["part", "time"]))
            run_df['run'] = i
            run_df['time'] = run_df['time'].map(lambda time: int(time.rstrip('ms').strip()))
            run_df = run_df.groupby(['run', 'part'], as_index=False).sum()
            for step, part in enumerate(["rank", "order", "coords", "other"]):
                measures = {}
                for measure in ["rank time", "normalizeRanks time", "assignRankMinMax time", "order time", "position time", "assignNodeIntersects time", "total"]:
                    measures[measure] = int(run_df[run_df["part"] == measure]["time"])
                row = {}
                row["layouter"] = "DAG"
                rank = measures["rank time"] + measures["normalizeRanks time"] + measures["assignRankMinMax time"]
                order =  measures["order time"]
                coords = measures["position time"] + measures["assignNodeIntersects time"]
                other = measures["total"] - rank - order - coords
                times = [rank, order, coords, other]
                row["time"] = sum(times[0:step+1]) / 1000
                part_dfs[step] = part_dfs[step].append(row, ignore_index=True)

    with open('../../performance_breakdown/results/performance_breakdown.json') as file:
        df = pd.json_normalize(json.load(file))
        df = df[df["graph"] == "bert"]
        for step, part in enumerate(["rank", "order", "resolve", "coords"]):
            part_df = pd.DataFrame()
            for i in range(df.shape[0]):
                row = df.iloc[i].copy()
                row["layouter"] = "SUG-J"
                rank = row["doLayout|assignRanks"]
                order =  row["doLayout|orderRanks"]
                coords = row["doLayout|assignCoordinates"]
                times = [rank, order, coords, 0]
                row["time"] = sum(times[0:step+1]) / 1000
            part_dfs[step] = part_dfs[step].append(row, ignore_index=True)

    part_dfs.reverse()
    handles = []
    for step, part_df in enumerate(part_dfs):
        bars.append(sns.barplot(
            data=part_df,
            x="layouter", y="time",
            ci=('sd' if step == 0 else None), color=colors[step]
        ))
        handles.append(mpatches.Patch(color=colors[step], label=["other", "coordinate assignment", "ordering", "ranking"][step]))

    if graph == "d_sw1-fused":
        plt.legend(handles=handles,  bbox_to_anchor=(1.05, 1), loc=2)
    ax.set_axisbelow(True)
    ax.set_xticklabels(ax.get_xticklabels(), rotation=90)
    plt.xlabel('')
    plt.ylabel('Time [s]')
    plt.setp(ax.patches, linewidth=0)
    plt.title(r"\textit{" + graph.split("/")[-1].replace('_', r"\_") + r"}")
    plt.savefig('dagre_breakdown_' + graph + '.pdf', bbox_inches='tight')
    plt.show()
