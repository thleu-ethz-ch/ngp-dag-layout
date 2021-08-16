from experiments.bench.graphs import *
import experiments.bench.performance.count as count

layouter = {'name': 'SUG-P', 'layouter': 'sugiyama'}

count.chrome([{"layouters": [layouter], "graphs": ALL, "runs": 1}])