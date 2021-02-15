#!/bin/bash

echo "(Re)Building docker image."
docker build jupytergraffiti -t jupytergraffiti --no-cache

echo "Starting Jupyter Server container with Graffiti Extension..."
# Note: optional shell arg tip from https://stackoverflow.com/questions/9332802/how-to-write-a-bash-script-that-takes-optional-input-arguments
docker run --rm -p ${1-8888}:8888 -v "$PWD":/home/jovyan/work jupytergraffiti
