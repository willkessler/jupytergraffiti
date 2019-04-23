# docker build . -t jupytergraffiti
# docker run --rm -p 8888:8888 -e JUPYTER_LAB_ENABLE=yes -v "$PWD":/home/jovyan jupytergraffiti
FROM jupyter/datascience-notebook

USER root
RUN curl -sL https://deb.nodesource.com/setup_11.x | sudo bash - && apt-get install -y nodejs
RUN mkdir -p /opt/jupytergraffiti
COPY . /opt/jupytergraffiti
WORKDIR /opt/jupytergraffiti

RUN cd /opt/jupytergraffiti && npm install && npm run build && \
       jupyter nbextension install graffiti-dist && jupyter nbextension enable graffiti-dist/graffiti

#RUN jupyter nbextension install graffiti_extension --symlink --user
#RUN jupyter nbextension enable graffiti_extension/main --user

# Switch back to where we'll mount $PWD when we start up this container
USER jovyan
RUN mkdir -p /home/jovyan/work
WORKDIR /home/jovyan/work

