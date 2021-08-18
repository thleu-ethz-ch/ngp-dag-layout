from experiments.bench.graphs import *
import experiments.bench.performance.breakdown as bd

layouters = []
for i in range(0, 11, 1):
    layouters.append({'name': 'SUG-JS' + str(i), 'layouter': 'sugiyama', 'preorderPorts': 'true', 'numShuffles': i, 'webWorkers': 0, 'maxWorkers': 0, 'breakdown': 1})
for i in range(0, 11, 1):
    layouters.append({'name': 'SUG-JS' + str(i) + 'M7', 'layouter': 'sugiyama', 'preorderPorts': 'true', 'numShuffles': i, 'webWorkers': 1, 'maxWorkers': 7, 'sharedArrayBuffer': 0, 'breakdown': 1})

bd.firefox([{"layouters": layouters, "graphs": WIDE, "runs": 5}])