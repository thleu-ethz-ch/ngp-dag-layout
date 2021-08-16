from . import _run_experiments


def firefox(experiments):
    _run_experiments('firefox', experiments, 'crossings')


def chrome(experiments):
    _run_experiments('chrome', experiments, 'crossings')