import matplotlib.ticker
import matplotlib.pyplot as plt
import json
import seaborn as sns
import pandas as pd
from experiments.bench.graphs import *
from matplotlib import rc
import matplotlib.patches as mpatches
import math

rc('text', usetex=True)
pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)

with open('../results/performance_breakdown_count.json') as file:
    df = pd.json_normalize(json.load(file))
    for i in range(df.shape[0]):
        row = df.iloc[i].copy()
        resolveHeavyHeavy = row["doLayout|orderRanks|doOrder|order|doOrder|resolve|resolveConflict|resolveX"]
        resolveHeavyHeavy = 0 if math.isnan(resolveHeavyHeavy) else resolveHeavyHeavy
        resolveX = row["doLayout|orderRanks|doOrder|order|doOrder|resolve|resolveConflict|resolveX"]
        resolveX = 0 if math.isnan(resolveX) else resolveX
        resolveY = row["doLayout|orderRanks|doOrder|order|doOrder|resolve|resolveConflict|resolveY"]
        resolveY = 0 if math.isnan(resolveY) else resolveY
        print(row["graph"], resolveHeavyHeavy, resolveX + resolveY)