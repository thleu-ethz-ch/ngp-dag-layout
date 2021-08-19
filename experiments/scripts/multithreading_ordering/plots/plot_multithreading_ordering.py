import matplotlib.ticker
import matplotlib.pyplot as plt
import json
import seaborn as sns
import pandas as pd
import re
import numpy as np

matplotlib.rc('text', usetex=True)

with open('../results/multithreading_ordering.json') as file:
    df = pd.json_normalize(json.load(file))
    df = df.sort_values(['name', 'graph'])
    df["layouter"] = df["name"].map(lambda name: "Multi-threaded" if "M" in name else "Single-threaded")
    df = df[df["layouter"] != "-"]
    df["shuffles"] = df["name"].map(lambda name: int(re.findall('.*S([0-9]+).*', name)[0]))
    df["order"] = df["doLayout|orderRanks"].map(lambda time: time / 1000)
    df = df[df["graph"] != "linformer"]

    print(df.groupby(["graph", "name"]).median())

    fig, ax = plt.subplots()
    plt.grid(color='#E0E0E0')
    sns.set_theme(style="whitegrid")
    g = sns.lineplot(
        data=df,
        x="shuffles", y="order", hue="graph", style="layouter",
        ci="sd", err_style="bars"
    )
    g.set(xlabel="Shuffles", ylabel="Time [s]")
    plt.xticks(np.arange(0, 11, 1))
    plt.yticks(np.arange(0, 110, 10))
    ax.set_xlim(0, 10)
    ax.set_ylim(ymin=0)
    ax.get_xaxis().set_major_formatter(matplotlib.ticker.FuncFormatter(lambda x, p: format(int(x), ',')))
    ax.get_yaxis().set_major_formatter(matplotlib.ticker.FuncFormatter(lambda x, p: format(int(x), ',')))
    handles, labels = ax.get_legend_handles_labels()
    ax.legend(handles=handles[0:], labels=[r"\textbf{Graph}", r"\textit{bert}", r"\textit{eos}", r"\textbf{Implementation}", 'Single-threaded', 'Multi-threaded'])
    plt.savefig('multithreading_ordering.pdf', bbox_inches='tight')
    plt.show()