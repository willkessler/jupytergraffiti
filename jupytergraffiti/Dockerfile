# docker build . -t jupytergraffiti
# docker run --rm -p 8888:8888 -e JUPYTER_LAB_ENABLE=yes -v "$PWD":/home/jovyan jupytergraffiti
FROM jupyter/datascience-notebook

USER root
RUN mkdir -p /opt/jupytergraffiti
COPY . /opt/jupytergraffiti
USER jovyan
WORKDIR /opt/jupytergraffiti
RUN jupyter nbextension install graffiti_extension --symlink --user
RUN jupyter nbextension enable graffiti_extension/main --user

# Switch back to where we'll mount $PWD when we start up this container
RUN mkdir -p /home/jovyan/work
WORKDIR /home/jovyan/work

