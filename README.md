# jupytergraffiti
Create interactive screencasts inside Jupyter Notebook that anybody can play back.

# Jupyter Graffiti

Ever wanted to offer someone a hands-on demo in Jupyter Notebook? Now
you can! Just add Graffiti and any text inside a code cell can be
annotated with a tip (a "graffiti") displaying the markdown of your
choice to explain your code in whatever detail you want.  Even better, you can
attach a recording of all all activities in your notebook to a
Graffiti, including:

* An audio track (e.g. voice narration), recorded with your laptop's microphone
* Your mouse cursor and scrolling up and down the notebook
* All selecting and editing inside code cells, and the output of any execution of code cells
* You can draw and highlight over sections you think are important.

# Advantages of Graffiti Over Traditional Screencasts

* You can save any number of Graffiti in a Notebook
* You don't need any special software other than the plugin and Jupyter Notebook to create and save Graffitis.
* Viewers can play any graffiti back just by hovering over the annotation.
* Viewers can pause any recorded playback anywhere, scrub forward and backward in time, and interact with the Notebook during
playback at any time. No more need to watch a whole recorded screencast and then switch contexts back to a Notebook; students can explore right along with
you in the same environment.
* Jupyter Graffiti is easy to use, either as a python library or a docker image with a Jupyter Extension.  At Udacity, Jupyter Notebook Workspaces have the plugin built in.
* All data, including audio, is stored in compressed plain text in a directory separate from your notebook files for easy portability and storage in any version control system.

## Demo

You can see a live demonstration of a Notebook with Graffiti here:

Learning About Python Function Parameters

You can also find more samples in the `samples/` directory.

## Installation

There are three ways to use Graffiti: as a python library, using a docker image, or installing a plugin into your Jupyter Notebook configuration. 

### As a Python Library (Simplest Option)

1. `git clone` this repo in the same directory where you keep the notebook(s) you want to add Graffiti to.
1. Add and run this command in a cell in the Notebook you want to start adding Graffiti to: 

```
import jupytergraffiti
```

If everything works, you should see the following message (temporarily) displayed in your Jupyter menu bar:

In addition, clicking in a code cell will show the Graffiti content creation controls:

If you don't see either of these things, use `Kernel... Restart and Clear Output` first, then try running the `import jupytergraffiti` command again.

### As a Docker image (Slightly More Complex Option)

You'll need to install Docker first. Then you can take the following steps
1. `cd jupytergraffiti`
1. `./build.sh`
1. `cd ..`
1. `./jupytergraffiti/run.sh`

This will start up a Docker container running the Jupyter Server and
the Jupyter Graffiti extension, with the container's home directory
being mounted where your Jupyter Notebook(s) are located.

The advantage of using the Docker container is that Jupyter Graffiti
is always loaded automatically so you don't have the run `import
jupytergraffiti` in the Notebook (unless you want access to the
Graffiti API, cf below for details on that).

The container will serve content out of port 8888. If you already have
a Jupyter server running on this port, pass a different port to
`run.sh` e.g. :

`./jupytergraffiti/run.sh 8889`

### Installing the Graffiti extension in your own Jupyter Server

This will permanently install the extension in Jupyter (although you
can always uninstall it if you want to). This means the extension will
always be available whenever you start up your Jupyter server. To
install the extension:

1. `cd jupytergraffiti`
1. `jupyter nbextension install jupytergraffiti/graffiti_extension --symlink --user`
1. `jupyter nbextension enable jupytergraffiti/graffiti_extension/main --user`

### Uninstalling the Graffiti extension from your Jupyter Server

To disable the plugin, you can visit `.local/share/jupyter/nbconfig/notebook.json` and set true to false.

## Usage

To add a Graffiti, simply click in any text in any code cell and click
either "Create" or "Record". In either case you will be presented with
a new cell you can use for editing the markdown content shown when a
user of your notebook hovers over your Graffiti.  If you click in an
existing Graffiti, you will see Edit instead of Create, but the
process is the same.

Inside this markdown, certain special controls are offered. These are lines of markdown starting with the special characters `%%`.



### Creating Graffitis
### Creating Recordings

## API

When you `import jupytergraffiti` you immediate get access to several
functions you can use to control Graffiti from Python. Some of these
are utility functions and others can be used to control playback.
