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

(For User name you can use `willkessler`.)

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
python3 -m twine upload dist/*
```

(For User name you can use `willkessler`.)

# General instructions for building for conda distribution


NB: this relies on jupytergraffiti being in the main (production) pypi repository.

```
mkdir conda
cd conda
rm -rf jupytergraffiti
conda skeleton pypi jupytergraffiti
conda install conda-verify
```

Modify jupytergraffiti/meta.yaml to include `build   noarch:  python`.
Modify jupytergraffiti/meta.json to include github handle: willkessler

Building on macosx:

```
conda build jupytergraffiti
export GRAFFITI_VERSION=1.0.1.10
anaconda upload /Users/will/anaconda/conda-bld/noarch/jupytergraffiti-$GRAFFITI_VERSION-py_0.tar.bz2
```

Then you want to convert to other architectures and upload these as well:

```
conda convert --platform all ~/anaconda/conda-bld/osx-64/jupytergraffiti-<version>-py36_0.tar.bz2 -o linux64_out
anaconda upload linux64_out/linux-64/jupytergraffiti-<version>-py36_0.tar.bz2
```
... etc for all the architectures you want to support. This last step doesn't seem to be necessary any more (01/23/2020).


To install you should be able to do :

```
conda install -c willkessler jupytergraffiti
```

