from experiments.bench.graphs import *
import experiments.bench.quality.cost as cost

layouters = [
    {'name': 'SUG-P', 'layouter': 'sugiyama'},
    {'name': 'SUG-PA', 'layouter': 'sugiyama', 'optimizeAngles': 1},
]
cost.chrome([{"layouters": layouters, "graphs": POLY + TALL + PORT + WIDE, "runs": 1}])