from . import _run_experiments

'''
Measure the total time spent in a layouter.
'''


def firefox(experiments):
    _run_experiments('firefox', experiments, 0)


def chrome(experiments):
    _run_experiments('chrome', experiments, 0)
