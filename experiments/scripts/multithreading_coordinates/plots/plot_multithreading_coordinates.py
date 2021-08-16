import matplotlib.ticker
import matplotlib.pyplot as plt
import json
import seaborn as sns
import pandas as pd

matplotlib.rc('text', usetex=True)

with open('../results/multithreading_coordinates.json') as file:
    df = pd.json_normalize(json.load(file))
    df = df.sort_values(['name', 'graph'])
    df["graph"] = df["graph"].map(lambda name: r"\textit{" + name + "}")
    df["layouter"] = df["name"].map(lambda name: "-" if "H" in name else ("Multi-threaded" if "M" in name else "Single-threaded"))
    df = df[df["layouter"] != "-"]
    df["time"] = df["doLayout|assignCoordinates|placeSubgraph|assignX"].map(lambda time: time / 1000)

    fig, ax = plt.subplots()

    sns.set_theme(style="whitegrid")
    g = sns.catplot(
        data=df, kind="bar",
        x="graph", y="time", hue="layouter",
        ci="sd", legend=False
    )
    g.despine(left=True)
    g.set_axis_labels("", "Time [s]")
    for ax in g.axes.flat:
        ax.get_yaxis().set_major_formatter(matplotlib.ticker.FuncFormatter(lambda x, p: format(x, ',')))
        ax.legend(loc='upper right')
    plt.savefig('multithreading_coordinates.pdf', bbox_inches='tight')
    plt.show()