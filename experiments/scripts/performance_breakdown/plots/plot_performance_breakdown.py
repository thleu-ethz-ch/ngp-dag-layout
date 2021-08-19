import matplotlib.pyplot as plt
import json
import seaborn as sns
import pandas as pd
from experiments.bench.graphs import *
from matplotlib import rc
import matplotlib.patches as mpatches

rc('text', usetex=True)
pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)

with open('../results/performance_breakdown.json') as file:
    original_df = pd.json_normalize(json.load(file))
    # print relative part of resolve for d_sw1-fused
    row = original_df[original_df["graph"] == "d_sw1-fused"].groupby("graph").median()
    print((row["doLayout|orderRanks|doOrder|order|doOrder|resolve"] + row["doLayout|orderRanks|doOrder|insertNodes"]) / row["doLayout"])
    # use one group at a time because we don't know how to reset plt properly
    # POLY, WIDE, TALL, PORT, DSW1
    for group in ["POLY"]:
        df = original_df.copy()
        if group == "POLY":
            graphs = POLY
            title = "POLY"
            width = 9.6
        elif group == "WIDE":
            graphs = WIDE
            title = "WIDE"
            width = 1.46
        elif group == "TALL":
            graphs = TALL
            title = "TALL"
            width = 1.04
        elif group == "PORT":
            graphs = PORT
            title = "PORT"
            width = 1.46
        elif group == "DSW1":
            graphs = DSW1
            title = "DSW1"
            width = 1.04

        df = df[df["graph"].isin(graphs)]
        fig, ax = plt.subplots(figsize=(width, 4.8))

        plt.grid(color='#E0E0E0')
        sns.set_theme(style="whitegrid")
        colors = sns.color_palette()

        part_dfs = []
        bars = []
        steps = []
        for step, part in enumerate(["rank", "order", "resolve", "coords"]):
            part_df = pd.DataFrame()
            for i in range(df.shape[0]):
                row = df.iloc[i].copy()
                row["graph"] = r"\textit{" + row["graph"].split("/")[-1].replace('_', r"\_") + r"}"
                rank = row["doLayout|assignRanks"]
                resolve = row["doLayout|orderRanks|doOrder|order|doOrder|resolve"] + row["doLayout|orderRanks|doOrder|insertNodes"]
                order =  row["doLayout|orderRanks"] - resolve
                coords = row["doLayout|assignCoordinates"]
                times = [rank, order, resolve, coords]
                row["time"] = sum(times[0:step+1]) / 1000
                part_df = part_df.append(row, ignore_index=True)
            part_dfs.append(part_df)
        part_dfs.reverse()
        handles = []
        for step, part_df in enumerate(part_dfs):
            bars.append(sns.barplot(
                data=part_df,
                x="graph", y="time",
                ci=('sd' if step == 0 else None), color=colors[step]
            ))
            handles.append(mpatches.Patch(color=colors[step], label=["coordinate assignment", "conflict resolution", "ordering", "ranking"][step]))

        plt.title(title)
        if group == "POLY":
            plt.legend(handles=handles)
        ax.set_axisbelow(True)
        ax.set_xticklabels(ax.get_xticklabels(), rotation=90)
        plt.xlabel('')
        plt.ylabel('Time [s]')
        plt.setp(ax.patches, linewidth=0)
        plt.savefig('performance_breakdown_' + group + '.pdf', bbox_inches='tight')
        plt.show()