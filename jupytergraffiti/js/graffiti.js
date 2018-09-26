define([
  'base/js/dialog',
  './LZString.js',
  './state.js',
  './utils.js',
  './audio.js',
  './storage.js',
  './selectionSerializer.js',
  'components/marked/lib/marked'
], function(dialog, LZString, state, utils, audio, storage, selectionSerializer, marked) {
  const Graffiti = (function() {
    const graffiti = {

      init: () => {
        console.log('Graffiti: Main constructor running.');
        
        utils.loadCss([
          'jupytergraffiti/css/graffiti.css'
        ]);

        const location = document.location;

        state.init();
        const currentAccessLevel = state.getAccessLevel();

        graffiti.LZString = LZString;
        graffiti.rewindAmt = 2; /*seconds */
        graffiti.CMEvents = {};
        graffiti.sitePanel = $('#site');
        graffiti.notebookPanel = $('#notebook');
        graffiti.notebookContainer = $('#notebook-container');
        graffiti.notebookContainerPadding = parseInt(graffiti.notebookContainer.css('padding').replace('px',''));
        graffiti.penColor = '000000';
        graffiti.lastDisplayIndexes = {};

        graffiti.recordingIntervalMs = 10; // In milliseconds, how frequently we sample the state of things while recording.
        graffiti.storageInProcess = false;
        graffiti.highlightMarkText = undefined;
        graffiti.cmLineHeight = 17.0001; // line height of code mirror lines as styled in Jupyter
        graffiti.cmLineFudge = 8; // buffer between lines
        graffiti.tokenRanges = {};
        graffiti.canvases = { 
          permanent: {}, // these canvases persist drawings throughout the lifespan of the recordin
          temporary: {}  // these canvases get wiped a couple seconds after the person stops drawing
        };
        graffiti.lastUpdateControlsTime = utils.getNow();
        graffiti.notificationMsgs = {};
        graffiti.panelFadeTime = 350;

        graffiti.scrollNudgeSmoothIncrements = 6;
        graffiti.scrollNudgeQuickIncrements = 4;
        graffiti.scrollNudge = undefined;

        if (currentAccessLevel === 'create') {
          storage.ensureNotebookGetsGraffitiId();
          graffiti.activateAudio();
        }

        storage.loadManifest(currentAccessLevel).then(() => {
          graffiti.initInteractivity();
        }).catch(() => {
          console.log('Graffiti: Not setting up Graffiti because this notebook has never had any authoring done yet (no recordingId).');
        });
      },

      provideAPIKeyExamples: () => {
        let recorderApiKeyCell = Jupyter.notebook.insert_cell_below('code');
        let invocationLine = "jupytergraffiti.api.play_recording('" + graffiti.recordingAPIKey + "')\n" +
                             "# jupytergraffiti.api.play_recording_with_prompt('" + graffiti.recordingAPIKey +
                             "', '![idea](../images/lightbulb_small.jpg) Click **here** to learn more.')\n" +
                             "# jupytergraffiti.api.stop_playback()";
        recorderApiKeyCell.set_text(invocationLine);          
        Jupyter.notebook.select_next();
        recorderApiKeyCell.code_mirror.focus();
      },

      bindControlPanelCallbacks: (parent, callbacks) => {
        if (callbacks !== undefined) {
          let cb, id, elem;
          for (cb of callbacks) {
            for (id of cb.ids) {
              parent.find('#' + id).on(cb.event, cb.fn);
            }
          }
        }
      },

      setNotifier: (notificationMsg, callbacks) => {
        const notifierPanel = graffiti.controlPanelIds['graffiti-notifier'];
        notifierPanel.show().children().hide();
        if (!graffiti.notificationMsgs.hasOwnProperty(notificationMsg)) {
          const notificationId = 'graffiti-notification-' + utils.generateUniqueId();
          const notificationHtml = $('<div id="' + notificationId + '">' + notificationMsg + '</div>');
          notificationHtml.appendTo(notifierPanel);
          const newNotificationDiv = notifierPanel.find('#' + notificationId);
          graffiti.notificationMsgs[notificationMsg] = newNotificationDiv;
          graffiti.bindControlPanelCallbacks(newNotificationDiv, callbacks);
        }
        graffiti.notificationMsgs[notificationMsg].show();
      },

      startPanelDragging: (e) => {
        console.log('Graffiti: dragging control panel');
        const controlPanelPosition = graffiti.outerControlPanel.position();
        const pointerPosition = state.getPointerPosition();
        state.setControlPanelDragging(true);
        state.setControlPanelDragOffset({ left: pointerPosition.x - controlPanelPosition.left, top: pointerPosition.y - controlPanelPosition.top });
        e.preventDefault();
        e.stopPropagation();
      },
      
      setupOneControlPanel: (elemId,elemHtml, callbacks) => {
        if (graffiti.controlPanelIds === undefined) {
          graffiti.controlPanelIds = {};
        }
        const fullHtml = '<div class="graffiti-control-panel" id="' + elemId +'">' + elemHtml + '</div>';
        const elem = $(fullHtml);
        elem.appendTo(graffiti.controlPanelsShell);
        graffiti.controlPanelIds[elemId] = graffiti.controlPanelsShell.find('#' + elemId);
        graffiti.bindControlPanelCallbacks(graffiti.controlPanelIds[elemId], callbacks);
      },

      setupControlPanels: () => {
        let previousPlayState;
        // HACK: fix me
        if ($('#graffiti-outer-control-panel').length == 0) {
          const outerControlPanel = $('<div id="graffiti-outer-control-panel">' +
                                      '  <div id="graffiti-inner-control-panel">' +
                                      '    <div class="graffiti-small-dot-pattern" id="graffiti-drag-handle">&nbsp;</div>' +
                                      '    <div id="graffiti-control-panels-shell"></div>' +
                                      '  </div>' +
                                      '</div>');
          //const header = $('#header');
          outerControlPanel.appendTo($('body'));
          const graffitiCursor = $('<i id="graffiti-cursor" name="cursor" class="graffiti-cursor"><img src="jupytergraffiti/css/transparent_bullseye2.png"></i>');
          graffitiCursor.appendTo(header);
        } else {
          console.log('Graffiti: big hack was just run.');
        }

        graffiti.graffitiCursor = $('#graffiti-cursor');
        graffiti.outerControlPanel = $('#graffiti-outer-control-panel');
        graffiti.outerControlPanel.hide();
        graffiti.controlPanelsShell = $('#graffiti-control-panels-shell');

        $('body').on('mouseup', (e) => {
          if (state.getControlPanelDragging()) {
            console.log('Graffiti: no longer dragging control panel');
            state.setControlPanelDragging(false);
            e.preventDefault();
            e.stopPropagation();
          }
        });

        const logoText = 'Graffiti'.split('').join('&nbsp;&nbsp;&nbsp;&nbsp;');
        graffiti.setupOneControlPanel('graffiti-control-panel-title', 
                                      '<div><img src="../images/udacity_tiny_logo.png" /></div><div>' + logoText + '</div>');

        const dragHandle = $('#graffiti-drag-handle,#graffiti-control-panel-title');
        dragHandle.on('mousedown', (e) => {
          graffiti.startPanelDragging(e); 
        });

        graffiti.setupOneControlPanel('graffiti-record-controls', 
                                      '  <button class="btn btn-default" id="graffiti-create-btn">' +
                                      '<i class="fa fa-edit"></i>&nbsp; <span>Create</span></button>' +
                                      '  <button class="btn btn-default" id="graffiti-edit-btn" title="Edit Graffiti movie">' +
                                      '<i class="fa fa-edit"></i>&nbsp; <span>Edit</span></button>' +
                                      '  <button class="btn btn-default" id="graffiti-begin-recording-btn" title="Record movie">' +
                                      '<i class="fa fa-film graffiti-recorder-button"></i>&nbsp;<span>Record</span></button>' +
                                      '  <button class="btn btn-default" id="graffiti-begin-rerecording-btn" title="ReRecord movie">' +
                                      '<i class="fa fa-film graffiti-recorder-button"></i>&nbsp;<span>Rerecord</span></button>' +
                                      '  <button class="btn btn-default" id="graffiti-remove-btn" title="Remove Graffiti">' +
                                      '<i class="fa fa-trash"></i></button>',
                                      [
                                        {
                                          ids: ['graffiti-create-btn', 'graffiti-edit-btn'],
                                          event: 'click',
                                          fn: (e) => {
                                            graffiti.editGraffiti('graffiting');
                                          }
                                        },
                                        {
                                          ids: ['graffiti-begin-recording-btn', 'graffiti-begin-rerecording-btn'],
                                          event: 'click',
                                          fn: (e) => {
                                            graffiti.beginMovieRecordingProcess();
                                          }
                                        },
                                        {
                                          ids: ['graffiti-remove-btn'],
                                          event: 'click',
                                          fn: (e) => {
                                            graffiti.removeGraffitiWithPrompt();
                                          }
                                        },
                                      ]
        );

        graffiti.setupOneControlPanel('graffiti-finish-edit-controls', 
                                      '<button class="btn btn-default" id="finish-graffiti-btn" title="Save Graffiti">Save Graffiti</button>',
                                      [
                                        {
                                          ids: ['finish-graffiti-btn'],
                                          event: 'click',
                                          fn: (e) => {
                                            graffiti.finishGraffiti(true);
                                          }
                                        }
                                      ]
        );

        graffiti.setupOneControlPanel('graffiti-start-recording-controls', 
                                      '<button class="btn btn-default" id="btn-start-recording" title="Start recording">' +
                                      '<i class="fa fa-pause recorder-start-button"></i>&nbsp;Start Recording</button>',
                                      [
                                        {
                                          ids: ['btn-start-recording', 'btn-restart-recording'],
                                          event: 'click',
                                          fn: (e) => {
                                            graffiti.finishGraffiti(true);
                                          }
                                        }
                                      ]
        );

        graffiti.setupOneControlPanel('graffiti-recording-controls', 
                                      '<button class="btn btn-default" id="btn-end-recording" title="End recording">' +
                                      '<i class="fa fa-pause recorder-stop-button"></i>&nbsp;End Recording</button>' +
                                      '<div id="graffiti-recording-status">' +
                                      '  <div id="graffiti-recording-flash-icon"></div>' +
                                      '  <div id="graffiti-time-display-recording"></div>' +
                                      '</div>',
                                      [
                                        {
                                          ids: ['btn-end-recording'],
                                          event: 'click',
                                          fn: (e) => {
                                            graffiti.toggleRecording();
                                          }
                                        }
                                      ]
        );

        graffiti.setupOneControlPanel('graffiti-playback-controls', 
                                      '<div id="graffiti-narrator-info">' +
                                      '  <div id="graffiti-narrator-pic"></div>' +
                                      '  <div id="graffiti-narrator-details">' +
                                      '    <div>Presenter: </div><div id="graffiti-narrator-name"></div>' +
                                      '  </div>' + 
                                      '</div>' +
                                      '<div id="graffiti-playback-buttons">' +
                                      '  <button class="btn btn-default btn-play" id="graffiti-play-btn" title="Start playback">' +
                                      '    <i class="fa fa-play"></i>' +
                                      '  </button>' +
                                      '  <button class="btn btn-default" id="graffiti-pause-btn" title="Pause playback">' +
                                      '    <i class="fa fa-pause"></i>' +
                                      '  </button>' +
                                      '  <div id="graffiti-skip-buttons">' +
                                      '    <button class="btn btn-default btn-rewind" id="graffiti-rewind-btn" title="Skip back ' + graffiti.rewindAmt + ' seconds">' +
                                      '      <i class="fa fa-backward"></i>' +
                                      '    </button>' +
                                      '    <button class="btn btn-default btn-forward" id="graffiti-forward-btn" title="Skip forward ' + graffiti.rewindAmt + ' seconds">' +
                                      '      <i class="fa fa-forward"></i>' +
                                      '    </button>' +
                                      '  </div>' +
                                      '  <div id="graffiti-sound-buttons">' +
                                      '    <button class="btn btn-default btn-sound-on" id="graffiti-sound-on-btn" title="mute">' +
                                      '       <i class="fa fa-volume-up"></i>' +
                                      '   </button>' +
                                      '   <button class="btn btn-default btn-sound-off" id="graffiti-sound-off-btn" title="unmute">' +
                                      '     <i class="fa fa-volume-off"></i>' +
                                      '   </button>' +
                                      '  </div>' +
                                      '</div>' +
                                      '<div id="graffiti-scrub-controls">' +
                                      '  <div id="graffiti-playback-range">' +
                                      '    <input title="scrub" type="range" min="0" max="1000" value="0" id="graffiti-recorder-range"></input>' +
                                      '  </div>' +
                                      '  <div id="graffiti-time-display-playback">00:00</div>' +
                                      '</div>',
                                        [
                                          {
                                          ids: ['graffiti-play-btn', 'graffiti-pause-btn'],
                                          event: 'click',
                                          fn: (e) => {
                                            graffiti.togglePlayback();
                                          }
                                        },
                                        { 
                                          ids: ['graffiti-forward-btn','graffiti-rewind-btn'],
                                          event: 'click',
                                          fn: (e) => {
                                            console.log('Graffiti: forward-btn/rewind-btn clicked');
                                            let direction = 1;
                                            if (($(e.target).attr('id') === 'graffiti-rewind-btn') || ($(e.target).hasClass('fa-backward'))) {
                                              direction = -1;
                                            }
                                            graffiti.jumpPlayback(direction);
                                          }
                                        },
                                        {
                                          ids: ['graffiti-sound-on-btn', 'graffiti-sound-off-btn'],
                                          event: 'click',
                                          fn: (e) => {
                                            if (state.getMute()) {
                                              state.setMute(false);
                                              graffiti.updateControlPanels();
                                              if (state.getActivity() === 'playing') {
                                                audio.startPlayback(state.getTimePlayedSoFar());
                                              }
                                            } else {
                                              state.setMute(true);
                                              graffiti.updateControlPanels();
                                              if (state.getActivity() === 'playing') {
                                                audio.pausePlayback();
                                              }
                                            }
                                          }
                                        },
                                        {
                                          ids: ['graffiti-recorder-range'],
                                          event: 'mousedown',
                                          fn: (e) => {
                                            //console.log('slider:mousedown');
                                            previousPlayState = state.getActivity();
                                            graffiti.pausePlayback(); // stop playback if playing when you start to scrub
                                            graffiti.changeActivity('scrubbing');
                                          }
                                        },
                                        {
                                          ids: ['graffiti-recorder-range'],
                                          event: 'mouseup',
                                          fn: (e) => {
                                            //console.log('slider:mouseup')
                                            if (previousPlayState === 'playing') {
                                              graffiti.startPlayback();
                                            }
                                            graffiti.updateAllGraffitiDisplays();
                                          }
                                        },
                                        {
                                          ids: ['graffiti-recorder-range'],
                                          event: 'input',
                                          fn: (e) => {
                                            graffiti.handleSliderDrag(e);
                                          }
                                        }
                                      ]
        );
        
        graffiti.setupOneControlPanel('graffiti-notifier', 
                                      '<div id="graffiti-notifier"></div>');


        // These two SVGs come from fontawesome-5.2.0: fas fa-highlighter and fas fa-pen-alt, respectively. However, we can't use them without importing the latest
        // fontawesome and that collides with Jupyter's use of fontawesome.

        graffiti.setupOneControlPanel('graffiti-recording-pen-controls', 
                                      '<div id="graffiti-recording-pens-shell">' +
                                      ' <button class="btn btn-default" id="graffiti-line-pen" title="Line tool">' +
                                      '<svg class="svg-inline--fa fa-pen-alt fa-w-16" aria-hidden="true" data-prefix="fa" data-icon="pen-alt" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M497.94 74.17l-60.11-60.11c-18.75-18.75-49.16-18.75-67.91 0l-56.55 56.55 128.02 128.02 56.55-56.55c18.75-18.75 18.75-49.15 0-67.91zm-246.8-20.53c-15.62-15.62-40.94-15.62-56.56 0L75.8 172.43c-6.25 6.25-6.25 16.38 0 22.62l22.63 22.63c6.25 6.25 16.38 6.25 22.63 0l101.82-101.82 22.63 22.62L93.95 290.03A327.038 327.038 0 0 0 .17 485.11l-.03.23c-1.7 15.28 11.21 28.2 26.49 26.51a327.02 327.02 0 0 0 195.34-93.8l196.79-196.79-82.77-82.77-84.85-84.85z"></path></svg>' +
                                      ' <button class="btn btn-default" id="graffiti-highlight-pen" title="Highlighter tool">' +
                                      '<svg class="svg-inline--fa fa-highlighter fa-w-17" aria-hidden="true" data-prefix="fa" data-icon="highlighter" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 544 512" data-fa-i2svg=""><path fill="currentColor" d="M0 479.98L99.92 512l35.45-35.45-67.04-67.04L0 479.98zm124.61-240.01a36.592 36.592 0 0 0-10.79 38.1l13.05 42.83-50.93 50.94 96.23 96.23 50.86-50.86 42.74 13.08c13.73 4.2 28.65-.01 38.15-10.78l35.55-41.64-173.34-173.34-41.52 35.44zm403.31-160.7l-63.2-63.2c-20.49-20.49-53.38-21.52-75.12-2.35L190.55 183.68l169.77 169.78L530.27 154.4c19.18-21.74 18.15-54.63-2.35-75.13z"></path></svg>' +
                                      '</button>' +
                                      ' <button class="btn btn-default" id="graffiti-eraser-pen" title="Eraser tool">' +
                                      '<svg aria-hidden="true" data-prefix="fas" data-icon="eraser" class="svg-inline--fa fa-eraser fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M497.941 273.941c18.745-18.745 18.745-49.137 0-67.882l-160-160c-18.745-18.745-49.136-18.746-67.883 0l-256 256c-18.745 18.745-18.745 49.137 0 67.882l96 96A48.004 48.004 0 0 0 144 480h356c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12H355.883l142.058-142.059zm-302.627-62.627l137.373 137.373L265.373 416H150.628l-80-80 124.686-124.686z"></path></svg>' +
                                      '</div>' +
                                      '<div id="graffiti-recording-colors-shell">' +
                                      '  <div id="graffiti-recording-color-red" colorVal="ff0000"></div>' +
                                      '  <div id="graffiti-recording-color-green" colorVal="00ff00"></div>' +
                                      '  <div id="graffiti-recording-color-blue" colorVal="0000ff"></div>' +
                                      '  <div id="graffiti-recording-color-yellow" colorVal="ffff00"></div>' +
                                      '  <div id="graffiti-recording-color-orange" colorVal="ff9900"></div>' +
                                      '  <div id="graffiti-recording-color-purple" colorVal="8a2be2"></div>' +
                                      '  <div id="graffiti-recording-color-brown" colorVal="996600"></div>' +
                                      '  <div id="graffiti-recording-color-black" colorVal="000000"></div>' +
                                      '</div>' +
                                      '<div id="graffiti-temporary-ink">' +
                                      ' <input type="checkbox" id="graffiti-temporary-ink-control" checked />' +
                                      ' <label id="graffiti-temporary-ink-label" for="graffiti-temporary-ink-control">Temporary Ink</label>' +
                                      '</div>',
                                      [
                                        {
                                          ids: ['graffiti-highlight-pen'],
                                          event: 'click',
                                          fn: (e) => {
                                            console.log('Graffiti: you picked highlighter tool.');
                                            graffiti.toggleGraffitiPen('highlight');
                                          }
                                        },
                                        {
                                          ids: ['graffiti-line-pen'],
                                          event: 'click',
                                          fn: (e) => {
                                            console.log('Graffiti: you picked line tool.');
                                            graffiti.toggleGraffitiPen('line');
                                          }
                                        },
                                        {
                                          ids: ['graffiti-eraser-pen'],
                                          event: 'click',
                                          fn: (e) => {
                                            console.log('Graffiti: you picked eraser tool.');
                                            graffiti.toggleGraffitiPen('eraser');
                                            $('#graffiti-temporary-ink-control').attr({checked:false});
                                            state.setGarnishPermanence('permanent');
                                          }
                                        },
                                        {
                                          ids: [
                                            'graffiti-recording-color-red',
                                            'graffiti-recording-color-green',
                                            'graffiti-recording-color-blue',
                                            'graffiti-recording-color-yellow',
                                            'graffiti-recording-color-orange',
                                            'graffiti-recording-color-purple',
                                            'graffiti-recording-color-brown',
                                            'graffiti-recording-color-black'
                                          ],
                                          event: 'click',
                                          fn: (e) => {
                                            const target = $(e.target);
                                            $('#graffiti-recording-colors-shell div').removeClass('graffiti-recording-color-active');
                                            const colorVal = target.attr('colorVal');
                                            target.addClass('graffiti-recording-color-active');
                                            console.log('Graffiti: you clicked color:', colorVal);
                                            state.setGarnishColor(colorVal);
                                            if (graffiti.activePen === undefined) {
                                              graffiti.toggleGraffitiPen('line');
                                            }
                                          }
                                        },
                                        {
                                          ids: [ 'graffiti-temporary-ink-control', 'graffiti-temporary-ink-label' ],
                                          event: 'click',
                                          fn: (e) => {
                                            const temporaryInk = ($('#graffiti-temporary-ink-control').is(':checked') ? 'temporary' : 'permanent');
                                            state.setGarnishPermanence(temporaryInk);
                                            if ((temporaryInk) && (graffiti.activePen === undefined)) {
                                              graffiti.toggleGraffitiPen('line');
                                            }
                                            console.log('You set temporary ink to:', temporaryInk);
                                          }
                                        }
                                      ]
        );

        graffiti.setupOneControlPanel('graffiti-access-api',
                                      '<button class="btn btn-default" id="graffiti-access-api-btn" title="Create Sample API Calls"></i>&nbsp; <span>Create Sample API Calls</span></button>',
                                      [
                                        { 
                                          ids: ['graffiti-access-api-btn'],
                                          event: 'click', 
                                          fn: (e) => { 
                                            console.log('Graffiti: API key is:', graffiti.recordingAPIKey);
                                            graffiti.provideAPIKeyExamples();
                                          }
                                        }
                                      ]
        );
        
        const creatorsTitle = 'Graffitis by:'.split('').join('&nbsp;');
        graffiti.setupOneControlPanel('graffiti-creators-chooser',
                                      '<div id="graffiti-creators-chooser">' +
                                      ' <div id="graffiti-creators-chooser-title">' + creatorsTitle + '</div>' +
                                      ' <div class="graffiti-creator">' +
                                      '    <div><img src="images/headshots/h1.jpeg"></div>' +
                                      '    <div>Stacy M.</div>' +
                                      ' </div>' +
                                      ' <div class="graffiti-creator">' +
                                      '    <div><img src="images/headshots/h2.jpeg"></div>' +
                                      '    <div>Bobby P.</div>' +
                                      ' </div>' +
                                      ' <div class="graffiti-creator">' +
                                      '    <div><img src="images/headshots/h3.jpeg"></div>' +
                                      '    <div>Akarnam J.</div>' +
                                      ' </div>' +
                                      ' <div class="graffiti-creator">' +
                                      '    <div><img src="images/headshots/h4.jpeg"></div>' +
                                      '    <div>James R.</div>' +
                                      ' </div>' +
                                      ' <div class="graffiti-creator">' +
                                      '    <div><img src="images/headshots/h5.jpeg"></div>' +
                                      '    <div>Amanda M.</div>' +
                                      ' </div>' +
                                      ' <div class="graffiti-creator">' +
                                      '    <div><img src="images/headshots/h6.jpeg"></div>' +
                                      '    <div>Aimee E.</div>' +
                                      ' </div>' +
                                      ' <div class="graffiti-creator">' +
                                      '    <div><img src="images/headshots/h7.jpeg"></div>' +
                                      '    <div>Lena Y.</div>' +
                                      ' </div>' +
                                      ' <div id="graffiti-creators-chooser-show-all">' +
                                      '  <input type="checkbox" id="chooser-show-all" /><label for="chooser-show-all">&nbsp;Show All Graffitis</label>' +
                                      ' </div>' +
                                      '</div>'
        );

      },

      showControlPanels: (panels) => {
        graffiti.controlPanelsShell.children().hide();
        graffiti.controlPanelIds['graffiti-control-panel-title'].css({display:'flex'}); // the title bar is always shown
        for (controlPanelId of panels) {
          // console.log('Graffiti: showing panel:', controlPanelId);
          graffiti.controlPanelIds[controlPanelId].show();
        }
      },


      updateControlPanels: (cm) => {
        // When we transition to a new state, control panel tweaks need to be made
        const activity = state.getActivity();
        const accessLevel = state.getAccessLevel();
        const outerControlHidden = graffiti.outerControlPanel.css('display') === 'none';
        // console.log('updateControlPanels, activity:', activity);
        if (accessLevel === 'view') {
          if (activity !== 'idle') {
            if (outerControlHidden) {
              graffiti.outerControlPanel.fadeIn(graffiti.panelFadeTime);
            }
          } else if ((state.getPlayableMovie('tip') === undefined) && 
                     (state.getPlayableMovie('api') === undefined) && 
                     (state.getPlayableMovie('cursorActivity') === undefined) ||
                     (activity !== 'notifying') ) {
            if (!outerControlHidden) {
              graffiti.outerControlPanel.fadeOut(graffiti.panelFadeTime);
            }
            return;
          }
        } else {
          if (outerControlHidden) {
            graffiti.outerControlPanel.fadeIn(graffiti.panelFadeTime);
          }
        }

        switch (activity) {
          case 'idle':
            // Check if anchor or head of current selection is inside an existing recording token set. Controls will be different if so.
            let activeCell;
            if (cm === undefined) {
              activeCell = Jupyter.notebook.get_selected_cell();
            } else {
              activeCell = utils.findCellByCodeMirror(cm);
            }
            graffiti.selectedTokens = utils.findSelectionTokens(activeCell, graffiti.tokenRanges, state);
            console.log('Graffiti: graffiti.selectedTokens:', graffiti.selectedTokens);
            graffiti.highlightIntersectingGraffitiRange();
            let visibleControlPanels;
            const isMarkdownCell = activeCell.cell_type === 'markdown';
            if ((graffiti.selectedTokens.noTokensPresent) ||
                (!isMarkdownCell && (graffiti.selectedTokens.range.selectionStart === graffiti.selectedTokens.range.selectionEnd) && 
                 (!graffiti.selectedTokens.isIntersecting)) ||
                (isMarkdownCell && activeCell.rendered)) {
              console.log('Graffiti: no tokens present, or no text selected.');
              visibleControlPanels = ['graffiti-notifier']; // hide all control panels if in view only mode and not play mode
              if (isMarkdownCell) {
                if (!activeCell.rendered) {
                  graffiti.setNotifier('<div>Select some text in this Markdown cell to add or modify Graffiti\'s, or click inside any existing Graffiti text to modify it.</div>');
                } else {
                  graffiti.setNotifier('<div>Edit this Markdown cell to add or modify Graffiti\'s in the cell.</div>');
                }
              } else {
                graffiti.setNotifier('<div>Select some text in this code cell to create or modify Graffiti\'s, or click inside any existing Graffiti text to modify it.</div>');
              }
            } else if (accessLevel === 'view') {
              console.log('Graffiti: view only');
              visibleControlPanels = ['graffiti-playback-controls']; // hide all control panels if in view only mode and not play mode
            } else {
              visibleControlPanels = ['graffiti-record-controls'];
              graffiti.controlPanelIds['graffiti-record-controls'].
                       find('#graffiti-begin-recording-btn').hide().
                       parent().find('#graffiti-begin-rerecording-btn').hide().
                       parent().find('#graffiti-remove-btn').hide();
              graffiti.controlPanelIds['graffiti-record-controls'].
                       find('#graffiti-create-btn').show().
                       parent().find('#graffiti-edit-btn').hide();
              if (graffiti.selectedTokens.isIntersecting) {
                console.log('Graffiti: updating recording controls');
                graffiti.highlightIntersectingGraffitiRange();
                graffiti.controlPanelIds['graffiti-record-controls'].
                         find('#graffiti-create-btn').hide().
                         parent().find('#graffiti-edit-btn').show().
                         parent().find('#graffiti-begin-recording-btn').show().
                         parent().find('#graffiti-remove-btn').show();
                //console.log('selectedTokens:', graffiti.selectedTokens);
                state.clearPlayableMovie('cursorActivity');
                if (graffiti.selectedTokens.hasMovie) {
                  state.setPlayableMovie('cursorActivity', graffiti.selectedTokens.recordingCellId,graffiti.selectedTokens.recordingKey);
                  graffiti.recordingAPIKey = graffiti.selectedTokens.recordingCellId.replace('id_','') + '_' + 
                                             graffiti.selectedTokens.recordingKey.replace('id_','');
                  visibleControlPanels.push('graffiti-access-api');
                  visibleControlPanels.push('graffiti-notifier');
                  //console.log('this recording has a movie');
                  graffiti.controlPanelIds['graffiti-record-controls'].find('#graffiti-begin-recording-btn').hide().parent().
                           find('#graffiti-begin-rerecording-btn').show();
                  graffiti.setNotifier('<div>You can <span class="graffiti-notifier-link" id="graffiti-idle-play-link">play</span> this movie any time.</div>',
                                       [
                                         {
                                           ids: ['graffiti-idle-play-link'],
                                           event: 'click',
                                           fn: (e) => {
                                             graffiti.loadAndPlayMovie('cursorActivity');
                                           }
                                         },
                                       ]);
                }
              }
            }
            graffiti.showControlPanels(visibleControlPanels);
            break;
          case 'playing':
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-play-btn').hide().parent().find('#graffiti-pause-btn').show();
            if (state.getMute()) {
              graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-sound-on-btn').hide().parent().find('#graffiti-sound-off-btn').show();
            } else {
              graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-sound-off-btn').hide().parent().find('#graffiti-sound-on-btn').show();
            }
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-info').hide();
            if ((graffiti.narratorName !== undefined) || (graffiti.narratorPic !== undefined)) {
              graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-info').show();
              if (graffiti.narratorPicture !== undefined) {
                graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-pic').html('<img src="' + graffiti.narratorPicture + '" />');
              }
              if (graffiti.narratorName !== undefined) {
                graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-name').html(graffiti.narratorName);
              }              
            }
            graffiti.showControlPanels(['graffiti-playback-controls']);
            graffiti.setNotifier('<div><span class="graffiti-notifier-link" id="graffiti-pause-link">Pause</span> to interact w/Notebook, or</div>' +
                                 '<div><span class="graffiti-notifier-link" id="graffiti-cancel-playback-link">Cancel</span> movie playback</div>',
                                 [
                                   {
                                     ids: ['graffiti-pause-link'],
                                     event: 'click',
                                     fn: (e) => {
                                       graffiti.togglePlayback();
                                     }
                                   },
                                   {
                                     ids: ['graffiti-cancel-playback-link'],
                                     event: 'click',
                                     fn: (e) => {
                                       graffiti.cancelPlayback({cancelAnimation:true});
                                     }
                                   }
                                 ]);
            break;
          case 'playbackPaused':
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-pause-btn').hide().parent().find('#graffiti-play-btn').show();
            if (state.getMute()) {
              graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-sound-on-btn').hide().parent().find('#graffiti-sound-off-btn').show();
            } else {
              graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-sound-off-btn').hide().parent().find('#graffiti-sound-on-btn').show();
            }
            if (state.getSetupForReset()) {
              graffiti.setNotifier('<div><span class="graffiti-notifier-link" id="graffiti-restart-play-link">Play movie again</span>, or</div>' +
                                   '<div><span class="graffiti-notifier-link" id="graffiti-cancel-playback-postreset-link">Cancel</span> movie playback</div>',
                                   [
                                     {
                                       ids: ['graffiti-restart-play-link'],
                                       event: 'click',
                                       fn: (e) => {
                                         graffiti.togglePlayback();
                                       }
                                     },
                                     {
                                       ids: ['graffiti-cancel-playback-postreset-link'],
                                       event: 'click',
                                       fn: (e) => {
                                         graffiti.cancelPlayback({cancelAnimation:true});
                                       }
                                     }
                                   ]);
            } else {
              graffiti.setNotifier('<div><span class="graffiti-notifier-link" id="graffiti-continue-play-link">Continue</span> movie playback, or</div>' +
                                   '<div><span class="graffiti-notifier-link" id="graffiti-cancel-playback-prereset-link">Cancel</span> movie playback</div>',
                                   [
                                     {
                                       ids: ['graffiti-continue-play-link'],
                                       event: 'click',
                                       fn: (e) => {
                                         graffiti.togglePlayback();
                                       }
                                     },
                                     {
                                       ids: ['graffiti-cancel-playback-prereset-link'],
                                       event: 'click',
                                       fn: (e) => {
                                         graffiti.cancelPlayback({cancelAnimation:true});
                                       }
                                     }
                                   ]);
            }
            break;
          case 'graffiting':
            graffiti.showControlPanels(['graffiti-finish-edit-controls']);
            graffiti.setNotifier('<div>Enter the markdown you want to be displayed in the Graffiti and then click "Save Graffiti"  (or just run the label cell).</div>' +
                                 '<div>Or, <span class="graffiti-notifier-link" id="graffiti-cancel-graffiting-link">Cancel changes</span></div>',
                                 [
                                   {
                                     ids: ['graffiti-cancel-graffiting-link'],
                                     event: 'click',
                                     fn: (e) => {
                                       graffiti.finishGraffiti(false);
                                     }
                                   }
                                 ]);
            break;
          case 'recordingLabelling':
            graffiti.showControlPanels(['graffiti-start-recording-controls']);
            graffiti.setNotifier('<div>Enter markdown to describe your movie, then click "Start Recording" (or just run the label cell).</div>' +
                                 '<div>Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-labelling-link">Cancel changes</span></div>',
                                 [
                                   {
                                     ids: ['graffiti-cancel-recording-labelling-link'],
                                     event: 'click',
                                     fn: (e) => {
                                       graffiti.finishGraffiti(false);
                                     }
                                   }
                                 ]);
            break;
          case 'recordingPending':
            graffiti.showControlPanels([]);
            graffiti.setNotifier('<div>Click anywhere in the notebook to begin recording your movie.</div>' +
                                 '<div>Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-pending-link">Cancel recording</span></div>',
                                 [
                                   {
                                     ids: ['graffiti-cancel-recording-pending-link'],
                                     event: 'click',
                                     fn: (e) => {
                                       graffiti.finishGraffiti(false);
                                     }
                                   }
                                 ]);
            break;
          case 'recording':
            graffiti.showControlPanels(['graffiti-recording-controls', 'graffiti-recording-pen-controls']);
            graffiti.setNotifier('<div>Your activities are being recorded.' + 
                                 'Press ESC or click <span class="graffiti-notifier-link" id="graffiti-end-recording-link">End Recording</span> ' +
                                 'to end recording.</div>' +
                                 '<div>Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-link">Cancel recording</span></div>',
                                 [
                                   {
                                     ids: ['graffiti-end-recording-link'],
                                     event: 'click',
                                     fn: (e) => {
                                       graffiti.toggleRecording();
                                     }
                                   },
                                   {
                                     ids: ['graffiti-cancel-recording-link'],
                                     event: 'click',
                                     fn: (e) => {
                                       graffiti.cancelRecording();
                                     }
                                   }
                                 ]);
            break;
          case 'notifying': // Just showing notifier alone. Used when prompting user to play a graffiti with the notifier
            graffiti.showControlPanels(['graffiti-notifier']);
            break;
        }
      },

      updateControlPanelPosition: () => {
        if (state.getControlPanelDragging()) {
          const position = state.getPointerPosition();
          const offset = state.getControlPanelDragOffset();
          const newPosition =   { left: Math.max(0,position.x - offset.left), top: Math.max(0,position.y - offset.top) };
          const newPositionPx = { top: newPosition.top + 'px', left: newPosition.left + 'px' };
          graffiti.outerControlPanel.css(newPositionPx);
        }
      },

      initInteractivity: () => {
        graffiti.notebookContainer.click((e) => {
          console.log('Graffiti: clicked container');
          if (state.getActivity() === 'recordingPending') {
            console.log('Graffiti: Now starting movie recording');
            graffiti.toggleRecording();
          }
          return false;
        });
        audio.setAudioStorageCallback(storage.storeMovie);
        graffiti.addCMEvents();
        setTimeout(() => { 
          graffiti.setupBackgroundEvents();
        }, 500); // this timeout avoids too-early rendering of hidden recorder controls

        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTips();
        graffiti.setupControlPanels();
        graffiti.updateControlPanels();
        graffiti.setupGarnishScreen();

      },

      toggleGraffitiPen: (penType) => {
        if (state.getActivity() !== 'recording') {
          return; // Pens can only be used while recording
        }
        const penControl = $('#graffiti-' + penType + '-pen');
        if (!(penControl.hasClass('btn'))) {
          penControl = penControl.parents('.btn');
        }
        if ((graffiti.activePen == undefined) || (graffiti.activePen !== penType)) {
          // Activate a new active pen
          graffiti.showGarnishScreen();
          $('.graffiti-active-pen').removeClass('graffiti-active-pen');
          graffiti.activePen = penType;
          penControl.addClass('graffiti-active-pen');
        } else {
          // turn off the active pen
          penControl.removeClass('graffiti-active-pen');
          graffiti.activePen = undefined;
          graffiti.hideGarnishScreen();
        }          
      },

      dimGraffitiCursor: () => {
        graffiti.graffitiCursor.css({opacity:0.1});
      },

      undimGraffitiCursor: () => {
        graffiti.graffitiCursor.show().css({opacity:1.0});
      },

      garnishScreenHandler: (e) => {
        if (state.getActivity() === 'recording') {
          if (e.type === 'mousedown') {
            console.log('garnishScreenHandler: mousedown');
            state.setGarnishing(true);
            graffiti.updateGarnishOpacity({recording:true, reset:true});
            switch (graffiti.activePen) {
              case 'highlight':
                state.setGarnishStyle('highlight');
                break;
              case 'line':
                state.setGarnishStyle('line');
                break;
              case 'eraser':
                state.setGarnishStyle('erase');
                break;
            }
          } else if ((e.type === 'mouseup') || (e.type === 'mouseleave')) {
            console.log('garnishScreenHandler: ', e.type);
            if (state.getGarnishing()) {
              state.setGarnishing(false);
              state.startGarnishFadeClock();
            }
          }
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      },

      resetGarnishColor: () => {
        $('#graffiti-recording-colors-shell div').removeClass('graffiti-recording-color-active');
        $('#graffiti-recording-color-black').addClass('graffiti-recording-color-active');
        state.setGarnishColor('000000');
      },

      clearGarnishPen: () => {
        $('.graffiti-active-pen').removeClass('graffiti-active-pen');
        graffiti.activePen = undefined;
      },

      showGarnishScreen: () => {
        graffiti.garnishScreen.show();
      },

      hideGarnishScreen: () => {
        graffiti.garnishScreen.hide();
      },

      // Inspired by https://www.codicode.com/art/how_to_draw_on_a_html5_canvas_with_a_mouse.aspx
      // and : http://perfectionkills.com/exploring-canvas-drawing-techniques/
      setupGarnishScreen: () => {
        const graffitiGarnishScreen = $('<div id="graffiti-garnish-screen"></div>');
        graffiti.garnishScreen = graffitiGarnishScreen.prependTo(graffiti.notebookContainer);
        const notebookHeight = $('#notebook').outerHeight(true);
        graffiti.garnishScreen.css({height: notebookHeight + 'px'});
        graffiti.garnishScreen.bind('mousedown mouseup mouseleave', (e) => { graffiti.garnishScreenHandler(e) });
      },

      placeCanvas: (cellId, garnishPermanence) => {
        const cell = utils.findCellByCellId(cellId);
        const cellElement = $(cell.element[0]);
        const cellRect = cellElement[0].getBoundingClientRect();
        if (graffiti.canvases[garnishPermanence][cellId] !== undefined) {
          //console.log('not adding ' + garnishPermanence + ' canvas to this cell, already exists.');
          return cellRect;
        }
        $('<div class="graffiti-canvas-outer graffiti-canvas-type-' + garnishPermanence + '"><canvas /></div>').appendTo(cellElement);
        const newCellCanvasDiv = cellElement.find('.graffiti-canvas-outer:last');
        const newCellCanvas = newCellCanvasDiv.find('canvas')[0];
        const ctx =  newCellCanvas.getContext("2d");

        const canvasStyle = {
          width: cellRect.width + 'px',
          height: cellRect.height + 'px'
        };
        newCellCanvasDiv.css(canvasStyle);
        newCellCanvas.width = cellRect.width;
        newCellCanvas.height = cellRect.height;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        graffiti.canvases[garnishPermanence][cellId] = {
          div: newCellCanvasDiv,
          canvas: newCellCanvas,
          ctx: ctx,
          cellRect: cellRect
        };
        return cellRect;
      },
      
      setCanvasStyle: (cellId, penType, canvasColor, canvasPermanence) => {
        const canvas = graffiti.canvases[canvasPermanence][cellId];
        const ctx = canvas.ctx;
        if (canvasColor === undefined) {
          canvasColor = '#000000'; // default to black lines if not set in older recordings before color was supported.
        } else {
          canvasColor = '#' + canvasColor;
        }
        if (penType === 'highlight') {
          const highlightCanvasColor = (canvasColor === '#000000' ? '#FFFF00' : canvasColor);
          ctx.strokeStyle = highlightCanvasColor;
          ctx.shadowColor = highlightCanvasColor;
          ctx.lineWidth = 15;
          ctx.shadowBlur = 35;
          ctx.globalAlpha = 0.5;
        } else { // lines are default although if erase activated, we will ignore this style and use clearRect
          // console.log('canvas color:', canvasColor);
          ctx.strokeStyle = canvasColor;
          ctx.shadowColor = canvasColor;
          ctx.shadowBlur = 1;
          ctx.lineWidth = 1.75;
          ctx.globalAlpha = 1.0;
        }
      },

      clearCanvas: (canvasType, cellId) => {
        const canvas = graffiti.canvases[canvasType][cellId];
        const ctx = canvas.ctx;
        const cellRect = canvas.cellRect;
        ctx.clearRect(0, 0, cellRect.width, cellRect.height);
      },
      
      clearCanvases: (canvasType) => {
        if (canvasType === 'all') {
          for (let canvasType of Object.keys(graffiti.canvases)) {
            for (let cellId of Object.keys(graffiti.canvases[canvasType])) {
              graffiti.clearCanvas(canvasType, cellId);
            }
          }
        } else {
          for (let cellId of Object.keys(graffiti.canvases[canvasType])) {
            graffiti.clearCanvas(canvasType, cellId);
          }
        }
      },

      updateGarnishOpacity: (opts) => {
        if (opts.recording) {
          // Recording ongoing, so store opacity records and handle resets when mouse goes down
          if (opts.reset) {
            // Forced reset of (possibly fading) canvases
            if (state.garnishFadeInProgress()) {
              graffiti.clearCanvases('temporary'); // clear the canvases only if we were in the middle of a fade. 
              state.resetGarnishOpacity();
            }
            state.disableGarnishFade();
          } else {
            // Check for fadeouts
            const opacityInfo = state.calculateGarnishOpacity();
            state.setGarnishOpacity(opacityInfo.opacity);
            switch (opacityInfo.status) {
              case 'max':
                state.resetGarnishOpacity();
                break;
              case 'fade':
                state.storeHistoryRecord('opacity');
                break;
              case 'fadeDone':
                if (state.garnishFadeInProgress()) {
                  console.log('Clearing temp canvases because fade completed');
                  graffiti.clearCanvases('temporary');
                  state.setupGarnishOpacityReset();
                  state.storeHistoryRecord('opacity');
                  state.resetGarnishOpacity();
                  state.disableGarnishFade();
                }
                break;
            }
          }
        } else {
          // Playback ongoing, so process records
          const opacityRecord = state.getHistoryItem('opacity',opts.opacityIndex);
          //console.log('opacityRecord:', opacityRecord);
          if (opacityRecord !== undefined) {
            if (opacityRecord.reset) {
              if ((graffiti.lastGarnishEraseIndex === undefined) ||
                  (graffiti.lastGarnishEraseIndex !== opts.opacityIndex)) {
                console.log('Erasing canvases');
                graffiti.clearCanvases('temporary');
                graffiti.lastGarnishEraseIndex = opts.opacityIndex;
              }
              state.resetGarnishOpacity(); // if latest record was a reset, make sure you reset
            } else {
              state.setGarnishOpacity(opacityRecord.opacity);
            }
          }
        }
        const opacity = state.getGarnishOpacity();
        $('.graffiti-canvas-type-temporary').css({opacity:opacity});
      },      

      updateGarnishDisplay: (cellId, ax, ay, bx, by, garnishStyle, garnishPermanence) => {
        if (garnishPermanence === undefined) {
          garnishPermanence = 'permanent'; // HACK: support for older recordings (adarsh's for instance)
        }
        // console.log('updateGarnishDisplay, garnishPermanence:', garnishPermanence);
        if (graffiti.canvases[garnishPermanence].hasOwnProperty(cellId)) {
          const ctx = graffiti.canvases[garnishPermanence][cellId].ctx;
          if (garnishStyle === 'erase') {
            const eraseBuffer = 25;
            ctx.clearRect(ax - eraseBuffer / 2, ay - eraseBuffer / 2, eraseBuffer, eraseBuffer);
          } else {
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.closePath();
            ctx.stroke();
          }
        }
      },

      // This fn is called on mousemove, which means fade counts always reset, and we clear the temporary ink completely if it was part way through a fade
      updateGarnishDisplayIfRecording: (ax, ay, bx, by, viewInfo) => {
        if (state.getActivity() === 'recording') {
          if (viewInfo.garnishing) {
            const cellRect = graffiti.placeCanvas(viewInfo.cellId, viewInfo.garnishPermanence);
            graffiti.setCanvasStyle(viewInfo.cellId, viewInfo.garnishStyle, viewInfo.garnishColor, viewInfo.garnishPermanence);
            graffiti.updateGarnishDisplay(viewInfo.cellId, 
                                          ax - cellRect.left,
                                          ay - cellRect.top, 
                                          bx - cellRect.left,
                                          by - cellRect.top,
                                          viewInfo.garnishStyle,
                                          viewInfo.garnishPermanence);
          }
          state.setLastGarnishInfo(bx, by, viewInfo.garnishing, viewInfo.garnishStyle, viewInfo.cellId);
        }
      },

      // Rerun all garnishes up to time t. Used after scrubbing.
      redrawAllGarnishes: (targetTime) => {
        graffiti.clearCanvases('all');
        // First, final last opacity reset before the target time. We will start redrawing garnishes from this point forward.
        let lastOpacityIndex = state.getIndexUpToTime('opacity', targetTime);
        let firstViewIndex = 0;
        if (lastOpacityIndex !== undefined) {
          for (let opacityIndex = 0; opacityIndex < lastOpacityIndex; ++opacityIndex) {
            record = state.getHistoryItem('opacity', opacityIndex);
            if (record.reset) {
              firstViewIndex = state.getIndexUpToTime('view', record.startTime);
            }
          }
        }

        
        const lastViewIndex = state.getIndexUpToTime('view', targetTime);
        if (lastViewIndex !== undefined) {
          console.log('firstViewIndex:', firstViewIndex, 'lastViewIndex:', lastViewIndex);
          for (let viewIndex = firstViewIndex; viewIndex < lastViewIndex; ++viewIndex) {
            record = state.getHistoryItem('view', viewIndex);
            // We must locate the cell in the notebook today (vs when the recording was made) before we can redraw garnish.
            if (record.subType === 'pointer') {
              //console.log('pointerUpdate is true, record:', record);
              record.hoverCell = utils.findCellByCellId(record.cellId); 
              graffiti.updatePointer(record);
            }
          }
        }
        state.resetGarnishOpacity();
        opacityIndex = state.getIndexUpToTime('opacity', targetTime);
        if (opacityIndex !== undefined) {
          graffiti.updateGarnishOpacity({recording:false, reset:false, opacityIndex: opacityIndex});          
        }
      },

      // extract any tooltip commands
      extractTooltipCommands: (markdown) => {
        const commandParts = markdown.match(/^%%(([^\s]*)\s(.*))$/mig);
        let partsRecord;
        if (commandParts === null)
          return undefined;
        if (commandParts.length > 0) {
          partsRecord = {
            buttonName: undefined,
            captionPic: '',
            captionVideo: undefined,
            caption: '',
            playback_pic: undefined
          };
          let parts;
          for (let i = 0; i < commandParts.length; ++i) {
            parts = commandParts[i].match(/^(\S+)\s(.*)/).slice(1);
            switch (parts[0].toLowerCase()) {
              case '%%comment':
                break; // we just ignore these. Used to instruct content creators how to use the editing tip cells.
              case '%%button_name':
                partsRecord.buttonName = parts[1];
                break;
              case '%%caption_pic':
                partsRecord.captionPic = utils.renderMarkdown(parts[1]);
                break;
              case '%%caption_video_id':
                if (parts[1].indexOf('images/') === 0) {
                  partsRecord.captionVideo =
                    '<video width="150" height="75" autoplay><source src="' + parts[1] + '" type="video/mp4"></video>';
                } else {
                  partsRecord.captionVideo =
                    '<iframe width="100" height=80 src="https://www.youtube.com/embed/' + parts[1] + 
                    '?rel=0&amp;controls=0&amp;showinfo=0" frameborder="0"></iframe>';
                }
                break;
              case '%%narrator_name':
                graffiti.narratorName = undefined;
                if (parts[1].length > 0) {
                  graffiti.narratorName = parts[1];
                }
                break;
              case '%%narrator_pic': // specify a picture to display in the control panel during playback
                graffiti.narratorPicture = undefined;
                if (parts[1].length > 0) {
                  graffiti.narratorPicture = parts[1];
                }
                break;
              case '%%caption':
                partsRecord.caption = parts[1];
                break;
              case '%%hide_player_after_playback_complete':
                state.setHidePlayerAfterPlayback(true);
                break;
              case '%%dont_restore_cell_contents_after_playback': // if the user hasn't changed cell contents, don't restore the cell contents when playback finishes
                state.setDontRestoreCellContentsAfterPlayback(true);
                break;
            }
          }
        }
        return partsRecord;
      },

      // Refresh the markDoc calls for any particular cell based on recording data

      refreshGraffitiHighlights: (params) => {
        if (params.cell.cell_type !== 'code') {
          return; // We don't refresh highlights in markdown cells because markdown cells do their highlights with plain html markup.
        }
        const recordings = state.getManifestRecordingsForCell(params.cell.metadata.cellId);
        const cm = params.cell.code_mirror;
        const marks = cm.getAllMarks();
        let markClasses;
        if (params.clear) {
          for (let mark of marks) {
            mark.clear();
          }
        } else {
          markClasses = marks.map((mark) => { return mark.className }).join(' ').replace(/graffiti-highlight /g, '');
        }
        const allTokens = utils.collectCMTokens(cm);
        const cellId = params.cell.metadata.cellId;
        graffiti.tokenRanges[cellId] = {};
        if (recordings !== undefined) {
          if (Object.keys(recordings).length > 0) {
            let keyParts,recording, recordingKey, tokens, firstToken, marker, range;
            for (recordingKey of Object.keys(recordings)) {
              recording = recordings[recordingKey];
              tokens = recording.tokens;
              //console.log('recordingKey:', recordingKey);
              range = utils.getCMTokenRange(cm, tokens, allTokens);
              if (range !== undefined) {
                // Store computed character ranges for checking selections against recording ranges.
                graffiti.tokenRanges[cellId][recordingKey] = range;
                if (params.clear || (!params.clear && markClasses !== undefined && markClasses.indexOf(recordingKey) === -1)) {
                  // don't call markText twice on a previously marked range
                  marker = 'graffiti-' + recording.cellId + '-' + recordingKey;
                  cm.markText({ line:range.start.line, ch:range.start.ch},
                              { line:range.end.line,   ch:range.end.ch  },
                              { className: 'graffiti-highlight ' + marker });
                }
              }
            }
          }
        }
      },

      refreshAllGraffitiHighlights: () => {
        const cells = Jupyter.notebook.get_cells();
        for (let cell of cells) {
          graffiti.refreshGraffitiHighlights({ cell: cell, clear: true });
        }
      },

      hideTip: (tip) => {
        graffiti.notebookContainer.find('.graffiti-tip .headline').remove();
        graffiti.notebookContainer.find('.graffiti-tip').hide();
        state.clearPlayableMovie('tip');
      },

      refreshGraffitiTips: () => {
        const tips = $('.graffiti-highlight');
        //console.log('tips:', tips);
        //console.log('refreshGraffitiTips: binding mousenter/mouseleave');
        tips.unbind('mouseenter mouseleave').bind('mouseenter mouseleave', (e) => {
          const activity = state.getActivity();
          if (activity === 'recording') {
            return; // do not show tooltips while recording
          }
          let highlightElem = $(e.target);
          if (!highlightElem.hasClass('graffiti-highlight')) {
            highlightElem = highlightElem.parents('.graffiti-highlight');
          }
          const idMatch = highlightElem.attr('class').match(/graffiti-(id_.[^\-]+)-(id_[^\s]+)/);
          if (idMatch !== null) {
            const cellId = idMatch[1];
            const recordingKey = idMatch[2];
            const hoverCell = utils.findCellByCellId(cellId);
            const hoverCellElement = hoverCell.element[0];
            const hoverCellElementPosition = $(hoverCellElement).position();
            const hoverCellType = hoverCell.cell_type;
            let outerInputElement;
            if (hoverCellType === 'markdown') {
              outerInputElement = $(hoverCellElement).find('.inner_cell');
            } else {
              outerInputElement = $(hoverCellElement).find('.CodeMirror-lines');
            }
            const recording = state.getManifestSingleRecording(cellId, recordingKey);
            let existingTip = graffiti.notebookContainer.find('.graffiti-tip');
            if (e.type === 'mouseleave') {
              state.setTipTimeout(() => { graffiti.hideTip(); }, 500);
            } else {
              const currentPointerPosition = state.getPointerPosition();
              // Only show tip if cursor rests on hover for a 1/2 second
              state.setTipTimeout(() => {
                const newPointerPosition = state.getPointerPosition();
                const cursorDistanceSquared = (newPointerPosition.x - currentPointerPosition.x) * (newPointerPosition.x - currentPointerPosition.x) +
                                                        (newPointerPosition.y - currentPointerPosition.y) * (newPointerPosition.y - currentPointerPosition.y);

                //console.log('comparing currentPointerPosition, newPointerPosition:', currentPointerPosition,
                //            newPointerPosition, cursorDistanceSquared);
                if (cursorDistanceSquared > 2000) {
                  state.clearTipTimeout();
                } else {
                  // const markdown = marked("## Header 2\n### Header3\nSee more [**details of defining keyboard shortcuts**](http://google.com) " +
                  // "below.\n\n Let's go to [**Udacity**](https://udacity.com).");
                  let contentMarkdown = '';
                  //console.log('markId:', markId, 'recordings:', hoverCell.metadata.recordings);
                  state.setHidePlayerAfterPlayback(false); // default for any recording is not to hide player
                  const tooltipCommands = graffiti.extractTooltipCommands(recording.markdown);
                  let headlineMarkdown = '';
                  if (tooltipCommands !== undefined) {
                    headlineMarkdown = '<div class="headline">' +
                                       ' <div>' + tooltipCommands.captionPic + '</div>' +
                                       ' <div>' + tooltipCommands.caption + '</div>' +
                                              (tooltipCommands.captionVideo !== undefined ?
                                               ' <div class="graffiti-video">' + tooltipCommands.captionVideo + '</div>' : '' ) +
                                       '</div>';
                  }
                  if (recording !== undefined) {
                    contentMarkdown = utils.renderMarkdown(recording.markdown)
                  }
                  let tooltipContents = headlineMarkdown + '<div class="parts">' + '<div class="info">' + contentMarkdown + '</div>';
                  if (recording.hasMovie) {
                    const buttonName = (((tooltipCommands !== undefined) && (tooltipCommands.buttonName !== undefined)) ? tooltipCommands.buttonName : 'Play Movie');
                    state.setPlayableMovie('tip', cellId, recordingKey);
                    tooltipContents +=
                      '   <div class="movie"><button class="btn btn-default btn-small" id="graffiti-movie-play-btn">' + buttonName + '</button></div>';
                  }
                  tooltipContents += '</div>';

                  if (existingTip.length === 0) {
                    existingTip = $('<div class="graffiti-tip" id="graffiti-tip">' + tooltipContents + '</div>')
                      .prependTo(graffiti.notebookContainer);
                    existingTip.bind('mouseenter mouseleave', (e) => {
                      console.log(e.type === 'mouseenter' ? 'entering tooltip' : 'leaving tooltip');
                      if (e.type === 'mouseenter') {
                        state.clearTipTimeout();
                      } else {
                        //console.log('hiding tip');
                        graffiti.hideTip();
                      }
                    });
                  } else {
                    existingTip.find('#graffiti-movie-play-btn').unbind('click');
                    existingTip.html(tooltipContents);
                  }

                  // Set up the call back for the play button on the tooltip that will actually play the movie.
                  existingTip.find('#graffiti-movie-play-btn').click((e) => {
                    //console.log('click in tip');
                    state.clearTipTimeout();
                    e.stopPropagation(); // for reasons unknown even still propogates to the codemirror editing area undeneath
                    const playableMovie = state.getPlayableMovie('tip');
                    //console.log('playableMovie', playableMovie);
                    if (state.getDontRestoreCellContentsAfterPlayback()) {
                      // If this movie is set to NOT restore cell contents, give the user a chance to opt-out of playback.
                      const dialogContent = 'This Graffiti movie may replace the contents of code cells. After this movie plays, do you want to...';
                      const confirmModal = dialog.modal({
                        title: 'Are you sure you want to play this Graffiti?',
                        body: dialogContent,
                        sanitize:false,
                        buttons: {
                          'Restore Cell Contents After Playback Ends': {
                            click: (e) => {
                              console.log('Graffiti: you want to preserve cell contents after playback.');
                              // Must restore playable movie values because jupyter dialog causes the tip to hide, which clears the playableMovie
                              state.setPlayableMovie('tip', playableMovie.cellId, playableMovie.recordingKey);
                              state.setDontRestoreCellContentsAfterPlayback(false);
                              graffiti.loadAndPlayMovie('tip');
                            }
                          },
                          'Let this Movie Permanently Set Cell Contents': { 
                            click: (e) => { 
                              // Must restore playable movie values because jupyter dialog causes the tip to hide, which clears the playableMovie
                              state.setPlayableMovie('tip', playableMovie.cellId, playableMovie.recordingKey);
                              graffiti.loadAndPlayMovie('tip'); 
                            }
                          }
                        }
                      });
                      confirmModal.on('hidden.bs.modal', (e) => { 
                        console.log('Graffiti: escaped the dontRestoreCellContents modal.');
                      });
                    } else {
                      graffiti.loadAndPlayMovie('tip');
                    }
                    return false;
                  });
                  const outerInputOffset = outerInputElement.offset();
                  const highlightElemOffset = highlightElem.offset();
                  let tipLeft;
                  if (hoverCellType === 'markdown') {
                    const anchorElem = highlightElem.find('i');
                    const anchorElemOffset = anchorElem.offset();
                    const posCandidate1 = outerInputElement.width() - existingTip.width() + outerInputOffset.left - graffiti.notebookContainerPadding;
                    const posCandidate2 = anchorElemOffset.left;
                    tipLeft = parseInt(Math.min(posCandidate1, posCandidate2));
                  } else {                    
                    tipLeft = parseInt(Math.min(outerInputElement.width() - existingTip.width(),
                                                Math.max(highlightElemOffset.left, outerInputOffset.left)));
                  }

                  const existingTipHeight = existingTip.height();
                  const tipPosition = { left: tipLeft,
                                        top: parseInt(highlightElemOffset.top - outerInputOffset.top) - existingTipHeight - 20 };
                  //console.log('outerInputOffset:', outerInputOffset, 'highlightElemOffset:', highlightElemOffset, 'tipPosition:', tipPosition);
                  //console.log('tipPosition.top:', tipPosition.top);
                  const highlightElemRect = highlightElem[0].getBoundingClientRect();
                  const headerRect = $('#header')[0].getBoundingClientRect();
                  // if the highlight element is in the upper half of the notebook panel area. flip the tooltip to be below the highlightElem
                  const rectDifference = highlightElemRect.top - headerRect.bottom - 20;
                  if (rectDifference < existingTipHeight ) {
                    tipPosition.top = highlightElemOffset.top - outerInputOffset.top + graffiti.cmLineHeight + graffiti.cmLineFudge;
                  }
                  tipPosition.top += hoverCellElementPosition.top;
                  const positionPx = { left: tipPosition.left + 'px', top: tipPosition.top + 'px' };
                  existingTip.css(positionPx);
                  existingTip.show();
                }
              }, 425); // this number is how long user has to hover before we display the tooltip
            }
          }
        });
      },

      setupBackgroundEvents: () => {
        // Handle rubber banding scrolling that occurs on short notebooks so cursor doesn't look wrong (possibly, only chrome?).
        console.log('Graffiti: setupBackgroundEvents');

        graffiti.sitePanel.on('scroll', (e) => {
          const notebookPanelHeight = graffiti.notebookPanel.height();
          const viewInfo = utils.collectViewInfo(state.getPointerPosition().x,
                                                 state.getPointerPosition().y,
                                                 graffiti.notebookPanel.height(),
                                                 graffiti.sitePanel.scrollTop() - state.getScrollTop(),
                                                 state.getGarnishing(),
                                                 state.getGarnishStyle(),
                                                 state.getGarnishColor(),
                                                 state.getGarnishPermanence());
          state.setScrollTop(graffiti.sitePanel.scrollTop());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('scroll');
          if (state.getActivity() === 'playbackPaused') {
            graffiti.undimGraffitiCursor();            
          }
          return true;
        });

        graffiti.sitePanel.on('mousewheel', (e) => {
          if (state.getActivity() === 'playing') {
            console.log('Graffiti: pausing playback because of mousewheel scroll.');
            graffiti.pausePlayback();
          }
        });

        $('body').keydown((e) => {
          const activity = state.getActivity();
          let stopProp = false;
          //console.log('keydown e:', e);
          switch (e.which) {
            case 32: // space key stops playback
              if (activity === 'playing') {
                stopProp = true;
                graffiti.togglePlayback();
              }
              break;
            case 27: // escape key stops playback, cancels pendingRecording, and completes regular recording in process
              stopProp = true;
              switch (activity) {
                case 'recording':
                  graffiti.toggleRecording();
                  break;
                case 'recordingPending':
                  graffiti.changeActivity('idle');
                  break;
                case 'playing':
                case 'playbackPaused':
                  graffiti.cancelPlayback({cancelAnimation:true});
                  break;
              }
              break;
              //          case 13: // enter key
              //            break;
              // case 18: // meta key
              // break;
              // case 91: // option key
              // break;
            default:
              break; // let other keys pass through
          }
          
          if (stopProp) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }

          return true;
        });

        $('body').keyup( (e) => {
          // any keyup turns off garnishing
          state.setGarnishing(false);
        });

        window.onmousemove = (e) => {
          //console.log('cursorPosition:[',e.clientX, e.clientY, ']');
          //console.log('mouse_e:', e.pageX, e.pageY);
          const previousPointerPosition = state.getPointerPosition();
          const previousPointerX = previousPointerPosition.x;
          const previousPointerY = previousPointerPosition.y;
          state.storePointerPosition( e.clientX, e.clientY ); // keep track of current pointer position at all times
          const viewInfo = utils.collectViewInfo(e.clientX, 
                                                 e.clientY, 
                                                 graffiti.notebookPanel.height(), 
                                                 graffiti.sitePanel.scrollTop() - state.getScrollTop(),
                                                 state.getGarnishing(),
                                                 state.getGarnishStyle(),
                                                 state.getGarnishColor(),
                                                 state.getGarnishPermanence());
          state.setScrollTop(graffiti.sitePanel.scrollTop());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('pointer');
          graffiti.updateGarnishDisplayIfRecording(previousPointerX, previousPointerY, e.clientX, e.clientY, viewInfo );
          graffiti.updateControlPanelPosition();
          return true;
        };

        // if we were playing a recording when they hit reload, we need to cancel it, restore, and save before we continue
        window.onbeforeunload = (e) => {
          graffiti.cancelPlaybackNoVisualUpdates();
        };

        // https://stackoverflow.com/questions/19469881/remove-all-event-listeners-of-specific-type
        window.addEventListener('dblclick', (e) => { 
          if (state.getActivity() === 'recording') {
            const isTextCell = ($(e.target)).parents('.text_cell');
            if (isTextCell.length > 0) {
              console.log('Graffiti: intercepted doubleclick on markdown during recording, discarding it');
              e.stopPropagation();
              e.preventDefault();
              return true;
            }
          }
          return false;
        }, true);

        // SErialize/deserialize range objects
        // https://github.com/tildeio/range-serializer
        // https://www.npmjs.com/package/serialize-selection

        // Specially handle selection changes in rendered markdown cells and output areas during recordings
        document.addEventListener("selectionchange", function() {
          // get the selection and serialize it
          if (state.getActivity() === 'recording') {
            state.clearSelectionSerialized();
            const viewInfo = state.getViewInfo();
            const cellId = viewInfo.cellId;
            if (cellId !== undefined) {
              const hoverCell = utils.findCellByCellId(cellId);
              let parentNode;
              if (hoverCell.cell_type === 'markdown') {
                parentNode = $(hoverCell.element).find('.rendered_html');
              } else {
                parentNode = $(hoverCell.element).find('.output_subarea');
              }
              if (parentNode.length > 0) {
                const selectionSerialized = selectionSerializer.get(parentNode[0]);
                if (!selectionSerialized.empty) {
                  selectionSerialized.cellType = hoverCell.cell_type;
                  selectionSerialized.cellId = cellId;
                  // utils.shrinkAllCMSelections(); // cancel all CM selections as they will prevent replaying selection changes in other dom elements
                  state.setSelectionSerialized(selectionSerialized);
                  state.storeHistoryRecord('selections');
                }
              }
            }
          }
        });

        console.log('Graffiti: Background setup complete.');
      },

      storeRecordingInfoInCell: () => {
        let recordingRecord, newRecording, recordingCell, recordingCellId, recordingKey;
        if (graffiti.selectedTokens.isIntersecting) { 
          // Prepare to update existing recording
          recordingCell = graffiti.selectedTokens.recordingCell;
          recordingCellId = graffiti.selectedTokens.recordingCellId;
          recordingKey = graffiti.selectedTokens.recordingKey;
          recordingRecord = state.getManifestSingleRecording(recordingCellId, recordingKey);
          newRecording = false;
        } else { 
          // Prepare to create a new recording
          recordingCell = Jupyter.notebook.get_selected_cell();
          recordingCellId = recordingCell.metadata.cellId;
          recordingKey = utils.generateUniqueId();
          newRecording = true;
          recordingRecord = {
            cellId: recordingCellId,
            cellType: recordingCell.cell_type,
            createDate: utils.getNow(),
            inProgress: true,
            tokens: $.extend({}, graffiti.selectedTokens.tokens),
            range: $.extend({}, graffiti.selectedTokens.range),
            allTokensString: graffiti.selectedTokens.allTokensString,
            markdown: '',
            authorId: state.getAuthorId(),
            authorType: state.getAuthorType(), // one of "creator" (eg teacher), "viewer" (eg student)
            hasMovie: false
          }
          // Store recording info in the manifest
          state.setSingleManifestRecording(recordingCellId, recordingKey, recordingRecord);
        }

        state.storeRecordingCellInfo({
          newRecording: newRecording,
          recordingRecord: recordingRecord,
          recordingCell: recordingCell,
          recordingCellId: recordingCellId,
          recordingKey: recordingKey,
          scrollTop: graffiti.sitePanel.scrollTop()
        });

        return recordingRecord;
      },

      clearHighlightMarkText: () => {
        if (graffiti.highlightMarkText !== undefined) {
          graffiti.highlightMarkText.clear();
          graffiti.highlightMarkText = undefined;
        }
      },

      highlightIntersectingGraffitiRange: () => {
        graffiti.clearHighlightMarkText();
        if (state.getAccessLevel() === 'view') { // we never do this in view mode
          return;
        }
        const cell = graffiti.selectedTokens.recordingCell;
        if (cell !== undefined) {
          const cm = cell.code_mirror;
          const startLoc = cm.posFromIndex(graffiti.selectedTokens.range.start);
          const endLoc = cm.posFromIndex(graffiti.selectedTokens.range.end);
          graffiti.highlightMarkText = cm.markText(startLoc, endLoc, { className: 'graffiti-selected' });
        }
      },

      selectIntersectingGraffitiRange: () => {
        const recordingCellInfo = state.getRecordingCellInfo();
        const recordingCell = recordingCellInfo.recordingCell;
        const cm = recordingCell.code_mirror;
        const startLoc = cm.posFromIndex(graffiti.selectedTokens.range.start);
        const endLoc = cm.posFromIndex(graffiti.selectedTokens.range.end);
        cm.setSelections([ { anchor: startLoc, head: endLoc } ]);        
        graffiti.selectedTokens = utils.findSelectionTokens(recordingCell, graffiti.tokenRanges, state);
        graffiti.highlightIntersectingGraffitiRange();
      },

      editGraffiti: (newActivity) => {
        graffiti.changeActivity(newActivity);
        state.setLastEditActivityTime();
        const recordingRecord = graffiti.storeRecordingInfoInCell();

        const activeCellIndex = Jupyter.notebook.get_selected_index();
        const graffitiEditCell = Jupyter.notebook.insert_cell_above('markdown');

        graffitiEditCell.metadata.cellId = utils.generateUniqueId();
        utils.refreshCellMaps();
        let editableText;
        if (graffiti.selectedTokens.isIntersecting) {
          // use whatever author put into this graffiti previously
          editableText = recordingRecord.markdown; 
        } else {
          editableText = "%% Below, type whatever markdown you want displayed in the Graffiti tip (markdown).\n" +
                         "%% Then run this cell to save it. You can then add an optional recording to your Graffiti.\n" +
                         graffiti.selectedTokens.allTokensString;
        }

        graffitiEditCell.set_text(editableText);
        graffitiEditCell.unrender();
        Jupyter.notebook.scroll_to_cell(Math.max(0,activeCellIndex),500);
        const selectedCell = Jupyter.notebook.get_selected_cell();
        selectedCell.unselect();
        graffitiEditCell.select();
        graffitiEditCell.code_mirror.focus();
        graffitiEditCell.code_mirror.setSelection( { line:2, ch:0}, { line:10000, ch:10000} );
        graffiti.graffitiEditCellId = graffitiEditCell.metadata.cellId;
      },

      finishGraffiti: (doSave) => {
        const activity = state.getActivity();
        if (activity !== 'graffiting' && activity !== 'recordingLabelling') {
          return;
        }

        const recordingCellInfo = state.getRecordingCellInfo();
        const recordingCell = recordingCellInfo.recordingCell;

        const editCellIndex = utils.findCellIndexByCellId(graffiti.graffitiEditCellId);

        let editCellContents = '';
        if (editCellIndex !== undefined) {
          const editCell = utils.findCellByCellId(graffiti.graffitiEditCellId);
          editCellContents = editCell.get_text();
          Jupyter.notebook.delete_cell(editCellIndex);

          // Save the graffiti text into the right cell recording.
          const recordings = state.getManifestRecordingsForCell(recordingCellInfo.recordingCellId);
          if (doSave) {
            if (recordingCellInfo.newRecording) {
              recordings[recordingCellInfo.recordingKey] = recordingCellInfo.recordingRecord;
            }
            recordings[recordingCellInfo.recordingKey].markdown = editCellContents;
          } else {
            if (recordingCellInfo.newRecording) {
              state.removeManifestEntry(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey);
            }
          }
        }
        storage.storeManifest();

        if ((recordingCell.cell_type === 'markdown') && (recordingCellInfo.newRecording) && doSave) {
          // If we were adding a Graffiti to a markdown cell, we need to modify the markdown cell to include 
          // our Graffiti span tag around the selection.
          const contents = recordingCell.get_text();
          let parts = [];
          parts.push(contents.substring(0,recordingCellInfo.recordingRecord.range.start));
          parts.push(contents.substring(recordingCellInfo.recordingRecord.range.start, recordingCellInfo.recordingRecord.range.end));
          parts.push(contents.substring(recordingCellInfo.recordingRecord.range.end));
          const spanOpenTag = '<span class="graffiti-highlight graffiti-' + 
                              recordingCellInfo.recordingCellId + '-' + recordingCellInfo.recordingKey + '"><i></i>'; // empty italic helps us find its anchor for tooltip
          const newContents = parts[0] + spanOpenTag + parts[1] + '</span>' + parts[2];
          //console.log('newContents:', newContents);
          recordingCell.set_text(newContents);
        }

        utils.saveNotebook();

        // need to reselect graffiti text that was selected in case it somehow got unselected
        //recordingCell.code_mirror.setSelections(recordingCellInfo.selections);
        graffiti.sitePanel.animate({ scrollTop: recordingCellInfo.scrollTop}, 500);
        if (doSave && state.getActivity() === 'recordingLabelling') {
          if (recordingCellInfo.recordingRecord.cellType === 'markdown') {
            recordingCell.render();
          }
          graffiti.setPendingRecording();
        } else {
          graffiti.changeActivity('idle');
          recordingCell.code_mirror.focus();
          graffiti.refreshGraffitiHighlights({cell: recordingCell, clear: false});
          graffiti.refreshGraffitiTips();
        }
      },

      removeGraffitiCore: (recordingCell, recordingKey) => {
        const recordingCellId = recordingCell.metadata.cellId;
        if (recordingCell.cell_type === 'markdown') {
          // If this Graffiti was in a markdown cell we need to remove the span tags from the markdown source
          const contents = recordingCell.get_text();
          const spanRegex = RegExp('<span class="graffiti-highlight graffiti-' + recordingCellId + '-' + recordingKey + '"><i></i>(.*?)</span>','g')
          let results, foundContents = [];
          while ((results = spanRegex.exec(contents)) !== null) { foundContents.push(results) };
          if (foundContents.length > 0) {
            const innerContents = foundContents[0][1];
            const sourceContents = '<span class="graffiti-highlight graffiti-' + recordingCellId + '-' + recordingKey + '"><i></i>' + innerContents + '</span>';
            const cleanedContents = contents.replace(sourceContents, innerContents);
            //console.log('cleanedContents of markdown:', cleanedContents);
            recordingCell.set_text(cleanedContents);
          }
        }

        storage.deleteMovie(recordingCellId, recordingKey);
      },


      removeAllGraffitis: () => {
        const manifest = state.getManifest(); // save manifest before we wipe it out
        state.setManifest({});
        let recordingCellId, recordingCell, recordingIds, recordingKeys, destructions = 0;
        for (recordingCellId of Object.keys(manifest)) {
          console.log('Graffiti: Removing recordings from cell:', recordingCellId);
          recordingKeys = Object.keys(manifest[recordingCellId]);
          if (recordingKeys.length > 0) {
            recordingCell = utils.findCellByCellId(recordingCellId);
            for (recordingKey of recordingKeys) {
              console.log('Graffiti: Removing recording id:', recordingKey);
              destructions++;
              graffiti.removeGraffitiCore(recordingCell, recordingKey);
              graffiti.refreshGraffitiHighlights({cell: recordingCell, clear: true});
            }
          }
        }
        storage.storeManifest();
        graffiti.highlightIntersectingGraffitiRange();
        graffiti.refreshGraffitiTips();
        graffiti.updateControlPanels();
        utils.saveNotebook();

        dialog.modal({
          title: 'Your notebook is now cleaned of all graffiti.',
          body: 'We removed ' + destructions + ' graffitis. Feel free to create new ones.',
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                console.log('Graffiti: You clicked ok, you want to remove ALL graffitis');
              }
            }
          }
        });

      },

      removeGraffiti: (recordingCell, recordingKey) => {
        graffiti.removeGraffitiCore(recordingCell, recordingKey);
        if (state.removeManifestEntry(recordingCell.metadata.cellId, recordingKey)) {
          graffiti.highlightIntersectingGraffitiRange();
          graffiti.refreshGraffitiHighlights({cell: recordingCell, clear: true});
          graffiti.refreshGraffitiTips();
          storage.storeManifest();
          utils.saveNotebook();
          graffiti.updateControlPanels();
        }
      },

      removeAllGraffitisWithConfirmation: () => {
        dialog.modal({
          title: 'Are you sure you want to remove ALL graffitis from this notebook?',
          body: 'Note: this cannot be undone.',
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                console.log('Graffiti: You clicked ok, you want to remove ALL graffitis');
                graffiti.removeAllGraffitis();

              }
            },
            'Cancel': { click: (e) => { console.log('Graffiti: you cancelled:', $(e.target).parent()); } },
          }
        });

      },

      removeGraffitiWithPrompt: () => {
        if (graffiti.selectedTokens.isIntersecting) {
          const recordingCell = graffiti.selectedTokens.recordingCell;
          const recordingCellId = recordingCell.metadata.cellId;
          const recordingKey = graffiti.selectedTokens.recordingKey;
          const recording = state.getManifestSingleRecording(recordingCellId,recordingKey);
          const content = '(Please Note: this cannot be undone.)<br/>' +
                          '<b>Graffiti\'d text:</b><span class="graffiti-text-display">' + recording.allTokensString + '</span><br/>' +
                          '<b>Graffiti contents:</b>' + utils.renderMarkdown(recording.markdown) + '<br/>';
          
          const confirmModal = dialog.modal({
            title: 'Are you sure you want to remove this Graffiti?',
            body: content,
            sanitize:false,
            buttons: {
              'OK': {
                click: (e) => {
                  console.log('Graffiti: you clicked ok, you want to remove graffiti:',
                              $(e.target).parent());
                  graffiti.removeGraffiti(recordingCell, recordingKey);

                }
              },
              'Cancel': { click: (e) => { console.log('Graffiti: you cancelled:', $(e.target).parent()); } },
            }
          });
          confirmModal.on('hidden.bs.modal', (e) => { 
            console.log('Graffiti: escaped the removeGraffitiWithPrompt modal.');
          });
        }
      },

      updateAllGraffitiDisplays: () => {
        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTips();
      },

      //
      // Recording control functions
      //

      setPendingRecording: () => {
        console.log('Graffiti: Setting pending recording.');
        graffiti.changeActivity('recordingPending');
        state.restoreCellStates('selections'); // reset selections to when you clicked to begin the recording
      },

      beginMovieRecordingProcess: () => {
        // Preserve the state of all cells and selections before we begin recording so we can restore when the recording is done.
        state.storeCellStates();
        graffiti.preRecordingScrollTop = state.getScrollTop();
        if (graffiti.selectedTokens.isIntersecting) {
          const recordingRecord = graffiti.storeRecordingInfoInCell();
          if (recordingRecord.cellType === 'markdown') {
            graffiti.selectedTokens.recordingCell.render();
          }
          graffiti.setPendingRecording();
        } else {
          graffiti.editGraffiti('recordingLabelling');
        }
      },

      addCMEventsToSingleCell: (cell) => {
        graffiti.CMEvents[cell.metadata.cellId] = true;
        const cm = cell.code_mirror;
        cm.on('focus', (cm, e) => {
          console.log('Graffiti: CM focus:' , cm, e);
          // Check to see if we jumped from another cell to this cell with the arrow keys. If we did and we're recording, we need to
          // create a focus history record because jupyter is not firing the select cell event in those cases.
          const activity = state.getActivity();
          if (activity === 'recording') {
            if (cell.metadata.cellId !== state.getSelectedCellId()) {
              state.saveSelectedCellId(cell.metadata.cellId);
              state.storeHistoryRecord('focus');
            }
          } else if (activity === 'recordingPending') {
            console.log('Graffiti: Now starting movie recording');
            graffiti.toggleRecording();
          }
          graffiti.updateControlPanels(cm); // this is necessary since a focus change can happen when you arrow advance from one cell to the next cell
        });

        cm.on('cursorActivity', (cm, e) => {
          //console.log('cursorActivity');
          if (state.getActivity() === 'idle') {
            graffiti.updateControlPanels(cm); // this is necessary because you can move the cursor from inside a graffiti to outside one
          }
          //console.log('graffiti.selectedTokens:', graffiti.selectedTokens);
          const affectedCell = utils.findCellByCodeMirror(cm);
          state.storeCellIdAffectedByActivity(affectedCell.metadata.cellId);
          state.storeHistoryRecord('selections');
        });

        cm.on('change', (cm, changeObj) => {
          //console.log('change activity:', changeObj);
          const affectedCell = utils.findCellByCodeMirror(cm);
          state.storeCellIdAffectedByActivity(affectedCell.metadata.cellId);
          state.storeHistoryRecord('contents');
          if (state.getActivity() === 'idle') {
            graffiti.refreshGraffitiHighlights({cell: affectedCell, clear: true});
          }
        });

        cm.on('mousedown', (cm, e) => {
          //console.log('mousedown, e:', e);
        });

        cm.on('refresh', (cm, e) => {
          //console.log('**** CM refresh event ****');
        });

        cm.on('update', (cm, e) => {
          //console.log('**** CM update event ****');
          graffiti.refreshGraffitiTips();
        });

        cm.on('scroll', (cm, e) => {
          const pointerPosition = state.getPointerPosition();
          const viewInfo = utils.collectViewInfo(pointerPosition.x,
                                                 pointerPosition.y, 
                                                 graffiti.notebookPanel.height(), 
                                                 graffiti.sitePanel.scrollTop() - state.getScrollTop(),
                                                 state.getGarnishing(),
                                                 state.getGarnishStyle(),
                                                 state.getGarnishColor(),
                                                 state.getGarnishPermanence());
          state.setScrollTop(graffiti.sitePanel.scrollTop());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('innerScroll');
        });

      },

      addCMEventsToCells: () => {
        const inputCells = Jupyter.notebook.get_cells();
        for (let cell of inputCells) {
          // Don't rebind if already bound
          if (!graffiti.CMEvents.hasOwnProperty(cell.metadata.cellId)) {
            graffiti.addCMEventsToSingleCell(cell);
          }
        }
      },

      // Bind all select, create, delete, execute  cell events at the notebook level
      addCMEvents: () => {
        graffiti.addCMEventsToCells();

        Jupyter.notebook.events.on('select.Cell', (e, cell) => {
          //console.log('cell select event fired, e, cell:',e, cell.cell);
          //console.log('select cell store selections');
          state.storeHistoryRecord('focus');
          graffiti.refreshGraffitiTips();
          graffiti.updateControlPanels();
        });

        Jupyter.notebook.events.on('create.Cell', (e, results) => {
          //console.log('create.Cell fired');
          //console.log(results);
          const newCell = results.cell;
          const newCellIndex = results.index;
          newCell.metadata.cellId = utils.generateUniqueId();
          utils.refreshCellMaps();
          graffiti.addCMEventsToSingleCell(newCell);
          state.storeHistoryRecord('contents');
        });

        Jupyter.notebook.events.on('delete.Cell', (e) => {
          utils.refreshCellMaps();
          graffiti.pausePlayback();
          state.storeHistoryRecord('contents');
        });

        Jupyter.notebook.events.on('finished_execute.CodeCell', (e, results) => {
          console.log('Graffiti: Finished execution event fired, e, results:',e, results);
          utils.refreshCellMaps();
          state.storeHistoryRecord('contents');
        });

        // Because we get this event when output is sent but before it's rendered into the dom, we set up to collect
        // the output on the next tick rather than this loop.
        Jupyter.notebook.events.on('set_dirty.Notebook', (e, results) => {
          // console.log('Graffiti: set_dirty.Notebook, e, results:',e, results);
          utils.refreshCellMaps();
          graffiti.runOnceOnNextRecordingTick = () => {
            state.storeHistoryRecord('contents');
          };
        });

        
        Jupyter.notebook.events.on('rendered.MarkdownCell', (e, results) => {
          const activity = state.getActivity();
          if (((activity === 'graffiting') || (activity === 'recordingLabelling')) &&
              (results.cell.metadata.cellId === graffiti.graffitiEditCellId)) {
            // When creating Graffitis for markdown cells, the user can also save the Graffiti by rendering the target
            // markdown cell rather than the editing cell. Some content creators get confused and do this, so we support it.
            const lastEditActivityTime = state.getLastEditActivityTime();
            if (lastEditActivityTime !== undefined && utils.getNow() - lastEditActivityTime > 250) {
              console.log('Graffiti: rendered MarkdownCell event fired and editing with long enough delay, so finishing graffiti. e, results:',e, results);
              graffiti.finishGraffiti(true);
              state.clearLastEditActivityTime();
            }
          }
          graffiti.refreshAllGraffitiHighlights();
        });

        Jupyter.notebook.events.on('shell_reply.Kernel', (e, results) => {
          console.log('Graffiti: Kernel shell reply event fired, e, results:',e, results);
          utils.refreshCellMaps();
          if (state.getStorageInProcess()) {
            storage.clearStorageInProcess();
            graffiti.updateAllGraffitiDisplays();
            graffiti.updateControlPanels(); // necessary because we just finished a save
          }
        });

      },

      //
      // End a movie recording currently underway.
      //
      stopRecordingCore: (useCallback) => {
        audio.setExecuteCallback(useCallback);
        graffiti.clearCanvases('all');
        graffiti.hideGarnishScreen();
        graffiti.resetGarnishColor();
        state.finalizeHistory();
        if (useCallback) {
          state.dumpHistory();
        }
        if (graffiti.recordingIndicatorInterval !== undefined) {
          clearInterval(graffiti.recordingIndicatorInterval);
          graffiti.recordingIndicatorInterval = undefined;
        }
        clearInterval(state.getRecordingInterval());
        // This will use the callback defined in setAudioStorageCallback to actually persist the whole recording, if useCallback is true
        audio.stopRecording();
        console.log('Graffiti: stopRecordingCore is refreshing.');
        state.restoreCellStates('contents');
        graffiti.updateAllGraffitiDisplays();
        graffiti.sitePanel.animate({ scrollTop: graffiti.preRecordingScrollTop }, 750);
        state.restoreCellStates('selections');
        graffiti.selectIntersectingGraffitiRange();
        state.deleteTrackingArrays();
        graffiti.changeActivity('idle');
      },

      cancelRecording: () => {
        const currentActivity = state.getActivity();
        console.log('Graffiti: canceling recording, current activity:', currentActivity);
        if (currentActivity === 'recording') {
          const recordingCellInfo = state.getRecordingCellInfo();
          if (recordingCellInfo.newRecording) {
            state.removeManifestEntry(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey);
            storage.storeManifest();
          }
          graffiti.stopRecordingCore(false);
          utils.saveNotebook();
          console.log('Graffiti: cancelled recording.');
        }
      },

      toggleRecording: () => {
        const currentActivity = state.getActivity();
        if (currentActivity !== 'playing') {
          if (currentActivity === 'recording') {
            graffiti.stopRecordingCore(true);
            console.log('Graffiti: Stopped recording.');
          } else {

            //
            // Start new movie recording.
            //

            const recordingCellInfo = state.getRecordingCellInfo();
            if (recordingCellInfo == undefined) {
              // Error condition, cannot start recording without an active cell
              console.log('Graffiti: Cannot begin recording, no cell chosen to store recording.');
              return;
            }
            console.log('Graffiti: Begin recording for cell id:', recordingCellInfo.recordingCellId);

            graffiti.changeActivity('recording');
            state.setMovieRecordingStarted(true);
            utils.assignCellIds();
            state.initHistory({
              storageCellId: recordingCellInfo.recordingCellId,
            });

            audio.startRecording();
            state.setScrollTop(graffiti.sitePanel.scrollTop());
            state.setGarnishing(false);
            state.resetGarnishOpacity();
            state.disableGarnishFade(); // initially, we don't fade since nothing drawn yet
            graffiti.clearGarnishPen();

            state.setRecordingInterval(
              setInterval(() => {
                //console.log('Moving time ahead.');
                if (graffiti.runOnceOnNextRecordingTick !== undefined) {
                  graffiti.runOnceOnNextRecordingTick();
                  graffiti.runOnceOnNextRecordingTick = undefined;
                }
                graffiti.updateTimeDisplay(state.getTimeRecordedSoFar());
                graffiti.updateGarnishOpacity({recording:true, reset: false});
              }, graffiti.recordingIntervalMs)
            );
            // Flash a red recording bullet while recording is ongoing, every second. 
            graffiti.recordingIndicatorInterval = setInterval(() => {
              if (state.getTimeRecordedSoFar() % 2000 > 1000) {
                $('#graffiti-recording-flash-icon').css({background:'rgb(245,245,245)'});
              } else {
                $('#graffiti-recording-flash-icon').css({background:'rgb(255,0,0)'});
              }
            }, 1000);

            console.log('Graffiti: Started recording');
          }
        }
      },


      changeActivity: (newActivity) => {
        if (state.getActivity() === newActivity) {
          console.log('Graffiti: state is already :', newActivity, 'not changing it');
          return; // no change to activity
        }
        state.setActivity(newActivity);
        graffiti.updateControlPanels();
      },

      //
      // Movie playback code begins
      //

      applyScrollNudge: (position, record, useTrailingVelocity) => {
        const clientHeight = document.documentElement.clientHeight;
        const topbarHeight = $('#header').height();
        const bufferY = clientHeight / 10;
        const minAllowedCursorY = topbarHeight + bufferY;
        const maxAllowedCursorY = clientHeight - bufferY;
        let mustNudgeCheck = !useTrailingVelocity;
        let nudgeIncrements = graffiti.scrollNudgeQuickIncrements;
        
        // Watch trailing average of cursor. If the average over twenty samples is in a nudge zone, then nudge
        if (useTrailingVelocity) {
          nudgeIncrements = ((state.getActivity === 'scrubbing') ? 1.0 : graffiti.scrollNudgeSmoothIncrements);
          const trailingAverageSize = 10;
          if (graffiti.scrollNudgeAverages.length > 0) {
            if (((graffiti.scrollNudgeAverages[graffiti.scrollNudgeAverages.length-1].x === position.x) &&
                 (graffiti.scrollNudgeAverages[graffiti.scrollNudgeAverages.length-1].y === position.y)) ||
                (graffiti.scrollNudgeAverages[graffiti.scrollNudgeAverages.length-1].t === record.startTime)) {
              return; // cursor didn't move or time didn't change, dont record velocity
            }
          }
          graffiti.scrollNudgeAverages.push({t:record.startTime, pos: { x: position.x, y: position.y }});
          if (graffiti.scrollNudgeAverages.length > trailingAverageSize) {
            graffiti.scrollNudgeAverages.shift();
            let velocities = [], distance, timeDiff;
            for (let i = 1; i < graffiti.scrollNudgeAverages.length; ++i) {
              // This is highly mathematically inefficient but maybe in this scale of things, it's ok.
              distance =
                Math.sqrt((Math.pow((graffiti.scrollNudgeAverages[i].pos.y - graffiti.scrollNudgeAverages[i-1].pos.y),2) / 
                  Math.pow((graffiti.scrollNudgeAverages[i].pos.x - graffiti.scrollNudgeAverages[i-1].pos.x),2)));
              timeDiff = graffiti.scrollNudgeAverages[i].t - graffiti.scrollNudgeAverages[i-1].t;
              velocities.push(distance / timeDiff );
            }
            const averageVelocity = Math.abs(utils.computeArrayAverage(velocities));
            mustNudgeCheck = mustNudgeCheck || (averageVelocity < 0.3);
          }
        }

        // console.log('averageVelocity:', averageVelocity, velocities, graffiti.scrollNudgeAverages);
        if (mustNudgeCheck) {
          // If we are scrubbing, do not nudge but immediately push the correct spot into view by setting the increment divider to 1 so we jump the 
          // full amount all at once.
          let nudging = false, nudgeAmount;
          if (position.y < minAllowedCursorY) {
            nudgeAmount = (position.y - minAllowedCursorY) / nudgeIncrements;
            nudging = true;
          } else if (position.y > maxAllowedCursorY) {
            nudgeAmount = (position.y - maxAllowedCursorY) / nudgeIncrements;
            nudging = true;
          }
          if (nudging) {
            /*
               console.log('Graffiti: nudgeAmount', nudgeAmount, 'position', position.x, position.y,
               'minAllowedCursorY',minAllowedCursorY, 'maxAllowedCursorY', maxAllowedCursorY, 
               'nudgeIncrements', nudgeIncrements, 'bufferY', bufferY, 'useTrailingVelocity', useTrailingVelocity);
             */
            graffiti.scrollNudge = { 
              counter: nudgeIncrements,
              amount: nudgeAmount
            };
          }
        }
      },

      updatePointer: (record) => {
        if (record.hoverCell !== undefined) {
          // console.log('update pointer, record:', record);
          const cellRects = utils.getCellRects(record.hoverCell);

          //console.log('hoverCellId:', record.hoverCell.metadata.cellId, 'rect:', innerCellRect);
          const dx = record.x / record.innerCellRect.width;
          const dy = record.y / record.innerCellRect.height;
          if (record.hoverCell.cell_type === 'code') {
            if (record.innerCellRect.width !== undefined) {
              dxScaled = parseInt(record.innerCellRect.width * dx);
              dyScaled = parseInt(record.innerCellRect.height * dy);
            } else {
              const codeCellWidth = $('.code_cell:first').width();
              dxScaled = parseInt(codeCellWidth * dx);
              dyScaled = parseInt(cellRects.innerCellRect.height * dy);
            }
          } else {
            dxScaled = parseInt(cellRects.innerCellRect.width * dx);
            dyScaled = parseInt(cellRects.innerCellRect.height * dy);
          }
          const offsetPosition = {
            x : cellRects.innerCellRect.left + dxScaled,
            y : cellRects.innerCellRect.top + dyScaled
          };
          graffiti.applyScrollNudge(offsetPosition, record, true);
          const lastPosition = state.getLastRecordingCursorPosition();
          const lastGarnishInfo = state.getLastGarnishInfo();
          let garnishPermanence;
          if (record.garnishing) {
            //console.log('lastGarnishInfo:', lastGarnishInfo);
            garnishPermanence = (record.garnishPermanence === undefined ? 'permanent' : record.garnishPermanence);
            graffiti.placeCanvas(record.cellId,garnishPermanence);
            graffiti.setCanvasStyle(record.cellId, record.garnishStyle, record.garnishColor, garnishPermanence);
            // We are currently garnishing, so draw next portion of garnish on canvas.
            //console.log('garnishing from:', lastGarnishInfo.x, lastGarnishInfo.y, '->', dxScaled, dyScaled);
            const garnishOffset = { x: dxScaled + (cellRects.innerCellRect.left - cellRects.cellRect.left), 
                                    y: dyScaled + (cellRects.innerCellRect.top - cellRects.cellRect.top) };
            if (lastGarnishInfo.garnishing && lastGarnishInfo.garnishCellId == record.cellId) {
              graffiti.updateGarnishDisplay(record.cellId, lastGarnishInfo.x, lastGarnishInfo.y, garnishOffset.x + 0.5, garnishOffset.y + 0.5, 
                                            record.garnishStyle,
                                            garnishPermanence);
            }
            state.setLastGarnishInfo(garnishOffset.x, garnishOffset.y, record.garnishing, record.garnishStyle, record.garnishColor, record.cellId);
          } else {
            state.setLastGarnishInfo(dxScaled, dyScaled, record.garnishing, record.garnishStyle, record.garnishColor, record.cellId);
          }
          if (record.garnishing && !lastGarnishInfo.garnishing) { 
            // we weren't garnishing and we started, so simulate pen down
            state.disableGarnishFade();
          } else if (!record.garnishing && lastGarnishInfo.garnishing) {
            // we were garnishing and we stopped, so simulate pen up
            state.startGarnishFadeClock();
          }

          if ((offsetPosition.x !== lastPosition.x) || (offsetPosition.y !== lastPosition.y)) {
            // Show cursor whenever it's moved by user
            //console.log('Showing cursor:', offsetPosition, lastPosition);
            graffiti.undimGraffitiCursor();
            const offsetPositionPx = { left: offsetPosition.x + 'px', top: offsetPosition.y + 'px'};
            graffiti.graffitiCursor.css(offsetPositionPx);
          }            
          state.setLastRecordingCursorPosition(offsetPosition);
        }
      },

      updateOpacity: (opacityIndex) => {
        // Update the garnish canvases' opacity
        graffiti.updateGarnishOpacity({recording:false, reset:false, opacityIndex: opacityIndex});
      },

      updateView: (viewIndex) => {
        // console.log('updateView, viewIndex:', viewIndex);
        let record = state.getHistoryItem('view', viewIndex);
        record.hoverCell = utils.findCellByCellId(record.cellId);

        // Select whatever cell is currently selected
        if (record.selectedCellId !== undefined) {
          const selectedCellIndex = utils.findCellIndexByCellId(record.selectedCellId); // we should use a map to speed this up
          //console.log('about to select index:', selectedCellIndex)
          Jupyter.notebook.select(selectedCellIndex);
        }

        // Handle pointer updates and canvas updates
        if (record.subType === 'pointer') {
          //console.log('pointerUpdate is true, record:', record);
          graffiti.updatePointer(record);
        } else {
          graffiti.dimGraffitiCursor();
        }

        if (record.hoverCell) {
          const cm = record.hoverCell.code_mirror;
          // Update innerScroll if required
          cm.scrollTo(record.innerScroll.left, record.innerScroll.top);

          const currentNotebookPanelHeight = graffiti.notebookPanel.height();
          const mappedScrollDiff = ((record.scrollDiff === undefined ? 0 : record.scrollDiff) / record.notebookPanelHeight) * currentNotebookPanelHeight;
          const currentScrollTop = graffiti.sitePanel.scrollTop();

          let newScrollTop = currentScrollTop;
          if (graffiti.scrollNudge !== undefined) {
            let scrollNudgeAmount = 0;
            graffiti.scrollNudge.counter--;
            if (graffiti.scrollNudge.counter > 0) {
              scrollNudgeAmount = graffiti.scrollNudge.amount;
              // console.log('Going to nudge scroll by:', scrollNudgeAmount, 'counter:', graffiti.scrollNudge.counter);
              newScrollTop = currentScrollTop + scrollNudgeAmount;
            } else {
              graffiti.scrollNudge = undefined; // stop nudging
            }
          }
          // console.log('Now applying mappedScrollDiff:', mappedScrollDiff);
          let skipMappedScrollDiff = (graffiti.lastScrollViewId !== undefined && graffiti.lastScrollViewId === viewIndex);
          if (!skipMappedScrollDiff) {
            newScrollTop += mappedScrollDiff;
            graffiti.lastScrollViewId = viewIndex;
          }

          // console.log('Setting sitepanel finally to scrolltop:', newScrollTop);
          graffiti.sitePanel.scrollTop(newScrollTop);

        }
      },

      updateSelections: (index,currentScrollTop) => {        
        const record = state.getHistoryItem('selections', index);
        let cellId, cell, selectionRecord, selections, code_mirror, currentSelections, active;

        // If there were text selections in rendered markdown or rendered output during this frame, restore them first if we need to.

        if (record.textSelection !== undefined) {
          const cellId = record.textSelection.cellId;
          const cell = utils.findCellByCellId(cellId);
          let referenceNode;
          if (cell !== undefined) {
            const cellType = cell.cell_type;
            // find the right reference node so we can highlight the correct text in either a markdown cell or a code cell output area
            if (cellType === 'markdown') {
              referenceNode = $(cell.element).find('.rendered_html')[0];
            } else {
              referenceNode = $(cell.element).find('.output_subarea')[0];
            }
            const currentSelection = selectionSerializer.get(referenceNode);
            if (!(_.isEqual(currentSelection.state, record.textSelection.state))) {
              if (cellType === 'markdown') {
                // console.log('Graffiti: Focusing on markdown cell');
                cell.focus_cell();
                // we don't need to shrink if we focus the cell
                graffiti.sitePanel.scrollTop(currentScrollTop); // restore scrollTop because changing selections messes with it
              }
              // console.log('Graffiti: Selection restoring textSelection, currentSelection:', record.textSelection, currentSelection);
              record.textSelection.referenceNode = referenceNode;
              selectionSerializer.restore(record.textSelection);
            }
          }
        } else {
          for (cellId of Object.keys(record.cellsSelections)) {
            selectionRecord = record.cellsSelections[cellId];
            selections = selectionRecord.selections;
            active = selectionRecord.active;
            cell = utils.findCellByCellId(cellId);
            if (cell !== undefined) {
              code_mirror = cell.code_mirror;
              currentSelections = utils.cleanSelectionRecords(code_mirror.listSelections());
              //console.log('cellId, selections, currentSelections:', cellId, selections, currentSelections);
              if (!(_.isEqual(selections,currentSelections))) {
                //console.log('updating selection, rec:', record, 'sel:', selections, 'cell:', cell);
                graffiti.dimGraffitiCursor();
                cell.focus_cell();
                code_mirror.setSelections(selections);
                if (!code_mirror.state.focused) {
                  code_mirror.focus();
                }
                // If we made a selections update this frame, make sure that we keep it in view. We need to compute the
                // offset position of the *head* of the selection where the action is.
                // console.log('setting selections with selections:', selections);
                const cellRects = utils.getCellRects(cell);
                const cellOffsetY = selections[0].head.line * (graffiti.cmLineHeight + graffiti.cmLineFudge);
                const offsetPosition = {
                  x: cellRects.innerCellRect.left, 
                  y: cellOffsetY + cellRects.innerCellRect.top
                }
                // console.log('selections[0]', selections[0], 'offsetPosition:', offsetPosition, 'cellId', cellId);
                graffiti.applyScrollNudge(offsetPosition, record, false);
              }
            }
          }
        }
      },

      processContentOutputs: (cell, frameOutputs, index) => {
        if (frameOutputs[index] === undefined) {
          return;
        }
        let output_type = frameOutputs[index].output_type;
        if (output_type !== 'clear') {
          if ((output_type === 'display_data' || output_type === 'stream') || (output_type === 'error')) {
            if ((output_type === 'stream') ||
                (output_type === 'error') ||
                (frameOutputs[0].hasOwnProperty('data') && !frameOutputs[index].data.hasOwnProperty('application/javascript'))) {
              cell.output_area.handle_output({header: { msg_type: frameOutputs[index].output_type }, content: frameOutputs[index]});
            }
          }
        }
      },

      // set_text() causes jupyter to scroll to top of cell so we need to restore scrollTop after calling this fn.
      updateContents: (index, currentScrollTop) => {
        const contentsRecord = state.getHistoryItem('contents', index);
        const cells = Jupyter.notebook.get_cells();
        let cellId, contents, outputs, frameContents, frameOutputs;
        for (let cell of cells) {
          if (cell.cell_type === 'code') {
            cellId = cell.metadata.cellId;
            contents = cell.get_text();
            if (contentsRecord.cellsContent.hasOwnProperty(cellId)) {
              frameContents = state.extractDataFromContentRecord(contentsRecord.cellsContent[cellId].contentsRecord, cellId);
              if (frameContents !== undefined && frameContents !== contents) {
                cell.set_text(frameContents);
              }
              frameOutputs = state.extractDataFromContentRecord(contentsRecord.cellsContent[cellId].outputsRecord, cellId);
              state.restoreCellOutputs(cell, frameOutputs);
            }
          }
        }
        graffiti.sitePanel.scrollTop(currentScrollTop);
      },

      updateDisplay: (frameIndexes) => {
        //console.log('before updateContents, scrollTop:', graffiti.sitePanel.scrollTop());
        if (state.shouldUpdateDisplay('contents', frameIndexes.contents)) {
          graffiti.updateContents(frameIndexes.contents, graffiti.sitePanel.scrollTop());
        }
        // console.log('before updateSelections, scrollTop:', graffiti.sitePanel.scrollTop());
        if (state.shouldUpdateDisplay('selections', frameIndexes.selections)) {
          graffiti.updateSelections(frameIndexes.selections, graffiti.sitePanel.scrollTop());
        }
        //console.log('before updateView, scrollTop:', graffiti.sitePanel.scrollTop());
        if (state.shouldUpdateDisplay('view', frameIndexes.view)) {
          graffiti.updateView(frameIndexes.view);
        }
        //console.log('after updateView, scrollTop:', graffiti.sitePanel.scrollTop());
        if (state.shouldUpdateDisplay('opacity', frameIndexes.opacity)) {
          graffiti.updateOpacity(frameIndexes.opacity);
        }
      },

      // update the timer display for play or recording
      updateTimeDisplay: (playedSoFar) => {
        const timeDisplay = utils.formatTime(playedSoFar);
        let recorderTimeDisplay;
        if (state.getActivity() === 'recording') {
          recorderTimeDisplay = $('#graffiti-time-display-recording');
        } else {
          recorderTimeDisplay = $('#graffiti-time-display-playback');
        }
        recorderTimeDisplay.text(timeDisplay);
      },

      updateSlider: (playedSoFar) => {
        const ratio = playedSoFar / state.getHistoryDuration();
        const sliderVal = ratio * 1000;
        //console.log('updateSlider, playedSoFar:', playedSoFar, 'sliderVal:', sliderVal);
        const slider = $('#graffiti-recorder-range');
        slider.val(sliderVal);
      },

      //
      // Playback functions
      //

      // Skip around by X seconds forward or back.
      jumpPlayback: (direction) => {
        const previousPlayState = state.getActivity();
        graffiti.pausePlayback();
        const timeElapsed = state.getPlaybackTimeElapsed();
        const t = Math.max(0, Math.min(timeElapsed + (graffiti.rewindAmt * 1000 * direction), state.getHistoryDuration() - 1 ));
        console.log('Graffiti: t:', t);
        const frameIndexes = state.getHistoryRecordsAtTime(t);
        state.clearSetupForReset();
        state.setPlaybackTimeElapsed(t);
        graffiti.updateDisplay(frameIndexes);
        graffiti.updateSlider(t);
        graffiti.updateTimeDisplay(t);
        graffiti.redrawAllGarnishes(t);
        if (previousPlayState === 'playing') {
          graffiti.startPlayback();
        }
        graffiti.updateAllGraffitiDisplays();
      },

      handleSliderDrag: () => {
        // Handle slider drag
        const target = $('#graffiti-recorder-range');
        const timeLocation = target.val() / 1000;
        //console.log('slider value:', timeLocation);
        state.clearSetupForReset();
        graffiti.undimGraffitiCursor();
        const t = Math.min(state.getHistoryDuration() * timeLocation, state.getHistoryDuration() - 1);
        // Now we need to set the time we are going to start with if we play from here.
        state.setPlaybackTimeElapsed(t);
        const frameIndexes = state.getHistoryRecordsAtTime(t);
        graffiti.updateDisplay(frameIndexes); // can replay scroll diffs, and in playback use cumulative scroll diff
        graffiti.updateTimeDisplay(t);
        graffiti.redrawAllGarnishes(t);
      },

      pausePlaybackNoVisualUpdates: () => {
        clearInterval(state.getPlaybackInterval());
        graffiti.changeActivity('playbackPaused');
        audio.pausePlayback();
        state.setPlaybackTimeElapsed();
      },

      // Pause any ongoing playback
      pausePlayback: () => {
        if (state.getActivity() !== 'playing')
          return;

        graffiti.pausePlaybackNoVisualUpdates();

        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTips();

        // Save after play stops, so if the user reloads we don't get the annoying dialog box warning us changes were made.
        // graffiti.saveNotebook();

        console.log('Graffiti: Stopped playback.');
      },

      cancelPlaybackNoVisualUpdates: () => {
        const accessLevel = state.getAccessLevel();
        graffiti.pausePlaybackNoVisualUpdates();
        state.setGarnishing(false);
        state.resetPlayState();
        graffiti.changeActivity('idle');
        if ((accessLevel === 'view') && (state.getDontRestoreCellContentsAfterPlayback())) {
          console.log('Graffiti: not restoring cell contents since this recording specifies not to.');
          utils.saveNotebook();
        } else {
          state.restoreCellStates('contents');
          utils.saveNotebook();
          state.restoreCellStates('selections');
        }
      },

      cancelPlayback: (opts) => {
        const activity = state.getActivity();
        if ((activity !== 'playing') && (activity !== 'playbackPaused') && (activity !== 'scrubbing')) {
          return;
        }

        console.log('Graffiti: Cancelling playback');
        graffiti.cancelPlaybackNoVisualUpdates();
        state.setDontRestoreCellContentsAfterPlayback(false);
        graffiti.graffitiCursor.hide();
        graffiti.clearCanvases('all');
        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTips(); 
        graffiti.updateControlPanels();
        graffiti.highlightIntersectingGraffitiRange();
        graffiti.narratorName = undefined;
        graffiti.narratorPicture = undefined;

        if (opts.cancelAnimation) {
          graffiti.sitePanel.animate({ scrollTop: graffiti.prePlaybackScrolltop }, 750);
        }
      },

      startPlayback: () => {
        // start playback
        console.log('Graffiti: Starting playback.');
        const activity = state.getActivity();
        if ((activity === 'idle') || (activity === 'notifying')) {
          // If just starting to play back, store all cells current contents so we can restore them when you cancel playback.
          utils.saveNotebook();
          state.setLastGarnishInfo(0,0,false, 'highlight'); // make sure we've turned off any garnishing flag from a previous interrupted playback
          state.setScrollTop(graffiti.sitePanel.scrollTop());
          graffiti.prePlaybackScrolltop = state.getScrollTop();
          graffiti.lastScrollViewId = undefined;
          graffiti.lastDrawIndex = undefined;
          graffiti.lastGarnishEraseIndex = undefined;
          state.storeCellStates();
          state.clearCellOutputsSent();
          state.initializeLastDisplayIndexes();
          graffiti.clearCanvases('all');
          graffiti.scrollNudgeAverages = [];
        }

        graffiti.clearHighlightMarkText();
        graffiti.undimGraffitiCursor();
        graffiti.changeActivity('playing');
        graffiti.lastTemporaryCanvasClearViewIndex = -1;

        if (state.getResetOnNextPlay()) {
          console.log('Resetting for first/re play.');
          graffiti.clearCanvases('all');
          state.resetPlayState();
        }

        state.setPlaybackStartTime(new Date().getTime() - state.getPlaybackTimeElapsed());

        if (!state.getMute()) {
          audio.startPlayback(state.getPlaybackTimeElapsed());
        }

        // Set up main playback loop on a 10ms interval
        state.setPlaybackInterval(
          setInterval(() => {
            //console.log('Moving time ahead.');
            const playedSoFar = state.getTimePlayedSoFar();
            if (playedSoFar >= state.getHistoryDuration()) {
              // reached end of recording naturally, so set up for restart on next press of play button
              state.setupForReset();
              graffiti.togglePlayback();
            } else {
              graffiti.updateSlider(playedSoFar);
              graffiti.updateTimeDisplay(playedSoFar);
              const frameIndexes = state.getHistoryRecordsAtTime(playedSoFar);
              graffiti.updateDisplay(frameIndexes);
            }
          }, 10)
        );
      },

      togglePlayback: () => {
        const activity = state.getActivity();
        if (activity !== 'recording') {
          if (activity === 'playing') {
            if (state.getHidePlayerAfterPlayback() && state.getSetupForReset()) {
              graffiti.cancelPlayback({ cancelAnimation: true});
            } else {
              graffiti.pausePlayback();
            }
          } else {
            graffiti.startPlayback();
          }
        }
      },

      loadAndPlayMovie: (kind) => {
        const playableMovie = state.getPlayableMovie(kind);
        if (playableMovie === undefined) {
          console.log('Graffiti: no playable movie defined.');
          return;
        }
        graffiti.cancelPlayback({cancelAnimation:false}); // cancel any ongoing movie playback b/c user is switching to a different movie
        storage.loadMovie(playableMovie.cellId, playableMovie.recordingKey).then( () => {
          console.log('Graffiti: Movie loaded for cellId, recordingKey:', playableMovie.cellId, playableMovie.recordingKey);
          if (playableMovie.cellType === 'markdown') {
            playableMovie.cell.render(); // always render a markdown cell first before playing a movie on a graffiti inside it
          }
          graffiti.togglePlayback();
          graffiti.hideTip();
        }).catch( (ex) => {
          dialog.modal({
            title: 'Movie is not available.',
            body: 'We are sorry, we could not load this movie at this time. Please contact the author of this Notebook for help.',
            sanitize:false,
            buttons: {
              'OK': { click: (e) => { console.log('Graffiti: Missing movie acknowledged.'); } }
            }
          });

          console.log('Graffiti: could not load movie:', ex);
        });

      },

      playRecordingById: (recordingFullId) => {
        const parts = recordingFullId.split('_');
        const cellId = 'id_' + parts[0];
        const recordingKey = 'id_' + parts[1];
        state.setPlayableMovie('api', cellId, recordingKey);
        graffiti.loadAndPlayMovie('api');
      },

      playRecordingByIdWithPrompt: (recordingFullId, promptMarkdown) => {
        graffiti.changeActivity('notifying');
        const promptHtml = '<span>' + utils.renderMarkdown(promptMarkdown) + '</span>';
        
        graffiti.setNotifier('<div id="graffiti-notifier-prompt">' + promptHtml + '</div>',
                             [
                               {
                                 ids: ['graffiti-notifier-prompt'],
                                 event: 'click',
                                 fn: (e) => {
                                   graffiti.playRecordingById(recordingFullId);
                                 }
                               }
                             ]);
      },

      activateAudio: () => {
        if (!state.getAudioInitialized()) {
          audio.init({
            succeed: () => {
              state.setAudioInitialized();
            },
            fail: () => {
              dialog.modal({
                title: 'Please grant access to your browser\'s microphone.',
                body: 'You cannot record Graffiti movies unless you grant access to the microphone. ' +
                      'Please <a href="https://help.aircall.io/hc/en-gb/articles/115001425325-How-to-allow-Google-Chrome-to-access-your-microphone" ' +
                      'target="_">grant access</a> and then reload this page.',
                sanitize:false,
                buttons: {
                  'OK': {
                  }
                }
              });
            }
          });
        }
      },

      changeAccessLevel: (level) => {
        if (level === 'create') {
          graffiti.cancelPlayback({cancelAnimation:true});
          graffiti.activateAudio();
          state.setAuthorId(0); // currently hardwiring this to creator(teacher) ID, which is always 0. Eventually we will replace this with 
          // individual author ids
          storage.ensureNotebookGetsGraffitiId();
          utils.assignCellIds();
          utils.saveNotebook();
          graffiti.refreshAllGraffitiHighlights();
          graffiti.refreshGraffitiTips();
        } else {
          graffiti.outerControlPanel.fadeOut(graffiti.panelFadeTime);          
        }
        state.setAccessLevel(level); 
        graffiti.updateControlPanels();
      },

      showCreatorsChooser: () => {
        graffiti.setNotifier('You can filter this Notebook\'s Graffiti\'s by clicking on creators in the list below.');
                             graffiti.showControlPanels(['graffiti-notifier','graffiti-creators-chooser']);
      },

      transferGraffitis: () => {
        storage.transferGraffitis().then(() => {
          dialog.modal({
            title: 'Transfer Complete',
            body: 'Your Notebook\'s Graffitis have been copied over from the original notebook. ' +
                  'Now you can modify them (or add and remove Graffitis to this notebook),  without affecting the original notebook\'s Graffitis.',
            sanitize:false,
            buttons: {
              'OK': {
                click: (e) => {
                  console.log('Graffiti: You clicked ok');
                }
              }
            }
          });
        });
      },

    };

    // Functions exposed externally to the Python API.
    return {
      init: graffiti.init,
      graffiti:graffiti, // remove me
      state: state, // remove me
      playRecordingById: (recordingFullId) => { graffiti.playRecordingById(recordingFullId) },
      playRecordingByIdWithPrompt: (recordingFullId, promptMarkdown) => { graffiti.playRecordingByIdWithPrompt(recordingFullId, promptMarkdown) },
      cancelPlayback: () => { graffiti.cancelPlayback({cancelAnimation:false}) },
      removeAllGraffitis: graffiti.removeAllGraffitisWithConfirmation,
      showCreatorsChooser: graffiti.showCreatorsChooser,
      setAccessLevel: (level) => { graffiti.changeAccessLevel(level) },
      setAuthorId: (authorId) => { state.setAuthorId(authorId) },
      transferGraffitis: () => { graffiti.transferGraffitis() },
      selectionSerializer: selectionSerializer
    }

  })();

  return Graffiti;

});
