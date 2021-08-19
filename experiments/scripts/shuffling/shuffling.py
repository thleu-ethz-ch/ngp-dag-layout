from experiments.bench.graphs import *
import experiments.bench.quality.crossings as crossings

layouters = []
for num_shuffles in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]:
    layouters.append({'name': 'SUG-S' + str(num_shuffles), 'layouter': 'sugiyama', 'numShuffles': num_shuffles, 'jointOrder': 0})
    layouters.append({'name': 'SUG-JS' + str(num_shuffles), 'layouter': 'sugiyama', 'numShuffles': num_shuffles, 'jointOrder': 1})
graphs = PORT + WIDE + TALL + POLY
crossings.chrome([{"layouters": layouters, "graphs": graphs, "runs": 1}])