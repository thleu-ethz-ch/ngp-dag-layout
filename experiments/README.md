To run the scripts in the `scripts` folder, you need python 3 and add the base dir to the python path:
```export PYTHONPATH=/path/to/npg-dag-layout```.

The scripts will try to call either the `chrome` or the `firefox` binary. You might change their path in `bench/__init__.py`. 

For the experiments to work in Firefox without a server, you need to set the following flag to `false`, e.g. by typing `about:config` in the browser bar:
`security.fileuri.strict_origin_policy`.

The scripts will then repeatedly open the browser, each time storing the results in the browsers local storage. Eventually, the browser will prompt you to specify a file name to which it will save the results in a `json` format.

SDFGs have to be placed in the `graphs` directory of the project root (with `.json`extension) to make this work.