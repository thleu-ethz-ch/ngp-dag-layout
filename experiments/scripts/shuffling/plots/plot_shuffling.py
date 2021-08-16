import matplotlib.ticker
import matplotlib.pyplot as plt
import json
import seaborn as sns
import pandas as pd
import re
import numpy as np
from experiments.bench.graphs import *

matplotlib.rc('text', usetex=True)

with open('../results/shuffling.json') as file:
    df = pd.json_normalize(json.load(file))
    df["group"] = df["graph"].map(lambda name: "POLY" if name in POLY else ("PORT" if name in PORT else ("TALL" if name in TALL else "WIDE")))
    df = df.groupby(["name", "group"], as_index=False).sum(numeric_only=True)
    df["layouter"] = df["name"].map(lambda name: "SUG-PS" if "SUG-PS" in name else "SUG-S")
    df["shuffles"] = df["name"].map(lambda name: int(re.findall('.*S([0-9]+).*', name)[0]))

    df = df[df["shuffles"] <= 50]

    base_dict = dict(df[df.name == "SUG-S0"][["group", "crossings"]].values)
    df["relative"] = df.apply(lambda row: 100 * row["crossings"] / base_dict[row["group"]], axis=1)

    df["group"] = pd.Categorical(df["group"], ["PORT", "WIDE", "TALL", "POLY"])

    # use one layouter at a time because we don't know how to reset plt properly
    # "SUG-S", "SUG-PS"
    for layouter in ["SUG-PS"]:
        df = df[df.layouter == layouter]
        fig, ax = plt.subplots()
        plt.grid(color='#E0E0E0')
        sns.set_theme(style="whitegrid")
        g = sns.lineplot(
            data=df,
            x="shuffles", y="relative", hue="group"
        )
        g.set(xlabel="Shuffles", ylabel="Crossings Relative to SUG [\%]")
        plt.xticks([0, 2, 4, 6, 8, 10, 20, 30, 40, 50])
        plt.yticks(np.arange(0, 110, 10))
        ax.set_xlim(0, 50)
        ax.set_ylim(0, 102)
        ax.get_xaxis().set_major_formatter(matplotlib.ticker.FuncFormatter(lambda x, p: format(int(x), ',')))
        ax.get_yaxis().set_major_formatter(matplotlib.ticker.FuncFormatter(lambda x, p: format(int(x), ',')))
        handles, labels = ax.get_legend_handles_labels()
        if layouter == "SUG-S":
            ax.legend(handles=handles[0:], labels=labels[0:])
        else:
            ax.get_legend().remove()
        plt.title(layouter)
        plt.savefig('shuffling_' + layouter + '.pdf', bbox_inches='tight')
        plt.show()