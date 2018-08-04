#!/bin/bash

echo "(Re)Building docker image."
docker build jupytergraffiti -t jupytergraffiti

echo "Starting Jupyter Server container with Graffiti Extension..."
docker run --rm -p ${1-8888}:8888 -e JUPYTER_LAB_ENABLE=yes -v "$PWD":/home/jovyan/work jupytergraffiti
