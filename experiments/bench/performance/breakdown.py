from . import _run_experiments

'''
Measure the time spent in various parts of the layouter.
'''


def firefox(experiments):
    _run_experiments('firefox', experiments, 1)


def chrome(experiments):
    _run_experiments('chrome', experiments, 1)