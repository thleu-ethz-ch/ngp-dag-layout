from experiments.bench.graphs import *
import experiments.bench.performance.breakdown as bd

layouter = {'name': 'SUG-J', 'layouter': 'sugiyama'}

bd.chrome([{"layouters": [layouter], "graphs": ALL, "runs": 5}])