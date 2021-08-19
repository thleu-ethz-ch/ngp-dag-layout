from experiments.bench.graphs import *
import experiments.bench.performance.breakdown as bd

layouters = [
    {'name': 'SUG-J', 'layouter': 'sugiyama', 'jointOrder': 'true', 'numShuffles': 0, 'webWorkers': 0, 'maxWorkers': 0, 'breakdown': 1},
    {'name': 'SUG-JM7', 'layouter': 'sugiyama', 'jointOrder': 'true', 'numShuffles': 0, 'webWorkers': 1, 'maxWorkers': 7, 'breakdown': 1},
]
bd.chrome([{"layouters": layouters, "graphs": WIDE, "runs": 10}])