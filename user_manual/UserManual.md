
# Jupyter Graffiti: Introduction and User Manual

### What is Jupyter Graffiti?

Jupyter Graffiti are short movies you can add to Notebooks that can illustrate and teach any concept you can think of. It's similar to a screencast, but there's no traditional "video"; instead, movies are "live", meaning they play back whatever you were doing while recording, right in the notebook cells. Viewers can pause your movie any time and play around in your Notebook to try out whatever you're showing them.

You can add unlimited Graffiti to text, code, and even images in any Notebook cell.   

Try out a demo of Graffiti on <a style="font-weight:800;color:blue;" target="_demo" title="Jump to Graffiti Demo" href="https://mybinder.org/v2/gh/willkessler/jupytergraffiti/master?filepath=samples%2FGraffiti%20Basic%20Demo.ipynb">this Binder link</a>.

A screenshot of a Graffiti movie in play is shown below:



<div style="background: url(pythagorasTip5.png); background-repeat:none; background-size:100% 100%;width:100%;height:890px;">
</div>

<br>
<br>
<hr>

You can also add buttons and inline terminals (shells) to help illustrate ideas and techniques and record your activities in these as well:
 

<div style="background: url(terminal1.png); background-repeat:none; background-size:100% 100%;width:100%;height:504px;">
</div>

### Playing back Jupyter Graffiti

Graffiti are indicated by a <span style="border-bottom:2px dashed rgb(47,147,107);">dashed green underline</span> underneath text or images, as well as a green marker off to the side of the Notebook. When the users hover over the underlined text, the user will see a floating tip which gives information and access to play the movie (when a movie is available for the Graffiti).

During movie playback, the user is able to "scrub" to any part of the movie (just like a regular video on YouTube), pause the movie, mute the sound, and play the movie at 2x speed. They can also click the red X to cancel playback any time. 


<div style="background: url(graffitiTipAndMarker.png); background-repeat:none; background-size:100% 100%;width:100%;height:288px;">
</div>

### What kinds of things can you record into a movie?

* Your voice (just talk as you record)
* All your mouse movements, page and cell scrolling, clicking, selecting/highlighting
* Any cell execution and its associated output
* Adding and removing cells

### What else can you do with Graffiti?

* You can use the Graffiti tips alone; you don't need to record movies if you don't want to. Sometimes tips provide all the information a viewer needs. For instance, in complicated code you can create tips explaining parts of the code that can take the place of a lot of code comments. You can therefore keep the code much shorter and users who are interested can hover over the Graffiti to read the tips only if they want to.
* You can add "annotations" like freeform drawings, arrows, boxes and other symbols, even pictures-- basically you can scribble on your Notebook anywhere you like (it's only visible while the movie is playing).
* You can insert "mini-terminals" that give you access to a system shell inside a Notebook cell. All interaction with the "mini-terminals" can be recorded in your movies.
* "Graffiti buttons" can be inserted in cells. These buttons can play Graffiti movies, reveal solutions to challenges students might be facing, or run a command in the mini-terminals.
* Lock the markdown cells: You can "lock" all the markdown cells so that the user cannot edit them. This is helpful if your markdown content is for teaching only, and you want students to stay focused on code cells.


### Setting up Jupyter Graffiti for the First Time

Jupyter Graffiti is a Notebook extension. 

The only requirement is Jupyter Notebooks and your web browser (Chrome/Firefox preferred). 

Installation of the software is covered in the README, but you can also try it out without installing anything at the Binder link at the top of this document.

### Activating Jupyter Graffiti in a Notebook

Load any Notebook and activate Graffiti by simply clicking the Activate Graffiti button. This step just adds some metadata to the notebook (a graffiti `id`) so that the Graffiti extension can connect Graffiti and recordings back to this Notebook. You can activate Graffiti on more than one Notebook in a directory; the Graffiti will all be stored inside the `jupytergraffiti_data` folder in the same directory as the Notebook. 

<div style="background: url(activateGraffiti2.png); background-repeat:none; background-size:100% 100%;width:100%;height:180px;">
</div>

### Creating Tips

Once Graffiti has been activated for a given Notebook, the "Activate Graffiti" button now becomes the Show Graffiti Editor button. Click this button to show or hide the editor panel. You can drag the editor panel around to get it out of your way if it's covering up important content using the drag handle on the left side of the panel.

Now, when you select some text in a Notebook code cell, the Graffiti editor panel will  show a button that says "Create" on it. Click this button. A new code cell will appear above your current cell. Enter whatever you want to show up in the Graffiti tip. (You can use markdown formatting here).

When you hit control-enter in the Graffiti editor cell, or click "Save Graffiti" in the editor panel, your Graffiti will be saved, the Graffiti editor cell will disappear, and you will see a green underline under the text in the code cell where you made your selection. Mouse over the underlined text to see your new tip.

<div style="border:1px solid #ddd;background: url(showGraffitiEditor.png);  background-size:100% 100%;width:100%;height:200px;">
</div>

### Creating Movie Recordings

#### Recording your interactions

When you edit a markdown cell and select any text in it, the Editor Panel will show a "Record" button. This allows you to record a movie. 

Click the Record button. Scroll approximately to where you wish to begin recording, and click anywhere in the Notebook. From now on, all of your activities are being recorded. 

The Editor Panel will look like what's shown in the screenshot below. You can use the pen, highlight and eraser tools, or expand the stickers part of the panel to get additional markup tools to use while recording.

To finish recording, hold down the Option key for about a second. The movie recording will automatically be saved and attached to your Graffiti.


<div style="border:1px solid #ddd;background: url(recordingGraffitiInProgress.png);  background-size:100% 100%;width:100%;height:500px;">
</div>

#### Annotating while recording

While making a recording, you can use the Editor panel to create line drawings, highlight items, or add "stickers" by selecting from the stickers choices. All of these annotations are drawn in "temporary ink" meaning they fade away after a few seconds (unless you uncheck that option in the Editor panel).

You can also type text stickers anywhere in your Notebook, using the Text sticker, and even create custom image stickers with the Cs sticker icon.

Keep in mind that all drawings created during a recording only persist while the recording is being played back. After the movie ends, the drawings will disappear until the next time the movie is played.

#### Editing and Recording

Once you've made a tip or recording, you can always edit it, (re)record a movie, or remove it entirely. Just select somewhere inside the Graffiti text (in markdown cells you will need to edit the Markdown, in code cells, just click inside the graffiti-ized text).

<div style="border:1px solid #ddd;background: url(editingGraffitiInMarkdown.png);  background-size:100% 100%;width:100%;height:250px;">
</div>

#### Using Graffiti Directives

You can add additional "directives" to every Graffiti that control how it behaves. All directives are entered in the Graffiti Editor cell when you Edit the Graffiti tip. 

For instance, the `%%play_on_click` directive will make any movie recorded for a Graffiti begin playing immediately when the Graffiti target (underlined text) is clicked.

Each directive must be added on a line by itself, and all of them start with the special prefix `%%`. A list of available directives is given in the Directives documentation.

#### Locking Markdown cells

If you click the Lock icon on the Graffiti Editor panel, you will lock all the content in markdown cells so that it cannot be edited. You may want to do this to prevent students from accidentally modifying instructional content in markdown cells or deleting Graffiti.

#### Removing Graffiti

Use the Trash icon in the Graffiti panel to delete a Graffiti. You must select in the text of the Graffiti first. If the Graffiti is in a markdown cell then edit the markdown cell, click in the Graffiti text, and then click the Trash icon.

If you delete text containing a Graffiti, it will not be removed from the stored Graffiti in the `jupytergraffiti_data` folder, although that's not a big deal. But to be most efficient you should use the Trash icon to remove Graffiti before you delete the text containing the Graffiti.

#### Using the API

Graffiti includes a Python API that's loaded when you run `import jupytergraffiti` in a code cell. Using this API, you can trigger Graffiti movies to play via your Python code, rather than via user clicks. You can also take other actions on Graffiti. For more information on the API, please consult the API documentation.

### Graffiti Extras

If no text is selected in your Notebook the Editor Panel gives you access to several Graffiti "extras" as shown below.

<div style="border:1px solid #ddd;background: url(graffitiExtras2.png);  background-size:100% 100%;width:100%;height:500px;">
</div>

### Creating Inline Terminals (Shells)

You can insert a Graffiti shell using the shell icon on the Graffiti Editor panel. It will be inserted before the selected cell. 

You can control how many lines of text the shell has. Edit the metadata for the cell and change the *"rows"* entry to the number of desired rows:

```
"graffitiConfig": {
    "rows": 6,
    "startingDirectory": "samples",
    "terminalId": "id_73csup4",
    "type": "terminal"
  }
  ```

For instance, in the above metadata the current number of rows is 6. You could, for instance, change the number of rows to 12. In order for the change to "stick", you must save the Notebook and reload the page.

### Creating Graffiti Buttons

You can insert a Graffiti Button by clicking the Button icon in the Graffiti Editor panel. If you have selected a markdown cell with an existing Graffiti button in it, a new button will be created alongside the existing one.

To control the Graffiti associated with the button, edit the markdown cell contents. When you click inside the Graffiti text, the Graffiti Editor panel will provide an Edit button you can use to configure the button Graffiti in the same way you configure any Graffiti. You can use directives to configure what the button does when clicked, for instance, running a command in a Graffiti shell.

### Creating a Graffiti "Suite"

The easiest way to set up shells and buttons to work in concert is a Graffiti Suite.

A "Graffiti Suite" is actually a regular code cell, a Graffiti shell, and a Graffiti Button, all wired together. You can create a Suite by clicking the Suite button on the Graffiti Editor panel.

The code cell is set up to autosave its contents to a text file every time they are changed. The Suite's Graffiti Button will run an arbitrary shell command (by default, the button just runs the `cat` command on the text file, but you can change this to anything you like).  Using a Suite, you can provide a simple coding environment for a student which can then run arbitrary commands on their resulting text files. 

You can configure the file the code cell's contents are saved to, and what command the button runs, by editing the directives of the Graffiti Button. An example set of directives is shown in the code cell below. These directives are used by the "Run Code" button in the Graffiti Demo Notebook.


```python
# Here are some example directives for a "Run Code" button
%%play_on_click
%%hide_tooltip
%%save_to_file id_54d409v "./sum_natural.cpp"
%%terminal_command id_up4395w "g++ ./sum_natural.cpp && ./a.out"
```

### Using Show/Hide Graffiti Buttons

Use the Graffiti Editor panel to create a Show/Hide Button, and you can make it easy to show a solution to a student for any problem they're working on. Again, this is a regular Graffiti button but configured with directives that will insert a code cell below the cell containing the Graffiti button. Into this code cell Graffiti will insert the contents of any file you wish.  Click the Graffiti button again and the solution cell will be deleted.

If you like, you can record a movie that explains the contents of the solution cell. To do so, you must first *Show* the solution cell by clicking the Show/Hide Button. Then edit the markdown cell containing the button so that you can record a movie on that button. This movie will be played when the student shows the solution cell by clicking the Show/Hide Button. 

### Graffiti Movie "Takes"

Graffiti records each movie as many times as you like. You can pick the best "take" to show your viewers. After you record a movie, you will see a list of "Takes" in the Editor Panel when you select the Graffiti. The most recent take is the highest number but you can select an earlier take. Whatever you select will be the take that is viewed when that Graffiti's movie is played.

This can be handy when you want to rerecord a movie but reference what you recorded previously.

### "Skips"

Tapping the option (alt) key while recording begins (or ends) a skip period. During this period, by default your activities will not be recorded. You may want to do this during a recording to pause for a bit and then come back.

Via directives, you can change all the skips in a movie to accelerations instead. For instance, instead of just skipping over a section, you can make that section play at 4x speed or play through in just half a second. 

Because holding down the option key to end recording takes about a second, Graffiti automatically inserts a jump skip at the end of every recording ended by holding down the option key. You cannot control how this skip behaves: Graffiti will always jump over this "tail second" during playback.

### Notes about How Graffiti Works

* Any changes made to the notebook during playback are rolled back when the movie finishes or is cancelled (so students don't lose any of their own work).  (Via a directive, you can also make changes "stick" after a movie completes. This is useful if you want a student to pick up and extend your example.)
* Movies only affect the cells interacted with during recording. If you record a movie that only changes the contents of one cell, no other cells are affected during playback.
* Because all the Graffiti information is stored in text files inside the `jupytergraffiti_data` directory, you can add that directory to a source-code control system like `git` if you want to manage changes that way (including recorded audio)
* All Graffiti in a notebook are loaded when the notebook is loaded (but asynchronously).  Because there is no streaming, we don't recommend making 10 minute long movies-- the audio portion of the download would be large. Instead, try to create many short movies of 1-3 minutes so that the user doesn't wait a long time to see your videos begin.
* Graffiti tries to line up scrolling and the cursor as best it can with the cells that were present during the recording. If you delete cells or rearrange the cells, the movies may not play as expected.
* If you want, you can even insert old-skool YouTube videos in the tip via the `%%caption_video_id` directive. This way you can add a talking head to your Graffiti before the user starts playing the Graffiti movie.
* If you split a Notebook into two notebooks, be aware that the Notebooks will share a Graffiti id. Behavior of movies in two notebooks that share an ID is unpredictable. Via the API you can make a copy of the first notebook and update all its Graffiti ids to new id's, and then delete Graffiti from the second notebook.
* If you are inserting more than one Graffiti terminal, you can have it share a single shell. This may help the terminals load faster but be aware that these are all one Jupyter shell now so whatever you type in one shell will appear in all the shells.  The metadata you must modify is at the Notebook level. 
* In code cells, Graffiti are tied to the "tokens" you select, not specific characters. For instance, if you add a Graffiti to the second "dog" word in the sentence _The cat, who was friends with the dog, refused to go on a walk with the dog_ then if you insert another _dog_ in the sentence, the Graffiti will appear to move. This is because we just store the fact that the second instance of the word "dog" in the code cell has the Graffiti. E.g. _The cat and the dog, who was friends with the other dog, refused to go on a walk with the dog_. The Graffiti will now be shown on the second "dog", not the third "dog".

### Sharing Graffiti with Others

You can send a notebook to anyone else as you normally would, and it will be annotated with Graffiti. However, you will also need to send along the `jupytergraffiti_data` folder alongside the notebook, as this contains all the information about the Graffiti and movie recordings.

If you use and install the `nbzip` extension then it's easy to download this folder as a compressed (tarball) file for upload elsewhere.

The recipient of your Graffiti-ized notebook will also need to install Graffiti to view your Graffiti. Or they can upload the notebook and the `jupytergraffiti_data` folder to binder.org to view them there.

### Who can use Graffiti?

Graffiti is open sourced under the same license as Jupyter Notebook. If you use it, please let us know and spread the word about Graffiti.

<hr>

Graffiti Version: 1.0

Date of this Manual: 04/16/19
