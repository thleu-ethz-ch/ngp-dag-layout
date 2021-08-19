import json
import pandas as pd
import math

with open('../results/performance_breakdown_count.json') as file:
    df = pd.json_normalize(json.load(file))
    for i in range(df.shape[0]):
        row = df.iloc[i].copy()
        resolveX = row["doLayout|orderRanks|doOrder|order|doOrder|resolve|resolveHeavyLight|resolveX"]
        resolveX = 0 if math.isnan(resolveX) else resolveX
        resolveY = row["doLayout|orderRanks|doOrder|order|doOrder|resolve|resolveHeavyLight|resolveY"]
        resolveY = 0 if math.isnan(resolveY) else resolveY
        heavyLightConflicts = int(resolveX + resolveY)
        if heavyLightConflicts > 0:
            print(row["graph"], heavyLightConflicts)