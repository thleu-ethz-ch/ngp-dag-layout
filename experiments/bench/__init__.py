import subprocess
import os


def _file_path(file):
    return 'file://' + os.path.join(os.path.dirname(os.path.dirname(os.path.realpath(__file__))), file)


def _open_firefox(url):
    p = subprocess.Popen([
        'firefox',
        url,
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    p.communicate()


def _open_chrome(url):
    p = subprocess.Popen([
        'google-chrome',
        '--allow-file-access-from-files',
        url,
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    p.communicate()


def _open_browser(browser, url):
    if browser == 'firefox':
        _open_firefox(url)
    else:
        _open_chrome(url)