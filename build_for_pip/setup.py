# Setting up build tools for distribution:
# sudo python -m pip install --upgrade pip setuptools wheel
# Build for distribution:
# python3 setup.py npm_install sdist bdist_wheel
# Uploading to test PyPi:
# python3 -m twine upload --repository-url https://test.pypi.org/legacy/ dist/* --verbose


import setuptools

# Build the gulp'd js for distribution via pip/conda.
# From: https://blog.niteo.co/setuptools-run-custom-code-in-setup-py/

import os
from setuptools import setup
from setuptools.command.install import install

class PrepToBuild(install):
    def run(self):
        os.system("./pre_build_clean.sh")
        install.run(self)

class NPMRunBuild(install):
    def run(self):
        os.system("cd ../jupytergraffiti && npm run build")
        install.run(self)

with open("README.md", "r") as fh:
    long_description = fh.read()

setuptools.setup(
    cmdclass={
        'prep_to_build': PrepToBuild,
        'npm_run_build': NPMRunBuild
    },
    name="jupytergraffiti",
    version='1.0.1.12',
    include_package_data=True,
    data_files=[
        # like `jupyter nbextension install --sys-prefix`
        ("share/jupyter/nbextensions/jupytergraffiti", [
            "./code-prep/build/jupytergraffiti/graffiti.js",
            "./code-prep/build/jupytergraffiti/graffiti.css",
            "./code-prep/build/jupytergraffiti/xterm.css"
        ]),
        # like `jupyter nbextension enable --sys-prefix`
        ("etc/jupyter/nbconfig/notebook.d", [
            "jupyter-config/nbconfig/notebook.d/jupytergraffiti.json"
        ])
    ],
    author="Will Kessler",
    author_email="will@udacity.com",
    description="Create interactive screencasts inside Jupyter Notebook that anybody can play back.",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/willkessler/jupytergraffiti",
    classifiers=[
        "Framework :: Jupyter",
        "Intended Audience :: Education",
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: BSD License",
        "Operating System :: OS Independent",
        "Natural Language :: English",
    ],
    zip_safe=False
)
