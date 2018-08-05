from __future__ import absolute_import
from IPython.display import Javascript, display_javascript, HTML

def run_js(jscmd, force):
    if (force):
        jsf = Javascript(jscmd)
    else:
        jsf = Javascript("// Graffiti javascript\n" + "if (window.Annotations !== undefined) {\n" + jscmd + "\n}\n")
    display_javascript(jsf)
    
def initialize():
    run_js("require(['jupytergraffiti/js/loader.js']);", True)

def play_recording(recording_id):
    run_js("window.Annotations.playRecordingById('" + recording_id + "')", False)

def play_recording_with_prompt(recording_id, prompt_markdown):
    run_js("window.Annotations.playRecordingByIdWithPrompt('" + recording_id + "','" + prompt_markdown.replace("'", "\\'") + "')", False)

def stop_playback():
    run_js("window.Annotations.cancelPlayback()", False)

def remove_all_annotations():
    run_js("window.Annotations.removeAllAnnotations()", False)

def set_access_level(level):
    run_js("window.Annotations.setAccessLevel('" + level + "')", False)
