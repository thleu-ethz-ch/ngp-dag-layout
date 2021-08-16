from experiments.bench.graphs import *
import experiments.bench.performance.breakdown as bd

layouter = {'name': 'SUG-P', 'layouter': 'sugiyama'}

bd.chrome([{"layouters": [layouter], "graphs": ALL, "runs": 5}])