import urllib.parse
import inspect
import os
import pandas as pd
import json
from experiments.bench import _open_browser, _file_path


def _run_experiments(browser, experiments, measure):
    _open_browser(browser, _file_path('clearStorage.html'))
    for experiment in experiments:
        for layouter in experiment["layouters"]:
            for graph in experiment["graphs"]:
                for run in range(experiment["runs"]):
                    setup = layouter.copy()
                    setup['measure'] = measure
                    setup['graph'] = graph
                    _run_experiment(browser, setup)
    _open_browser(browser, _file_path('downloadStorage.html'))


def _run_experiment(browser, experiment):
    _open_browser(browser, _file_path('quality.html') + '?' + urllib.parse.urlencode(experiment, doseq=False))