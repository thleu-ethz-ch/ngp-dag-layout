import matplotlib.ticker
import matplotlib.pyplot as plt
import json
import seaborn as sns
import pandas as pd
from experiments.bench.graphs import *
import experiments.bench.eval.pareto

matplotlib.rc('text', usetex=True)
pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)

with open('../results/overview.json') as file:
    original_df = pd.json_normalize(json.load(file))
    with open('../results/overview_cost.json') as file_cost:
        original_df_cost = pd.json_normalize(json.load(file_cost))
        # use one group at a time because we don't know how to reset plt properly
        # POLY_DAGRE, WIDE, TALL, PORT
        for group in ["WIDE"]:
            df = original_df.copy()
            df_cost = original_df_cost.copy()
            if group == "POLY_DAGRE":
                graphs = POLY_DAGRE
            elif group == "WIDE":
                graphs = WIDE
            elif group == "TALL":
                graphs = TALL
            else:
                graphs = PORT

            df = df[df["graph"].isin(graphs)]

            df_cost = df_cost[df_cost["graph"].isin(graphs)]

            df["run"] = df.groupby(["graph"]).cumcount()
            sum_df = df.groupby(["run", "name"], as_index=False).sum(numeric_only=True)
            sum_df["time"] = sum_df["time"].map(lambda time: time / 1000)

            sum_df_cost = df_cost.groupby(["name"]).sum(numeric_only=True)

            cost_dict = sum_df_cost.to_dict()["cost"]
            sum_df["cost"] = sum_df["name"].map(lambda name: cost_dict[name])

            median_dict = dict(sum_df.groupby(["name"], as_index=False).median()[["name", "time"]].values)
            sum_df["mediandiff"] = sum_df.apply(lambda row: abs(row["time"] - median_dict[row["name"]]), axis=1)
            sum_df["name"] = pd.Categorical(sum_df["name"], ["DAG", "SUG", "SUG-P", "SUG-S", "SUG-PS"])
            sum_df = sum_df.sort_values(["name", "mediandiff"], ascending=[True, False])

            fig, ax = plt.subplots()

            plt.grid(color='#E0E0E0')
            sns.set_theme(style="whitegrid")

            pareto_lines = experiments.bench.eval.pareto.lines(cost_dict, median_dict)
            for line in pareto_lines:
                plt.plot([line[0][0], line[1][0]], [line[0][1], line[1][1]], color='black', zorder=0)

            g = sns.scatterplot(
                data=sum_df,
                x="cost", y="time",
                hue="name"
            )
            g.set(xlabel="Cost", ylabel="Time [s]")
            handles, labels = ax.get_legend_handles_labels()
            if group == "POLY_DAGRE":
                ax.legend(handles=handles[0:], labels=labels[0:])
            else:
                ax.get_legend().remove()
            ax.set_xlim(xmin=0)
            ax.set_ylim(ymin=0)
            ax.get_xaxis().set_major_formatter(matplotlib.ticker.FuncFormatter(lambda x, p: format(int(x), ',')))
            ax.get_yaxis().set_major_formatter(matplotlib.ticker.FuncFormatter(lambda x, p: format(int(x), ',')))

            plt.title(group.replace('_DAGRE', ''))
            ax.set_axisbelow(True)

            plt.savefig('overview_' + group + '.pdf', bbox_inches='tight')
            plt.show()
