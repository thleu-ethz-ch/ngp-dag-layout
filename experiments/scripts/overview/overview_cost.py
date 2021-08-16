from experiments.bench.graphs import *
import experiments.bench.quality.cost as cost

layouters = [
    {'name': 'DAG', 'layouter': 'dagre', 'preorderPorts': 0, 'numShuffles': 0},
    {'name': 'SUG', 'layouter': 'sugiyama', 'preorderPorts': 0, 'numShuffles': 0},
    {'name': 'SUG-P', 'layouter': 'sugiyama', 'preorderPorts': 1, 'numShuffles': 0},
    {'name': 'SUG-S', 'layouter': 'sugiyama', 'preorderPorts': 0, 'numShuffles': 10},
    {'name': 'SUG-PS', 'layouter': 'sugiyama', 'preorderPorts': 1, 'numShuffles': 10},
]

experiments = [
    {
        "layouters": layouters,
        "graphs": POLY_DAGRE + WIDE + TALL,
        "runs": 1
    },
    {
        "layouters": layouters[1:],
        "graphs": PORT,
        "runs": 1
    },
]

cost.chrome(experiments)