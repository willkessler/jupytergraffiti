# jupytergraffiti
Create interactive screencasts inside Jupyter Notebook that anybody can play back.

# Jupyter Graffiti

Ever wanted to offer someone a hands-on demo in Jupyter Notebook? Now
you can! Just add _Graffiti_, and any text inside a code cell can be
annotated with a hoverable tip (a "_Graffiti_") displaying the markdown of your
choice to explain your code in whatever detail you want.  Even better, you can
attach a recording of all your activity in your notebook, including:

* Audio track (e.g. voice narration), recorded by your laptop's microphone
* Mouse movement and scrolling in the notebook
* Selecting and editing inside code cells
* The output of any code cell executions
* You can draw and highlight over sections you think are important or handwrite notes.

## Advantages of _Graffiti_ Over Traditional Screencasts

* You can save any number of _Graffiti_ in a Notebook
* You don't need any special software other than this repo and Jupyter Notebook to create and save _Graffitis_.
* Viewers can play back any _Graffiti_ just by hovering over it and clicking the _Show Movie_ button.
* Viewers can pause recorded playback any time, scrub forward and backward, and interact with the Notebook during
playback at any point. No more need to watch a whole recorded screencast and then switch contexts back to a Notebook; students can explore right along with
you in the same environment.
* Jupyter Graffiti is easy to use, either as a Python library or a Docker image with a Jupyter Extension.  (At Udacity, Jupyter Notebook Workspaces use the plugin, see below how to accomplish this).
* All data, including audio, is stored in compressed plain text in a directory separate from your notebook files for easy portability and storage in any version control system.

## Demo

You can see a live demonstration of a Notebook with Graffiti here: (coming shortly)

Learning About Python Function Parameters

You can also find more samples in the `samples/` directory. (coming shortly)

## Installation

There are three ways to use _Graffiti_: as a python library, using a docker image, or installing a plugin into your Jupyter Notebook configuration. 

### As a Python Library (Simplest Option)

1. `git clone` this repo in the same directory where you keep the notebook(s) you want to add _Graffiti_ to.
1. Add and run this command in a cell in the Notebook you want to start adding _Graffiti_ to: 

```
import jupytergraffiti
```

If everything works, you should see the following message (temporarily) displayed in your Jupyter menu bar:

In addition, clicking in a code cell will show the _Graffiti_ content creation controls:

If you don't see either of these things, use `Kernel... Restart and Clear Output` first, then try running the `import jupytergraffiti` command again.

### As a Docker image (Slightly More Complex Option) (coming shortly)

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

You may need to restart your Jupyter server to get the extension to load, although usually that's not required.

### Uninstalling the Graffiti extension from your Jupyter Server

To disable the plugin, you can visit
`~/.jupyter/nbconfig/notebook.json` and set
`"jupyter_graffit/graffiti_extension/main": false` in the
`"load_extensions"` block. Then restart the Jupyter server.

## Usage

To add a _Graffiti_, simply click in any text in any code cell and click
either "Create" or "Record". In either case you will be presented with
a new cell you can use for editing the markdown content shown when a
user of your notebook hovers over your _Graffiti_.  If you click in an
existing _Graffiti_, you will see Edit instead of Create, but the
process is the same.

Enter any markdown you want to show up in the _Graffiti_ tip, and
click Save Annotation. The editing cell will disappear and you will
return to the cell where you were adding your _Graffiti_. The text
where you clicked now has an dashed underline. Mouse over the
underline to see your _Graffiti_ tip.

Inside this markdown of a _Graffiti_, certain special controls are
available to you (optional). These are lines of markdown starting with
the special characters `%%`. These are:

`%%button_name` : Specify a different button title to display when you record a movie as part of your _Graffiti_. The default title is _Play Movie_.
`%%caption`     : Specify a special caption that appears at the top of this tip, formatted in boldface, such as _"Will explains..."_
`%%caption_pic` : Provide the markdown path to a small image you want to display to the left of the caption. 



### Creating _Graffitis_
### Creating Recordings

## API

When you `import jupytergraffiti` you immediate get access to several
functions you can use to control Jupyter Graffiti from Python. Some of these
are utility functions and others can be used to control playback.
