# General instructions for building for pip distribution

After changing `setup.py` or any part of the Graffiti codebase, increase the version number in setup.py appropriately, around line 37.

Then run the commands shown below to upgrade what's stored in pip

``` shell
python3 setup.py prep_to_build npm_run_build sdist bdist_wheel
```

Uploading to the pypi test servers:

``` shell
python3 -m twine upload --repository-url https://test.pypi.org/legacy/ dist/* --verbose
```

Installing to a host in the cloud, from the test servers:
``` shell
python3 -m pip install --index-url https://test.pypi.org/simple/ jupytergraffiti
```

Testing new installation on cloud host:

``` shell
jupyter notebook —port=3001 —ip=127.0.0.1 —allow-root
```

Uploading to the pypi production servers:

``` shell
python3 -m twine upload --repository-url https://pypi.org/legacy/ dist/* --verbose
```

# General instructions for building for conda distribution


NB: this relies on jupytergraffiti being in the main (production) pypi repository.

```
mkdir conda
cd conda
conda skeleton pypi jupytergraffiti
conda install conda-verify
```

Modify meta.yaml to include `build   noarch:  generic`.

Building on macosx:

```
conda build jupytergraffiti
anaconda upload /Users/will/anaconda/conda-bld/osx-64/jupytergraffiti-1.0.1.8-py36_0.tar.bz2
```

Then you want to convert to other architectures and upload these as well:

```
conda convert --platform all ~/anaconda/conda-bld/osx-64/jupytergraffiti-1.0.1.8-py36_0.tar.bz2 -o linux64_out
anaconda upload linux64_out/linux-64/jupytergraffiti-1.0.1.8-py36_0.tar.bz2
```
... etc for all the architectures you want to support.


To install you should be able to do :

```
conda install -c willkessler jupytergraffiti
```

