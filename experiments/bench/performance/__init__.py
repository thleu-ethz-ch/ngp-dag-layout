import urllib.parse
from experiments.bench import _open_browser, _file_path


def _run_experiments(browser, experiments, breakdown=False, count=False):
    _open_browser(browser, _file_path('clearStorage.html'))
    for experiment in experiments:
        for layouter in experiment["layouters"]:
            for graph in experiment["graphs"]:
                for run in range(experiment["runs"]):
                    setup = layouter.copy()
                    setup['breakdown'] = int(breakdown)
                    setup['count'] = int(count)
                    setup['graph'] = graph
                    _run_experiment(browser, setup)
    _open_browser(browser, _file_path('downloadStorage.html'))


def _run_experiment(browser, experiment):
    _open_browser(browser, _file_path('performance.html') + '?' + urllib.parse.urlencode(experiment, doseq=False))