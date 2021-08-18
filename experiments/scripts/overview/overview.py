from experiments.bench.graphs import *
import experiments.bench.performance.time as time

layouters = [
    {'name': 'DAG', 'layouter': 'dagre', 'preorderPorts': 0, 'numShuffles': 0},
    {'name': 'SUG', 'layouter': 'sugiyama', 'preorderPorts': 0, 'numShuffles': 0},
    {'name': 'SUG-J', 'layouter': 'sugiyama', 'preorderPorts': 1, 'numShuffles': 0},
    {'name': 'SUG-S', 'layouter': 'sugiyama', 'preorderPorts': 0, 'numShuffles': 10},
    {'name': 'SUG-JS', 'layouter': 'sugiyama', 'preorderPorts': 1, 'numShuffles': 10},
]

experiments = [
    {
        "layouters": layouters,
        "graphs": POLY_DAGRE + WIDE + TALL,
        "runs": 5,
    },
    {
        "layouters": layouters[1:],
        "graphs": PORT,
        "runs": 5,
    },
]

time.chrome(experiments)
