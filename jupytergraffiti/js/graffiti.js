define([
  'base/js/dialog',
  './LZString.js',
  './state.js',
  './utils.js',
  './audio.js',
  './storage.js',
  './sticker.js',
  './selectionSerializer.js',
  'components/marked/lib/marked'
], function(dialog, LZString, state, utils, audio, storage, stickerLib, selectionSerializer, marked) {
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
        graffiti.penColor = 'black';

        graffiti.recordingIntervalMs = 10; // In milliseconds, how frequently we sample the state of things while recording.
        graffiti.playbackIntervalMs = graffiti.recordingIntervalMs;  // In milliseconds, loop speed for playback.  Must match recordingIntervalMs.
        graffiti.storageInProcess = false;
        graffiti.highlightMarkText = undefined;
        graffiti.cmLineHeight = 17.0001; // line height of code mirror lines as styled in Jupyter
        graffiti.cmLineFudge = 8; // buffer between lines
        graffiti.tokenRanges = {};
        graffiti.canvases = { 
          permanent: {}, // these canvases persist drawings throughout the lifespan of the recording
          temporary: {}  // these canvases get wiped a couple seconds after the person stops drawing
        };
        graffiti.stickers = {
          permanent: {}, // these stickers persist throughout the lifespan of the recording
          temporary: {}  // these stickers fade out a couple seconds after the person finishes placing them
        };

        graffiti.lastUpdateControlsTime = utils.getNow();
        graffiti.notificationMsgs = {};
        graffiti.panelFadeTime = 350;

        graffiti.scrollNudgeSmoothIncrements = 6;
        graffiti.scrollNudgeQuickIncrements = 4;
        graffiti.scrollNudge = undefined;
        graffiti.penColors = {
          'black'  : '000000',
          'red'    : 'ff0000',
          'green'  : '00ff00',
          'blue'   : '0000ff',
          'yellow' : 'ffff00',
          'orange' : 'ff9900',
          'purple' : '8a2be2',
          'brown'  : '996600',
        };
        graffiti.minimumStickerSize = 20; // pixels
        graffiti.minimumStickerSizeWithBuffer = graffiti.minimumStickerSize + 10;
        graffiti.previousActiveTakeId = undefined;

        if (currentAccessLevel === 'create') {
          storage.ensureNotebookGetsGraffitiId();
        }

        // Set up the button that activates Graffiti on new notebooks and controls visibility of the control panel if the notebook has already been graffiti-ized.
        graffiti.updateSetupButton();

        if (Jupyter.notebook.metadata.hasOwnProperty('graffitiId')) { // do not try to load the manifest if this notebook has not yet been graffiti-ized.
          storage.loadManifest(currentAccessLevel).then(() => {
            graffiti.initInteractivity();
          }).catch((ex) => {
            console.log('Graffiti: Not setting up Graffiti because this notebook has never had any authoring done yet (no recordingId).');
            console.log(ex);
          });
        }
        
      },

      provideAPIKeyExamples: () => {
        let recorderApiKeyCell = Jupyter.notebook.insert_cell_below('code');
        let invocationLine = "import jupytergraffiti\n" +
                             "jupytergraffiti.api.play_recording('" + graffiti.recordingAPIKey + "')\n" +
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
                                      '<div>' + stickerLib.makeSmallUdacityIcon({width:20,height:20}) + '</div><div>' + logoText + '</div>');

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

        // controls which recording takes are the activeTake
        graffiti.setupOneControlPanel('graffiti-takes-controls',
                                      '<div id="graffiti-takes-controls-outer">' +
                                      '  <div id="graffiti-takes-title">Takes:</div>' +
                                      '  <div id="graffiti-takes-list"></div>' +
                                      '</div>',
                                      [
                                        {
                                          ids: ['graffiti-takes-list'],
                                          event: 'click',
                                          fn: (e) => {
                                            const target = $(e.target);
                                            let choice;
                                            if (target.attr('id') === 'graffiti-takes-list') {
                                              choice = target.find('.graffiti-take-item:first');
                                            } else {
                                              choice = target;
                                            }
                                            if (choice.length > 0) {
                                              const newTakeId = choice.attr('id');
                                              const recordingCellId = choice.attr('recordingCellId');
                                              const recordingKey = choice.attr('recordingKey');
                                              graffiti.updateActiveTakeId(recordingCellId, recordingKey, newTakeId);
                                            }
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
                                      '  <div id="graffiti-rapidplay-buttons">' +
                                      '    <button class="btn btn-default btn-rapidplay-on" id="graffiti-rapidplay-on-btn" title="high speed playback">' + '2x' +
                                      '   </button>' +
                                      '   <button class="btn btn-default btn-rapidplay-off" id="graffiti-rapidplay-off-btn" title="regular speed playback">' + '2x' +
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
                                          ids: ['graffiti-rapidplay-on-btn', 'graffiti-rapidplay-off-btn'],
                                          event: 'click',
                                          fn: (e) => {
                                            graffiti.toggleRapidPlay();
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
                                      '</button>' +
                                      ' <button class="btn btn-default" id="graffiti-highlight-pen" title="Highlighter tool">' +
                                      '<svg class="svg-inline--fa fa-highlighter fa-w-17" aria-hidden="true" data-prefix="fa" data-icon="highlighter" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 544 512" data-fa-i2svg=""><path fill="currentColor" d="M0 479.98L99.92 512l35.45-35.45-67.04-67.04L0 479.98zm124.61-240.01a36.592 36.592 0 0 0-10.79 38.1l13.05 42.83-50.93 50.94 96.23 96.23 50.86-50.86 42.74 13.08c13.73 4.2 28.65-.01 38.15-10.78l35.55-41.64-173.34-173.34-41.52 35.44zm403.31-160.7l-63.2-63.2c-20.49-20.49-53.38-21.52-75.12-2.35L190.55 183.68l169.77 169.78L530.27 154.4c19.18-21.74 18.15-54.63-2.35-75.13z"></path></svg>' +
                                      '</button>' +
                                      ' <button class="btn btn-default" id="graffiti-eraser-pen" title="Eraser tool">' +
                                      '<svg aria-hidden="true" data-prefix="fas" data-icon="eraser" class="svg-inline--fa fa-eraser fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M497.941 273.941c18.745-18.745 18.745-49.137 0-67.882l-160-160c-18.745-18.745-49.136-18.746-67.883 0l-256 256c-18.745 18.745-18.745 49.137 0 67.882l96 96A48.004 48.004 0 0 0 144 480h356c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12H355.883l142.058-142.059zm-302.627-62.627l137.373 137.373L265.373 416H150.628l-80-80 124.686-124.686z"></path></svg>' +
                                      '</button>' +
                                      '</div>' +
                                      '<div id="graffiti-recording-colors-shell">' +
                                      Object.keys(graffiti.penColors).map((key) => { 
                                        return '<div id="graffiti-recording-color-' + key + '" colorVal="' + key + '"></div>';
                                      }).join('') +
                                      '</div>' +
                                      '<div id="graffiti-line-style-controls">' +
                                      '  <div id="graffiti-temporary-ink">' +
                                      '   <input type="checkbox" id="graffiti-temporary-ink-control" checked />' +
                                      '   <label id="graffiti-temporary-ink-label" for="graffiti-temporary-ink-control">Temporary Ink</label>' +
                                      '  </div>' +
                                      '  <div id="graffiti-dashed-line">' +
                                      '   <input type="checkbox" id="graffiti-dashed-line-control" />' +
                                      '   <label id="graffiti-dashed-line-label" for="graffiti-dashed-line-control">Dashed lines</label>' +
                                      '  </div>' +
                                      '</div>',
                                      [
                                        {
                                          ids: ['graffiti-highlight-pen'],
                                          event: 'click',
                                          fn: (e) => {
                                            console.log('Graffiti: you picked highlighter tool.');
                                            graffiti.setGraffitiPenColor('yellow');
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
                                            state.updateDrawingState([ { change: 'drawingModeActivated', data: true }, 
                                                                       { change: 'permanence', data: 'permanent' },
                                                                       { change: 'penType', data: 'eraser' }  ]);
                                          }
                                        },
                                        {
                                          ids: Object.keys(graffiti.penColors).map((key) => { return 'graffiti-recording-color-' + key }),
                                          event: 'click',
                                          fn: (e) => {
                                            const target = $(e.target);
                                            const colorVal = target.attr('colorVal');
                                            graffiti.setGraffitiPenColor(colorVal);
                                            // Turn on the pen/highlighter if you change pen color and not stickering
                                            const activePenType = state.getDrawingPenAttribute('type');
                                            if (activePenType !== 'sticker') {
                                              graffiti.activateGraffitiPen(state.getDrawingPenAttribute('type')); 
                                            }
                                          }
                                        },
                                        {
                                          ids: [ 'graffiti-temporary-ink-control', 'graffiti-temporary-ink-label' ],
                                          event: 'click',
                                          fn: (e) => {
                                            const permanence = ($('#graffiti-temporary-ink-control').is(':checked') ? 'temporary' : 'permanent');
                                            console.log('You set temporary ink to:', permanence);
                                            state.updateDrawingState([ { change: 'permanence', data: permanence } ]);
                                            // Turn on the pen/highlighter if you switch temporary ink status and it's not already on, unless stickering
                                            const activePenType = state.getDrawingPenAttribute('type');
                                            if (activePenType !== 'sticker') {
                                              graffiti.activateGraffitiPen(state.getDrawingPenAttribute('type')); 
                                            }
                                          }
                                        },
                                        {
                                          ids: [ 'graffiti-dashed-line-control', 'graffiti-dashed-line-label' ],
                                          event: 'click',
                                          fn: (e) => {
                                            const dashedLine = ($('#graffiti-dashed-line-control').is(':checked') ? 'dashed' : 'solid');
                                            console.log('You set dashed line to:', dashedLine);
                                            state.updateDrawingState([ { change: 'dash', data: dashedLine } ]);
                                            // Turn on the pen/highlighter if you switch dashed line status and not stickering
                                            const activePenType = state.getDrawingPenAttribute('type');
                                            if (activePenType !== 'sticker') {
                                              graffiti.activateGraffitiPen(state.getDrawingPenAttribute('type')); 
                                            }
                                          }
                                        }
                                      ]
        );

        const iconSize = 22;
        const iconColor = '#666'
        const iconStrokeWidth = 1;
        const iconFatStrokeWidth = 2;
        const iconMargin = 6;
        const smallIconMargin = 2;
        const iconDimensions = { x: iconMargin, y:iconMargin, width:iconSize - iconMargin,height:iconSize - iconMargin };
        const largeIconDimensions = { x: smallIconMargin, y:smallIconMargin, width:iconSize + smallIconMargin,height:iconSize + smallIconMargin };
        const defaultIconConfiguration = {
          dimensions: iconDimensions,
          color:iconColor,
          iconUsage: true,
          strokeWidth:iconStrokeWidth,
          fillOpacity: 0
        };
        const solidIconConfiguration = $.extend({}, defaultIconConfiguration, { fillOpacity: 1 });
        const solidFatIconConfiguration = $.extend({}, true, solidIconConfiguration, { strokeWidth:iconFatStrokeWidth });
        const largeIconConfiguration = $.extend({}, true, defaultIconConfiguration, { buffer: 1, dimensions:largeIconDimensions });
        const roundRectConfiguration = $.extend({}, true, largeIconConfiguration, { rx: 6, ry: 6 });

        const rightTriangle = stickerLib.makeRightTriangle(defaultIconConfiguration);
        const isocelesTriangle = stickerLib.makeIsocelesTriangle(defaultIconConfiguration);
        const rectangle = stickerLib.makeRectangle(largeIconConfiguration);
        const roundRectangle = stickerLib.makeRectangle(roundRectConfiguration);
        const checkMark = stickerLib.makeCheckmark(solidFatIconConfiguration);
        const xMark = stickerLib.makeXmark(solidFatIconConfiguration);
        const ribbon = stickerLib.makeRibbon(solidIconConfiguration)
        const axis = stickerLib.makeAxis(solidIconConfiguration)
        const grid = stickerLib.makeGrid(solidIconConfiguration);
        const bomb = stickerLib.makeBomb(defaultIconConfiguration);
        const trophy = stickerLib.makeTrophy(defaultIconConfiguration);
        const smiley = stickerLib.makeSmiley(solidIconConfiguration);
        const horizontalBrackets = stickerLib.makeHorizontalBrackets(defaultIconConfiguration);
        const verticalBrackets = stickerLib.makeVerticalBrackets(defaultIconConfiguration);
        const ellipse = stickerLib.makeEllipse(largeIconConfiguration);
        const pi = stickerLib.makePi(solidIconConfiguration);
        const alpha = stickerLib.makeAlpha(solidIconConfiguration);
        const beta = stickerLib.makeBeta(solidIconConfiguration);
        const sigma = stickerLib.makeSigma(solidIconConfiguration);
        const theta = stickerLib.makeTheta(solidIconConfiguration);
        const angle = stickerLib.makeAngle(defaultIconConfiguration);
        const curlyBraces = stickerLib.makeSymmetricCurlyBraces(solidIconConfiguration);
        const lineWithArrow = stickerLib.makeLine({
          color:'black',
          dimensions: iconDimensions,
          endpoints: { p1: { x:-2, y:iconSize - 2 }, p2: { x:iconSize - 2, y:-2 } },
          lineStartOffset: { x: iconMargin - 2, y:iconMargin - 2 },
          strokeWidth:iconStrokeWidth,
          dashed:'solid',
          usesArrow:true, 
          arrowHeadSize: 10,
        });

        graffiti.setupOneControlPanel('graffiti-stickers-controls', 
                                      '<div id="graffiti-stickers-shell">' +
                                      '  <div id="graffiti-stickers-header">Stickers <span>(Select, then click & drag)</span></div>' +
                                      '  <div id="graffiti-stickers-body">' +
                                      '    <div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-lineWithArrow">' + lineWithArrow + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-horizontalBrackets">' + horizontalBrackets + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-verticalBrackets">' + verticalBrackets + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-curlyBraces">' + curlyBraces + '</div>' +
                                      '    </div>' +
                                      '    <div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-rectangle">' + rectangle + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-roundRectangle">' + roundRectangle + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-ellipse">' + ellipse + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-rightTriangle">' + rightTriangle + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-isocelesTriangle">' + isocelesTriangle + '</div>' +
                                      '    </div>' +
                                      '    <div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-checkmark">' + checkMark + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-xmark">' + xMark + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-smiley">' + smiley + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-bomb">' + bomb + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-trophy">' + trophy + '</div>' +
                                      '    </div>' +
                                      '    <div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-pi">' + pi + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-alpha">' + alpha + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-beta">' + beta + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-sigma">' + sigma + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-theta">' + theta + '</div>' +
                                      '    </div>' +
                                      '    <div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-axis">' + axis + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-grid">' + grid + '</div>' +
                                      '      <div class="graffiti-sticker-button" id="graffiti-sticker-angle">' + angle + '</div>' +
                                      '    </div>' +
                                      '  </div>' +
                                      '  <div id="graffiti-sticker-style-controls">' +
                                      '    <div id="graffiti-sticker-fill">' +
                                      '     <input type="checkbox" id="graffiti-sticker-fill-control" />' +
                                      '     <label id="graffiti-sticker-fill-control-label" for="graffiti-sticker-fill-control">Solid Fill</label>' +
                                      '    </div>' +
                                      '    <div id="graffiti-sticker-hint">Shift-key: align items to grid / keep items square</div>' +
                                      '  </div>' +
                                      '</div>',
                                      [
                                        {
                                          ids: [
                                            'graffiti-sticker-rightTriangle',
                                            'graffiti-sticker-isocelesTriangle',
                                            'graffiti-sticker-rectangle', 
                                            'graffiti-sticker-roundRectangle',
                                            'graffiti-sticker-lineWithArrow',
                                            'graffiti-sticker-checkmark',
                                            'graffiti-sticker-xmark',
                                            'graffiti-sticker-grid',
                                            'graffiti-sticker-angle',
                                            'graffiti-sticker-ribbon',
                                            'graffiti-sticker-alpha',
                                            'graffiti-sticker-beta',
                                            'graffiti-sticker-sigma',
                                            'graffiti-sticker-theta',
                                            'graffiti-sticker-axis',
                                            'graffiti-sticker-bomb',
                                            'graffiti-sticker-trophy',
                                            'graffiti-sticker-smiley',
                                            'graffiti-sticker-horizontalBrackets',
                                            'graffiti-sticker-verticalBrackets',
                                            'graffiti-sticker-curlyBraces',
                                            'graffiti-sticker-ellipse',
                                            'graffiti-sticker-pi'
                                          ],
                                          event: 'click',
                                          fn: (e) => {
                                            let stickerId = $(e.target).attr('id');
                                            if (stickerId === undefined) {
                                              stickerId = $(e.target).parents('.graffiti-sticker-button').attr('id');
                                            }
                                            const cleanStickerId = stickerId.replace('graffiti-sticker-','');
                                            console.log('Sticker chosen:', cleanStickerId);
                                            graffiti.toggleGraffitiSticker(cleanStickerId);
                                          }
                                        },
                                        {
                                          ids: [ 'graffiti-sticker-fill-control', 'graffiti-sticker-fill-control-label' ],
                                          event: 'click',
                                          fn: (e) => {
                                            state.updateDrawingState([ { change: 'fillOpacity', 
                                                                         data: $('#graffiti-sticker-fill-control').is(':checked') ? 1 : 0 } ]);
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
        
// Will return to this code soon.
/*
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
*/

      },

      setSitePanelScrollTop: (scrollTop) => {
        // console.log('Setting sitepanel to scrolltop:', newScrollTop);
        graffiti.sitePanel.scrollTop(scrollTop);
      },
      
      showControlPanels: (panels) => {
        graffiti.controlPanelsShell.children().hide();
        graffiti.controlPanelIds['graffiti-control-panel-title'].css({display:'flex'}); // the title bar is always shown
        for (controlPanelId of panels) {
          // console.log('Graffiti: showing panel:', controlPanelId);
          graffiti.controlPanelIds[controlPanelId].show();
        }
      },

      updateActiveTakeId: (recordingCellId, recordingKey, activeTakeId) => {
        storage.updateSingleManifestRecordingField(recordingCellId, recordingKey, 'activeTakeId', activeTakeId);
        state.setPlayableMovie('cursorActivity', recordingCellId, recordingKey, activeTakeId);
        graffiti.updateTakesPanel(recordingCellId, recordingKey, activeTakeId);
      },

      updateTakesPanel: (recordingCellId, recordingKey, activeTakeId) => {
        const recording = state.getManifestSingleRecording(recordingCellId, recordingKey);
        //console.log('we got these takes:', recording.takes);
        const sortedRecs = _.sortBy($.map(recording.takes, (val,key) => { return $.extend(true, {}, val, { key: key }) }), 'createDate')
        //console.log('sorted recs are:', sortedRecs);
        let recIndex, recIndexZerobased, renderedTakes = '', createDateFormatted, renderedDate, rec, takeClass;
        for (recIndex = sortedRecs.length; recIndex > 0; --recIndex) {
          recIndexZerobased = recIndex - 1;
          rec = sortedRecs[recIndexZerobased];
          renderedDate = 'Recorded: ' + new Date(rec.createDate);
          takeClass = ((rec.key === activeTakeId) ? 'graffiti-take-selected' : 'graffiti-take-unselected');
          renderedTakes += '<div ' +
                           'class="' + takeClass + ' graffiti-take-item" ' +
                           'id="' + rec.key + '" ' +
                           'recordingCellId="' + recordingCellId + '" ' +
                           'recordingKey="' + recordingKey + '" ' +
                           'title="' + renderedDate + '">' + recIndex + 
                           '</div>';
        }
        $('#graffiti-takes-list').html(renderedTakes);
      },

      updateControlPanels: (cm) => {
        // When we transition to a new state, control panel tweaks need to be made
        const activity = state.getActivity();
        // console.log('Graffiti: updateControlPanels, activity:', activity);
        const accessLevel = state.getAccessLevel();
        const outerControlHidden = graffiti.outerControlPanel.css('display') === 'none';
        if (accessLevel === 'view') {
          if (activity !== 'idle') {
            if (outerControlHidden) {
              //console.trace('fadeIn 1');
              graffiti.outerControlPanel.fadeIn(graffiti.panelFadeTime);
            }
          } else if ((state.getPlayableMovie('tip') === undefined) && 
                     (state.getPlayableMovie('api') === undefined) && 
                     (state.getPlayableMovie('cursorActivity') === undefined) ||
                     (activity !== 'notifying') ) {
            if (!outerControlHidden) {
              //console.trace('fadeout');
              graffiti.outerControlPanel.fadeOut(graffiti.panelFadeTime);
            }
            return;
          }
        } else {
          if (outerControlHidden) {
            //console.trace('fadeIn 2');
            graffiti.outerControlPanel.fadeIn(graffiti.panelFadeTime);
          }
        }

        // These controls will need to be updated in a variety of activities so easiest just to do their updates in all cases.
        if (state.getMute()) {
          graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-sound-on-btn').hide().parent().find('#graffiti-sound-off-btn').show();
        } else {
          graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-sound-off-btn').hide().parent().find('#graffiti-sound-on-btn').show();
        }
        if (state.getRapidPlay()) {
          graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidplay-on-btn').hide().parent().find('#graffiti-rapidplay-off-btn').show();
        } else {
          graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidplay-off-btn').hide().parent().find('#graffiti-rapidplay-on-btn').show();
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
            const selectedTokens = graffiti.selectedTokens;
            //console.log('Graffiti: selectedTokens:', selectedTokens);
            graffiti.highlightIntersectingGraffitiRange();
            let visibleControlPanels;
            const isMarkdownCell = activeCell.cell_type === 'markdown';
            if ((selectedTokens.noTokensPresent) ||
                (!isMarkdownCell && (selectedTokens.range.selectionStart === selectedTokens.range.selectionEnd) && 
                 (!selectedTokens.isIntersecting)) ||
                (isMarkdownCell && activeCell.rendered)) {
              //console.log('Graffiti: no tokens present, or no text selected.');
              visibleControlPanels = ['graffiti-notifier']; // hide all control panels if in view only mode and not play mode
              if (isMarkdownCell) {
                if (!activeCell.rendered) {
                  graffiti.setNotifier('<div>Select some text in this Markdown cell to add or modify Graffiti\'s, or click inside any existing Graffiti text to modify it.</div>');
                } else {
                  graffiti.setNotifier('<div>Edit this Markdown cell to add or modify Graffiti\'s in the cell.</div>');
                }
              } else {
                graffiti.setNotifier('<div>Select some text in a code cell to create or modify Graffiti\'s, or click inside any existing Graffiti text to modify it.</div>');
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
              if (selectedTokens.isIntersecting) {
                // console.log('Graffiti: updating recording controls');
                graffiti.highlightIntersectingGraffitiRange();
                graffiti.controlPanelIds['graffiti-record-controls'].
                         find('#graffiti-create-btn').hide().
                         parent().find('#graffiti-edit-btn').show().
                         parent().find('#graffiti-begin-recording-btn').show().
                         parent().find('#graffiti-remove-btn').show();
                //console.log('selectedTokens:', selectedTokens);
                state.clearPlayableMovie('cursorActivity');
                if (selectedTokens.hasMovie) {
                  const recordingCellId = selectedTokens.recordingCellId;
                  const recordingKey = selectedTokens.recordingKey;
                  const recording = state.setPlayableMovie('cursorActivity', recordingCellId, recordingKey);
                  graffiti.recordingAPIKey = recordingCellId.replace('id_','') + '_' + 
                                             recordingKey.replace('id_','');
                  visibleControlPanels.push('graffiti-access-api');
                  visibleControlPanels.push('graffiti-notifier');
                  visibleControlPanels.push('graffiti-takes-controls');
                  graffiti.updateTakesPanel(recordingCellId, recordingKey, recording.activeTakeId);
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
            graffiti.setNotifier('<div><span class="graffiti-notifier-link" id="graffiti-pause-link">Pause</span> (or scroll the page) to interact with this Notebook</div>' +
                                 '<div><span class="graffiti-notifier-link" id="graffiti-cancel-playback-link">Cancel</span> movie playback (Esc)</div>',
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
            if (state.getSetupForReset()) {
              graffiti.setNotifier('<div><span class="graffiti-notifier-link" id="graffiti-restart-play-link">Play movie again</span></div>' +
                                   '<div><span class="graffiti-notifier-link" id="graffiti-cancel-playback-postreset-link">Cancel</span> movie playback (Esc)</div>',
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
              graffiti.setNotifier('<div><span class="graffiti-notifier-link" id="graffiti-continue-play-link">Continue</span> movie playback</div>' +
                                   '<div><span class="graffiti-notifier-link" id="graffiti-cancel-playback-prereset-link">Cancel</span> movie playback (Esc)</div>',
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
                                   },
                                   {
                                     ids: ['graffiti-cancel-recording-pending-link'],
                                     event: 'click',
                                     fn: (e) => {
                                       graffiti.cancelPendingRecording();
                                     }
                                   }
                                 ]);
            break;
          case 'recording':
            graffiti.showControlPanels(['graffiti-recording-controls', 'graffiti-recording-pen-controls','graffiti-stickers-controls']);
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
        graffiti.refreshGraffitiTooltips();
        graffiti.setupControlPanels();
        graffiti.updateControlPanels();
        graffiti.setupDrawingScreen();
        graffiti.setupSavingScrim();
        graffiti.playAutoplayGraffiti(); // play any autoplay graffiti if there is one set up
      },

      setGraffitiPenColor: (colorVal) => {
        $('#graffiti-recording-colors-shell div').removeClass('graffiti-recording-color-active');
        console.log('Graffiti: you clicked color:', colorVal);
        state.updateDrawingState([ { change: 'color', data: colorVal } ]);
        $('#graffiti-recording-color-' + colorVal).addClass('graffiti-recording-color-active');
      },

      activateGraffitiPen: (penType) => {
        if (!(state.getActivity() == 'recording')) {
          return; // Pens can only be used while recording
        }
        if (penType === undefined) {
          penType = 'line';
        }
        graffiti.showDrawingScreen();
        $('.graffiti-active-pen').removeClass('graffiti-active-pen');
        let penControl = $('#graffiti-' + penType + '-pen');
        if (penControl.length > 0 && !(penControl.hasClass('btn'))) {
          penControl = penControl.parents('.btn');
        }
        penControl.addClass('graffiti-active-pen');
        // Turn on drawing (if it's not already on), and activate this pen type
        state.updateDrawingState([ 
          { change: 'drawingModeActivated', data: true}, 
          { change: 'stickerType', data: undefined },
          { change: 'penType', data: penType } 
        ]);
      },

      deactivateAllPens: () => {
        graffiti.setGraffitiPenColor('black');
        state.updateDrawingState([ 
          { change: 'drawingModeActivated', data: false}, 
          { change: 'stickerType', data: undefined },
          { change: 'penType', data: undefined } 
        ]);
        $('.graffiti-active-sticker').removeClass('graffiti-active-sticker');
        $('.graffiti-active-pen').removeClass('graffiti-active-pen');
      },

      toggleGraffitiPen: (penType) => {
        if (!(state.getActivity() == 'recording')) {
          return; // Pens can only be used while recording
        }
        const activePenType = state.getDrawingPenAttribute('type');
        if (activePenType !== penType) {
          // Activate a new active pen, unless this pen is already active, in which case, deactivate it
          if (activePenType === 'highlight') {
            // When switching from highlight to pen or eraser, always go to black color because
            // usual color for highlighter is yellow which looks crappy in the line mode.
            graffiti.setGraffitiPenColor('black');
          }
          graffiti.activateGraffitiPen(penType);
          $('.graffiti-active-sticker').removeClass('graffiti-active-sticker');
        } else {
          // turn off the active pen and drawing
          $('.graffiti-active-pen').removeClass('graffiti-active-pen');
          // Disable drawing
          state.updateDrawingState([ 
            { change: 'drawingModeActivated', data: false },
            { change: 'stickerType', data: undefined },
            { change: 'penType', data: undefined } 
          ]);
          graffiti.hideDrawingScreen();
        }          
      },

      toggleGraffitiSticker: (stickerType) => {
        if (!(state.getActivity() == 'recording')) {
          return; // Stickers can only be used while recording
        }
        const activePenType = state.getDrawingPenAttribute('type');
        const activeStickerType = state.getDrawingPenAttribute('stickerType');
        if (activeStickerType !== stickerType) {
          // Activate a new sticker, unless sticker is already active, in which case, deactivate it
          graffiti.showDrawingScreen();
          // Deactivate any active pen
          $('.graffiti-active-pen').removeClass('graffiti-active-pen');
          const stickerControl = $('#graffiti-sticker-' + stickerType);
          if (activePenType === 'highlight') {
            // If we were highlighting, it was probably yellow. we probably don't want that color
            // when switching back to stickering.
            graffiti.setGraffitiPenColor('black'); 
          }
          $('.graffiti-active-sticker').removeClass('graffiti-active-sticker');
          stickerControl.addClass('graffiti-active-sticker');
          state.updateDrawingState([
            { change: 'drawingModeActivated', data: true}, 
            { change: 'stickerType', data: stickerType },
            { change: 'penType', data: 'sticker' } 
          ]);          
        } else {
          // Turn off the active sticker.
          $('.graffiti-active-sticker').removeClass('graffiti-active-sticker');
          // Disable stickering
          state.updateDrawingState([ 
            { change: 'drawingModeActivated', data: false },
            { change: 'stickerType', data: undefined },
            { change: 'penType', data: undefined } 
          ]);
          graffiti.hideDrawingScreen();
        }          
      },

      cancelRapidPlay: () => {
        console.log('Graffiti: cancelRapidPlay');
        state.setRapidPlay(false);
        audio.updateAudioPlaybackRate();
        graffiti.updateControlPanels();
      },

      toggleRapidPlay: () => {
        if (state.getRapidPlay()) {
          graffiti.cancelRapidPlay();
        } else {
          console.log('activating rapidPlay');
          state.setRapidPlay(true);
          audio.updateAudioPlaybackRate();
          graffiti.updateControlPanels();
        }
      },

      dimGraffitiCursor: () => {
        graffiti.graffitiCursor.css({opacity:0.1});
      },

      undimGraffitiCursor: () => {
        graffiti.graffitiCursor.show().css({opacity:1.0});
      },

      drawingScreenHandler: (e) => {
        if (state.getActivity() === 'recording') {
          if (e.type === 'mousedown') {
            console.log('drawingScreenHandler: mousedown');
            const wasFading = (state.getDrawingStateField('drawingActivity') === 'fade');
            console.log('wasFading:', wasFading);
            graffiti.resetTemporaryCanvases();
            state.disableDrawingFadeClock();
            const stickerType = state.getDrawingPenAttribute('stickerType');
            let drawingActivity = 'draw';
            if (stickerType !== undefined) {
              console.log('mousedown with stickerType:', stickerType);
              drawingActivity = 'sticker';
              if (wasFading) {
                graffiti.resetStickerCanvases('temporary');
                graffiti.wipeTemporaryStickerDomCanvases();
              }
              //graffiti.placeSticker({dynamic:true});
              const currentPointerPosition = state.getPointerPosition();
              const viewInfo = state.getViewInfo();
              const penType = state.getDrawingPenAttribute('type');
              const minSize = (penType === 'lineWithArrow' ? 1 : graffiti.minimumStickerSize);
              console.log('minSize:', minSize);
              state.updateDrawingState([
                { change: 'mouseDownPosition',
                  data: {
                    x : currentPointerPosition.x,
                    y : currentPointerPosition.y
                  }
                },
                { change: 'positions',
                  data: { 
                    positions: {
                      start: { x: currentPointerPosition.x, y: currentPointerPosition.y },
                      end: { x: currentPointerPosition.x + minSize, y: currentPointerPosition.y + minSize },
                    }
                  }
                },
                { change: 'cellId',
                  data: viewInfo.cellId
                }
              ]);
            }
            state.updateDrawingState( [ 
              { change: 'drawingModeActivated', data: true }, 
              { change: 'isDown',  data: true }, 
              { change: 'drawingActivity', data: drawingActivity },
              { change: 'opacity', data: state.getMaxDrawingOpacity() } 
            ]);
          } else if ((e.type === 'mouseup') || (e.type === 'mouseleave')) {
            console.log('drawingScreenHandler: ', e.type);
            const drawingActivity = state.getDrawingStateField('drawingActivity');
            if ((drawingActivity === 'sticker') && (e.type === 'mouseup')) {
              graffiti.clearAnyActiveStickerStages();
            }
            if (state.getDrawingPenAttribute('isDown')) {
              state.updateDrawingState( [ { change: 'isDown',  data: false } ]);
              state.startDrawingFadeClock();
            }
          }
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      },

      resetDrawingColor: () => {
        $('#graffiti-recording-colors-shell div').removeClass('graffiti-recording-color-active');
        $('#graffiti-recording-color-black').addClass('graffiti-recording-color-active');
        state.updateDrawingState([ { change: 'color', data: 'black' }] );
      },

      resetDrawingPen: () => {
        $('.graffiti-active-pen').removeClass('graffiti-active-pen');
        graffiti.toggleGraffitiPen(undefined, 'deactivate'); // turn off the active pen
      },

      showDrawingScreen: () => {
        graffiti.drawingScreen.show();
      },

      hideDrawingScreen: () => {
        graffiti.drawingScreen.hide();
      },

      // Inspired by https://www.codicode.com/art/how_to_draw_on_a_html5_canvas_with_a_mouse.aspx
      // and : http://perfectionkills.com/exploring-canvas-drawing-techniques/
      setupDrawingScreen: () => {
        const graffitiDrawingScreen = $('<div id="graffiti-drawing-screen"></div>');
        graffiti.drawingScreen = graffitiDrawingScreen.prependTo(graffiti.notebookContainer);
        const notebookHeight = $('#notebook').outerHeight(true);
        graffiti.drawingScreen.css({height: notebookHeight + 'px'});
        graffiti.drawingScreen.bind('mousedown mouseup mouseleave', (e) => { graffiti.drawingScreenHandler(e) });
      },

      setupSavingScrim: () => {
        const graffitiSavingScrim = $('<div id="graffiti-saving-scrim"><div>Saving Graffiti Recording. Please wait...</div></div>');
        graffiti.savingScrim = graffitiSavingScrim.prependTo(graffiti.notebookContainer);
      },
      
      resizeCanvases: () => {
        const canvasTypes = ['permanent','temporary'];
        let cellElement, cellRect, canvasStyle, canvas, cellCanvas;
        for (let canvasType of canvasTypes) {
          for (let cellId of Object.keys(graffiti.canvases[canvasType])) {
            canvas = graffiti.canvases[canvasType][cellId];
            cell = utils.findCellByCellId(cellId);
            if (cell !== undefined) {
              cellElement = cell.element[0];
              cellRect = cellElement.getBoundingClientRect();
              canvasStyle = {
                width:  cellRect.width + 'px',
                height: cellRect.height + 'px'
              };
              canvas.div.css(canvasStyle);
              cellCanvas = canvas.canvas;
              cellCanvas.width = cellRect.width;
              cellCanvas.height = cellRect.height;
              canvas.cellRect = cellRect;
              // console.log('resized height of ',cellId, 'to ', cellRect.height);
            }
          }
        }
        const notebookHeight = $('#notebook').outerHeight(true);
        graffiti.drawingScreen.css({height: notebookHeight + 'px'});
      },

      // Pretty inefficient, good enough for time being though.
      clearAnyActiveStickerStages: () => {
        let stickerStage, stickerIndex, sticker, canvasTypes = ['temporary', 'permanent'];
        for (let canvasType of canvasTypes) {
          for (let cellId of Object.keys(graffiti.stickers[canvasType])) {
            stickerStage = graffiti.stickers[canvasType][cellId];
            if (stickerStage.stickers !== undefined) {
              for (let stickerIndex = 0; stickerIndex < stickerStage.stickers.length; ++stickerIndex) {
                sticker = stickerStage.stickers[stickerIndex];
                if (sticker.active) {
                  stickerStage.stickers[stickerIndex].active = false;
                }
              }
            }
          }
        }
      },

      resetGraffitiStickerStage: (cellId, stickerPermanence) => {
        if (!graffiti.stickers[stickerPermanence].hasOwnProperty(cellId)) {
          graffiti.stickers[stickerPermanence][cellId] = {
            stickers: [],
            canvas: undefined
          };
        }
      },

      placeStickerCanvas: (cellId, stickerPermanence) => {
        graffiti.resetGraffitiStickerStage(cellId, stickerPermanence); // put the sticker stage record into memory if we need to before placing a canvas in the dom
        if (graffiti.stickers[stickerPermanence][cellId].canvas !== undefined) {
          return;
        }
        const cell = utils.findCellByCellId(cellId);
        const cellElement = $(cell.element[0]);
        const cellRect = cellElement[0].getBoundingClientRect();

        // Note that we inline all these styles because to include them from a stylesheet causes rendering jumps.
        const stickerDivId = 'graffiti-sticker-' + cellId;
        graffiti.stickers[stickerPermanence][cellId].canvas = 
          $('<div class="graffiti-sticker-outer graffiti-canvas-type-' + stickerPermanence + '" id="' + stickerDivId + '" ' +
            'style="width:' + parseInt(cellRect.width) + 'px;' +
            'height:' + parseInt(cellRect.height) + 'px;' +
            'position:absolute;left:0;top:0;">' +
            '</div>').appendTo(cellElement);
      },

      placeCanvas: (cellId, drawingPermanence) => {
        const cell = utils.findCellByCellId(cellId);
        const cellElement = $(cell.element[0]);
        const cellRect = cellElement[0].getBoundingClientRect();
        if (graffiti.canvases[drawingPermanence][cellId] !== undefined) {
          //console.log('not adding ' + drawingPermanence + ' canvas to this cell, already exists.');
          return cellRect;
        }
        // console.log('Graffiti: placing ', drawingPermanence, 'canvas for cellId:', cellId);
        $('<div class="graffiti-canvas-outer graffiti-canvas-type-' + drawingPermanence + '"><canvas /></div>').appendTo(cellElement);
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

        graffiti.canvases[drawingPermanence][cellId] = {
          div: newCellCanvasDiv,
          canvas: newCellCanvas,
          ctx: ctx,
          cellRect: cellRect
        };
        return cellRect;
      },
      
      setCanvasStyle: (cellId, penType, penDashStyle, canvasColor, canvasPermanence) => {
        const canvas = graffiti.canvases[canvasPermanence][cellId];
        const ctx = canvas.ctx;
        if (canvasColor === undefined) {
          canvasColor = 'black'; // default to black lines if not set in older recordings before color was supported.
        }
        if (penType === 'highlight') {
          if (canvasColor === 'black') {
            canvasColor = 'yellow';
          }
          ctx.lineWidth = 15;
          ctx.shadowBlur = 35;
          ctx.globalAlpha = 0.5;
        } else { // lines are default although if erase activated, we will ignore this style and use clearRect
          //console.log('canvas color:', canvasColor);
          ctx.shadowBlur = 1;
          ctx.lineWidth = 1.75;
          ctx.globalAlpha = 1.0;
            ctx.setLineDash([]);
          if (penDashStyle === 'dashed') {
            ctx.setLineDash([2,10]); /* first parm = dash, second parm = spaces btwn */
            ctx.lineDashOffset = 2;
            ctx.lineWidth = 3;
            ctx.globalAlpha = 0.5;
          }
        }
        let rawColorVal = '#' + graffiti.penColors[canvasColor];
        // Hack test
        if (rawColorVal === undefined) {
          console.log('Graffiti: warning, rawColorVal is undefined');
          rawColorVal = '#000000';
        }
        ctx.strokeStyle = rawColorVal;
        ctx.shadowColor = rawColorVal;
      },

      clearCanvas: (canvasType, cellId) => {
        const canvas = graffiti.canvases[canvasType][cellId];
        const ctx = canvas.ctx;
        const cellRect = canvas.cellRect;
        ctx.clearRect(0, 0, cellRect.width, cellRect.height);
      },
      
      clearCanvases: (canvasType) => {
        //console.log('clearCanvases');
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
        $('.graffiti-canvas-type-temporary').css({opacity: state.getMaxDrawingOpacity() });
      },

      resetTemporaryCanvases: () => {
        console.log('Graffiti: resetTemporaryCanvases.');
        const opacity = state.getDrawingStateField('opacity');
        const maxOpacity = state.getMaxDrawingOpacity();
        if (opacity < maxOpacity) {
          console.log('Graffiti: Clearing temp canvases, since fade was in progress.');
          graffiti.clearCanvases('temporary');
          state.updateDrawingState( [ { change: 'drawingActivity', data: 'wipe' } ]);
          state.storeHistoryRecord('drawings');
          state.updateDrawingState( [ { change: 'opacity', data: maxOpacity } ]);
          state.disableDrawingFadeClock();
        }
      },

      // If a cell is deleted by jupyter we need to forget any the canvases we were tracking for it.
      removeCanvasRecordsForCell: (cellId) => {
        delete(graffiti.canvases['permanent'][cellId]);
        delete(graffiti.stickers['permanent'][cellId]);
        delete(graffiti.canvases['temporary'][cellId]);
        delete(graffiti.stickers['temporary'][cellId]);
      },

      updateDrawingOpacity: () => {
        const maxOpacity = state.getMaxDrawingOpacity();
        // Check for fadeouts
        const currentOpacity = state.getDrawingStateField('opacity');
        const opacityInfo = state.calculateDrawingOpacity();
        switch (opacityInfo.status) {
          case 'max':
            if (currentOpacity !== maxOpacity) { // only go to max if not already set to max
              const drawingActivity = state.getDrawingStateField('drawingActivity');
              state.updateDrawingState( [ { change: 'drawingActivity', data: drawingActivity }, { change: 'opacity', data: maxOpacity } ] );
            }
            break;
          case 'fade':
            state.updateDrawingState( [ { change: 'drawingActivity', data: 'fade' }, { change: 'opacity', data: opacityInfo.opacity } ] );
            state.storeHistoryRecord('drawings');
            $('.graffiti-canvas-type-temporary').css({opacity:opacityInfo.opacity});
            break;
          case 'fadeDone':
            graffiti.resetTemporaryCanvases();
            graffiti.resetStickerCanvases('temporary');
            break;
        }
      },      

      updateDrawingDisplay: (cellId, ax, ay, bx, by, drawingPenType, drawingPermanence ) => {
        //console.log('updateDrawingDisplay, drawingPermanence:', drawingPermanence);
        if (graffiti.canvases[drawingPermanence].hasOwnProperty(cellId)) {
          const ctx = graffiti.canvases[drawingPermanence][cellId].ctx;
          if (drawingPenType === 'eraser') {
            const eraseBuffer = 25;
            ctx.clearRect(ax - eraseBuffer / 2, ay - eraseBuffer / 2, eraseBuffer, eraseBuffer);
          } else {
            //console.log('updateDrawingDisplay:', ax, ay, bx, by);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.closePath();
            ctx.stroke();
          }
        }
      },

      wipeTemporaryStickerDomCanvases: () => {
        $('.graffiti-sticker-outer.graffiti-canvas-type-temporary').empty();
      },
      
      wipeAllStickerDomCanvases: () => {
        $('.graffiti-sticker-outer').empty();
      },

      resetStickerCanvases: (typeOverride) => {
        let sticker, canvasTypes = (typeOverride === undefined ? ['temporary', 'permanent'] : [ typeOverride ]);
        for (let canvasType of canvasTypes) {
          for (let cellId of Object.keys(graffiti.stickers[canvasType])) {
            sticker = graffiti.stickers[canvasType][cellId];
            if (sticker.canvas !== undefined) {
              sticker.canvas.empty();
            }
            sticker.stickers = [];
            sticker.activeStickerIndex = 0;
          }
        }
      },        

      // calculate correct offsets based on innerCellRect / dx, dy etc
      drawStickersForCell: (cellId, stickerPermanence,record) => {
        const activity = state.getActivity();
        graffiti.placeStickerCanvas(cellId, stickerPermanence);
        let stickerX, stickerY, fillOpacity, width, height, stickerWidth, stickerHeight, generatedStickerElem, pen, type, positions, p1x,p1y,p2x,p2y;
        let newInnerHtml = [];
        let stickersRecords;
        let canvasElem = graffiti.stickers[stickerPermanence][cellId].canvas;
        canvasElem.empty();
        if (record !== undefined) {
          stickersRecords = record.stickersRecords;
        } else { 
          stickersRecords = graffiti.stickers[stickerPermanence][cellId].stickers; 
        }
        for (let stickerRecord of stickersRecords) {
          pen = stickerRecord.pen;
          type = pen.stickerType;
          if (activity === 'recording') {
            positions = stickerRecord.positions;
            fillOpacity = state.getDrawingPenAttribute('fillOpacity');
            //console.log('Recording, Computed fillOpacity:', fillOpacity);
          } else {
            positions = graffiti.computeStickersOffsetPositions(cellId, record, stickerRecord);
            fillOpacity = stickerRecord.pen.fillOpacity;
            //console.log('playbac Computed fillOpacity:', fillOpacity, stickerRecord);
          }
          if (type === 'lineWithArrow') {
            stickerX = positions.start.x;
            stickerY = positions.start.y;
          } else {
            stickerX = Math.min(positions.start.x, positions.end.x);
            stickerY = Math.min(positions.start.y, positions.end.y);
          }
          stickerWidth =  Math.abs(positions.end.x - positions.start.x);
          stickerHeight = Math.abs(positions.end.y - positions.start.y);
          const transformX = Math.sign(positions.end.x - positions.start.x);
          const transformY = Math.sign(positions.end.y - positions.start.y);
          let cssTransform = 'scale(' + transformX + ',' + transformY + ')';
          if (stickerRecord.stickerOnGrid) {
            // Make things square when shift key is down, except for certain items,
            // where shift key means align with a fixed grid and fixed graffiti size.
            if ( (type === 'checkmark') || (type === 'xmark') || (type === 'bomb') || (type === 'trophy') || (type === 'smiley') ||
                 (type === 'pi') || (type === 'alpha') || (type === 'beta') || (type === 'sigma') || (type == 'theta') || (type === 'angle') ) {
              stickerX = parseInt(positions.start.x / graffiti.minimumStickerSizeWithBuffer) * graffiti.minimumStickerSizeWithBuffer;
              stickerY = parseInt(positions.start.y / graffiti.minimumStickerSizeWithBuffer) * graffiti.minimumStickerSizeWithBuffer;
              stickerWidth = graffiti.minimumStickerSize;
              cssTransform = undefined; // don't allow transforms while on the fixed grid
            } 
            stickerHeight = stickerWidth;
          }
          const dimensions = {
            x: stickerX,
            y: stickerY,
            width: stickerWidth,
            height: stickerHeight
          };
          //console.log('drawing to dimensions:', dimensions);
          //console.log('Processing stickerRecord:', stickerRecord);
          switch (type) {
            case 'rectangle':
              generatedStickerHtml = stickerLib.makeRectangle({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                strokeWidth: 4,
                dimensions: dimensions,
                fillOpacity: fillOpacity,
              });
              break;
            case 'roundRectangle':
              generatedStickerHtml = stickerLib.makeRectangle({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                strokeWidth: 4,
                rx: 8,
                ry: 8,
                dimensions: dimensions,
                fillOpacity: fillOpacity,
              });
              break;
            case 'isocelesTriangle':
              generatedStickerHtml = stickerLib.makeIsocelesTriangle({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                strokeWidth: 4,
                dimensions: dimensions,
                cssTransform: cssTransform,
                fillOpacity: fillOpacity,
              });
              break;
            case 'rightTriangle':
              generatedStickerHtml = stickerLib.makeRightTriangle({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                dimensions: dimensions,
                strokeWidth: 4,
                cssTransform: cssTransform,
                fillOpacity: fillOpacity,
              });
              break;
            case 'ellipse':
              generatedStickerHtml = stickerLib.makeEllipse({
                color:  pen.color,
                dashed: pen.dash, 
                strokeWidth:3,
                dimensions: dimensions,
                fillOpacity: fillOpacity,
                buffer: 4,
              });
              break;
            case 'checkmark':
              generatedStickerHtml = stickerLib.makeCheckmark({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                dimensions: dimensions
              });
              break;
            case 'xmark':
              generatedStickerHtml = stickerLib.makeXmark({
                strokeWidth: 2,
                color:  'red',
                dashed: pen.dash, 
                dimensions: dimensions
              });
              break;
            case 'grid':
              generatedStickerHtml = stickerLib.makeGrid({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                dimensions: dimensions,
                cssTransform: cssTransform,
                strokeWidth: 1
              });
              break;
            case 'axis':
              generatedStickerHtml = stickerLib.makeAxis({
                strokeWidth: 2,
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                dimensions: dimensions,
                cssTransform: cssTransform
              });
              break;
            case 'bomb':
              generatedStickerHtml = stickerLib.makeBomb({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                dimensions: dimensions,
                cssTransform: cssTransform
              });
              break;
            case 'trophy':
              generatedStickerHtml = stickerLib.makeTrophy({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                dimensions: dimensions,
                cssTransform: cssTransform
              });
              break;
            case 'smiley':
              generatedStickerHtml = stickerLib.makeSmiley({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                dimensions: dimensions,
                cssTransform: cssTransform,
                strokeWidth:2,
              });
              break;
            case 'ribbon':
              generatedStickerHtml = stickerLib.makeRibbon({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                strokeWidth:2,
                dimensions: dimensions,
              });
              break;
            case 'horizontalBrackets':
              generatedStickerHtml = stickerLib.makeHorizontalBrackets({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                strokeWidth:3,
                dimensions: dimensions,
              });
              break;
            case 'verticalBrackets':
              generatedStickerHtml = stickerLib.makeVerticalBrackets({
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                strokeWidth:3,
                dimensions: dimensions,
              });
              break;
            case 'curlyBraces':
              generatedStickerHtml = stickerLib.makeSymmetricCurlyBraces({
                color:  pen.color,
                dashed: pen.dash, 
                strokeWidth:3,
                dimensions: dimensions,
              });
              break;
            case 'pi':
              generatedStickerHtml = stickerLib.makePi({
                color:  pen.color,
                dashed: pen.dash, 
                strokeWidth:2,
                dimensions: dimensions,
                cssTransform: cssTransform
              });
              break;
            case 'alpha':
              generatedStickerHtml = stickerLib.makeAlpha({
                color:  pen.color,
                dashed: pen.dash, 
                strokeWidth:2,
                dimensions: dimensions,
                cssTransform: cssTransform
              });
              break;
            case 'beta':
              generatedStickerHtml = stickerLib.makeBeta({
                color:  pen.color,
                dashed: pen.dash, 
                strokeWidth:2,
                dimensions: dimensions,
                cssTransform: cssTransform
              });
              break;
            case 'sigma':
              generatedStickerHtml = stickerLib.makeSigma({
                strokeWidth:1,
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                dimensions: dimensions,
                cssTransform: cssTransform
              });
              break;
            case 'theta':
              generatedStickerHtml = stickerLib.makeTheta({
                strokeWidth:1,
                color:  pen.color,
                fill:   pen.fill,
                dashed: pen.dash, 
                dimensions: dimensions,
                cssTransform: cssTransform
              });
              break;
            case 'angle':
              generatedStickerHtml = stickerLib.makeAngle({
                strokeWidth:1,
                fill: pen.fill,
                color:  pen.color,
                dashed: pen.dash, 
                dimensions: dimensions,
                cssTransform: cssTransform
              });
              break;
            case 'lineWithArrow':
              generatedStickerHtml = stickerLib.makeLine({
                color:  pen.color,
                dashed: pen.dash, 
                dimensions: dimensions,
                endpoints: { p1: {x: positions.start.x, y: positions.start.y }, p2: { x: positions.end.x, y: positions.end.y } },
                lineStartOffset: { x: 0, y: 0 },
                usesArrow: true,
                arrowHeadSize: 6
              });
              break;
          }
          newInnerHtml.push(generatedStickerHtml);
        }
        const finalInnerHtml = newInnerHtml.join('');
        canvasElem.html(finalInnerHtml);
      },

      updateStickerDisplayWhenRecording: (stickerPermanence) => {
        const cellId = state.getDrawingStateField('cellId');
        graffiti.resetGraffitiStickerStage(cellId, stickerPermanence);

        // Replace active sticker if there is one, or add a new active sticker
        const stickers = graffiti.stickers[stickerPermanence][cellId].stickers;
        let stickerRecord = state.createDrawingRecord();
        // console.log('stickerRecord', stickerRecord);
        //console.log('stickerRecordEnd:', stickerRecord.positions.start.x, stickerRecord.positions.start.y, stickerRecord.positions.end.x, stickerRecord.positions.end.y);
        stickerRecord.active = true;
        let replaced = false;
        if (stickers.length > 0) {
          const lastSticker = stickers.length - 1;
          if (stickers[lastSticker].active) {
            graffiti.stickers[stickerPermanence][cellId].stickers[lastSticker] = stickerRecord;
            replaced = true;
          }
        }
        if (!replaced) {
          stickers.push(stickerRecord);
        }

        // Store the state for later redrawing.
        state.storeStickersStateForCell(graffiti.stickers[stickerPermanence][cellId].stickers, cellId);
        // Now rerender all stickers for this cell
        graffiti.drawStickersForCell(cellId, stickerPermanence);
      },

      // This fn is called on mousemove, which means fade counts always reset, and we clear the temporary ink completely if it was part way through a fade
      updateDrawingDisplayWhenRecording: (ax, ay, bx, by, viewInfo) => {
        if (state.getActivity() === 'recording') {
          if (state.getDrawingPenAttribute('isDown')) {
            const drawingActivity = state.getDrawingStateField('drawingActivity');
            const drawingPermanence = state.getDrawingPenAttribute('permanence');
            const cellId = (drawingActivity === 'sticker' ? state.getDrawingStateField('cellId') : viewInfo.cellId);
            const cellRect = graffiti.placeCanvas(cellId, drawingPermanence);
            const drawingPenType = state.getDrawingPenAttribute('type');
            const drawingPenDash = state.getDrawingPenAttribute('dash');
            const drawingPenColor = state.getDrawingPenAttribute('color');
            //console.log('drawingActivity', drawingActivity, drawingPenType);
            if (drawingActivity === 'sticker') {
              const mouseDownPosition = state.getDrawingPenAttribute('mouseDownPosition');
              state.updateDrawingState([
                { change:'positions', 
                  data: { 
                    positions: {
                      start: { x: mouseDownPosition.x - cellRect.left, y: mouseDownPosition.y - cellRect.top },
                      end:   { x: bx - cellRect.left, y: by - cellRect.top }
                    }
                  }
                } // note that we don't change the sticker cellId during mousemove. It's set once at mousedown and kept constant until mouse up.
              ]);
              graffiti.updateStickerDisplayWhenRecording(drawingPermanence);
            } else {
              graffiti.setCanvasStyle(viewInfo.cellId, drawingPenType, drawingPenDash, drawingPenColor, drawingPermanence);
              graffiti.updateDrawingDisplay(viewInfo.cellId, 
                                            ax - cellRect.left,
                                            ay - cellRect.top, 
                                            bx - cellRect.left,
                                            by - cellRect.top,
                                            drawingPenType,
                                            drawingPermanence);
              state.updateDrawingState([
                { change:'positions', 
                  data: { 
                    positions: {
                      start: { x: ax - cellRect.left, y: ay - cellRect.top },
                      end:   { x: bx - cellRect.left, y: by - cellRect.top }
                    }
                  }
                },
                { change: 'cellId',
                  data: viewInfo.cellId
                }
              ]);
            }
            state.storeHistoryRecord('drawings');
          }
        }
      },

      // Rerun all drawings up to time t. Used after scrubbing.
      redrawAllDrawings: (targetTime) => {
        graffiti.clearCanvases('all');
        const lastDrawFrameIndex = state.getIndexUpToTime('drawings', targetTime);
        if (lastDrawFrameIndex !== undefined) {
          // First, final last opacity reset before the target time. We will start redrawing drawings from this point forward.
          for (let index = 0; index < lastDrawFrameIndex; ++index) {
            record = state.getHistoryItem('drawings', index);
            graffiti.updateDrawingCore(record);
          }
        }
      },

      // Extract any tooltip commands. Here's some examples:
      //
      // %%button_name Watch Movie
      // %%narrator_pic images/adarsh_pic.png
      // %%narrator_name Adarsh
      // %%caption_pic ![Adarsh](images/adarsh_pic.png)
      // %%caption  What is Naive Bayes?
      //

      extractTooltipCommands: (markdown) => {
        const commandParts = markdown.match(/^\s*%%(([^\s]*)(\s*)(.*))$/mig);
        let partsRecord, part, parts0;
        if (commandParts === null)
          return undefined;
        if (commandParts.length > 0) {
          partsRecord = {
            buttonName: undefined,
            captionPic: '',
            captionVideo: undefined,
            caption: '',
            playback_pic: undefined,
            autoplay: 'never',
            hideTooltip: false,
            playOnClick: false
          };
          let parts;
          for (let i = 0; i < commandParts.length; ++i) {
            part = $.trim(commandParts[i]);
            console.log('part:', part);
            parts = part.match(/^(\S+)\s(.*)/).slice(1);
            parts0 = $.trim(parts[0]).toLowerCase().replace('%%', '');
            switch (parts0) {
              case 'comment':
                break; // we just ignore these. Used to instruct content creators how to use the editing tip cells.
              case 'button_name':
                partsRecord.buttonName = parts[1];
                break;
              case 'caption': // you can make a special caption for this tip
                partsRecord.caption = parts[1];
                break;
              case 'caption_pic': // you can put a tiny pic next to the caption (use markdown)
                partsRecord.captionPic = utils.renderMarkdown(parts[1]);
                break;
              case 'caption_video_id': // you can put a tiny video next to the caption
                if (parts[1].indexOf('images/') === 0) {
                  partsRecord.captionVideo =
                    '<video width="150" height="75" autoplay><source src="' + parts[1] + '" type="video/mp4"></video>';
                } else {
                  partsRecord.captionVideo =
                    '<iframe width="100" height=80 src="https://www.youtube.com/embed/' + parts[1] + 
                    '?rel=0&amp;controls=0&amp;showinfo=0" frameborder="0"></iframe>';
                }
                break;
              case 'narrator_name': // set the name of the narrator to display in the control panel during playback
                graffiti.narratorName = undefined;
                if (parts[1].length > 0) {
                  graffiti.narratorName = parts[1];
                }
                break;
              case 'narrator_pic': // specify a picture to display in the control panel during playback
                graffiti.narratorPicture = undefined;
                if (parts[1].length > 0) {
                  graffiti.narratorPicture = parts[1];
                }
                break;
              case 'hide_player_after_playback_complete':
                state.setHidePlayerAfterPlayback(true);
                break;
              case 'dont_restore_cell_contents_after_playback': // if the user hasn't changed cell contents, don't restore the cell contents when playback finishes
                state.setDontRestoreCellContentsAfterPlayback(true);
                break;
              case 'autoplay': // 'never' (optional), 'once', 'always'
                if (parts[1].length > 0) {
                  partsRecord.autoplay = parts[1].toLowerCase();
                }
                break;
              case 'play_on_click': // if present, we will make a click on the target initiate playback.
                // Note: they must use a param for this to take due to the lame regex i have above
                // e.g. '%%play_on_click on'
                partsRecord.playOnClick = true; 
                break;
              case 'hide_tooltip': // if present, we will not render tooltip.
                // Note: they must use a param for this to take due to the lame regex i have above
                // e.g. '%%hide_tooltip on'
                partsRecord.hideTooltip = true;
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
        const recordings = state.getManifestRecordingsForCell(utils.getMetadataCellId(params.cell.metadata));
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
        const cellId = utils.getMetadataCellId(params.cell.metadata);
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
        // I think this is messing up clickable images.
        //state.clearPlayableMovie('tip');
      },

      refreshGraffitiTooltips: () => {
        const tips = $('.graffiti-highlight');
        //console.log('tips:', tips);
        //console.log('refreshGraffitiTooltips: binding mousenter/mouseleave');
        tips.unbind('mouseenter mouseleave');
        if (state.getActivity() !== 'recording') {
          tips.bind('mouseenter mouseleave', (e) => {
            const activity = state.getActivity();
            if (activity === 'recording') {
              return; // do not show tooltips while recording
            }
            console.log('Graffiti: mousenter/mouseleave:', e.type);
            let highlightElem = $(e.target);
            if (!highlightElem.hasClass('graffiti-highlight')) {
              highlightElem = highlightElem.parents('.graffiti-highlight');
            }
            const highlightElemRect = highlightElem[0].getBoundingClientRect();
            const highlightElemMaxDimension = Math.max(highlightElemRect.width, highlightElemRect.height);
            const highlightElemMaxDimensionSquared = highlightElemMaxDimension * highlightElemMaxDimension;
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
              const activeTakeId = recording.activeTakeId;
              console.log('refreshGraffitiTooltips: recording=', recording, cellId, recordingKey);
              if (recording.hasMovie) {
                state.setPlayableMovie('tip', cellId, recordingKey);
              }                
              if (recording.playOnClick) {
                console.log('binding target for click', highlightElem);
                const imageOrButtons = highlightElem.find('img,button');
                if (imageOrButtons.length > 0) {
                  imageOrButtons.off('click').click((e) => {
                    state.clearTipTimeout();
                    e.stopPropagation(); // for reasons unknown event still propogates to the codemirror editing area undeneath...

                    if (state.getActivity() === 'recordingPending') {
                      graffiti.toggleRecording(); // we want clicks on playOnClick to be ignored if a recording is pending.
                    } else {
                      graffiti.playMovieViaUserClick();
                    }
                    return false;
                  });
                }
              }
              if (recording.hideTooltip) {
                console.log('Graffiti: recording is set to hide tip.');
                return;
              }
              let existingTip = graffiti.notebookContainer.find('.graffiti-tip');
              if (e.type === 'mouseleave') {
                state.setTipTimeout(() => { graffiti.hideTip(); }, 500);
              } else {
                let currentPointerPosition = state.getPointerPosition();
                // Only show tip if cursor rests on hover for a 1/2 second
                state.setTipTimeout(() => {
                  //console.log('tip interval');
                  const newPointerPosition = state.getPointerPosition();
                  const cursorDistanceSquared = (newPointerPosition.x - currentPointerPosition.x) * (newPointerPosition.x - currentPointerPosition.x) +
                                               (newPointerPosition.y - currentPointerPosition.y) * (newPointerPosition.y - currentPointerPosition.y);

                  //console.log('comparing currentPointerPosition, newPointerPosition:', currentPointerPosition,
                  //newPointerPosition, cursorDistanceSquared);
                  // Only show tip if cursor isn't flying over the item at high speeds
                  if (cursorDistanceSquared > highlightElemMaxDimensionSquared) {
                    currentPointerPosition = state.getPointerPosition();
                  } else {
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
                      tooltipContents +=
                        '   <div class="movie"><button class="btn btn-default btn-small" id="graffiti-movie-play-btn">' + buttonName + '</button></div>';
                    }
                    tooltipContents += '</div>';

                    if (existingTip.length === 0) {
                      existingTip = $('<div class="graffiti-tip" id="graffiti-tip">' + tooltipContents + '</div>')
                        .prependTo(graffiti.notebookContainer);
                      existingTip.bind('mouseenter mouseleave', (e) => {
                        // console.log(e.type === 'mouseenter' ? 'entering tooltip' : 'leaving tooltip');
                        if (e.type === 'mouseenter') {
                          state.clearTipTimeout();
                        } else {
                          //console.log('hiding tip');
                          graffiti.hideTip();
                        }
                      });
                    } else {
                      // Don't replace the tip if the contents are identical to what we had on the last interval.
                      const currentTipInfo = state.getDisplayedTipInfo();
                      let doUpdate = true;
                      if (currentTipInfo !== undefined) {
                        if ((currentTipInfo.cellId === cellId) && (currentTipInfo.recordingKey === recordingKey)) {
                          doUpdate = false;
                        }
                      }
                      if (doUpdate) {
                        //console.log('replacing tooltip contents ');
                        existingTip.find('#graffiti-movie-play-btn').unbind('click');
                        existingTip.html(tooltipContents);
                        state.setDisplayedTipInfo(cellId,recordingKey);
                      }
                    }

                    // Set up the call back for the play button on the tooltip that will actually play the movie.
                    existingTip.find('#graffiti-movie-play-btn').unbind('click').click((e) => {
                      state.clearTipTimeout();
                      e.stopPropagation(); // for reasons unknown event still propogates to the codemirror editing area undeneath...
                      graffiti.playMovieViaUserClick();
                      return false;
                    });
                    const outerInputOffset = outerInputElement.offset();
                    const outerInputElementWidth = outerInputElement.width();
                    const highlightElemOffset = highlightElem.offset();
                    const existingTipWidth = existingTip.width();
                    const existingTipHeight = existingTip.height();
                    let tipTop = parseInt(highlightElemOffset.top - outerInputOffset.top) - existingTipHeight - 20;
                    let tipLeft, anchorIsImage = false;
                    if (hoverCellType === 'markdown') {
                      const anchorImage = highlightElem.find('img');
                      if (anchorImage.length > 0) {
                        const anchorElemOffset = anchorImage.offset();
                        //console.log('anchorElemOffset', anchorElemOffset);
                        tipLeft = anchorElemOffset.left + anchorImage.width() / 2 - existingTipWidth / 2;
                        tipTop =  anchorElemOffset.top - outerInputOffset.top + anchorImage.height() / 2 - existingTipHeight / 2;
                        anchorIsImage = true;
                        //console.log('image tipLeft, tipTop:', tipLeft, tipTop);
                      } else {
                        const anchorElem = highlightElem.find('i');
                        const anchorElemOffset = anchorElem.offset();
                        const posCandidate1 = outerInputElementWidth - existingTipWidth + outerInputOffset.left - graffiti.notebookContainerPadding;
                        const posCandidate2 = anchorElemOffset.left;
                        tipLeft = parseInt(Math.min(posCandidate1, posCandidate2));
                      }
                    } else {                    
                      tipLeft = parseInt(Math.min(outerInputElementWidth - existingTipWidth,
                                                  Math.max(highlightElemOffset.left, outerInputOffset.left)));
                    }

                    // Place tip in the best position on the screen.
                    const tipPosition = { left: tipLeft, top: tipTop };
                    //console.log('outerInputOffset:', outerInputOffset, 'highlightElemOffset:', highlightElemOffset, 'tipPosition:', tipPosition);
                    //console.log('1) tipPosition:', tipPosition);
                    const headerRect = $('#header')[0].getBoundingClientRect();
                    // If the highlight element is in the upper half of the notebook panel area, flip the tooltip to be below the highlightElem.
                    const rectDifference = highlightElemRect.top - headerRect.bottom - 20;
                    if (rectDifference < existingTipHeight && !anchorIsImage) {
                      tipPosition.top = highlightElemOffset.top - outerInputOffset.top + graffiti.cmLineHeight + graffiti.cmLineFudge;
                    }
                    //console.log('2) tipPosition:', tipPosition);
                    tipPosition.top += hoverCellElementPosition.top;
                    //console.log('3) tipPosition:', tipPosition);

                    const positionPx = { left: tipPosition.left + 'px', top: tipPosition.top + 'px' };
                    existingTip.css(positionPx);
                    existingTip.show();
                  }
                }, 425); // this number is how long user has to hover before we display the tooltip
              }
            }
          });
        }
      },

      setupBackgroundEvents: () => {
        // Handle rubber banding scrolling that occurs on short notebooks so cursor doesn't look wrong (possibly, only chrome?).
        console.log('Graffiti: setupBackgroundEvents');

        graffiti.sitePanel.on('scroll', (e) => {
          const notebookPanelHeight = graffiti.notebookPanel.height();
          const viewInfo = utils.collectViewInfo(state.getPointerPosition().x,
                                                 state.getPointerPosition().y,
                                                 graffiti.notebookPanel.height(),
                                                 graffiti.sitePanel.scrollTop() - state.getScrollTop());
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
          //console.log('keydown e.which:', e.which);
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
                case 'scrubbing':
                  graffiti.cancelPlayback({cancelAnimation:true});
                  break;
              }
              break;
            case 16: // shift key
              graffiti.shiftKeyIsDown = true;
              state.updateDrawingState([ { change: 'stickerOnGrid', data: true } ]);
              //console.log('Graffiti: shiftKeyIsDown');
              break;
              // case 13: // enter key
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

        $('body').keyup((e) => {
          //console.log('keyUp e.which:', e.which);
          switch (e.which) {
            case 16:
              //console.log('Graffiti: shiftKeyIsUp');
              graffiti.shiftKeyIsDown = false;
              state.updateDrawingState([ { change: 'stickerOnGrid', data: false } ]);
              break;
          }
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
                                                 graffiti.sitePanel.scrollTop() - state.getScrollTop());
          state.setScrollTop(graffiti.sitePanel.scrollTop());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('pointer');

          graffiti.updateDrawingDisplayWhenRecording(previousPointerX, previousPointerY, e.clientX, e.clientY, viewInfo );

          graffiti.updateControlPanelPosition();
          return true;
        };

        // if we were playing a recording when they hit reload, we need to cancel it, restore, and save before we continue
        window.onbeforeunload = (e) => {
          console.log('Graffiti: before unload');
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
          graffiti.previousActiveTakeId = recordingRecord.activeTakeId;
          if (recordingRecord.activeTakeId === undefined) { // if making a new take when there's a previous movie, must create a new activeTakeId
            recordingRecord.activeTakeId = utils.generateUniqueId(); // do not set a new activeTakeId if there was already a valid one set for the movie
          }
          newRecording = false;
        } else { 
          // Prepare to create a new recording
          graffiti.previousActiveTakeId = undefined;
          recordingCell = Jupyter.notebook.get_selected_cell();
          recordingCellId = utils.getMetadataCellId(recordingCell.metadata);
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
            activeTakeId: undefined, // this will be replaced with an id for the first movie recording made
            hasMovie: false
          }
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

        utils.setMetadataCellId(graffitiEditCell.metadata,utils.generateUniqueId());
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
        graffiti.graffitiEditCellId = utils.getMetadataCellId(graffitiEditCell.metadata);
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

            const tooltipCommands = graffiti.extractTooltipCommands(editCellContents);
            const recording = recordings[recordingCellInfo.recordingKey];
            recording.autoplay = 'never';
            if (tooltipCommands.autoplay === 'always') {
              recording.autoplay = 'always';
            } else if (tooltipCommands.autoplay === 'once') {
              recording.autoplay = 'once';
              recording.playedOnce = false;
            }
            recording.playOnClick = tooltipCommands.playOnClick;
            recording.hideTooltip = tooltipCommands.hideTooltip;
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
        if (doSave && recordingCellInfo.recordingRecord.cellType === 'markdown') {
          recordingCell.render();
        }
        if (doSave && state.getActivity() === 'recordingLabelling') {
          graffiti.setPendingRecording();
        } else {
          graffiti.changeActivity('idle');
          recordingCell.code_mirror.focus();
          if (doSave) {
            graffiti.refreshGraffitiHighlights({cell: recordingCell, clear: false});
          } else {
            graffiti.refreshGraffitiHighlights({cell: recordingCell, clear: true});
          }
          graffiti.refreshGraffitiTooltips();
        }
      },

      removeGraffitiCore: (recordingCell, recordingKey) => {
        const recordingCellId = utils.getMetadataCellId(recordingCell.metadata);
        if (recordingCell.cell_type === 'markdown') {
          // If this Graffiti was in a markdown cell we need to remove the span tags from the markdown source
          const contents = recordingCell.get_text();
          const spanRegex = RegExp('<span class="graffiti-highlight graffiti-' + recordingCellId + '-' + recordingKey + '"><i></i>(.*?)</span>','gm')
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


      removeAllGraffitis: (graffitiDisabled) => {
        const manifest = state.getManifest(); // save manifest before we wipe it out
        state.setManifest({});
        let recording, recordingCellId, recordingCell, recordingIds, recordingKeys, destructions = 0;
        for (recordingCellId of Object.keys(manifest)) {
          console.log('Graffiti: Removing recordings from cell:', recordingCellId);
          recordingKeys = Object.keys(manifest[recordingCellId]);
          if (recordingKeys.length > 0) {
            recordingCell = utils.findCellByCellId(recordingCellId);
            for (recordingKey of recordingKeys) {
              console.log('Graffiti: Removing recording id:', recordingKey);
              recording = manifest[recordingCellId][recordingKey];
              destructions++;
              graffiti.removeGraffitiCore(recordingCell, recordingKey);
              graffiti.refreshGraffitiHighlights({cell: recordingCell, clear: true});
            }
          }
        }
        storage.storeManifest();
        graffiti.highlightIntersectingGraffitiRange();
        graffiti.refreshGraffitiTooltips();
        graffiti.updateControlPanels();

        if (graffitiDisabled) {
          if (Jupyter.notebook.metadata.hasOwnProperty('graffitiId')) {
            storage.deleteDataDirectory(Jupyter.notebook.metadata.graffitiId);
            storage.removeGraffitiIds();
            graffiti.changeAccessLevel('view');
            graffiti.updateSetupButton();
          }
        }

        utils.saveNotebook();

        if (destructions === 0) {
          destructions = 'all';
        }

        let title, body;
        if (graffitiDisabled) {
          title = 'Graffiti has been disabled on this Notebook.';
          body = 'We removed ' + destructions + ' graffitis, and you will need to Enable Graffiti again to use Graffiti in this notebook.' + 
                 'You will also now want to remove the Graffiti data directory (jupytergraffiti_data) manually.';
        } else {
          title = 'Your notebook is now cleaned of all graffiti.';
          body = 'We removed ' + destructions + ' graffitis. Feel free to create new ones.';
        }
        dialog.modal({
          title: title,
          body: body,
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
        if (state.removeManifestEntry(utils.getMetadataCellId(recordingCell.metadata), recordingKey)) {
          graffiti.highlightIntersectingGraffitiRange();
          graffiti.refreshGraffitiHighlights({cell: recordingCell, clear: true});
          graffiti.refreshGraffitiTooltips();
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
                graffiti.removeAllGraffitis(false);

              }
            },
            'Cancel': { click: (e) => { console.log('Graffiti: you cancelled:', $(e.target).parent()); } },
          }
        });

      },

      removeGraffitiWithPrompt: () => {
        if (graffiti.selectedTokens.isIntersecting) {
          const recordingCell = graffiti.selectedTokens.recordingCell;
          const recordingCellId = utils.getMetadataCellId(recordingCell.metadata);
          const recordingKey = graffiti.selectedTokens.recordingKey;
          const recording = state.getManifestSingleRecording(recordingCellId,recordingKey);
          const content = '(Please Note: this cannot be undone.)<br/>' +
                          '<b>Graffiti\'d text:&nbsp;</b><span class="graffiti-text-display">' + recording.allTokensString + '</span><br/>' +
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

      // Remove all graffiti and remove the graffiti id's as well. Basically, return a notebook to a pre-graffiti-ized state.
      disableGraffiti: () => {
        graffiti.removeAllGraffitis(true);
      },

      disableGraffitiWithConfirmation: () => {
        const content = 'Clicking OK will <i>remove any trace of Graffiti</i> in this notebook, setting it to a state as if you had never enabled Graffiti. ' +
                        '<br><br><b>NOTE</b>: This <b>cannot</b> be undone.';
        const confirmModal = dialog.modal({
          title: 'Are you sure you want to disable Graffiti?',
          body: content,
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                console.log('Graffiti: you clicked ok, you want to disable graffiti:',
                            $(e.target).parent());
                graffiti.disableGraffiti();

              }
            },
            'Cancel': { click: (e) => { console.log('Graffiti: you cancelled:', $(e.target).parent()); } },
          }
        });

      },

      updateAllGraffitiDisplays: () => {
        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltips();
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
        const recordingRecord = graffiti.storeRecordingInfoInCell();
        if (recordingRecord.cellType === 'markdown') {
          graffiti.selectedTokens.recordingCell.render();
        }
        graffiti.setPendingRecording();
      },

      addCMEventsToSingleCell: (cell) => {
        graffiti.CMEvents[utils.getMetadataCellId(cell.metadata)] = true;
        const cm = cell.code_mirror;
        cm.on('focus', (cm, e) => {
          // console.log('Graffiti: CM focus:' , cm, e);
          // Check to see if we jumped from another cell to this cell with the arrow keys. If we did and we're recording, we need to
          // create a focus history record because jupyter is not firing the select cell event in those cases.

          // debugging lack of focus in input text field
          //          const focusCell = utils.findCellByCodeMirror(cm);
          //          const focusCellId = utils.getMetadataCellId(focusCell.metadata);
          //          console.log('focus cellId:', focusCellId);

          const activity = state.getActivity();
          if (activity === 'recording') {
            const cellId = utils.getMetadataCellId(cell.metadata);
            if (cellId !== state.getSelectedCellId()) {
              state.saveSelectedCellId(cellId);
            }
            state.storeHistoryRecord('focus');
          } else if (activity === 'recordingPending') {
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
          state.storeCellIdAffectedByActivity(utils.getMetadataCellId(affectedCell.metadata));
          state.storeHistoryRecord('selections');
        });

        cm.on('change', (cm, changeObj) => {
          //console.log('change activity:', changeObj);
          const affectedCell = utils.findCellByCodeMirror(cm);
          state.storeCellIdAffectedByActivity(utils.getMetadataCellId(affectedCell.metadata));
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
          graffiti.refreshGraffitiTooltips();
        });

        cm.on('scroll', (cm, e) => {
          const pointerPosition = state.getPointerPosition();
          const viewInfo = utils.collectViewInfo(pointerPosition.x,
                                                 pointerPosition.y, 
                                                 graffiti.notebookPanel.height(), 
                                                 graffiti.sitePanel.scrollTop() - state.getScrollTop());

          state.setScrollTop(graffiti.sitePanel.scrollTop());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('innerScroll');
        });

      },

      addCMEventsToCells: () => {
        const inputCells = Jupyter.notebook.get_cells();
        for (let cell of inputCells) {
          // Don't rebind if already bound
          if (!graffiti.CMEvents.hasOwnProperty(utils.getMetadataCellId(cell.metadata))) {
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
          graffiti.refreshGraffitiTooltips();
          graffiti.updateControlPanels();
        });

        Jupyter.notebook.events.on('create.Cell', (e, results) => {
          //console.log('create.Cell fired');
          //console.log(results);
          const newCell = results.cell;
          const newCellIndex = results.index;
          const newCellId = utils.setMetadataCellId(newCell.metadata,utils.generateUniqueId());
          utils.refreshCellMaps();
          graffiti.addCMEventsToSingleCell(newCell);
          state.storeCellAddition(newCellId, newCellIndex);
          state.storeHistoryRecord('contents');
        });

        Jupyter.notebook.events.on('delete.Cell', (e,results) => {
          utils.refreshCellMaps();
          const deletedCell = results.cell;
          if (deletedCell !== undefined) {
            const deletedCellId = utils.getMetadataCellId(deletedCell.metadata);
            if (deletedCellId !== undefined) {
              graffiti.removeCanvasRecordsForCell(deletedCellId);              
            }
          }
          state.storeHistoryRecord('contents');
        });

        Jupyter.notebook.events.on('finished_execute.CodeCell', (e, results) => {
          console.log('Graffiti: Finished execution event fired, e, results:',e, results);
          utils.refreshCellMaps();
          state.storeHistoryRecord('contents');
          graffiti.resizeCanvases();
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
              (utils.getMetadataCellId(results.cell.metadata) === graffiti.graffitiEditCellId)) {
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
            graffiti.savingScrim.css({display:'none'});
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
        graffiti.hideDrawingScreen();
        graffiti.resetDrawingColor();
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
        graffiti.wipeAllStickerDomCanvases();
        graffiti.removeCellsAddedByPlaybackOrRecording();
        state.restoreCellStates('selections');
        graffiti.sitePanel.animate({ scrollTop: graffiti.preRecordingScrollTop }, 750);
        graffiti.selectIntersectingGraffitiRange();
        state.deleteTrackingArrays();
        state.clearDisplayedTipInfo();
        graffiti.changeActivity('idle');
      },

      cancelPendingRecording: () => {
        const currentActivity = state.getActivity();
        console.log('Graffiti: canceling recording, current activity:', currentActivity);
        if (currentActivity === 'recordingPending') {
          graffiti.changeActivity('idle');
        }        
      },

      cancelRecording: () => {
        const currentActivity = state.getActivity();
        console.log('Graffiti: canceling recording, current activity:', currentActivity);
        if (currentActivity === 'recording') {
          const recordingCellInfo = state.getRecordingCellInfo();
          let mustStoreManifest = false;
          if (recordingCellInfo.newRecording) {
            state.removeManifestEntry(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey);
            mustStoreManifest = true;
          }
          if (graffiti.previousActiveTakeId !== undefined) {
            storage.updateSingleManifestRecordingField(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey, 
                                                       'activeTakeId', graffiti.previousActiveTakeId);
            mustStoreManifest = false; // updateSingleManifestRecordingField does manifest store for us.
          }
          if (mustStoreManifest) {
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
            console.log('Graffiti: Now starting movie recording');
            state.blockRecording(); // this is here because a race condition can happen right at the end of recording
            graffiti.setNotifier('Please wait, storing this movie...');
            graffiti.showControlPanels(['graffiti-notifier']);
            graffiti.savingScrim.css({display:'flex'});
            graffiti.deactivateAllPens();
            graffiti.resetStickerCanvases();
            graffiti.stopRecordingCore(true);
            state.unblockRecording();
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

            state.resetPlayState();
            graffiti.changeActivity('recording');
            state.setMovieRecordingStarted(true);
            utils.assignCellIds();
            state.initHistory({
              storageCellId: recordingCellInfo.recordingCellId,
            });
            state.clearCellAdditions();

            audio.startRecording();
            state.setScrollTop(graffiti.sitePanel.scrollTop());
            state.updateDrawingState([ { change: 'drawingModeActivated', data: false },
                                       { change: 'drawingActivity', data: 'idle' },
                                       { change: 'penType', data: undefined },
                                       { change: 'opacity', data: state.getMaxDrawingOpacity() } ]);
            graffiti.resetDrawingPen();
            state.disableDrawingFadeClock(); // initially, we don't fade since nothing drawn yet

            state.setRecordingInterval(
              setInterval(() => {
                //console.log('Moving recording time ahead');
                if (graffiti.runOnceOnNextRecordingTick !== undefined) {
                  graffiti.runOnceOnNextRecordingTick();
                  graffiti.runOnceOnNextRecordingTick = undefined;
                }
                graffiti.updateTimeDisplay(state.getTimeRecordedSoFar());
                graffiti.updateDrawingOpacity();
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
        const bufferY = clientHeight / 9;
        const minAllowedCursorY = topbarHeight + bufferY;
        const maxAllowedCursorY = clientHeight - bufferY;
        let mustNudgeCheck = !useTrailingVelocity;
        let nudgeIncrements = graffiti.scrollNudgeQuickIncrements;
        
        // Watch trailing average of cursor. If the average over twenty samples is in a nudge zone, then nudge
        if (useTrailingVelocity) {
          nudgeIncrements = ((state.getActivity === 'scrubbing') ? 1.0 : graffiti.scrollNudgeSmoothIncrements);
          const trailingAverageSize = 8;
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

      computeOffsetPosition: (record) => {
        const cellRects = utils.getCellRects(record.hoverCell);        
        //console.log('hoverCellId:', utils.getMetadataCellId(record.hoverCell.metadata), 'rect:', innerCellRect);
        const dx = record.x / record.innerCellRect.width;
        const dy = record.y / record.innerCellRect.height;
        if (record.hoverCell.cell_type === 'code') {
          let codeCellWidth = $('.code_cell:first').width();
          if (record.innerCellRect.width !== undefined) {
            codeCellWidth = record.innerCellRect.width;
          }
          dxScaled = parseInt(codeCellWidth * dx);
          dyScaled = parseInt(cellRects.innerCellRect.height * dy);
        } else {
          dxScaled = parseInt(cellRects.innerCellRect.width * dx);
          dyScaled = parseInt(cellRects.innerCellRect.height * dy);
        }
        const offsetPosition = {
          x : cellRects.innerCellRect.left + dxScaled,
          y : cellRects.innerCellRect.top + dyScaled
        };
        return offsetPosition;
      },

      // This needs a rethink, it's too similar to the func above
      computeStickersOffsetPositions: (cellId, record, stickerRecord) => {
        const cell = utils.findCellByCellId(cellId);
        //console.log('computeStickersOffsetPositions, cellId', cellId);
        const cellRects = utils.getCellRects(cell);
        const positions = stickerRecord.positions;
        const ratio = { 
          start: { x: positions.start.x / record.innerCellRect.width,
                   y: positions.start.y / record.innerCellRect.height },
          end:   { x: positions.end.x / record.innerCellRect.width,
                   y: positions.end.y / record.innerCellRect.height }
        };
        posScaled = { start: {}, end: {} };
        if (cell.cell_type === 'code') {
          let codeCellWidth = $('.code_cell:first').width();
          if (record.innerCellRect.width !== undefined) {
            codeCellWidth = record.innerCellRect.width;
          }
          posScaled.start.x = parseInt(codeCellWidth * ratio.start.x);
          posScaled.start.y = parseInt(cellRects.innerCellRect.height * ratio.start.y);
          posScaled.end.x = parseInt(codeCellWidth * ratio.end.x);
          posScaled.end.y = parseInt(cellRects.innerCellRect.height * ratio.end.y);
        } else {
          posScaled.start.x = parseInt(cellRects.innerCellRect.width * ratio.start.x);
          posScaled.start.y = parseInt(cellRects.innerCellRect.height * ratio.start.y);
          posScaled.end.x = parseInt(cellRects.innerCellRect.width * ratio.end.x);
          posScaled.end.y = parseInt(cellRects.innerCellRect.height * ratio.end.y);
        }
        const offsetPosition = {
          start: {
            x : posScaled.start.x,
            y : posScaled.start.y
          },
          end: {
            x : posScaled.end.x,
            y : posScaled.end.y
          }
        };
        return offsetPosition;
      },

      updateDrawingCore: (record) => {
        //console.log('updateDrawingCore:', record);
        record.hoverCell = utils.findCellByCellId(record.cellId);

        switch (record.drawingActivity) {
          case 'draw':
            graffiti.placeCanvas(record.cellId, record.pen.permanence);
            graffiti.setCanvasStyle(record.cellId, record.pen.type, record.pen.dash, record.pen.color, record.pen.permanence);
            graffiti.updateDrawingDisplay(record.cellId, 
                                          record.positions.start.x, 
                                          record.positions.start.y,
                                          record.positions.end.x, 
                                          record.positions.end.y,
                                          record.pen.type,
                                          record.pen.permanence);
            break;
          case 'sticker':
            graffiti.drawStickersForCell(record.cellId, record.pen.permanence, record);
            break;
          case 'fade':
            $('.graffiti-canvas-type-temporary').css({opacity: record.opacity });
            break;
          case 'wipe':
            graffiti.clearCanvases('temporary');            
            graffiti.wipeTemporaryStickerDomCanvases();
            break;
        }
      },

      updateDrawings: (drawingFrameIndex) => {
        if (drawingFrameIndex === undefined) {
          return; // no drawings yet at this index
        }

        // console.log('updateDrawings');
        // Need to process a range of records if that's required.
        const startIndex = ((drawingFrameIndex.rangeStart == undefined) ? drawingFrameIndex.index : drawingFrameIndex.rangeStart);
        const endIndex = drawingFrameIndex.index;
        let index, record;
        for (index = startIndex; index <= endIndex; ++index) {
          record = state.getHistoryItem('drawings', index);
          graffiti.updateDrawingCore(record);
        }
      },

      updatePointer: (record) => {
        if (record.hoverCell !== undefined) {
          const offsetPosition = graffiti.computeOffsetPosition(record);
          graffiti.applyScrollNudge(offsetPosition, record, true);

          const lastPosition = state.getLastRecordedCursorPosition();
          if ((offsetPosition.x !== lastPosition.x) || (offsetPosition.y !== lastPosition.y)) {
            // Show cursor whenever it's moved by user
            //console.log('Showing cursor:', offsetPosition, lastPosition);
            graffiti.undimGraffitiCursor();
            const offsetPositionPx = { left: offsetPosition.x + 'px', top: offsetPosition.y + 'px'};
            graffiti.graffitiCursor.css(offsetPositionPx);
          }            
          state.setLastRecordedCursorPosition(offsetPosition);
        }
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

        // Handle pointer updates and canvas updates, as well as cell focus changes
        if (record.subType === 'pointer') {
          //console.log('pointerUpdate is true, record:', record);
          graffiti.updatePointer(record);
        } else {
          graffiti.dimGraffitiCursor();
          if (record.hoverCell !== undefined) {
            if (record.subType === 'focus') {
              // console.log('processing focus');
              record.hoverCell.focus_cell();
              const code_mirror = record.hoverCell.code_mirror;
              if (!code_mirror.state.focused) {
                code_mirror.focus();
              }
              code_mirror.getInputField().focus();
            }
          }
        }

        if (record.hoverCell !== undefined) {
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

          graffiti.setSitePanelScrollTop(newScrollTop);

        }
      },

      updateCellSelections: (cell,cm, selections) => {
        const currentScrollTop = graffiti.sitePanel.scrollTop();
        cell.focus_cell();
        cm.setSelections(selections);
        graffiti.setSitePanelScrollTop(currentScrollTop);
      },

      updateSelectedCellSelections: (currentScrollTop) => {
        const selectedCell = Jupyter.notebook.get_selected_cell();
        utils.refreshCodeMirrorSelection(selectedCell);
        graffiti.setSitePanelScrollTop(currentScrollTop);
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
                graffiti.setSitePanelScrollTop(currentScrollTop); // restore scrollTop because changing selections messes with it
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
              //console.log('cellId, selections, currentSelections, subType:', cellId, selections, currentSelections, record.subType);

              if (!(_.isEqual(selections,currentSelections))) {
                graffiti.dimGraffitiCursor();

                graffiti.updateCellSelections(cell,code_mirror, selections);

                if (code_mirror.state.focused) {
                  // If we made a selections update this frame, AND we are focused in it,
                  // make sure that we keep it in view. We need to compute the
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
        }
      },

      // After playback finishes, delete any cells added during playback.
      removeCellsAddedByPlaybackOrRecording: () => {
        const cellAdditions = state.getCellAdditions(); // all cells added during this recording
        if (cellAdditions !== undefined) {
          let deleteCellIndex;
          for (let cellId of Object.keys(cellAdditions)) {
            deleteCellIndex = utils.findCellIndexByCellId(cellId);
            if (deleteCellIndex !== undefined) {
              //console.log('Going to delete:', cellId, 'at index:', deleteCellIndex);
              Jupyter.notebook.delete_cell(deleteCellIndex);
            }
          }
        }
      },

      // At any timeframe add cells that were present during recording but aren't now, and remove any that were added by playback/scrub
      // but aren't present at this timeframe.
      applyCellListToNotebook: (record) => {
        const cellsPresentThisFrame = record.cellsPresentThisFrame;
        const cellsPresentIds = Object.keys(cellsPresentThisFrame);
        const numCellsPresent = cellsPresentIds.length;
        let mustRefreshCellMaps = false;
        if (numCellsPresent > 0) {
          // First figure out which cells are extra and need to be deleted on this cell
          let checkCellId, deleteCellId, deleteCellIndex, foundCell, cellPosition, newCell;
          const cellAdditions = state.getCellAdditions(); // all cells added during this recording
          const cellAdditionsIds = Object.keys(cellAdditions);
          // Any cells that may have been added during the movie, not present in this timeframe, must be deleted.
          const deletableCellIds = _.difference(cellAdditionsIds, cellsPresentIds); 
          //console.log('deletableCellIds', deletableCellIds, cellAdditions, cellsPresentIds);
          for (deleteCellId of deletableCellIds) {
            deleteCellIndex = utils.findCellIndexByCellId(deleteCellId);
            if (deleteCellIndex !== undefined) {
              //console.log('Going to delete:', deleteCellId, 'at index:', deleteCellIndex);
              Jupyter.notebook.delete_cell(deleteCellIndex);
            }
          }

          // Now figure out which cells are missing and need to be added in. Add them in above whatever position 
          // they were recorded in, which will be approximate.
          for (checkCellId of cellsPresentIds) {
            foundCell = utils.findCellByCellId(checkCellId);
            if (foundCell === undefined) {
              cellPosition = cellsPresentThisFrame[checkCellId];
              newCell = Jupyter.notebook.insert_cell_above('code', cellPosition);
              newCell.metadata.graffitiCellId = checkCellId;
              mustRefreshCellMaps = true;
            }
          }
        }
        if (mustRefreshCellMaps) {
          utils.refreshCellMaps();
        }
      },

      // set_text() causes jupyter to scroll to top of cell so we need to restore scrollTop after calling this fn.
      updateContents: (index, currentScrollTop) => {
        const contentsRecord = state.getHistoryItem('contents', index);
        const cells = Jupyter.notebook.get_cells();
        let cellId, contents, outputs, frameContents, frameOutputs;
        graffiti.applyCellListToNotebook(contentsRecord);
        for (let cell of cells) {
          if (cell.cell_type === 'code') {
            cellId = utils.getMetadataCellId(cell.metadata);
            contents = cell.get_text();
            if (contentsRecord.cellsContent.hasOwnProperty(cellId)) {
              frameContents = state.extractDataFromContentRecord(contentsRecord.cellsContent[cellId].contentsRecord, cellId);
              if (frameContents !== undefined && frameContents !== contents) {
                //console.log('Setting text on cellid:', utils.getMetadataCellId(cell.metadata));
                cell.set_text(frameContents);
              }
              frameOutputs = state.extractDataFromContentRecord(contentsRecord.cellsContent[cellId].outputsRecord, cellId);
              state.restoreCellOutputs(cell, frameOutputs);
            }
          }
        }
        graffiti.setSitePanelScrollTop(currentScrollTop); // restore scrollTop because changing selections messes with it
        graffiti.resizeCanvases();
      },

      updateDisplay: (frameIndexes) => {
        if (state.shouldUpdateDisplay('contents', frameIndexes.contents)) {
          graffiti.updateContents(frameIndexes.contents.index, graffiti.sitePanel.scrollTop());
        }
        if (state.shouldUpdateDisplay('selections', frameIndexes.selections)) {
          graffiti.updateSelections(frameIndexes.selections.index, graffiti.sitePanel.scrollTop());
        }
        if (state.shouldUpdateDisplay('drawing', frameIndexes.drawings)) {
          if (state.getActivity() !== 'scrubbing') {
            // console.log('calling updateDrawings from updateDisplay');
            graffiti.updateDrawings(frameIndexes.drawings);
          }
        }
        if (state.shouldUpdateDisplay('view', frameIndexes.view)) {
          graffiti.updateView(frameIndexes.view.index);
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
        // console.log('Graffiti: t:', t);
        const frameIndexes = state.getHistoryRecordsAtTime(t);
        state.clearSetupForReset();
        state.resetRapidPlayTime();
        state.setPlaybackTimeElapsed(t);
        graffiti.wipeAllStickerDomCanvases();
        graffiti.updateDisplay(frameIndexes);
        graffiti.updateSlider(t);
        graffiti.updateTimeDisplay(t);
        graffiti.redrawAllDrawings(t);
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
        state.resetRapidPlayTime();
        graffiti.undimGraffitiCursor();
        const t = Math.min(state.getHistoryDuration() * timeLocation, state.getHistoryDuration() - 1);
        // Now we need to set the time we are going to start with if we play from here.
        state.setPlaybackTimeElapsed(t);
        const frameIndexes = state.getHistoryRecordsAtTime(t);
        graffiti.wipeAllStickerDomCanvases();
        graffiti.updateDisplay(frameIndexes); // can replay scroll diffs, and in playback use cumulative scroll diff
        graffiti.updateTimeDisplay(t);
        graffiti.redrawAllDrawings(t);
      },

      pausePlaybackNoVisualUpdates: () => {
        if (state.getActivity() === 'playing') {
          clearInterval(state.getPlaybackInterval());
          graffiti.changeActivity('playbackPaused');
          audio.pausePlayback();
          console.log('Graffiti: pausePlaybackNoVisualUpdates');
          state.setPlaybackTimeElapsed();
          // Make sure, if some markdown was selected, that the active code_mirror textarea reengages to get keystrokes.
          graffiti.updateSelectedCellSelections(graffiti.sitePanel.scrollTop()); 
        }
      },

      // Pause any ongoing playback
      pausePlayback: () => {
        if (state.getActivity() !== 'playing')
          return;

        graffiti.pausePlaybackNoVisualUpdates();

        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltips();
        //graffiti.cancelRapidPlay();

        // Save after play stops, so if the user reloads we don't get the annoying dialog box warning us changes were made.
        // graffiti.saveNotebook();

        console.log('Graffiti: Stopped playback.');
      },

      cancelPlaybackNoVisualUpdates: () => {
        const accessLevel = state.getAccessLevel();
        graffiti.pausePlaybackNoVisualUpdates();
        state.resetPlayState();
        graffiti.changeActivity('idle');
        if ((accessLevel === 'view') && (state.getDontRestoreCellContentsAfterPlayback())) {
          console.log('Graffiti: not restoring cell contents since this recording specifies not to.');
          utils.saveNotebook();
        } else {
          graffiti.removeCellsAddedByPlaybackOrRecording();
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
        graffiti.resetStickerCanvases();
        graffiti.cancelRapidPlay();
        graffiti.graffitiCursor.hide();
        graffiti.clearCanvases('all');
        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltips(); 
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
        const activity = state.getActivity();
        console.log('Graffiti: Starting playback, current activity:', activity);
        if ((activity === 'idle') || (activity === 'notifying')) {
          // If just starting to play back, store all cells current contents so we can restore them when you cancel playback.
          utils.saveNotebook();
          state.setScrollTop(graffiti.sitePanel.scrollTop());
          graffiti.prePlaybackScrolltop = state.getScrollTop();
          graffiti.lastScrollViewId = undefined;
          graffiti.lastDrawIndex = undefined;
          graffiti.lastDrawingEraseIndex = undefined;
          state.storeCellStates();
          state.clearCellOutputsSent();
          graffiti.scrollNudgeAverages = [];
        }

        if ((activity === 'idle') || (activity === 'notifying') || (activity === 'playbackPaused')) {
          graffiti.clearCanvases('all');
        }

        graffiti.clearHighlightMarkText();
        graffiti.undimGraffitiCursor();
        graffiti.changeActivity('playing');
        graffiti.lastTemporaryCanvasClearViewIndex = -1;

        if (state.getResetOnNextPlay()) {
          console.log('Graffiti: Resetting for first/re play.');
          graffiti.clearCanvases('all');
          graffiti.wipeAllStickerDomCanvases();
          state.resetPlayState();
        }

        state.setPlaybackStartTime(utils.getNow() - state.getPlaybackTimeElapsed());
        state.setRapidPlayStartTimeToNowIfOn();

        if (!state.getMute()) {
          audio.startPlayback(state.getPlaybackTimeElapsed());
        }

        // Set up main playback loop on a 10ms interval
        state.setPlaybackInterval(
          setInterval(() => {
            //console.log('Moving playback time ahead.');
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
              //console.log('play interval, now=', utils.getNow());
            }
          }, graffiti.playbackIntervalMs)
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

      // If there is a graffiti that has the autoplayAlways attribute set to true, play it immediately.
      // Otherwise, if there is one with autoplayOnce attribute set to true and it hasn't been played previously, play it immediately.
      playAutoplayGraffiti: () => {
        const manifest = state.getManifest();
        let recordingCellId, recordingKeys, recording, autoplayGraffiti, autoplayedOnce = false;
        for (recordingCellId of Object.keys(manifest)) {
          recordingKeys = Object.keys(manifest[recordingCellId]);
          if (recordingKeys.length > 0) {
            for (recordingKey of recordingKeys) {
              recording = manifest[recordingCellId][recordingKey];
              // console.log('Graffiti autoplay rec:', recording);
              if (recording.autoplay !== undefined) {
                if (autoplayGraffiti === undefined) {
                  if (recording.autoplay === 'always') {
                    autoplayGraffiti = { recordingCellId: recordingCellId, recordingKey: recordingKey };
                  } else if (recording.autoplay === 'once') {
                    if (!recording.playedOnce) {
                      autoplayGraffiti = { recordingCellId: recordingCellId, recordingKey: recordingKey };
                      recording.playedOnce = true;
                      autoplayedOnce = true;
                    }
                  }
                }
              }
            }
          }
        }
        if (autoplayGraffiti !== undefined) {
          graffiti.playRecordingById(autoplayGraffiti.recordingCellId, autoplayGraffiti.recordingKey);
          if (autoplayedOnce) {
            storage.storeManifest();
          }
        }
      },

      playMovieViaUserClick: () => {
        //console.log('click in tip');
        graffiti.cancelPlayback({cancelAnimation:false});
        const playableMovie = state.getPlayableMovie('tip');
        if (playableMovie === undefined) {
          console.log('Graffiti: no playable movie known.');
          return;
        }
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
      },

      loadAndPlayMovie: (kind) => {
        const playableMovie = state.getPlayableMovie(kind);
        if (playableMovie === undefined) {
          console.log('Graffiti: no playable movie defined.');
          return;
        }

        // next line seems to be extraneous and buggy because we create a race condition with the control panel. however what happens if a movie cannot be loaded?
        // graffiti.cancelPlayback({cancelAnimation:false}); // cancel any ongoing movie playback b/c user is switching to a different movie

        storage.loadMovie(playableMovie.cellId, playableMovie.recordingKey, playableMovie.activeTakeId).then( () => {
          console.log('Graffiti: Movie loaded for cellId, recordingKey:', playableMovie.cellId, playableMovie.recordingKey);
          if (playableMovie.cellType === 'markdown') {
            playableMovie.cell.render(); // always render a markdown cell first before playing a movie on a graffiti inside it
          }
          graffiti.togglePlayback();
          graffiti.hideTip();
        }).catch( (ex) => {
          graffiti.changeActivity('idle');
          dialog.modal({
            title: 'Movie is not available.',
            body: 'We are sorry, we could not load this movie at this time. Please contact the author of this Notebook for help.',
            sanitize:false,
            buttons: {
              'OK': {
                click: (e) => { 
                  console.log('Graffiti: Missing movie acknowledged.'); 
                }
              }
            }
          });

          console.log('Graffiti: could not load movie:', ex);
        });

      },

      playRecordingById: (cellId, recordingKey) => {
        state.setPlayableMovie('api', cellId, recordingKey);
        graffiti.loadAndPlayMovie('api');
      },      

      playRecordingByIdString: (recordingFullId) => {
        const parts = recordingFullId.split('_');
        const cellId = 'id_' + parts[0];
        const recordingKey = 'id_' + parts[1];
        graffiti.playRecordingById(cellId, recordingKey);
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
                                   graffiti.playRecordingByIdString(recordingFullId);
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
          graffiti.activateAudio(); // we need to activate audio to create the audio object, even if microphone access was previously granted.
          state.setAuthorId(0); // currently hardwiring this to creator(teacher) ID, which is always 0. Eventually we will replace this with 
          // individual author ids
          storage.ensureNotebookGetsGraffitiId();
          utils.assignCellIds();
          utils.saveNotebook();
          graffiti.refreshAllGraffitiHighlights();
          graffiti.refreshGraffitiTooltips();
        } else {
          graffiti.outerControlPanel.fadeOut(graffiti.panelFadeTime);          
        }
        state.setAccessLevel(level); 
        graffiti.updateControlPanels();
      },

      toggleAccessLevel: (forcedLevel) => {
        let buttonLabel;
        const level = (forcedLevel === undefined ? state.getAccessLevel() : forcedLevel);
        if (forcedLevel !== undefined) {
          if (level === 'create') {
            buttonLabel = 'Hide Graffiti Editor';
            graffiti.changeAccessLevel('create');
          } else {
            buttonLabel = 'Show Graffiti Editor';
            graffiti.changeAccessLevel('view');
          }
        } else {
          if (level === 'create') {
            buttonLabel = 'Show Graffiti Editor';
            graffiti.changeAccessLevel('view');
          } else {
            buttonLabel = 'Hide Graffiti Editor';
            graffiti.changeAccessLevel('create');
          }
        }
        $('#graffiti-setup-button span:last').text(buttonLabel);
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

      packageGraffitis: () => {
        storage.packageGraffitis().then((fileName) => {
          dialog.modal({
            title: 'Packaging Complete',
            body: 'Your Notebook\'s Graffitis, and your notebook, have been copied into a archive file.<br><br>' +
                  'Now you can copy and unpack that archive file anywhere Graffiti is supported, using the shell command: ' +
                  '<code>tar zxf ' + fileName + '</code>',
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

      updateSetupButton: () => {
        const notebook = Jupyter.notebook;
        const sprayCanIcon = stickerLib.makeSprayCanIcon();
        let buttonLabel, setupForSetup = false;
        //sprayCanIcon = '<img src="jupytergraffiti/css/spray_can_icon.png">';
        let buttonContents = '<div id="graffiti-setup-button" class="btn-group"><button class="btn btn-default" title="Enable Graffiti">';

        if (!notebook.metadata.hasOwnProperty('graffitiId')) {
          // This notebook has never been graffiti-ized, or it just got un-graffiti-ized
          const existingSetupButton = $('#graffiti-setup-button');
          if (existingSetupButton.length > 0) {
            existingSetupButton.remove();
          }
          buttonLabel = 'Activate Graffiti';
          setupForSetup = true;
        } else {
          // This notebook has already been graffiti-ized. Render the setup button for view mode,
          // which is the default mode to start.
          buttonLabel = 'Show Graffiti Editor';
        }
        const setupButtonDiv = $(buttonContents + '<span>' + buttonLabel + '</div></button></span>');
        const jupyterMainToolbar = $('#maintoolbar-container');
        setupButtonDiv.appendTo(jupyterMainToolbar);
        $('#graffiti-setup-button button').prepend(sprayCanIcon);
        if (setupForSetup) {
          $('#graffiti-setup-button').click(() => {
            graffiti.firstTimeSetup();
          });
        } else {
          $('#graffiti-setup-button').click(() => {
            graffiti.toggleAccessLevel();
          });
        }
      },

      firstTimeSetup: () => {
        dialog.modal({
          title: 'Activate Graffiti On This Notebook?',
          body: 'Enable Graffiti on this Notebook, so you can begin using Graffiti for the first time?<br>' +
                'If you click Cancel, we will not change the notebook in any way.' +
                '<br><br><i>(This process merely adds some metadata to the cells, but does not otherwise change the Notebook\'s contents.)</i>',
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                console.log('Graffiti: You clicked ok');
                storage.ensureNotebookGetsGraffitiId();
                utils.saveNotebook();
                graffiti.initInteractivity();
                graffiti.toggleAccessLevel('view');
                graffiti.activateAudio(); // request microphone access in case switching to 'create' mode later
                $('#graffiti-setup-button').unbind('click').click(() => {
                  graffiti.toggleAccessLevel();
                });
              }
            },
            'Cancel': {
              click: (e) => {
                console.log('Graffiti: Not adding Graffiti.');
              }
            }
          }
        });
      },

    };

    // Functions exposed externally to the Python API.
    return {
      init: graffiti.init,
      graffiti:graffiti, // remove me
      state: state, // remove me
      playRecordingById: (recordingFullId) => { graffiti.playRecordingByIdString(recordingFullId) },
      playRecordingByIdWithPrompt: (recordingFullId, promptMarkdown) => { graffiti.playRecordingByIdWithPrompt(recordingFullId, promptMarkdown) },
      cancelPlayback: () => { graffiti.cancelPlayback({cancelAnimation:false}) },
      removeAllGraffiti: graffiti.removeAllGraffitisWithConfirmation,
      disableGraffiti: graffiti.disableGraffitiWithConfirmation,
      // showCreatorsChooser: graffiti.showCreatorsChooser,
      setAccessLevel: (level) => { graffiti.toggleAccessLevel(level) },
      setAuthorId: (authorId) => { state.setAuthorId(authorId) },
      transferGraffitis: () => { graffiti.transferGraffitis() },
      packageGraffitis: () => { graffiti.packageGraffitis() },
      selectionSerializer: selectionSerializer
    }

  })();

  return Graffiti;

});
