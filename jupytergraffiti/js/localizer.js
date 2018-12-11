define([
  './state.js',
], function (state) {
  const localizer = {  
    defaultLanguage: 'EN',
    language: 'EN',

    getLanguage: () => {
      return localizer.language;
    },

    setLanguage: (language) => {
      if (language !== undefined) {
        localizer.language = language;
      } else {
        localizer.language = localizer.defaultLanguage;
      }
    },

    getString: (token) => {
      if (localizer.translations.hasOwnProperty(localizer.language)) {
        if (localizer.translations[localizer.language].hasOwnProperty(token)) {
          if (localizer.translations[localizer.language][token].length > 0) {
            // console.log('localized, for ' + token + ' returning ' , localizer.translations[localizer.language][token]);
            return localizer.translations[localizer.language][token];
          } else {
            // console.log('unlocalized, for ' + token + ' returning ' , localizer.translations[localizer.defaultLanguage][token]);
            return localizer.translations[localizer.defaultLanguage][token];
          }
        }
      }
      // Cant find the string, just return the token so it's obvious it needs translation
      return token;
    },

    init: () => {
      localizer.translations = {
        'EN' : {
          'ENABLE_GRAFFITI':                   'Enable Graffiti',
          'ACTIVATE_GRAFFITI':                 'Activate Graffiti',
          'GRAFFITI_PRESENT':                  'Graffiti is present on this line to the left.',
          'MOVIE_UNAVAILABLE':                 'Movie is not available.',
          'MOVIE_UNAVAILABLE_EXPLANATION':     'We are sorry, we could not load this movie at this time. Please contact the author of this Notebook for help.',
          'ACTIVATE_GRAFFITI_CONFIRM':         'Activate Graffiti On This Notebook?',
          'CREATE':                            'Create',
          'EDIT' :                             'Edit',
          'EDIT_TOOLTIP' :                     'Edit Graffiti tooltip',
          'START_RECORDING':                   'Start Recording',
          'END_RECORDING':                     'End Recording',
          'RECORD' :                           'Record',
          'RECORD_MOVIE' :                     'Record movie',
          'RERECORD':                          'Rerecord',
          'RERECORD_MOVIE':                    'Rerecord movie',
          'START_PLAYBACK':                    'Start playback',
          'PAUSE_PLAYBACK':                    'Pause playback',
          'MUTE':                              'Mute',
          'UNMUTE':                            'Unmute',
          'HIGH_SPEED_PLAYBACK':               'High speed playback',
          'REGULAR_SPEED_PLAYBACK':            'Regular speed playback',
          'HIGH_SPEED_SILENCES':               'High Speed during silences',
          'REGULAR_SPEED_SILENCES':            'Regular Speed during silences',
          'SKIP_BACK':                         'Skip back',
          'SKIP_FORWARD':                      'Skip forward',
          'TO_PREVIOUS_SENTENCE':              'to previous sentence',
          'TO_NEXT_SENTENCE':                  'to next sentence',
          'SECONDS':                           'seconds',
          'SAVE_GRAFFITI':                     'Save Graffiti',
          'REMOVE_GRAFFITI':                   'Remove Graffiti',
          'BELOW_TYPE_MARKDOWN':               "%% Below, type any markdown to display in the Graffiti tip.\n" +
                                               "%% Then run this cell to save it.\n",
          'SAMPLE_API':                        'Create Sample API Calls',
          'TAKES':                             'Takes',
          'SELECT_SOME_TEXT_MARKDOWN' :        'Select some text in this Markdown cell to add or modify Graffiti, or click inside any existing Graffiti text to modify it.',
          'EDIT_IN_MARKDOWN_CELL' :            'Edit the Markdown cell to add or modify Graffiti in the cell.',
          'SELECT_SOME_TEXT_PLAIN' :           'Select some text to create or modify Graffiti, or click inside any existing Graffiti text to modify that Graffiti.',
          'YOU_CAN_PLAY_VIA_TOOLTIP' :         'You can play this movie any time via its tooltip.',
          'PLEASE_WAIT_STORING_MOVIE' :        'Please wait, storing this movie...',
          'YOU_CAN_FILTER' :                   'You can filter this Notebook\'s Graffiti by clicking on creators in the list below.',
          'PAUSE_TO_INTERACT' :                '<span class="graffiti-notifier-link" id="graffiti-pause-link">Pause</span> (or scroll the page) to interact with this Notebook',
          'CANCEL_MOVIE_PLAYBACK_1' :          '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-link">Cancel</span> movie playback (Esc)',
          'CANCEL_MOVIE_PLAYBACK_2' :          '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-postreset-link">Cancel</span> movie playback (Esc)',
          'CANCEL_MOVIE_PLAYBACK_3' :          '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-prereset-link">Cancel</span> movie playback (Esc)',
          'PLAY_MOVIE_AGAIN' :                 '<span class="graffiti-notifier-link" id="graffiti-restart-play-link">Play movie again</span>',
          'CONTINUE_MOVIE_PLAYBACK' :          '<span class="graffiti-notifier-link" id="graffiti-continue-play-link">Continue</span> movie playback',
          'ENTER_AND_SAVE' :                   'Enter the markdown you want to be displayed in the Graffiti and then click "Save Graffiti"  (or just run the label cell).',
          'CANCEL_CHANGES_1' :                 'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-graffiting-link">Cancel changes</span>',
          'CANCEL_CHANGES_2' :                 'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-labelling-link">Cancel changes</span>',
          'ENTER_MARKDOWN_MOVIE_DESCRIPTION' : 'Enter markdown to describe your movie, then click "Start Recording" (or just run the label cell).',
          'CLICK_BEGIN_MOVIE_RECORDING' :      'Click anywhere in the notebook to begin recording your movie.',
          'CANCEL_RECORDING_1' :               'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-pending-link">Cancel recording</span>',
          'CANCEL_RECORDING_2' :               'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-link">Cancel recording</span>',
          'ACTIVITIES_BEING_RECORDED':         'Your activities are being recorded.' + 
                                               'Press ⌘-M or click <span class="graffiti-notifier-link" id="graffiti-end-recording-link">End Recording</span> ' +
                                               'to end recording.',
          'LOADING':                           'Loading...',
          'LOADING_PLEASE_WAIT':               'Loading Graffiti movie, please wait...',
          'RECORDED_ON':                       'Recorded',
          'PRESS_ESC_TO_END_MOVIE_PLAYBACK' :  'Press ESC to end movie playback',
          'SHOW_GRAFFITI_EDITOR':              'Show Graffiti Editor',
          'HIDE_GRAFFITI_EDITOR':              'Hide Graffiti Editor',
          'ENTER_LABEL':                       'Enter a label...',
          'FREEFORM_PEN_TOOL' :                'Freeform pen tool',
          'HIGHLIGHTER_TOOL':                  'Highlighter tool',
          'ERASER_TOOL':                       'Eraser tool',
          'USE_DISAPPEARING_INK':              'Use disappearing ink',
          'USE_DASHED_LINES':                  'Use dashed lines',
          'DASHED_LINES':                      'Dashed lines',
          'TEMPORARY_INK':                     'Temporary Ink',
          'SOLID_FILL':                        'Solid Fill',
          'SHIFT_KEY_ALIGN':                   'Shift-key: align items to grid / keep items square',
          'PLAY_CONFIRM':                      'Are you sure you want to play this Graffiti?',
          'REPLACE_CONFIRM_BODY_1':            'This Graffiti movie may replace the contents of code cells. After this movie plays, do you want to...',
          'REPLACE_CONFIRM_BODY_2':            'Restore Cell Contents After Playback Ends',
          'REPLACE_CONFIRM_BODY_3':            'Let this Movie Permanently Set Cell Contents',
          'ACCESS_MICROPHONE_PROMPT':          'Please grant access to your browser\'s microphone.',
          'ACCESS_MICROPHONE_ADVISORY':        'You cannot record Graffiti movies unless you grant access to the microphone. ' +
                                               'Please <a href="https://help.aircall.io/hc/en-gb/articles/115001425325-How-to-allow-Google-Chrome-to-access-your-microphone" ' +
                                               'target="_">grant access</a> and then reload this page.',
          'ACTIVATE_GRAFFITI_ADVISORY':        'Enable Graffiti on this Notebook, so you can begin using Graffiti for the first time?<br>' +
                                               'If you click Cancel, we will not change the notebook in any way.' +
                                               '<br><br><i>(This process merely adds some metadata to the cells, but does not otherwise change the Notebook\'s contents.)</i>',
        }
      };
      const notebook = Jupyter.notebook;
      localizer.setLanguage('EN');
      if (notebook.metadata.hasOwnProperty('graffiti')) {
        if (notebook.metadata.graffiti.hasOwnProperty('language')) {
          localizer.setLanguage(notebook.metadata.graffiti.language);
        }
      }
      return new Promise((resolve) => {
        requirejs(['/nbextensions/graffiti_extension/js/locales/cn/strings.js'], function (strings) {
          console.log('Fetched lang strings');
          localizer.translations['CN'] = strings.getTranslations();
          console.log('we loaded chinese translations.');
          //localizer.setLanguage('CN');
          resolve();
        });
      });

    },

  };

  return (localizer);

});
