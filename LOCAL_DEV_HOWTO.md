# How to set up for local development

1. Install latest anaconda 
1. Install jupyter with `conda update --prefix ~/anaconda3 anaconda` and then `conda install jupyter` to ensure you have >6.2.0. With earlier versions than 6.1.6, the inline terminals will not function due to a patch of the Jupyter core that prevented the instantiation of new terminals with *only* a socket connection.
1. run `npm i` in the `jupytergraffiti` dir.
1. Install Graffiti using conda: `conda install -c willkessler jupytergraffiti` to set it up to run on jupyter start. You will be overwriting the shipped files in its extension directory in the next step.
1. The `build_for_pip` directory can be used to build and install a minified version of the plugin to the following directory: `~/anaconda3/share/jupyter/nbextensions/jupytergraffiti`. cd `build_for_pip && python setup.py npm_run_build`.
1. To make local dev easier, set up `watchexec` (https://github.com/watchexec/watchexec) . Then `cd jupytergraffiti/js` and `watchexec --exts js "cd ../../build_for_pip && python setup.py npm_run_build"` to run the build command any time a js file changes.

