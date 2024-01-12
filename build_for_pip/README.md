# General instructions for building for pip distribution

After changing `setup.py` or any part of the Graffiti codebase, increase the version number in setup.py appropriately, around line 37.

Make sure you have installed `penv` if on linux Mint:

``` shell
sudo apt-get install python3.10-venv
```

Then run the commands shown below to upgrade what's stored in pip


``` shell
cd build_for_pip
python3 -m build
# This was (now deprecated): python3 setup.py prep_to_build npm_run_build sdist bdist_wheel
```

If you don't yet have `twine` installed, you need to do `pip3 install twine`.

Now, uploading to the pypi test servers:

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
First time steps:

```
mkdir conda
cd conda
rm -rf jupytergraffiti
# Note that after twine upload to pip, above, there will be about 30 seconds before the new build is accessible to conda.
conda skeleton pypi jupytergraffiti
conda install conda-verify
```

Modify `jupytergraffiti/meta.yaml` to include `build   noarch:  python` and set `recipe-maintainers` on the last line.
Modify `jupytergraffiti/meta.json` to include github handle: `willkessler`  (appears unnecessary now)


(Re)building on macosx:

(After you make updates, make sure to bump the version number in `jupytergraffiti/meta.yml`.

```
conda build jupytergraffiti
export GRAFFITI_VERSION=1.0.1.18
anaconda upload ~/anaconda3/conda-bld/noarch/jupytergraffiti-$GRAFFITI_VERSION-py_0.tar.bz2
```

You may need to log in with `willkessler` and the same password you use for `pip` uploads.
(Optional)

## Note that you may get an error during `conda build jupytergraffiti` wherein the build process will not finish and it will complain that the SHA does not match.
If this happens, make sure to update the SHA in meta.yaml with the SHA the build program actually wants.  For instance,

``` 
SHA256 mismatch: '52dcc24f0e1bfb0937f73e7ab240c72d9cd1d20608b2d696622f49dd1198ea2d' != '5b94b49521f6456670fdb30cd82a4eca9412788a93fa6dd6df72c94d5a8ff2d7'

```

In this case update the SHA to the one ending in `2d` (the first SHA) since that is the latest for the conda repos.

Then you want to convert to other architectures and upload these as well:

```
conda convert --platform all ~/anaconda/conda-bld/osx-64/jupytergraffiti-<version>-py36_0.tar.bz2 -o linux64_out
anaconda upload linux64_out/linux-64/jupytergraffiti-<version>-py36_0.tar.bz2
```
... etc for all the architectures you want to support. This last step doesn't seem to be necessary any more (01/23/2020).


Finally...

To install and test you should be able to do :

```
conda install -c willkessler jupytergraffiti
```

You can test on Udacity streamed linux desktops with:

```
jupyter notebook —port=3001 —ip=127.0.0.1 —allow-root
```

### Building for Windows and building for pip on Windows

To debug issues on Windows, you need to have cygwin64 and node installed on the system. Then you need to use `jupytergraffiti/package.json_windows` instead of `jupytergraffiti/package.json`. This version of `package.json` has a different build step using utilities provided by Cygwin:

```
...
  "scripts": {
    "build": "/cygwin64/bin/rm.exe -rf graffiti-dist build ../build_for_pip/code-prep && node node_modules/gulp/bin/gulp.js prebuild && cd node_modules/.bin && r_js.cmd -o ../../build.js && cd ../.. && node ./node_modules/gulp/bin/gulp.js moveStyles && cd node_modules/.bin && r_js.cmd -o ../../../build_for_pip/buildPip.js && cd ../.. && node ./node_modules/gulp/bin/gulp.js pipMoveStyles"
  },
...
```

You can follow the steps above to build for pip. For creating the pip artifact, from this directory do:

```
python3 setup.py prep_to_build npm_run_build sdist bdist_wheel
```

but then you can install from this build, without uploading to pypi servers, by simply :

1. unpacking the tarball found in the dist directory
1. switching to the unpack directory
1. finally: `pip install .`


