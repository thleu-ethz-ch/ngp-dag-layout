import matplotlib.ticker
import matplotlib.pyplot as plt
import json
import seaborn as sns
import pandas as pd
from experiments.bench.graphs import *

matplotlib.rc('text', usetex=True)

with open('../results/angles.json') as file:
    df = pd.json_normalize(json.load(file))
    df["group"] = df["graph"].map(lambda name: "POLY" if name in POLY else ("PORT" if name in PORT else ("TALL" if name in TALL else "WIDE")))

    sns.set_theme(style="whitegrid")
    g = sns.catplot(
        data=df, kind="bar", legend=False,
        x="group", y="cost", hue="name",
        ci=False, estimator=sum
    )
    g.despine(left=True)
    g.set_axis_labels("", "Cost")
    for ax in g.axes.flat:
        ax.get_yaxis().set_major_formatter(matplotlib.ticker.FuncFormatter(lambda x, p: format(int(x), ',')))
        ax.legend(loc='upper left')
    plt.savefig('angles.pdf', bbox_inches='tight')
    plt.show()
    print(df.groupby(['group', 'name']).sum())
