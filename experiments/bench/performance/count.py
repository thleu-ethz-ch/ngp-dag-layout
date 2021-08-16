from . import _run_experiments

'''
Count how many times different parts of the layouter are executed.
'''


def firefox(experiments):
    _run_experiments('firefox', experiments, True, True)


def chrome(experiments):
    _run_experiments('chrome', experiments, True, True)