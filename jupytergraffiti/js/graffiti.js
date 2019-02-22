define([
  'base/js/dialog',
  'base/js/events',
  'notebook/js/textcell',
  './LZString.js',
  './state.js',
  './utils.js',
  './audio.js',
  './storage.js',
  './sticker.js',
  './localizer.js',
  './selectionSerializer.js',
  './terminals.js',
  './batchRunner.js',
  'components/marked/lib/marked'
], function(dialog, events, textCell, LZString, state, utils, audio, storage, stickerLib, localizer, selectionSerializer, terminalLib, batchRunner, marked) {
  const Graffiti = (function() {
    const graffiti = {

      init: () => {
        console.log('Graffiti: Main constructor running.');
        
        utils.loadCss([
          'jupytergraffiti/css/graffiti.css',
          'jupytergraffiti/css/xterm.css'
        ]);

        const location = document.location;

        state.init();
        const currentAccessLevel = state.getAccessLevel();

        graffiti.LZString = LZString;
        graffiti.rewindAmt = 1;  // seconds
        graffiti.rewindSkipEditAmt = 0.05;  // seconds
        graffiti.CMEvents = {};
        graffiti.halfBullseye = 12;
        graffiti.sitePanel = $('#site');
        graffiti.notebookPanel = $('#notebook');
        graffiti.notebookContainer = $('#notebook-container');
        graffiti.notebookContainerPadding = parseInt(graffiti.notebookContainer.css('padding').replace('px',''));
        graffiti.penColor = 'black';

        graffiti.recordingIntervalMs = 10; // In milliseconds, how frequently we sample the state of things while recording.
        graffiti.playbackIntervalMs = graffiti.recordingIntervalMs;  // In milliseconds, loop speed for playback.  Must match recordingIntervalMs.
        graffiti.highlightMarkText = undefined;
        graffiti.cmLineHeight = 17.0001; // line height of code mirror lines as styled in Jupyter
        graffiti.cmLineFudge = 8; // buffer between lines
        graffiti.cmLineTipFudge = 6; // buffer between lines for tip display
        graffiti.tipAboveFudge = 14;
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
        graffiti.windowSizeCheckInterval = 250; // ms
        graffiti.windowSizeChangeTime = undefined;
        graffiti.skipKeyDownTimer = undefined;
        graffiti.skipKeyCode = 18; // key code of whatever key starts a skip (alt/option)

        graffiti.scrollNudgeSmoothIncrements = 6;
        graffiti.scrollNudgeQuickIncrements = 4;
        graffiti.scrollNudge = undefined;
        graffiti.penColors = {
          'black'  : '000000',
          'white'  : 'ffffff',
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
        graffiti.forcedGraffitiTooltipRefresh = false;
        graffiti.MarkdownCell = textCell.MarkdownCell;

        if (currentAccessLevel === 'create') {
          storage.ensureNotebookGetsGraffitiId();
          storage.ensureNotebookGetsFirstAuthorId();
        }

        // Init language strings
        localizer.init().then(() => { 
          // Set up the button that activates Graffiti on new notebooks and controls visibility of the control panel if the notebook has already been graffiti-ized.
          graffiti.updateSetupButton();

          if (Jupyter.notebook.metadata.hasOwnProperty('graffiti')) { // do not try to load the manifest if this notebook has not yet been graffiti-ized.
            storage.loadManifest(currentAccessLevel).then(() => {
              graffiti.initInteractivity();
            }).catch((ex) => {
              console.log('Graffiti: Not setting up Graffiti because this notebook has never had any authoring done yet (no recordingId).');
              console.log(ex);
            });
          }
        });
        
      },

      provideAPIKeyExamples: () => {
        let recorderApiKeyCell = Jupyter.notebook.insert_cell_below('code');
        let invocationLine = 
          "# Graffiti Id: " + graffiti.recordingAPIKey + "\n\n" +
          "# --------------------------------------\n" +
          "import jupytergraffiti\n" +
          "# jupytergraffiti.api.play_recording('" + graffiti.recordingAPIKey + "')\n" +
          "# jupytergraffiti.api.play_recording_with_prompt('" + graffiti.recordingAPIKey +
          "', '![idea](../images/lightbulb_small.jpg) Click **here** to learn more.')\n" +
          "# jupytergraffiti.api.stop_playback()\n" +
          "# jupytergraffiti.api.remove_unused_takes('" + graffiti.recordingAPIKey + "')\n" +
          "# jupytergraffiti.api.remove_all_unused_takes()\n";
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

      setJupyterMenuHint: (hint, classOverride) => {
        if (graffiti.jupyterMenuHint === undefined) {
          const jupyterMainToolbar = $('#maintoolbar-container');
          const menuHintDiv = $('<span class="graffiti-jupyter-menu-hint-shell"></span>');
          graffiti.jupyterMenuHint = menuHintDiv.appendTo(jupyterMainToolbar);
        }
        const override = (classOverride !== undefined ? classOverride : '');
        const hintHtml = '<span class="graffiti-jupyter-menu-hint ' + override + '">' + hint + '</span>';
        graffiti.jupyterMenuHint.html(hintHtml).show();
      },

      clearJupyterMenuHint: () => {
        if (graffiti.jupyterMenuHint !== undefined) {
          graffiti.jupyterMenuHint.hide();
        }
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
      
      // Skips functionality

      updateSkipsBar: () => {
        if (!(state.getEditingSkips())) {
          return;
        }
        const skipRecords = state.getSkipsRecords();
        const bar = $('#graffiti-skips-display-bar');
        bar.empty();
        const barWidth = bar.width();
        const barHeight = bar.height();
        let skipBarLeft, skipBarWidth, skipBarColor, skipBarCaption, rec, endTime;
        const duration = state.getHistoryDuration();
        for (let i = 0; i < skipRecords.length; ++i) {
          rec = skipRecords[i];
          endTime = (rec.endTime !== undefined ? rec.endTime : state.getTimePlayedSoFar() );
          console.log('updateSkipsBar, rec:',rec, 'endTime:', endTime);
          skipBarWidth = parseInt(((endTime - rec.startTime) / duration) * barWidth);
          skipBarLeft = parseInt((rec.startTime / duration) * barWidth);
          if (skipBarWidth < 0) {
            skipBarLeft += skipBarWidth;
            skipBarWidth = Math.abs(skipBarWidth);
          }
          skipBarColor = state.getSkipStatusColor(rec.status);
          skipBarCaption = state.getSkipStatusCaption(rec.status);
          $('<div class="graffiti-skips-display-sub-bar" style="width:' + skipBarWidth + 'px;left:' + skipBarLeft + 'px;background:#' + skipBarColor + '"' +
            'title="' + skipBarCaption + '"></div>').appendTo(bar);
        }
      },

      storeSkipRecord: (newStatus) => {
        state.storeSkipRecord(newStatus);
        graffiti.updateSkipsBar();
        graffiti.updateControlPanels();
      },
      
      toggleRecordingSkip: () => {
        if (state.getActivity() !== 'recording') {
          state.resetSkipStatus();
          return;
        }
        state.toggleRecordingSkip();
        if (state.isSkipping()) {
          graffiti.setJupyterMenuHint(localizer.getString('RECORDING_HINT_4'), 'graffiti-jupyter-menu-alert');
        } else {
          graffiti.clearJupyterMenuHint();
        }
        state.storeHistoryRecord('skip');
      },

      // This function is sort of a hack. It creates a new Graffiti to be placed in this cell, wrapping the markdown in it.
      // It repeats some of the functionality of finishGraffiti() without UX interactions, which is unfortunate. Refactor really needed.
      createGraffitizedMarkdown: (cell, markdown, tooltipCommands, tooltipDirectives) => {
        const recordingKey = utils.generateUniqueId();
        const cellId = utils.getMetadataCellId(cell.metadata);
        const recordingRecord = $.extend(true, {
          cellId: cellId,
          cellType: 'markdown',
          createDate: utils.getNow(),
          inProgress: false,
          tokens: $.extend({}, graffiti.selectedTokens.tokens),
          range: $.extend({}, graffiti.selectedTokens.range),
          allTokensString: graffiti.selectedTokens.allTokensString,
          markdown: tooltipDirectives.join("\n") + "\n",
          authorId: state.getAuthorId(),
          authorType: state.getAuthorType(),
          activeTakeId: undefined, // this will be replaced with an id for the first movie recording made
          takes: [],
          hasMovie: true, // this is set to true but the non-existent will be ignored because this will run a terminal command
        }, tooltipCommands);
        state.setSingleManifestRecording(cellId, recordingKey, recordingRecord);
        storage.storeManifest();
        const spanOpenTag = '<span class="graffiti-highlight graffiti-' + cellId + '-' + recordingKey + '"><i></i>';
        const graffizedContents = spanOpenTag + markdown + '</span>';
        return { 
          recordingKey: recordingKey,
          markdown: graffizedContents 
        };
      },

      // Create a button with a graffiti that doesn't do anything, but is ready to attach a recording to. This is merely to help
      // authors who don't know much html create buttons more easily.
      createGraffitiButtonAboveSelectedCell: () => {
        const selectedCellIndex = Jupyter.notebook.get_selected_index();
        const buttonCell = Jupyter.notebook.insert_cell_above('markdown', selectedCellIndex);
        const buttonCellId = utils.getMetadataCellId(buttonCell.metadata);
        const buttonCellIndex = utils.findCellIndexByCellId(buttonCellId);
        Jupyter.notebook.select(buttonCellIndex); // critical step, otherwise, the cell will not render correctly
        const cm = buttonCell.code_mirror;
        cm.execCommand('selectAll');
        const params = { cell: buttonCell, clear: true };
        graffiti.refreshGraffitiHighlights(params);
        graffiti.selectedTokens = utils.findSelectionTokens(buttonCell, graffiti.tokenRanges, state);

        tooltipCommands = {
          autoPlay: 'never',
          playOnClick: false,
          hideTooltip: false,
          narratorName: undefined,
          narratorPicture: undefined,
          stickerImageUrl: undefined,
        };
        const tooltipDirectives = [
          '%%button_name No Movie Here Yet',
          'Edit this markdown cell to customize the Graffiti for this button, and to record a new movie.<br><br>' +
          '_(NB: The default movie that was created with this button is a *placeholder* and it will *not* play.)_',
        ];
        const rawButtonMarkdown = '<button>Graffiti Sample Button (edit me)</button>';
        const graffitizedData = graffiti.createGraffitizedMarkdown(buttonCell, rawButtonMarkdown, tooltipCommands, tooltipDirectives);
        buttonCell.set_text(graffitizedData.markdown);
        buttonCell.render();

        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltips();

        return buttonCell;
      },

      createTerminalSuiteAboveSelectedCell: () => {
        graffiti.setJupyterMenuHint(localizer.getString('INSERT_TERMINAL_SUITE_STATUS'));
        const terminalSuite = {};
        const selectedCellIndex = Jupyter.notebook.get_selected_index();

        const codeCell = Jupyter.notebook.insert_cell_above('code', selectedCellIndex);
        const codeCommentString = utils.getCodeCommentString();
        codeCell.set_text(codeCommentString + "\n" + codeCommentString + ' ' +
                          "Paste code here. It will execute the graffiti associated with the button when shift-enter is pressed.\n" +
                          codeCommentString + "\n");
        terminalSuite.codeCellId = utils.getMetadataCellId(codeCell.metadata);

        const terminalCell = terminalLib.createTerminalCellAboveSelectedCell(selectedCellIndex + 1);
        terminalSuite.terminalCellId = terminalCell.term.id; // initially the term id is the same as the cellId of the cell it lives in.

        const buttonCell = Jupyter.notebook.insert_cell_below('markdown', selectedCellIndex + 1);
        const buttonCellId = utils.getMetadataCellId(buttonCell.metadata);
        const buttonCellIndex = utils.findCellIndexByCellId(buttonCellId);
        Jupyter.notebook.select(buttonCellIndex); // critical step, otherwise, the cell will not render correctly
        const cm = buttonCell.code_mirror;
        cm.execCommand('selectAll');
        const params = { cell: buttonCell, clear: true };
        graffiti.refreshGraffitiHighlights(params);
        graffiti.selectedTokens = utils.findSelectionTokens(buttonCell, graffiti.tokenRanges, state);

        tooltipCommands = {
          autoPlay: 'never',
          playOnClick: true,
          hideTooltip: true,
          narratorName: undefined,
          narratorPicture: undefined,
          stickerImageUrl: undefined,
          saveToFile: [{ cellId: terminalSuite.codeCellId, path: './graffiti_sample.txt' }],
          terminalCommand: { terminalId: terminalSuite.terminalCellId, command: 'cat ./graffiti_sample.txt' },
        };
        const tooltipDirectives = [
          '%%play_on_click',
          '%%hide_tooltip',
          '%%save_to_file' + ' ' + terminalSuite.codeCellId + ' "' + tooltipCommands.saveToFile[0].path + '"',
          '%%terminal_command' + ' ' + terminalSuite.terminalCellId + ' "' + tooltipCommands.terminalCommand.command + '"'
        ];
        const rawButtonMarkdown = '<button>Run Code</button>';
        const graffitizedData = graffiti.createGraffitizedMarkdown(buttonCell, rawButtonMarkdown, tooltipCommands, tooltipDirectives);
        buttonCell.set_text(graffitizedData.markdown);
        buttonCell.render();
        terminalSuite.buttonCellId = utils.getMetadataCellId(buttonCell.metadata);

        // Wire up the code cell to execute the button graffiti when shift-enter/ctrl-enter is pressed in it.
        const targetGraffitiId = utils.composeGraffitiId(terminalSuite.buttonCellId, graffitizedData.recordingKey);
        utils.setCellGraffitiConfigEntry(codeCell, 'executeCellViaGraffiti', targetGraffitiId);

        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltips();
        
        graffiti.clearJupyterMenuHint();
        return terminalSuite;      
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
          const graffitiCursor = $('<div id="graffiti-cursor" name="cursor" class="graffiti-cursor">' +
                                   '  <div id="graffiti-cursor-normal-cells">' +
                                   '     <img src="jupytergraffiti/css/transparent_bullseye2.png">' +
                                   '  </div>' +
                                   '  <div id="graffiti-cursor-terminal-cells"></div>' +
                                   '</div>');
          graffitiCursor.appendTo(header);
        }

        graffiti.graffitiCursorShell = $('#graffiti-cursor');
        graffiti.graffitiNormalCursor = $('#graffiti-cursor-normal-cells');
        graffiti.graffitiTerminalCursor = $('#graffiti-cursor-terminal-cells');
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

        graffiti.windowResizeHandler = (opts) => {
          //console.log('Graffiti: windowResizeHandler');
          if (opts === undefined || (opts !== undefined && opts.force)) {
            graffiti.resizeCanvases();
            if (graffiti.outerControlPanel.is(':visible')) {
              const windowWidth = $(window).width();
              const windowHeight = $(window).height();
              const controlPanelPosition = graffiti.outerControlPanel.position();
              const maxLeft = windowWidth - graffiti.outerControlPanel.width() - 20;
              const maxTop = windowHeight - graffiti.outerControlPanel.height() - 20;
              // need to redraw all current stickers here if playing
              const activity = state.getActivity();
              if ((activity === 'playing') || (activity === 'playbackPaused')) {
                graffiti.wipeAllStickerDomCanvases();
                graffiti.redrawAllDrawings();
              }
              graffiti.updateControlPanelPosition({ left: Math.max(0, Math.min(controlPanelPosition.left, maxLeft)),
                                                    top: Math.max(0,Math.min(maxTop, controlPanelPosition.top)) });
              state.setControlPanelDragging(false);
            }
            graffiti.refreshAllGraffitiSideMarkers();
          }
        };

        // Debounce is no longer needed as we're handling resizes of the notebook container with setTimeout calls, below this.
        //const windowResizeDebounced = _.debounce(graffiti.windowResizeHandler, 100);

        // Watch the notebook container width. If it changes, we will need to handle a resize to redraw many elements.
        graffiti.notebookContainerWidth = graffiti.notebookContainer.width();
        graffiti.performWindowResizeCheck = () => {
          const newWidth = graffiti.notebookContainer.width();
          if (newWidth !== graffiti.notebookContainerWidth) {
            graffiti.notebookContainerWidth = newWidth;
            const now = utils.getNow();
            // Sort of simple debounce technique
            if (graffiti.windowSizeChangeTime === undefined) {
              graffiti.windowResizeHandler();
              graffiti.windowSizeChangeTime = now;
            } else if (now - graffiti.windowSizeChangeTime > 100) { //  try not to resize more frequently than every 100ms
              graffiti.windowResizeHandler();              
              graffiti.windowSizeChangeTime = now;
            }
          }
          setTimeout(graffiti.performWindowResizeCheck, graffiti.windowSizeCheckInterval);
        };
        setTimeout(graffiti.performWindowResizeCheck, graffiti.windowSizeCheckInterval);

        const iconConfiguration = {
          dimensions: { x: 0, y: 0, width: 8, height: 8 },
          color:'black',
          strokeWidth:1,
          fillOpacity: 0
        };

        const settingsIcon = stickerLib.makeSettingsIcon(iconConfiguration);

        graffiti.setupOneControlPanel('graffiti-record-controls', 
                                      '  <button class="btn btn-default" id="graffiti-create-btn" title="' + localizer.getString('CREATE_1') + '">' +
                                      '<i class="fa fa-edit"></i>&nbsp; <span>' + localizer.getString('CREATE_1') + '</span></button>' +
                                      '  <button class="btn btn-default" id="graffiti-edit-btn" title="' + localizer.getString('EDIT_TOOLTIP') + '">' +
                                      '  <span style="position:absolute;margin-top:4px;margin-left:2px;">' + settingsIcon + '</span> ' +
                                      '  <span style="padding-left:16px;">' +  localizer.getString('EDIT') + '</span></button>' +
                                      '  <button class="btn btn-default" id="graffiti-begin-recording-btn" title="' + localizer.getString('RECORD_MOVIE') + '">' +
                                      '<i class="fa fa-film graffiti-recorder-button"></i>&nbsp;<span>' + localizer.getString('RECORD') + '</span></button>' +
                                      '  <button class="btn btn-default" id="graffiti-begin-rerecording-btn" title="' + localizer.getString('RERECORD_MOVIE') + '">' +
                                      '<i class="fa fa-film graffiti-recorder-button"></i>&nbsp;<span>' + localizer.getString('RERECORD') + '</span></button>' +
                                      '  <button class="btn btn-default" id="graffiti-remove-btn" title="' + localizer.getString('REMOVE_GRAFFITI') + '">' +
                                      '<i class="fa fa-trash"></i></button>',
                                      [
                                        {
                                          ids: ['graffiti-create-btn', 'graffiti-edit-btn'],
                                          event: 'click',
                                          fn: (e) => {
                                            graffiti.editGraffiti();
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
                                      '<button class="btn btn-default" id="finish-graffiti-btn" title="' +
                                      localizer.getString('SAVE_GRAFFITI') + '">' + localizer.getString('SAVE_GRAFFITI') + '</button>',
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
                                      '<button class="btn btn-default" id="btn-start-recording" title="' + localizer.getString('START_RECORDING') + '">' +
                                      '<i class="fa fa-pause recorder-start-button"></i>&nbsp;' + localizer.getString('START_RECORDING') + '</button>',
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
                                      '<div id="graffiti-recording-button-help-shell">' +
                                      '  <div id="graffiti-btn-end-recording" class="graffiti-recording-button-help">' +
                                      localizer.getString('RECORDING_HINT_1') +
                                      '  </div>' +
                                      '  <div class="graffiti-recording-button-help">' +
                                      '    <div>' + localizer.getString('RECORDING_HINT_2') + '</div>' +
                                      '    <div>' + localizer.getString('RECORDING_HINT_3') + '</div>' +
                                      '  </div>' +
                                      '</div>' + 
                                      '<div id="graffiti-recording-status">' +
                                      '  <div id="graffiti-recording-flash-icon"></div>' +
                                      '  <div id="graffiti-time-display-recording"></div>' +
                                      '</div>',
                                      [
                                        {
                                          ids: ['graffiti-btn-end-recording'],
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
                                      '  <div id="graffiti-takes-title">' + localizer.getString('TAKES') + ':</div>' +
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
        
        const runnerOnIcon = stickerLib.makeRunningMan('black');
        const runnerOffIcon = stickerLib.makeRunningMan('white');

        graffiti.setupOneControlPanel('graffiti-playback-controls', 
                                      '<div id="graffiti-narrator-info">' +
                                      '  <div id="graffiti-narrator-pic"></div>' +
                                      '  <div id="graffiti-narrator-details">' +
                                      '    <div>Presenter: </div><div id="graffiti-narrator-name"></div>' +
                                      '  </div>' + 
                                      '</div>' +
                                      '<div id="graffiti-playback-buttons">' +
                                      '  <button class="btn btn-default btn-play" id="graffiti-play-btn" title="' + localizer.getString('START_PLAYBACK') + '">' +
                                      '    <i class="fa fa-play"></i>' +
                                      '  </button>' +
                                      '  <button class="btn btn-default" id="graffiti-pause-btn" title="' + localizer.getString('PAUSE_PLAYBACK') + '">' +
                                      '    <i class="fa fa-pause"></i>' +
                                      '  </button>' +
                                      '  <div id="graffiti-skip-buttons">' +
                                      '    <button class="btn btn-default btn-rewind" id="graffiti-rewind-btn" title="' + localizer.getString('SKIP_BACK') + ' ' +
                                       (state.scanningIsOn() ? localizer.getString('TO_PREVIOUS_SENTENCE') : graffiti.rewindAmt + ' ' + localizer.getString('SECONDS') ) + '">' +
                                      '      <i class="fa fa-backward"></i>' +
                                      '    </button>' +
                                      '    <button class="btn btn-default btn-forward" id="graffiti-forward-btn" title="' + localizer.getString('SKIP_FORWARD') + ' ' + 
                                       (state.scanningIsOn() ? localizer.getString('TO_NEXT_SENTENCE') : graffiti.rewindAmt + ' ' + localizer.getString('SECONDS')) + '">' +
                                      '      <i class="fa fa-forward"></i>' +
                                      '    </button>' +
                                      '  </div>' +
                                      '  <div id="graffiti-sound-buttons">' +
                                      '    <button class="btn btn-default btn-sound-on" id="graffiti-sound-on-btn" title="' + localizer.getString('MUTE') + '">' +
                                      '       <i class="fa fa-volume-up"></i>' +
                                      '   </button>' +
                                      '   <button class="btn btn-default btn-sound-off" id="graffiti-sound-off-btn" title="' + localizer.getString('UNMUTE') + '">' +
                                      '     <i class="fa fa-volume-off"></i>' +
                                      '   </button>' +
                                      '  </div>' +
                                      '  <div id="graffiti-rapidplay-buttons">' +
                                      '    <button class="btn btn-default btn-rapidplay-on" id="graffiti-rapidplay-on-btn" title="' +
                                      localizer.getString('HIGH_SPEED_PLAYBACK') + '">' + runnerOnIcon +
                                      '   </button>' +
                                      '   <button class="btn btn-default btn-rapidplay-off" id="graffiti-rapidplay-off-btn" title="' +
                                      localizer.getString('REGULAR_SPEED_PLAYBACK') + '">' + runnerOffIcon +
                                      '   </button>' +
                                      '  </div>' +
                                      '</div>' +
                                      '<div id="graffiti-scrub-controls">' +
                                      '  <div id="graffiti-playback-range">' +
                                      '    <div id="graffiti-skips-display-bar"></div>' +
                                      '    <input type="range" min="0" max="1000" value="0" id="graffiti-recorder-range"></input>' +
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
                                            //console.log('Graffiti: forward-btn/rewind-btn clicked');
                                            let direction = 1;
                                            if (($(e.target).attr('id') === 'graffiti-rewind-btn') || ($(e.target).hasClass('fa-backward'))) {
                                              direction = -1;
                                            }
                                            graffiti.jumpPlayback(direction, (state.getEditingSkips() ? graffiti.rewindSkipEditAmt : graffiti.rewindAmt));
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
                                            graffiti.toggleRapidPlay({scan:false});
                                          }
                                        },
                                        {
                                          ids: ['graffiti-rapidscan-on-btn', 'graffiti-rapidscan-off-btn'],
                                          event: 'click',
                                          fn: (e) => {
                                            graffiti.toggleRapidPlay({scan:true});
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
                                            graffiti.handleSliderDrag(); // rerun slider drag on mouseup because we may not have gotten the last input event.
                                            graffiti.changeActivity('playbackPaused');
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
                                            graffiti.handleSliderDragDebounced();
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
                                      ' <button class="btn btn-default" id="graffiti-line-pen" title="' + localizer.getString('FREEFORM_PEN_TOOL') + '">' +
                                      '<svg class="svg-inline--fa fa-pen-alt fa-w-16" aria-hidden="true" data-prefix="fa" data-icon="pen-alt" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M497.94 74.17l-60.11-60.11c-18.75-18.75-49.16-18.75-67.91 0l-56.55 56.55 128.02 128.02 56.55-56.55c18.75-18.75 18.75-49.15 0-67.91zm-246.8-20.53c-15.62-15.62-40.94-15.62-56.56 0L75.8 172.43c-6.25 6.25-6.25 16.38 0 22.62l22.63 22.63c6.25 6.25 16.38 6.25 22.63 0l101.82-101.82 22.63 22.62L93.95 290.03A327.038 327.038 0 0 0 .17 485.11l-.03.23c-1.7 15.28 11.21 28.2 26.49 26.51a327.02 327.02 0 0 0 195.34-93.8l196.79-196.79-82.77-82.77-84.85-84.85z"></path></svg>' +
                                      '</button>' +
                                      ' <button class="btn btn-default" id="graffiti-highlight-pen" title="' + localizer.getString('HIGHLIGHTER_TOOL') + '">' +
                                      '<svg class="svg-inline--fa fa-highlighter fa-w-17" aria-hidden="true" data-prefix="fa" data-icon="highlighter" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 544 512" data-fa-i2svg=""><path fill="currentColor" d="M0 479.98L99.92 512l35.45-35.45-67.04-67.04L0 479.98zm124.61-240.01a36.592 36.592 0 0 0-10.79 38.1l13.05 42.83-50.93 50.94 96.23 96.23 50.86-50.86 42.74 13.08c13.73 4.2 28.65-.01 38.15-10.78l35.55-41.64-173.34-173.34-41.52 35.44zm403.31-160.7l-63.2-63.2c-20.49-20.49-53.38-21.52-75.12-2.35L190.55 183.68l169.77 169.78L530.27 154.4c19.18-21.74 18.15-54.63-2.35-75.13z"></path></svg>' +
                                      '</button>' +
                                      ' <button class="btn btn-default" id="graffiti-eraser-pen" title="' + localizer.getString('ERASER_TOOL') + '">' +
                                      '<svg aria-hidden="true" data-prefix="fas" data-icon="eraser" class="svg-inline--fa fa-eraser fa-w-16" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M497.941 273.941c18.745-18.745 18.745-49.137 0-67.882l-160-160c-18.745-18.745-49.136-18.746-67.883 0l-256 256c-18.745 18.745-18.745 49.137 0 67.882l96 96A48.004 48.004 0 0 0 144 480h356c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12H355.883l142.058-142.059zm-302.627-62.627l137.373 137.373L265.373 416H150.628l-80-80 124.686-124.686z"></path></svg>' +
                                      '</button>' +
                                      '</div>' +
                                      '<div id="graffiti-recording-colors-shell">' +
                                      Object.keys(graffiti.penColors).map((key) => { 
                                        return '<div id="graffiti-recording-color-' + key + '" colorVal="' + key + '"></div>';
                                      }).join('') +
                                      '</div>' +
                                      '<div id="graffiti-line-style-controls">' +
                                      '  <div id="graffiti-temporary-ink" title="' + localizer.getString('USE_DISAPPEARING_INK') + '">' +
                                      '   <input type="checkbox" id="graffiti-temporary-ink-control" checked />' +
                                      '   <label id="graffiti-temporary-ink-label" for="graffiti-temporary-ink-control">' + localizer.getString('TEMPORARY_INK') + '</label>' +
                                      '  </div>' +
                                      '  <div id="graffiti-dashed-line" title="' + localizer.getString('USE_DASHED_LINES') + '">' +
                                      '   <input type="checkbox" id="graffiti-dashed-line-control" />' +
                                      '   <label id="graffiti-dashed-line-label" for="graffiti-dashed-line-control">' + localizer.getString('DASHED_LINES') + '</label>' +
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
        const bullsEye = stickerLib.makeBullsEye(largeIconConfiguration);
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

        const stickersExpando = 
          '<div id="graffiti-stickers-expando" class="graffiti-expando graffiti-expando-closed"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" x="0px" y="0px"><title>triangolo</title><g data-name="Livello 11"><polygon points="50 87.5 6.7 87.5 28.35 50 50 12.5 71.65 50 93.3 87.5 50 87.5"/></g></svg></div>';

        graffiti.setupOneControlPanel('graffiti-stickers-controls', 
                                      '<div id="graffiti-stickers-shell">' +
                                      '  <div id="graffiti-stickers-header">' + stickersExpando + '<div>Stickers <span>(Select, then click & drag)</span></div></div>' +
                                      '  <div id="graffiti-stickers-body">' +
                                      '    <div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-lineWithArrow" title="Line with arrow at tip">' + 
                                      lineWithArrow + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-horizontalBrackets" title="Horizontal brackets">' +
                                      horizontalBrackets + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-verticalBrackets" title="Vertical brackets">' + 
                                      verticalBrackets + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-curlyBraces" title="Curly braces">' + curlyBraces + '</div>' +
                                      '    </div>' +
                                      '    <div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-rectangle" title="Rectangle">' + rectangle + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-roundRectangle" title="Rounded corners rectangle">' +
                                      roundRectangle + '</div>' +
                                      //'      <div class="graffiti-stickers-button" id="graffiti-sticker-ellipse" title="Ellipse">' + ellipse + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-ellipse" title="Ellipse">' + bullsEye + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-rightTriangle" title="Right triangle">' + rightTriangle + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-isocelesTriangle" title="Isoceles triangle">' + 
                                      isocelesTriangle + '</div>' +
                                      '    </div>' +
                                      '    <div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-checkmark" title="Checkmark">' + checkMark + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-xmark" title="X mark">' + xMark + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-smiley" title="Smiley face">' + smiley + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-bomb" title="Bomb">' + bomb + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-trophy" title="Trophy">' + trophy + '</div>' +
                                      '    </div>' +
                                      '    <div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-pi" title="Pi symbol">' + pi + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-alpha"  title="Alpha symbol">' + alpha + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-beta" title="Beta symbol">' + beta + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-sigma" title="Sigma symbol">' + sigma + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-theta"  title="Theta symbol">' + theta + '</div>' +
                                      '    </div>' +
                                      '    <div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-axis" title="X-y axis">' + axis + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-grid" title="Square grid">' + grid + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-angle" title="Angle">' + angle + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-label" title="Text label">' + 'Tt' + '</div>' +
                                      '      <div class="graffiti-stickers-button" id="graffiti-sticker-custom" title="Custom sticker">' + 'Cs' + '</div>' +
                                      '    </div>' +
                                      '  </div>' +
                                      '  <div id="graffiti-sticker-style-controls">' +
                                      '    <div id="graffiti-sticker-fill">' +
                                      '     <input type="checkbox" id="graffiti-sticker-fill-control" />' +
                                      '     <label id="graffiti-sticker-fill-control-label" for="graffiti-sticker-fill-control" title="Fill shapes with chosen color">' +
                                      localizer.getString('SOLID_FILL') + '</label>' +
                                      '    </div>' +
                                      '    <div id="graffiti-sticker-hint">' + localizer.getString('SHIFT_KEY_ALIGN') + '</div>' +
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
                                            'graffiti-sticker-pi',
                                            'graffiti-sticker-label',
                                            'graffiti-sticker-custom'
                                          ],
                                          event: 'click',
                                          fn: (e) => {
                                            let stickerId = $(e.target).attr('id');
                                            if (stickerId === undefined) {
                                              stickerId = $(e.target).parents('.graffiti-stickers-button').attr('id');
                                            }
                                            const cleanStickerId = stickerId.replace('graffiti-sticker-','');
                                            console.log('Sticker chosen:', cleanStickerId);
                                            graffiti.toggleGraffitiSticker(cleanStickerId);
                                          }
                                        },
                                        {
                                          ids: [ 'graffiti-stickers-header' ],
                                          event: 'click',
                                          fn: (e) => {
                                            $('#graffiti-stickers-body,#graffiti-sticker-style-controls').slideToggle(200);
                                            if ($('#graffiti-stickers-expando').hasClass('graffiti-expando-closed')) {
                                              $('#graffiti-stickers-expando').removeClass('graffiti-expando-closed').addClass('graffiti-expando-open');
                                              setTimeout(() => {
                                                graffiti.windowResizeHandler({force:true});
                                              }, 400);
                                            } else {
                                              $('#graffiti-stickers-expando').removeClass('graffiti-expando-open').addClass('graffiti-expando-closed');
                                            }
                                          },
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


        graffiti.setupOneControlPanel('graffiti-access-skips',
                                      '<button class="btn btn-default" id="graffiti-access-skips-btn" title="' + 
                                      localizer.getString('SKIPS_API') + '"></i>&nbsp; <span>' +
                                      localizer.getString('SKIPS_API') + '&nbsp; </span></button>',
                                      [
                                        { 
                                          ids: ['graffiti-access-skips-btn'],
                                          event: 'click', 
                                          fn: (e) => { 
                                            graffiti.editSkips();
                                          }
                                        }
                                      ]
        );

        const compressTimeOnIcon = stickerLib.makeCompressTimeIcon('black');
        const compressTimeOffIcon = stickerLib.makeCompressTimeIcon('white');
        const absoluteSkipOnIcon = stickerLib.makeScan('black');
        const absoluteSkipOffIcon = stickerLib.makeScan('white');
        //const clearSkipsIcon = stickerLib.makeNoEntryIcon('red');
        const clearSkipsIcon = stickerLib.makeTrashIcon('black');

        graffiti.setupOneControlPanel('graffiti-skips-controls',
                                      '<div id="graffiti-skips-controls">' +
                                      '  <div id="graffiti-skips-controls-header"><span>' + localizer.getString('SKIPS_HEADER') + '</span></div>' +

                                      '  <div id="graffiti-skips-controls-body">' +
                                      '    <button class="btn btn-default graffiti-skips-on-btn" id="graffiti-skips-2x-on-btn" title="' +
                                      localizer.getString('SKIPS_2X_BTN') + '">2x</button>' +
                                      '    <button class="btn btn-default graffiti-skips-off-btn" id="graffiti-skips-2x-off-btn" title="' +
                                      localizer.getString('SKIPS_2X_BTN') + '">2x</button>' +

                                      '    <button class="btn btn-default graffiti-skips-on-btn" id="graffiti-skips-3x-on-btn" title="' +
                                      localizer.getString('SKIPS_3X_BTN') + '">3x</button>' +
                                      '    <button class="btn btn-default graffiti-skips-off-btn" id="graffiti-skips-3x-off-btn" title="' +
                                      localizer.getString('SKIPS_3X_BTN') + '">3x</button>' +

                                      '    <button class="btn btn-default graffiti-skips-on-btn" id="graffiti-skips-4x-on-btn" title="' +
                                      localizer.getString('SKIPS_4X_BTN') + '">4x</button>' +
                                      '    <button class="btn btn-default graffiti-skips-off-btn" id="graffiti-skips-4x-off-btn" title="' +
                                      localizer.getString('SKIPS_4X_BTN') + '">4x</button>' +

                                      '    <button class="btn btn-default graffiti-skips-on-btn" id="graffiti-skips-compress-on-btn" title="' +
                                      localizer.getString('SKIPS_COMPRESS_BTN') + '">' + compressTimeOnIcon + '</button>' +
                                      '    <button class="btn btn-default graffiti-skips-off-btn" id="graffiti-skips-compress-off-btn" title="' +
                                      localizer.getString('SKIPS_COMPRESS_BTN') + '">' + compressTimeOffIcon + '</button>' +

                                      '    <button class="btn btn-default graffiti-skips-on-btn" id="graffiti-skips-absolute-on-btn" title="' +
                                      localizer.getString('SKIPS_ABSOLUTE_BTN') + '">' + absoluteSkipOnIcon + '</button>' +
                                      '    <button class="btn btn-default graffiti-skips-off-btn" id="graffiti-skips-absolute-off-btn" title="' +
                                      localizer.getString('SKIPS_ABSOLUTE_BTN') + '">' + absoluteSkipOffIcon + '</button>' +


                                      '    <button class="btn btn-default" id="graffiti-skips-clear-btn" title="' +
                                      localizer.getString('SKIPS_CLEAR_BTN') + '">' + clearSkipsIcon + '</button>' +
                                      
                                      '  </div>' +
                                      '</div>',
                                      [
                                        { 
                                          ids: ['graffiti-skips-2x-on-btn','graffiti-skips-2x-off-btn'],
                                          event: 'click', 
                                          fn: (e) => { 
                                            graffiti.storeSkipRecord(state.SKIP_STATUS_2X);
                                          }
                                        },
                                        { 
                                          ids: ['graffiti-skips-3x-on-btn', 'graffiti-skips-3x-off-btn'],
                                          event: 'click', 
                                          fn: (e) => { 
                                            graffiti.storeSkipRecord(state.SKIP_STATUS_3X);
                                          }
                                        },
                                        { 
                                          ids: ['graffiti-skips-4x-on-btn', 'graffiti-skips-4x-off-btn'],
                                          event: 'click', 
                                          fn: (e) => { 
                                            graffiti.storeSkipRecord(state.SKIP_STATUS_4X);
                                          }
                                        },
                                        { 
                                          ids: ['graffiti-skips-compress-on-btn', 'graffiti-skips-compress-off-btn'], // compress time to 2s
                                          event: 'click', 
                                          fn: (e) => { 
                                            graffiti.storeSkipRecord(state.SKIP_STATUS_COMPRESS);
                                          }
                                        },
                                        { 
                                          ids: ['graffiti-skips-absolute-on-btn','graffiti-skips-absolute-off-btn'], // absolutely skip over a section
                                          event: 'click', 
                                          fn: (e) => { 
                                            graffiti.storeSkipRecord(state.SKIP_STATUS_ABSOLUTE);
                                          }
                                        },
                                        { 
                                          ids: ['graffiti-skips-clear-btn'], // clear all skips
                                          event: 'click', 
                                          fn: (e) => { 
                                            graffiti.clearAllSkipsWithConfirm();
                                          }
                                        }

                                      ]
        );

        graffiti.setupOneControlPanel('graffiti-access-api',
                                      '<button class="btn btn-default" id="graffiti-access-api-btn" title="' + localizer.getString('SAMPLE_API') + '"></i>&nbsp; <span>' +
                                      localizer.getString('SAMPLE_API') + '</span></button>',
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
        
        const lockConfigOn =  $.extend({}, true, defaultIconConfiguration, { color: 'red' });
        const lockConfigOff = $.extend({}, true, defaultIconConfiguration, { color: 'green' });

        graffiti.setupOneControlPanel('graffiti-terminal-builder',
                                      '<div id="graffiti-terminal-builder-header"><div>Extras</div></div>' +
                                      '<div id="graffiti-terminal-builder-body">' +

                                      '  <div id="graffiti-insert-terminal-cell" title="' + localizer.getString('INSERT_GRAFFITI_TERMINAL_ALT_TAG') + '">' +
                                      stickerLib.makeTerminal({width:25}) + 
                                      '  </div>' +

                                      '  <div id="graffiti-insert-btn-cell" title="' + localizer.getString('INSERT_GRAFFITI_BUTTON_CELL_ALT_TAG') + '">' +
                                      stickerLib.makeButton({width:27, height:22, contents:'Run'}) + 
                                      '  </div>' +

                                      '  <div id="graffiti-insert-terminal-suite" title="' + localizer.getString('INSERT_GRAFFITI_TERMINAL_SUITE_ALT_TAG') + '">' +
                                      '    <div>' + stickerLib.makeTerminal({width:25}) + '</div> + ' +
                                      '    <div>' + stickerLib.makeButton({width:27, height:22, contents:'Run'}) + '</div>' +
                                      '  </div>' +

                                      '  <div class="graffiti-stickers-button" id="graffiti-toggle-markdown-lock" title="' + 
                                      localizer.getString('ACTIVATE_LOCK_ALT_TAG') + '">' +
                                      '<span id="graffiti-locked-on">' + stickerLib.makeLock(lockConfigOn) + '</span>' +
                                      '<span id="graffiti-locked-off">' + stickerLib.makeLock(lockConfigOff) + '</span>' +
                                      '</div>' +
                                      '</div>',
                                      [
                                        { 
                                          ids: ['graffiti-insert-btn-cell'],
                                          event: 'click', 
                                          fn: (e) => { 
                                            console.log('inserting graffiti button cell')
                                            const suite = graffiti.createGraffitiButtonAboveSelectedCell();
                                            utils.saveNotebook();
                                          }
                                        },
                                        {
                                          ids: ['graffiti-insert-terminal-cell'],
                                          event: 'click', 
                                          fn: (e) => { 
                                            console.log('inserting graffiti terminal cell')
                                            const suite = terminalLib.createTerminalCellAboveSelectedCell();
                                            utils.saveNotebook();
                                          }
                                        },
                                        {
                                          ids: ['graffiti-insert-terminal-suite'],
                                          event: 'click', 
                                          fn: (e) => { 
                                            console.log('inserting graffiti terminal suite')
                                            const suite = graffiti.createTerminalSuiteAboveSelectedCell();
                                            utils.saveNotebook();
                                          }
                                        },
                                        {
                                          ids: ['graffiti-toggle-markdown-lock'],
                                          event: 'click', 
                                          fn: (e) => { 
                                            console.log('Toggle markdown lock')
                                            graffiti.toggleMarkdownLock();
                                            utils.saveNotebook();
                                          }
                                        }
                                      ]
        );
        graffiti.refreshMarkdownLock();

        // Will return to this code soon. It simulates multiple creators (e.g. students) and switching between their different sets of Graffiti.
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

      setupMarkdownLocks: () => {
        graffiti.oldUnrender = graffiti.MarkdownCell.prototype.unrender;
        graffiti.MarkdownCell.prototype.unrender = () => {
          console.log('Unrender fired.');
          const cell = Jupyter.notebook.get_selected_cell();
          if (cell !== undefined) {
            const cellId = utils.getMetadataCellId(cell.metadata);
            const markdownLocked = utils.getNotebookGraffitiConfigEntry('markdownLocked');
            if (markdownLocked === true || terminalLib.isTerminalCell(cellId)) {
              console.log('Graffiti: Not unrendering markdown cell, since Graffiti lock in place or is terminal cell.');
            } else {
              console.log('Graffiti: applying old unrender call, cellId', cellId);
              graffiti.oldUnrender.apply(cell, arguments);
              window.brokeCell = cell;
            }
          }
        }
      },

      refreshMarkdownLock: (isLocked) => {
        if (isLocked === undefined) {
          const markdownLocked = utils.getNotebookGraffitiConfigEntry('markdownLocked');
          isLocked = (((markdownLocked !== undefined) && (markdownLocked === true)) ? true : false);
        }
        if (isLocked) {
          $('#graffiti-locked-off').hide();
          $('#graffiti-locked-on').show();
        } else {
          $('#graffiti-locked-off').show();
          $('#graffiti-locked-on').hide();
        }
        return(isLocked);
      },

      toggleMarkdownLock: () => {
        const markdownLocked = utils.getNotebookGraffitiConfigEntry('markdownLocked');
        const isLocked = (markdownLocked === true ? true : false);
        const verb = (isLocked ? localizer.getString('UNLOCK_VERB') : localizer.getString('LOCK_VERB'));
        const bodyText = (isLocked ?
                          localizer.getString('UNLOCK_BODY') :
                          localizer.getString('LOCK_BODY') );
        dialog.modal({
          title: verb + ' ' + localizer.getString('LOCK_CONFIRM'),
          body: bodyText,
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                console.log('Graffiti: You clicked ok, you want to toggle the lock');
                const markdownLocked = utils.getNotebookGraffitiConfigEntry('markdownLocked');
                const isLocked = (((markdownLocked !== undefined) && (markdownLocked === true)) ? true : false);
                utils.setNotebookGraffitiConfigEntry('markdownLocked', !isLocked);
                utils.saveNotebook();
                graffiti.refreshMarkdownLock(!isLocked);
              }
            },
            'Cancel': { click: (e) => { console.log('Graffiti: you cancelled:', $(e.target).parent()); } },
          }
        });
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
        state.setPlayableMovie('cursorActivity', recordingCellId, recordingKey);
        graffiti.updateTakesPanel(recordingCellId, recordingKey);
      },

      updateTakesPanel: (recordingCellId, recordingKey) => {
        const recording = state.getManifestSingleRecording(recordingCellId, recordingKey);
        const activeTakeId = recording.activeTakeId;
        if ((activeTakeId === undefined) || (recording.takes === undefined)) {
          return false;
        }
        //console.log('we got these takes:', recording.takes);
        let renderedTakes = '';
        const sortedRecs = _.sortBy($.map(recording.takes, (val,key) => { return $.extend(true, {}, val, { key: key }) }), 'createDate')
        //console.log('sorted recs are:', sortedRecs);
        let recIndex, recIndexZerobased, createDateFormatted, renderedDate, rec, takeClass;
        for (recIndex = sortedRecs.length; recIndex > 0; --recIndex) {
          recIndexZerobased = recIndex - 1;
          rec = sortedRecs[recIndexZerobased];
          renderedDate = localizer.getString('RECORDED_ON') + ': ' + new Date(rec.createDate);
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
        return true;
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
              // fadeins/fadeouts cause race conditions when you interrupt a movie in progress
              //graffiti.outerControlPanel.fadeIn(graffiti.panelFadeTime);
              graffiti.outerControlPanel.show();
            }
          } else if ((state.getPlayableMovie('tip') === undefined) && 
                     (state.getPlayableMovie('api') === undefined) && 
                     (state.getPlayableMovie('cursorActivity') === undefined) ||
                     (activity !== 'notifying') ) {
            if (!outerControlHidden) {
              //console.trace('fadeout');
              // fadeins/fadeouts cause race conditions when you interrupt a movie in progress
              //graffiti.outerControlPanel.fadeOut(graffiti.panelFadeTime);
              graffiti.outerControlPanel.hide();
            }
            return;
          }
        } else {
          if (outerControlHidden) {
            //console.trace('fadeIn 2');
              // fadeins/fadeouts cause race conditions when you interrupt a movie in progress
            //graffiti.outerControlPanel.fadeIn(graffiti.panelFadeTime);
            graffiti.outerControlPanel.show();
          }
        }

        // These controls will need to be updated in a variety of activities so easiest just to do their updates in all cases.
        if (state.getMute()) {
          graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-sound-on-btn').hide().parent().find('#graffiti-sound-off-btn').show();
        } else {
          graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-sound-off-btn').hide().parent().find('#graffiti-sound-on-btn').show();
        }
        const currentPlaySpeed = state.getCurrentPlaySpeed();
        graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rewind-btn').attr({title:localizer.getString('SKIP_BACK') + ' ' + graffiti.rewindAmt + localizer.getString('SECONDS')});
        graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-forward-btn').attr({title:localizer.getString('SKIP_FORWARD') + ' ' + graffiti.rewindAmt + ' ' + localizer.getString('SECONDS')});
        switch (currentPlaySpeed) {
          case 'scanActive':
          case 'scanInactive':
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidscan-on-btn').hide().parent().find('#graffiti-rapidscan-off-btn').show();
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidplay-off-btn').hide().parent().find('#graffiti-rapidplay-on-btn').show();
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rewind-btn').attr({title:localizer.getString('SKIP_BACK') + ' ' +
                                                                                                            localizer.getString('TO_PREVIOUS_SENTENCE')});
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-forward-btn').attr({title:localizer.getString('SKIP_FORWARD') + ' ' +
                                                                                                             localizer.getString('TO_NEXT_SENTENCE')});
            break;
          case 'rapid':
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidscan-off-btn').hide().parent().find('#graffiti-rapidscan-on-btn').show();
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidplay-on-btn').hide().parent().find('#graffiti-rapidplay-off-btn').show();
            break;
          case 'regular':
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidplay-off-btn').hide().parent().find('#graffiti-rapidplay-on-btn').show();
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-rapidscan-off-btn').hide().parent().find('#graffiti-rapidscan-on-btn').show();
            break;
        }

        if (state.getEditingSkips()) {
          graffiti.controlPanelIds['graffiti-skips-controls'].find('.graffiti-skips-off-btn').hide().parent().find('.graffiti-skips-on-btn').show();
          const skipStatus = state.getSkipStatus();
          //console.log('skipStatus:', skipStatus);
          switch (skipStatus) {
            case state.SKIP_STATUS_COMPRESS:
              graffiti.controlPanelIds['graffiti-skips-controls'].find('#graffiti-skips-compress-off-btn').show().parent().find('#graffiti-skips-compress-on-btn').hide();
              break;
            case state.SKIP_STATUS_2X:
              graffiti.controlPanelIds['graffiti-skips-controls'].find('#graffiti-skips-2x-off-btn').show().parent().find('#graffiti-skips-2x-on-btn').hide();
              break;
            case state.SKIP_STATUS_3X:
              graffiti.controlPanelIds['graffiti-skips-controls'].find('#graffiti-skips-3x-off-btn').show().parent().find('#graffiti-skips-3x-on-btn').hide();
              break;
            case state.SKIP_STATUS_4X:
              graffiti.controlPanelIds['graffiti-skips-controls'].find('#graffiti-skips-4x-off-btn').show().parent().find('#graffiti-skips-4x-on-btn').hide();
              break;
            case state.SKIP_STATUS_ABSOLUTE:
              graffiti.controlPanelIds['graffiti-skips-controls'].find('#graffiti-skips-absolute-off-btn').show().parent().find('#graffiti-skips-absolute-on-btn').hide();
              break;
          }              
        }

        let visibleControlPanels;
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
            const isMarkdownCell = (activeCell.cell_type === 'markdown');
            if (isMarkdownCell && !selectedTokens.isIntersecting) {
              // swap out the CREATE and RECORD strings depending on what type of new Graffiti could possibly be made
              $('#graffiti-create-btn').attr({title: localizer.getString('CREATE_2')});
              $('#graffiti-create-btn span').text(localizer.getString('CREATE_2'));
            } else {
              $('#graffiti-create-btn').attr({title: localizer.getString('CREATE_1')});
              $('#graffiti-create-btn span').text(localizer.getString('CREATE_1'));
            }

            if ((selectedTokens.noTokensPresent) ||
                (!isMarkdownCell && (selectedTokens.range.selectionStart === selectedTokens.range.selectionEnd) && 
                 (!selectedTokens.isIntersecting)) ||
                (isMarkdownCell && activeCell.rendered)) {
              //console.log('Graffiti: no tokens present, or no text selected.');
              visibleControlPanels = ['graffiti-notifier', 'graffiti-terminal-builder']; // hide all control panels if in view only mode and not play mode
              if (isMarkdownCell) {
                if (!activeCell.rendered) {
                  graffiti.setNotifier('<div>' + localizer.getString('SELECT_SOME_TEXT_MARKDOWN') + '</div>');
                } else {
                  graffiti.setNotifier('<div>' + localizer.getString('EDIT_IN_MARKDOWN_CELL') + '</div>');
                }
              } else {
                graffiti.setNotifier('<div>' + localizer.getString('SELECT_SOME_TEXT_PLAIN') + '</div>');
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
                  state.setPlayableMovie('cursorActivity', recordingCellId, recordingKey);
                  graffiti.recordingAPIKey = utils.composeGraffitiId(recordingCellId, recordingKey);
                  visibleControlPanels.push('graffiti-access-skips');
                  visibleControlPanels.push('graffiti-access-api');
                  visibleControlPanels.push('graffiti-notifier');
                  if (graffiti.updateTakesPanel(recordingCellId, recordingKey)) {
                    visibleControlPanels.push('graffiti-takes-controls');
                    graffiti.setNotifier('<div>' + localizer.getString('YOU_CAN_PLAY_VIA_TOOLTIP') + '</div>');
                  } else {
                    graffiti.setNotifier('<div>' + localizer.getString('NO_MOVIE_RECORDED_YET') + '</div>');
                  }

                  //console.log('this recording has a movie');
                  graffiti.controlPanelIds['graffiti-record-controls'].find('#graffiti-begin-recording-btn').hide().parent().
                           find('#graffiti-begin-rerecording-btn').show();
                  // This "play" link is not reliable because its info is only updated by mousing over tooltips, yet you may be editing
                  // a graffiti that you did not show the tooltip on, making it play the wrong movie. Therefore we instruct users to use the tooltip to play the movie.
                  /*
                  graffiti.setNotifier('<div>You can <span class="graffiti-notifier-link" id="graffiti-idle-play-link">play</span> this movie any time.</div>',
                                       [
                                         {
                                           ids: ['graffiti-idle-play-link'],
                                           event: 'click',
                                           fn: (e) => {
                                             state.setPlayableMovie('cursorActivity', recordingCellId, recordingKey);
                                             graffiti.loadAndPlayMovie('cursorActivity');
                                           }
                                         },
                                       ]);
                  */
                }
              }
            }
            graffiti.showControlPanels(visibleControlPanels);
            break;
          case 'playing':
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-play-btn').hide().parent().find('#graffiti-pause-btn').show();
            graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-info').hide();
            const narratorName = state.getNarratorInfo('name');
            const narratorPicture = state.getNarratorInfo('picture');
            if ((narratorName !== undefined) || (narratorPicture !== undefined)) {
              graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-info').show();
              if (narratorPicture !== undefined) {
                graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-pic').html('<img src="' + narratorPicture + '" />');
              }
              if (narratorName !== undefined) {
                graffiti.controlPanelIds['graffiti-playback-controls'].find('#graffiti-narrator-name').html(narratorName);
              }              
            }
            visibleControlPanels = ['graffiti-playback-controls'];
            $('#graffiti-skips-display-bar').hide();
            if (state.getEditingSkips()) {
              visibleControlPanels.push('graffiti-skips-controls');
              $('#graffiti-skips-display-bar').show();
            }
            graffiti.showControlPanels(visibleControlPanels);
            graffiti.setNotifier('<div>' + localizer.getString('PAUSE_TO_INTERACT') + '</div>' +
                                 '<div>' + localizer.getString('CANCEL_MOVIE_PLAYBACK_1') + '</div>',
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
            visibleControlPanels = ['graffiti-playback-controls'];
            $('#graffiti-skips-display-bar').hide();
            if (state.getEditingSkips()) {
              visibleControlPanels.push('graffiti-skips-controls');
              $('#graffiti-skips-display-bar').show();
            }
            graffiti.showControlPanels(visibleControlPanels);
            if (state.getSetupForReset()) {
              graffiti.setNotifier('<div>' + localizer.getString('PLAY_MOVIE_AGAIN') + '</div>' +
                                   '<div>' + localizer.getString('CANCEL_MOVIE_PLAYBACK_2') + '</div>',
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
              graffiti.setNotifier('<div>' + localizer.getString('CONTINUE_MOVIE_PLAYBACK') + '</div>' +
                                   '<div>' + localizer.getString('CANCEL_MOVIE_PLAYBACK_3') + '</div>',
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
            graffiti.setNotifier('<div>' + localizer.getString('ENTER_AND_SAVE') + '</div>' +
                                 '<div>' + localizer.getString('CANCEL_CHANGES_1') + '</div>',
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
          case 'recordingPending':
            graffiti.showControlPanels([]);
            graffiti.setNotifier('<div>' + localizer.getString('CLICK_BEGIN_MOVIE_RECORDING') + '</div>' +
                                 '<div>' + localizer.getString('CANCEL_RECORDING_1') + '</div>',
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
            graffiti.setNotifier('<div>' + localizer.getString('ACTIVITIES_BEING_RECORDED') + '</div>' +
                                 '<div>' + localizer.getString('CANCEL_RECORDING_2') + '</div>',
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
          case 'scrubbing':
            // do nothing special while scrubbing
            break;
          default:
            console.log('Graffiti: updateControlPanels hit unknown activity:', activity);
            break;
        }

        graffiti.performWindowResizeCheck();
      },

      updateControlPanelPosition: (hardPosition) => {
        if (hardPosition !== undefined) {
          const newPositionPx = { top: hardPosition.top + 'px', left: hardPosition.left + 'px' };
          graffiti.outerControlPanel.css(newPositionPx);
        } else {
          if (state.getControlPanelDragging()) {
            const position = state.getPointerPosition();
            const offset = state.getControlPanelDragOffset();
            const controlPanelWidth = graffiti.outerControlPanel.width();
            const controlPanelHeight = graffiti.outerControlPanel.height();
            const panelBbox = graffiti.sitePanel[0].getBoundingClientRect();
            const constrainedLeft = Math.min(panelBbox.right - controlPanelWidth - 20, Math.max(0,position.x - offset.left));
            const constrainedTop = Math.min(panelBbox.bottom - controlPanelHeight - 20, Math.max(0,position.y - offset.top));
            const newPosition =   { left: constrainedLeft, top: constrainedTop };
            const newPositionPx = { top: newPosition.top + 'px', left: newPosition.left + 'px' };
            graffiti.outerControlPanel.css(newPositionPx);
          }
        }
      },

      initInteractivity: () => {
        graffiti.notebookContainer.click((e) => {
          // console.log('Graffiti: clicked container');
          if (state.getActivity() === 'recordingPending') {
            console.log('Graffiti: Now starting movie recording');
            graffiti.toggleRecording();
          }
          return true;
        });
        audio.setAudioStorageCallback(storage.storeMovie);
        graffiti.addCMEvents();
        setTimeout(() => { 
          graffiti.setupBackgroundEvents();
        }, 500); // this timeout avoids too-early rendering of hidden recorder controls

        graffiti.refreshGraffitiTooltipsDebounced = _.debounce(graffiti.refreshGraffitiTooltips, 100, false);
        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltipsDebounced();
        graffiti.setupControlPanels();
        graffiti.updateControlPanels();
        graffiti.setupDrawingScreen();
        graffiti.setupSavingScrim();
        graffiti.playAutoplayGraffiti(); // play any autoplay graffiti if there is one set up
        graffiti.setupMarkdownLocks();

        terminalLib.init(graffiti.handleTerminalsEvents);

        storage.preloadAllMovies();
        graffiti.checkplay = new Audio('/tree/samples/darth.mp3');

/*
        let body = '<div>Enter the Graffiti Hub Key to import Graffiti into this notebook.</div>';
        body += '<div style="font-weight:bold;margin-top:15px;">Key: <input type="text" value="R5a7Hb"/ width="60"></div>';
        body += '<div style="font-style:italic; color:green;">(Author: N. Vishalyam)</div>';
        dialog.modal({
          title: 'Import Graffiti from GraffitiHub?',
          body: body,
          sanitize:false,
          buttons: {
            'Import': {
              click: (e) => {
                console.log('Graffiti: You clicked Import');
              }
            },
            'Cancel': {
              click: (e) => {
                console.log('Graffiti: You clicked Cancel');
              }
            }
          }
        });
*/
        
      },

      setGraffitiPenColor: (colorVal) => {
        const activePenType = state.getDrawingPenAttribute('type');
        if (activePenType === 'highlight') {
          if (colorVal === 'black') {
            console.log('Graffiti: black is not choosable when using the highlighter');
            return;
          }
        }

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
        graffiti.hideLabelInputBoxes();
        if (activePenType !== penType) {
          // Activate a new active pen, unless this pen is already active, in which case, deactivate it
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

        if (activePenType === 'highlight') {
          // When switching from highlight to pen or eraser, always go to black color because
          // usual color for highlighter is yellow which looks crappy in the line mode.
          graffiti.setGraffitiPenColor('black');
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
          graffiti.hideLabelInputBoxes();
          graffiti.clearAnyActiveStickerStages();
          graffiti.showDrawingScreen();
          // Deactivate any active pen
          $('.graffiti-active-pen').removeClass('graffiti-active-pen');
          const stickerControl = $('#graffiti-sticker-' + stickerType);
          $('.graffiti-active-sticker').removeClass('graffiti-active-sticker');
          stickerControl.addClass('graffiti-active-sticker');
          state.updateDrawingState([
            { change: 'drawingModeActivated', data: true}, 
            { change: 'stickerType', data: stickerType },
            { change: 'penType', data: 'sticker' }
          ]);          
          if (activePenType === 'highlight') {
            // If we were highlighting, it was probably yellow. we probably don't want that color
            // when switching back to stickering.
            graffiti.setGraffitiPenColor('black'); 
          }
        } else {
          // Turn off the active sticker control.
          graffiti.hideLabelInputBoxes();
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
        state.setCurrentPlaySpeed('regular');
        audio.updateAudioPlaybackRate();
        graffiti.updateControlPanels();
      },

      toggleRapidPlay: (opts) => {
        let forceOn = false;
        if ((state.rapidIsOn() && !opts.scan)  || (state.scanningIsOn() && opts.scan)) {
          graffiti.cancelRapidPlay();
        } else {
          console.log('Graffiti: activating rapidPlay/rapidScan');
          if (opts.scan) {
            const currentSpeakingStatus = state.scanForSpeakingStatus();
            if (currentSpeakingStatus) {
              state.setCurrentPlaySpeed('scanInactive');
            } else {
              state.setCurrentPlaySpeed('scanActive'); // turn on rapid scan immediately if rabbit icon is activated during a silent period
            }
          } else {
            state.setCurrentPlaySpeed('rapid');
          }
          audio.updateAudioPlaybackRate();
          graffiti.updateControlPanels();
        }
      },

      dimGraffitiCursor: () => {
        graffiti.graffitiCursorShell.css({opacity:0.1});
      },

      undimGraffitiCursor: () => {
        graffiti.graffitiCursorShell.show().css({opacity:1.0});
      },

      activateTerminalGraffitiCursor: () => {
        if (graffiti.graffitiNormalCursor.is(':visible')) {
          //console.log('activate terminal cursor');
          graffiti.graffitiTerminalCursor.show();
          graffiti.graffitiNormalCursor.hide();
        }
      },

      activateNormalGraffitiCursor: () => {
        if (graffiti.graffitiTerminalCursor.is(':visible')) {
          //console.log('activate normal cursor');
          graffiti.graffitiNormalCursor.show();
          graffiti.graffitiTerminalCursor.hide();
        }
      },      

      drawingScreenHandler: (e) => {
        let drawingActivity = state.getDrawingStateField('drawingActivity');
        if (state.getActivity() === 'recording') {
          if (e.type === 'mousedown') {
            console.log('Graffiti: drawingScreenHandler: mousedown');
            const wasFading = (state.getDrawingStateField('drawingActivity') === 'fade');
            // console.log('Graffiti: wasFading:', wasFading);
            graffiti.resetTemporaryCanvases();
            state.disableDrawingFadeClock();
            const stickerType = state.getDrawingPenAttribute('stickerType');
            drawingActivity = 'draw';
            const viewInfo = state.getViewInfo();
            if (stickerType !== undefined) {
              // console.log('Graffiti: mousedown with stickerType:', stickerType);
              drawingActivity = 'sticker';
              if (wasFading) { // terminate any fading in progress when drawing a new sticker
                graffiti.resetStickerCanvases('temporary');
                graffiti.wipeTemporaryStickerDomCanvases();
              }
              const currentPointerPosition = state.getPointerPosition();
              const penType = state.getDrawingPenAttribute('type');
              const minSize = (penType === 'lineWithArrow' ? 1 : graffiti.minimumStickerSize);
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

              // If we are using a label-type sticker, then put the label input box where the mousedown happened.
              if (stickerType === 'label') {
                graffiti.showLabelInputBox();
              }

            }
            state.updateDrawingState( [ 
              { change: 'drawingModeActivated', data: true }, 
              { change: 'isDown',  data: true }, 
              { change: 'drawingActivity', data: drawingActivity },
              { change: 'opacity', data: state.getMaxDrawingOpacity() },
              { change: 'downInMarkdown', data: viewInfo.inMarkdownCell },
              { change: 'downInPromptArea', data: viewInfo.inPromptArea }
            ]);
          } else if ((e.type === 'mouseup') || (e.type === 'mouseleave')) {
            // console.log('Graffiti: drawingScreenHandler: ', e.type);
            if ((drawingActivity === 'sticker') && (e.type === 'mouseup')) {
              graffiti.clearAnyActiveStickerStages();
            }
            if (state.getDrawingPenAttribute('isDown')) {
              state.updateDrawingState( [ { change: 'isDown',  data: false } ]);
              if (state.getDrawingPenAttribute('permanence') === 'temporary') {
                state.startDrawingFadeClock();
              }
            }
          } else if (e.type === 'keyup') {
            console.log('Graffiti: drawingScreen got key:', e);
            graffiti.handleKeyup(e);
          } else if (e.type === 'keydown') {
            console.log('Graffiti: drawingScreen got key:', e);
            graffiti.handleKeydown(e);
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
        graffiti.drawingScreen.show().focus();
      },

      hideDrawingScreen: () => {
        graffiti.drawingScreen.hide();
      },

      // Inspired by https://www.codicode.com/art/how_to_draw_on_a_html5_canvas_with_a_mouse.aspx
      // and : http://perfectionkills.com/exploring-canvas-drawing-techniques/
      setupDrawingScreen: () => {
        // Note that the tabindex is the key to capture the keydown/up events, 
        // cf https://stackoverflow.com/questions/3149362/capture-key-press-or-keydown-event-on-div-element
        const graffitiDrawingScreen = $('<div tabindex="0" id="graffiti-drawing-screen"></div>');
        graffiti.drawingScreen = graffitiDrawingScreen.prependTo(graffiti.notebookContainer);
        const notebookHeight = $('#notebook').outerHeight(true);
        graffiti.drawingScreen.css({height: notebookHeight + 'px'});
        graffiti.drawingScreen.bind('mousedown mouseup mouseleave keydown keyup', (e) => { graffiti.drawingScreenHandler(e) });
      },
      
      placeLabelInputBox: () => {
        const viewInfo = state.getViewInfo();
        const cell = utils.findCellByCellId(viewInfo.cellId);
        const elem = $(cell.element[0]);
        let labelInputBox = elem.find('.graffiti-label-input');
        if (labelInputBox.length === 0) {
          labelInputBoxElem = $('<div tabindex="0" class="graffiti-label-input"><input type="text" maxlength="50" placeholder="' + localizer.getString('ENTER_LABEL') + 
                                '"/></div>');
          labelInputBox = labelInputBoxElem.appendTo(elem);
          labelInputBox.bind('keydown keyup', (e) => { graffiti.handleLabelInput(e) });
        }
        const penColor = state.getDrawingPenAttribute('color');
        if (penColor === 'white') {
          labelInputBox.find('input').css({color:'black'});
        } else {
          labelInputBox.find('input').css({color:penColor});
        }
        return labelInputBox;
      },

      showLabelInputBox: () => {
        graffiti.clearAnyActiveStickerStages();
        graffiti.hideLabelInputBoxes();
        const labelInputBox = graffiti.placeLabelInputBox(); // make sure there is a label box
        const currentPointerPosition = state.getPointerPosition();
        const viewInfo = state.getViewInfo();
        let adjustedPosition = utils.subtractCoords(viewInfo.outerCellRect, currentPointerPosition);
        const verticalAdjust = parseInt(labelInputBox.height() / 2);
        adjustedPosition.y = adjustedPosition.y - verticalAdjust;
        labelInputBox.show().css({left:adjustedPosition.x + 'px', top:adjustedPosition.y + 'px'}).find('input').val('').focus();
        const outerCellRect = viewInfo.outerCellRect;
        const mouseDownPosition = state.getDrawingPenAttribute('mouseDownPosition');
        state.updateDrawingState([
          { change: 'positions', 
            data: {
              positions: {
                start: { x: mouseDownPosition.x - outerCellRect.left, y: mouseDownPosition.y - outerCellRect.top - verticalAdjust },
                end:   { x: mouseDownPosition.x + 1 - outerCellRect.left, y: mouseDownPosition.y + 1 - outerCellRect.top - verticalAdjust }
              }
            }
          },

          { change: 'downInPromptArea',
            data: viewInfo.inPromptArea
          },
          { change: 'downInMarkdown',
            data: viewInfo.downInMarkdown
          }, 
          { change: 'promptWidth',
            data: viewInfo.promptWidth
          }
        ]);
      },

      hideLabelInputBoxes: () => {
        console.log('Graffiti: Ending labelling');
        $('.graffiti-label-input').val('').hide();
      },

      handleLabelInput: (e) => {
        if (e.which === 9) {
          e.preventDefault(); // don't let tab key buble up
        }
        e.stopPropagation(); // make sure keystrokes in the label input box don't bubble up to jupyter
        if (e.type === 'keyup') {
          if (state.getActivity() === 'recording') {
            // If user hits return tab, we "accept" this label, which simply means hide the input box. The rendered label should be underneath.
            state.disableDrawingFadeClock();
            const inputBox = $(e.target);
            const labelText = inputBox.val();
            state.updateDrawingState([ { change: 'label', data: '' + labelText }]);
            const drawingPermanence = state.getDrawingPenAttribute('permanence');
            graffiti.updateStickerDisplayWhenRecording(drawingPermanence);
            state.storeHistoryRecord('stickers');
            //console.log('keycode',e.which);
            if ((e.which === 13) || (e.which === 9)) {
              graffiti.hideLabelInputBoxes();
              state.startDrawingFadeClock();
            }
          }
        }
      },

      setupSavingScrim: () => {
        const graffitiSavingScrim = $('<div id="graffiti-saving-scrim"><div>Saving Graffiti Recording. Please wait...</div></div>');
        graffiti.savingScrim = graffitiSavingScrim.prependTo(graffiti.notebookContainer);
      },
      
      showSavingScrim: () =>  {
        graffiti.savingScrim.css({display:'flex'});
      },

      hideSavingScrim: () => {
        graffiti.savingScrim.css({display:'none'});
      },

      resizeCanvases: () => {
        const canvasTypes = ['permanent','temporary'];
        let cellElement, cellRect, canvasStyle, canvas, cellCanvas;
        for (let canvasType of canvasTypes) {
          for (let cellId of Object.keys(graffiti.canvases[canvasType])) {
            cell = utils.findCellByCellId(cellId);
            if (cell !== undefined) {
              canvas = graffiti.canvases[canvasType][cellId];
              cellCanvas = canvas.canvas;
              cellElement = cell.element[0];
              cellRect = cellElement.getBoundingClientRect();
              if ((parseInt(cellRect.width) !== parseInt(cellCanvas.width)) || (parseInt(cellRect.height) !== parseInt(cellCanvas.height))) {
                canvasStyle = {
                  width:  cellRect.width + 'px',
                  height: cellRect.height + 'px'
                };
                canvas.div.css(canvasStyle);
                cellCanvas.width = cellRect.width;
                cellCanvas.height = cellRect.height;
                canvas.cellRect = cellRect;
                //console.trace('resized height of ',cellId, 'to ', cellRect.height);
              }
            }
          }
        }
        const notebookHeight = $('#notebook').outerHeight(true);
        graffiti.drawingScreen.css({height: notebookHeight + 'px'});
      },

      // Remove "active" attribute from whatever sticker might have rt now.
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
        const cellElement = cell.element[0];
        const cellRect = cellElement.getBoundingClientRect();

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
        //console.log('wipeAllStickerDomCanvases');
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
          }
        }
      },        

      processPositionsForCellTypeScaling: (record, type) => {
        let positions, scalarX, scalarY, positionsRaw, cell, cellId, cellRects, denomWidth, denomHeight;
        // console.log('scalarX', scalarX, 'scalarY', scalarY);
        if (type === 'cursor') {
          // Scale the cursor position. The cell the cursor is hovering over is in the cellId field, unless the
          // drawingActivity was 'sticker' when this record was made, in which case we'll scale to the cell under
          // the starting coordinates of the sticker to match what happens when we scale the sticker itself.
          if (record.stickerInfo !== undefined) {
            cellId = record.stickerInfo.cellId;
            denomWidth = record.stickerInfo.width;
            denomHeight = record.stickerInfo.height;
          } else {
            cellId = record.cellId;
            denomWidth = record.innerCellRect.width;
            denomHeight = record.innerCellRect.height;
          }
          cell = utils.findCellByCellId(cellId);
          cellRects = utils.getCellRects(cell);
          scalarX = cellRects.innerCellRect.width / denomWidth;
          scalarY = cellRects.innerCellRect.height / denomHeight;
          positionsRaw = { x: record.x, y: record.y };
          if (!record.inMarkdownCell) {
            // in code cells, or if pen went down in prompt area, just use positions verbatim
            positions = { start: { x: positionsRaw.x, y: positionsRaw.y } };
          } else {
            if (record.inPromptArea || record.downInPromptArea) {
              // in prompt area only scale y value
              positions = { start: { x: positionsRaw.x, y: positionsRaw.y * scalarY } };
            } else {
              // in markdown area, scale full position.
              positions = { start: { x: (positionsRaw.x - record.promptWidth) * scalarX + cellRects.promptRect.width,
                                     y: positionsRaw.y * scalarY } };
            }
          }
          //if (record.drawingActivity === 'sticker') {
          //console.log('cellId', cellId, 'hoverCellId', record.hoverCell.metadata.graffitiCellId, 'positions', positions.start.y, 'scalarX', scalarX, 'scalarY', scalarY);
          //}
        } else {
          //
          // Drawing and sticker scaling code begins here.
          //
          positionsRaw = { start: { x: record.positions.start.x, y: record.positions.start.y },
                           end:   { x: record.positions.end.x, y: record.positions.end.y } };
          cell = utils.findCellByCellId(record.cellId);
          cellRects = utils.getCellRects(cell);
          scalarX = cellRects.innerCellRect.width / record.innerCellRect.width ;
          scalarY = cellRects.innerCellRect.height / record.innerCellRect.height;
          // If this drawing/sticker started in a markdown cell, we will attempt to scale both x and y coords in the inner_cell rect area but 
          // NOT the prompt area.
          if (record.pen.downInMarkdown) {
            if (record.pen.downInPromptArea) {
              //console.log('inPromptArea and did not start in prompt area');
              // if pen went down in prompt area of a markdown cell, scale the Y value only. 
              positions = { start: { x: positionsRaw.start.x,
                                     y: positionsRaw.start.y * scalarY },
                            end:   { x: positionsRaw.end.x,
                                     y: positionsRaw.end.y * scalarY }
              };
            } else {
              if (record.pen.inPromptArea) {
                scalarX = 1;
              }
              // In the inner_cell, scale both x and y. First subtract the historical prompt width, then scale the value up/down, and then
              // add the current prompt width to calculate the final X (UNLESS we are drawing in the prompt area, then do not scale in X).
              // Y is just scaled by change in cell height.
              positions = { start: { x: (positionsRaw.start.x - record.promptWidth) * scalarX + cellRects.promptRect.width,
                                     y: positionsRaw.start.y * scalarY },
                            end:   { x: (positionsRaw.end.x - record.promptWidth) * scalarX + cellRects.promptRect.width,
                                     y: positionsRaw.end.y * scalarY }
              };
            }
          } else {
            // we don't scale anything if we started in a code cell. Just leave everything as recorded.
            positions = { 
              start: { x : positionsRaw.start.x, y: positionsRaw.start.y },
              end: {   x : positionsRaw.end.x,   y: positionsRaw.end.y }
            }
          }
        }
        return positions;
      },

      // calculate correct offsets based on innerCellRect / dx, dy etc
      drawStickersForCell: (cellId,record) => {
        const activity = state.getActivity();
        const currentlyRecording = (activity === 'recording');
        const canvasTypes = ['temporary', 'permanent'], canvasElements = {};
        let canvasType, newInnerHtml = {}, finalInnerHtml;
        for (canvasType of canvasTypes) {
          graffiti.placeStickerCanvas(cellId, canvasType);
          canvasElements[canvasType] = {elem: graffiti.stickers[canvasType][cellId].canvas };
          canvasElements[canvasType].opacityOverride = canvasElements[canvasType].elem.css('opacity');
          newInnerHtml[canvasType] = [];
        }
        let stickerPermanence, stickerX, stickerY, fillOpacity, width, height, stickerWidth, stickerHeight, 
            generatedStickerHtml, generatedStickerElem, pen, type, positions, p1x,p1y,p2x,p2y,
            stickersRecords, dimensions, stickerProcessingRecord;
        if (record !== undefined) {
          stickersRecords = record.stickersRecords;
        } else { 
          stickerPermanence = state.getDrawingPenAttribute('permanence');
          stickersRecords = graffiti.stickers[stickerPermanence][cellId].stickers; 
        }
        for (let stickerRecord of stickersRecords) {
          pen = stickerRecord.pen;
          type = pen.stickerType;
          stickerPermanence = pen.permanence;
          if (currentlyRecording) {
            positions = stickerRecord.positions;
            fillOpacity = state.getDrawingPenAttribute('fillOpacity');
            //console.log('Recording, Computed fillOpacity:', fillOpacity);
          } else {
            stickerRecord.cellId = cellId;
            // console.log('Graffiti: sticker rendering.  record', record, 'stickerRecord', stickerRecord, 'stickerProcessingRecord', stickerProcessingRecord);
            positions = graffiti.processPositionsForCellTypeScaling(stickerRecord,'positions');
            fillOpacity = stickerRecord.pen.fillOpacity;
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
          dimensions = {
            x: stickerX,
            y: stickerY,
            width: stickerWidth,
            height: stickerHeight
          };
          //console.log('Processing stickerRecord:', stickerRecord);
          //console.log('Drawing to dimensions:', dimensions);
          generatedStickerHtml = undefined;
          //console.log('processing type:', type);
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
                fill:   pen.fill,
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
            case 'label':
              // If we are recording, on mouseup, we will put a centered input box on screen. Otherwise render this label.
              // If not recording, render a text label scaled by the size of this box.
              if (pen.label !== undefined) {
                dimensions.width = 15 * pen.label.length; // large enough for the label
                dimensions.height = 18;
                generatedStickerHtml = stickerLib.makeLabelHtml({
                  color:  pen.color,
                  label: pen.label,
                  dimensions: dimensions,
                  opacity: 1.0,
                });
                //console.log('generatedStickerHtml:', generatedStickerHtml);
              }
              break;
            case 'custom':
              let stickerImageUrl;
              if (currentlyRecording) {
                const recordingCellInfo = state.getRecordingCellInfo();
                stickerImageUrl = recordingCellInfo.recordingRecord.stickerImageUrl;
              } else {
                stickerImageUrl = state.getStickerImageUrl();
              }
              if (stickerImageUrl !== undefined) {
                generatedStickerHtml = stickerLib.makeCustom({
                  dimensions: dimensions,
                  imageUrl: stickerImageUrl,
                  cssTransform: cssTransform
                });
                canvasElements[stickerPermanence].opacityOverride = 1.0; // make parent opacity maximum so child images are fully visible
              } else {
                // Sticker not set or not found; just draw grey rect to let user know
                generatedStickerHtml = stickerLib.makeRectangle({
                  color:  'lightgrey',
                  fill:   pen.fill,
                  dashed: 'dashed',
                  strokeWidth: 3,
                  dimensions: dimensions,
                  fillOpacity: 0,
                });
              }
              break;
          }
          if (generatedStickerHtml !== undefined) {
            newInnerHtml[stickerPermanence].push(generatedStickerHtml);
          }
        }
        // Finally, render all sticker html now that it's built.
        for (canvasType of canvasTypes) {
          if (newInnerHtml[canvasType].length > 0) { // only redraw canvas that has elements drawn during this frame
            canvasElements[canvasType].elem.empty();
            finalInnerHtml = newInnerHtml[canvasType].join('');
            canvasElements[canvasType].elem.html(finalInnerHtml);
            canvasElements[canvasType].elem.css({opacity:canvasElements[canvasType].opacityOverride});
          }
        }
      },

      updateStickerDisplayWhenRecording: (stickerPermanence) => {
        const cellId = state.getDrawingStateField('cellId');
        graffiti.resetGraffitiStickerStage(cellId, stickerPermanence);

        // Replace active sticker if there is one, or add a new active sticker
        const stickers = graffiti.stickers[stickerPermanence][cellId].stickers;
        let stickerRecord = state.createStickerRecord();
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
        graffiti.drawStickersForCell(cellId);
      },

      // This fn is called on mousemove, which means fade counts always reset, and we clear the temporary ink completely if it was part way through a fade
      updateDrawingDisplayWhenRecording: (ax, ay, bx, by, viewInfo) => {
        if (state.getActivity() === 'recording') {
          if (state.getDrawingPenAttribute('isDown')) {
            const drawingActivity = state.getDrawingStateField('drawingActivity');
            const drawingPermanence = state.getDrawingPenAttribute('permanence');
            const cellId = (drawingActivity === 'sticker' ? state.getDrawingStateField('cellId') : viewInfo.cellId);
            const cellRect = graffiti.placeCanvas(cellId, drawingPermanence);
            let drawingRecordType;
            if (drawingActivity === 'sticker') {
              drawingRecordType = 'stickers';
              const mouseDownPosition = state.getDrawingPenAttribute('mouseDownPosition');
              state.updateDrawingState([
                { change:'positions', 
                  data: { 
                    positions: {
                      start: { x: mouseDownPosition.x - cellRect.left, y: mouseDownPosition.y - cellRect.top },
                      end:   { x: bx - cellRect.left, y: by - cellRect.top }
                    }
                  }
                },
                { change: 'inPromptArea',
                  data: viewInfo.inPromptArea
                },
                { change: 'promptWidth',
                  data: viewInfo.promptWidth
                }, 
                // note that we don't change the sticker cellId during mousemove. It's set once at mousedown and kept constant until mouse up.
              ]);
              graffiti.updateStickerDisplayWhenRecording(drawingPermanence);
            } else {
              drawingRecordType = 'drawings';
              const drawingPenType = state.getDrawingPenAttribute('type');
              const drawingPenDash = state.getDrawingPenAttribute('dash');
              const drawingPenColor = state.getDrawingPenAttribute('color');
              // console.log('drawingActivity', drawingActivity, drawingPenType);
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
                },
                { change: 'inPromptArea',
                  data: viewInfo.inPromptArea
                },
                { change: 'promptWidth',
                  data: viewInfo.promptWidth
                }, 
              ]);
            }
            state.storeHistoryRecord(drawingRecordType);
          }
        }
      },

      // Rerun all drawings up to time t. Used after scrubbing.
      redrawAllDrawings: (targetTime) => {
        if (targetTime === undefined) {
          targetTime = state.getTimePlayedSoFar();
        }
        graffiti.clearCanvases('all');
        const lastDrawFrameIndex = state.getIndexUpToTime('drawings', targetTime);
        if (lastDrawFrameIndex !== undefined) {
          // First, final last opacity reset before the target time. We will start redrawing drawings from this point forward.
          let record;
          for (let index = 0; index < lastDrawFrameIndex; ++index) {
            record = state.getHistoryItem('drawings', index);
            graffiti.updateDrawingCore(record);
          }
        }
      },

      redrawAllDrawingsWhenRecording: () => {
        if (state.getActivity() !== 'recording') {
          return;
        }
        const lastDrawFrameIndex = state.getLastFrameIndex('drawings');
        if (lastDrawFrameIndex !== undefined) {
          let record;
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
        //const commandParts = markdown.match(/^\s*%%(([^\s]*)(\s*)(.*))$/mig);
        const commandParts = markdown.split(/\n/);
        let partsRecord, part, subParts, cleanedPart;
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
            playOnClick: false,
            saveToFile: undefined, // may be array of save_to_file directives
          };
          for (let i = 0; i < commandParts.length; ++i) {
            part = $.trim(commandParts[i]);
            //console.log('part:', part);
            if ((part.indexOf('%%') === 0) && (part.indexOf('%% ') !== 0)) {
              cleanedPart = part.replace('%%','');
              subParts = $.trim(cleanedPart).split(/\s+/);
              if (subParts.length > 0) {
                const subPart0 = subParts[0];
                if ((subPart0 === 'button_name') || (subPart0 === 'caption') || (subPart0 === 'caption_pic') || 
                    (subPart0 === 'caption_video_id') || (subPart0 === 'narrator_name') || (subPart0 === 'narrator_pic') || 
                    (subPart0 === 'custom_sticker')) {
                  if (subParts.length === 1) { // not enough parameters given, silently ignore
                    continue;
                  }
                }
                const subPart1 = subParts[1];
                const subPart1ToEnd = subParts.slice(1).join(' ');
                switch (subPart0) {
                  case 'comment':
                    break; // we just ignore these. Used to instruct content creators how to use the editing tip cells.
                  case 'title_tag':
                    state.setTooltipTitleTag(subPart1ToEnd);
                    break;
                  case 'button_name':
                    partsRecord.buttonName = subPart1ToEnd;
                    break;
                  case 'caption': // you can make a special caption for this tip
                    partsRecord.caption = subPart1ToEnd;
                    break;
                  case 'caption_pic': // you can put a tiny pic next to the caption (use markdown)
                    partsRecord.captionPic = utils.renderMarkdown(subPart1);
                    break;
                  case 'caption_video_id': // you can put a tiny video next to the caption
                    if (subPart1.indexOf('images/') === 0) {
                      partsRecord.captionVideo =
                        '<video width="150" height="75" autoplay><source src="' + subPart1 + '" type="video/mp4"></video>';
                    } else {
                      partsRecord.captionVideo =
                        '<iframe width="100" height=80 src="https://www.youtube.com/embed/' + subPart1 + 
                        '?rel=0&amp;controls=0&amp;showinfo=0" frameborder="0"></iframe>';
                    }
                    break;
                  case 'narrator_name': // set the name of the narrator to display in the control panel during playback
                    if (subPart1 !== undefined) {
                      partsRecord.narratorName = subPart1ToEnd;
                    }
                    break;
                  case 'narrator_pic': // specify a picture to display in the control panel during playback
                    if (subPart1 !== undefined) {
                      partsRecord.narratorPicture = subPart1;
                    }
                    break;
                  case 'hide_player_after_playback_complete':
                    state.setHidePlayerAfterPlayback(true);
                    break;
                  case 'dont_restore_cell_contents_after_playback': // if the user hasn't changed cell contents, don't restore the cell contents when playback finishes
                    state.setDontRestoreCellContentsAfterPlayback(true);
                    break;
                  case 'autoplay': // 'never' (optional), 'once', 'always'
                    if (subPart1 !== undefined) { // if not passed in then its considered to be 'never'
                      partsRecord.autoplay = subPart1.toLowerCase();
                    }
                    break;
                  case 'play_on_click': // if present, we will make a click on the target initiate playback.
                  case 'click_to_play':
                    partsRecord.playOnClick = true; 
                    break;
                  case 'hide_tooltip': // if present, we will not render tooltip.
                    partsRecord.hideTooltip = true;
                    break;
                  case 'hide_play_button':
                    // if present, we will render the tooltip but we will not show the play button. 
                    // Used in conjunction with clickToPlay on text graffiti
                    partsRecord.hidePlayButton = true; 
                    break;
                  case 'custom_sticker':
                    // Path to an image or svg that will be a custom sticker.
                    partsRecord.stickerImageUrl = subPart1;
                    break;
                  case 'save_to_file':
                    // Param 1: id of cell to save; param 2: path of file to save cell contents to. You can have more than one of these in a tooltip
                    if (partsRecord.saveToFile === undefined) {
                      partsRecord.saveToFile = [];
                    }
                    const saveFile = subParts[2].replace(/^"/,'').replace(/"$/,'');
                    const sourceCell = subPart1;
                    partsRecord.saveToFile.push({ cellId: sourceCell, path: saveFile });
                    break;
                  case 'terminal_command':
                    // pass a shell command to execute, enclosed by double quotes. The outside quotes will be removed.
                    const command = subParts.slice(2).join(' ').replace(/^"/,'').replace(/"$/,'');
                    partsRecord.terminalCommand = { terminalId: subPart1, command: command };
                    break;
                }
              }
            }
          }
        }
        return partsRecord;
      },

     refreshGraffitiSideMarkers: (cell) => {
       const element = $(cell.element[0]);
       const elemOffset = element.offset();
       element.find('.graffiti-right-side-marker').unbind('mouseenter mouseleave').remove(); // remove all previous markers for this cell
       let markers = element.find('.graffiti-highlight');
       const yBuffer = 2;
       let i, marker, offset, makerIcon, rect, yDiff, className, idMatch, metaData;
       if (markers.length > 0) {
         //console.log('markers:', markers);
         for (i = 0; i < markers.length; ++i) {
           marker = markers[i];
           className = marker.className;
           // extract the recording tag so we can highlight it later
           idMatch = className.match(/graffiti-(id_.[^\-]+-id_[^\s]+)/);
           metaData = (idMatch !== null ? idMatch[1] : undefined);
           offset = $(marker).offset();
           yDiff = offset.top - elemOffset.top;
           markerIcon = stickerLib.makeRightSideMarker({color:'rgb(47,147,107)',
                                                        dimensions: { x: element.width() + 20,
                                                                      y: yDiff - yBuffer,
                                                                      width: 18,
                                                                      height:12,
                                                        },
                                                        metaTag: 'graffiti-id|' + metaData,
                                                        title: localizer.getString('GRAFFITI_PRESENT')
           });
           $(markerIcon).appendTo(element);
         }
       }
       let markerIcons = element.find('.graffiti-right-side-marker');
       if (markerIcons.length > 0) {
         markerIcons.bind('mouseenter mouseleave', (e) => {
           let target = $(e.target);
           if (!target.hasClass('graffiti-right-side-marker')) {
             target = target.parents('.graffiti-right-side-marker');
           }
           const graffitiId = target.attr('graffiti-id');
           const cellElement = target.parents('.cell');
           const graffitiElement = cellElement.find('.graffiti-' + graffitiId);
           if (e.type === 'mouseenter') {
             //console.log('entered right-side-marker:', graffitiId);
             graffitiElement.addClass('graffiti-highlight-extra');
           } else {
             //console.log('left right-side-marker', graffitiId);
             graffitiElement.removeClass('graffiti-highlight-extra');
           }
         });
       }
     },

      // Refresh the markDoc calls for any particular cell based on recording data
      refreshGraffitiHighlights: (params) => {
        params.cellId = utils.getMetadataCellId(params.cell.metadata);

        if (params.cell.cell_type !== 'code') {
          return; // We don't refresh highlights in markdown cells because markdown cells do their highlights with plain html markup.
        }
        const recordings = state.getManifestRecordingsForCell(params.cellId);
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
        graffiti.tokenRanges[params.cellId] = {};
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
                graffiti.tokenRanges[params.cellId][recordingKey] = range;
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

      refreshAllGraffitiSideMarkers: () => {
        const activity = state.getActivity();
        if (activity === 'playing' || activity === 'recording' || activity === 'scrubbing') {
          return; // don't update these during playback, recording or scrubbing... too slow
        }
        const cells = Jupyter.notebook.get_cells();
        for (let cell of cells) {
          graffiti.refreshGraffitiSideMarkers(cell);
        }
      },

      refreshAllGraffitiHighlights: () => {
        const cells = Jupyter.notebook.get_cells();
        let params;
        for (let cell of cells) {
          params = { cell: cell, clear: true };
          graffiti.refreshGraffitiHighlights(params);
          graffiti.refreshGraffitiSideMarkers(cell);
        }
      },

      updateRefreshableCell: () => {
        const highlightRefreshCellId = state.getHighlightsRefreshCellId();
        if (highlightRefreshCellId !== undefined) {
          const highlightRefreshCell = utils.findCellByCellId(highlightRefreshCellId);
          graffiti.refreshGraffitiHighlights({cell: highlightRefreshCell, clear: true});
          graffiti.refreshGraffitiSideMarkers(highlightRefreshCell);
          state.clearHighlightsRefreshableCell();
        }
      },

      hideTip: (tip) => {
        graffiti.notebookContainer.find('.graffiti-tip .headline').remove();
        graffiti.notebookContainer.find('.graffiti-tip').hide();
        // I think this is messing up clickable images.
        //state.clearPlayableMovie('tip');
      },

      refreshGraffitiTooltipsCore: (e) => {
        //console.log('Graffiti: handling mousenter/mouseleave:', e.type);
        const activity = state.getActivity();
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
          //console.log('refreshGraffitiTooltips: recording=', recording, cellId, recordingKey);
          if (recording.hasMovie) {
            //console.log('Graffiti: refreshGraffitiTooltips: recording=', recording, cellId, recordingKey);
            state.setPlayableMovie('tip', cellId, recordingKey);
          }                
          state.setHidePlayerAfterPlayback(false); // default for any recording is not to hide player
          const tooltipCommands = graffiti.extractTooltipCommands(recording.markdown);

          if (recording.playOnClick) {
            //console.log('Graffiti: binding target for click', highlightElem);
            highlightElem.off('click dblclick').bind('click dblclick', (e) => {
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

          if ((recording.hideTooltip) || (recording.terminalCommand !== undefined) || activity === 'recording') {
            // console.log('Graffiti: recording is set to hide tip or recording is set to run a terminal command, or recording so we do not display tips');
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
                let headlineMarkdown = '';
                if (tooltipCommands !== undefined) {
                  headlineMarkdown = '<div class="headline">' +
                                     ' <div>' + tooltipCommands.captionPic + '</div>' +
                                     ' <div>' + tooltipCommands.caption + '</div>' +
                                                   (tooltipCommands.captionVideo !== undefined ?
                                                    ' <div class="graffiti-video">' + tooltipCommands.captionVideo + '</div>' : '' ) +
                                     '</div>';
                }
                contentMarkdown = utils.renderMarkdown(recording.markdown)
                // if no tooltip is defined, show a default message
                if ((contentMarkdown.length === 0) && (recording.hidePlayButton)) {
                  contentMarkdown = utils.renderMarkdown('_' + localizer.getString('TOOLTIP_HINT') + '_');
                }
                let tooltipContents = headlineMarkdown + '<div class="parts">' + '<div class="info">' + contentMarkdown + '</div>';
                if ((recording.hasMovie) && (!recording.hidePlayButton)) {
                  graffiti.tooltipButtonLabel = (((tooltipCommands !== undefined) && (tooltipCommands.buttonName !== undefined)) ? 
                                                 tooltipCommands.buttonName : 'Play Movie');
                  tooltipContents +=
                    '   <div class="movie"><button class="btn btn-default btn-small" id="graffiti-movie-play-btn">' + 
                    graffiti.tooltipButtonLabel + '</button></div>';
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
                  if (!graffiti.forcedGraffitiTooltipRefresh) {
                    if (currentTipInfo !== undefined) {
                      if ((currentTipInfo.cellId === cellId) && (currentTipInfo.recordingKey === recordingKey)) {
                        doUpdate = false;
                      }
                    }
                  }
                  graffiti.forcedGraffitiTooltipRefresh = false;
                  if (doUpdate) {
                    //console.log('replacing tooltip contents ');
                    existingTip.find('#graffiti-movie-play-btn').unbind('click');
                    existingTip.html(tooltipContents);
                    state.setDisplayedTipInfo(cellId,recordingKey);
                  } else {
                    if (graffiti.tooltipButtonLabel !== undefined) {
                      $('#graffiti-movie-play-btn').html(graffiti.tooltipButtonLabel);
                    }
                  }
                  $('#graffiti-movie-play-btn').prop('disabled',false);
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
                let tipTop = parseInt(highlightElemOffset.top - outerInputOffset.top) - existingTipHeight - graffiti.tipAboveFudge;
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
                if (rectDifference < existingTipHeight && !anchorIsImage) { // place tip below the line
                  tipPosition.top = highlightElemOffset.top - outerInputOffset.top + graffiti.cmLineHeight + graffiti.cmLineTipFudge;
                }
                //console.log('2) tipPosition:', tipPosition);
                tipPosition.top += hoverCellElementPosition.top;
                //console.log('3) tipPosition:', tipPosition);

                const positionPx = { left: tipPosition.left + 'px', top: tipPosition.top + 'px' };
                existingTip.css(positionPx);
                existingTip.show();

                // increase counter of total tips shown this session
                state.updateUsageStats({
                  type:'tip',
                  data: { 
                    cellId: cellId,
                    recordingKey: recordingKey
                  }
                });

              }
            }, 425); // this number is how long user has to hover before we display the tooltip
          }
        }
      },

      refreshGraffitiTooltips: () => {
        const tips = $('.graffiti-highlight');
        //console.trace('refreshGraffitiTooltips: binding mousenter/mouseleave');
        tips.unbind('mouseenter mouseleave').bind('mouseenter mouseleave', (e) => { graffiti.refreshGraffitiTooltipsCore(e); } );
      },

      markSelectedCellForExecution: () => {
        const selectedCell = Jupyter.notebook.get_selected_cell();
        if (selectedCell !== undefined && selectedCell.cell_type === 'code') {
          state.setExecutionSourceChoiceId(utils.getMetadataCellId(selectedCell.metadata));
          graffiti.setJupyterMenuHint(localizer.getString('CELL_EXECUTE_CHOICE'));
        }
      },

      handleExecuteCellViaGraffiti: () => {
        const selectedCell = Jupyter.notebook.get_selected_cell();
        if (selectedCell.cell_type === 'code') {
          const config = utils.getCellGraffitiConfig(selectedCell);
          if (config !== undefined) {
            if (config.hasOwnProperty('executeCellViaGraffiti')) {
              const execKey = config['executeCellViaGraffiti'];
              const keyParts = execKey.split('_');
              state.setPlayableMovie('cellExecute', 'id_' + keyParts[0], 'id_' + keyParts[1]);
              graffiti.loadAndPlayMovie('cellExecute');
              return true;
            }
          }
        }
        return false;
      },

      clearSkipKeyDownTimer: () => {
        clearTimeout(graffiti.skipKeyDownTimer);
        graffiti.skipKeyDownTimer = undefined;
      },

      handleKeydown: (e) => {
        const keyCode = e.which;
        const activity = state.getActivity();
        let stopProp = false;

        //console.log('handleKeydown keyCode:', keyCode, String.fromCharCode(keyCode));
        if (activity === 'recording') {
          if (keyCode === graffiti.skipKeyCode) {
            graffiti.skipKeyDownTimer = setTimeout(() => { 
              console.log('Graffiti: ending recording by key press.');
              graffiti.skipKeyDownTimer = undefined;
              graffiti.endRecordingByKeyPress();
            }, state.END_RECORDING_KEYDOWN_TIMEOUT);
          }
        }


        if (terminalLib.getFocusedTerminal() !== undefined) {
          // Let any focused terminal handle the event. Don't let jupyter or anybody else get it. 
          // (Graffiti will need to capture the data during recording though.)
          // console.log('Graffiti: Focused terminal so stopping propogation');
          e.stopPropagation(); 
          return true;
        }
          
        // If user hit shift-enter or ctrl-enter, in a code cell, and it is marked as "executeCellViaGraffiti" then it will
        // actually run a graffiti movie when you try to execute that cell, rather than the jupyter default (only when in 'idle' activity)
        if (activity === 'idle') {
          if (keyCode === 13) {
            if (e.ctrlKey || e.shiftKey) {
              if (graffiti.handleExecuteCellViaGraffiti()) {
                console.log('Graffiti: executedCellViaGraffiti ran, so: intercepting return-key press.');
                e.stopPropagation();
                return true;
              }
            }
          }
        }

        if ((((48 <= keyCode) && (keyCode <= 57)) ||    // A-Z
             ((65 <= keyCode) && (keyCode <= 90)) ||    // 0-9
             ((37 <= keyCode) && (keyCode <= 40)) ||    // arrow keys                
             (keyCode === 32))                          // space bar
            && activity === 'playing') {
          // Pressing keys : A-Z, 0-9, arrows, and spacebar stop any playback in progress.
          stopProp = true;
          graffiti.togglePlayback();
        } else {
          // Check for other keypress actions
          switch (keyCode) {
            case 27: // escape key CANCELS playback
              stopProp = true;
              if ((activity === 'playing') || (activity === 'playbackPaused') || (activity === 'scrubbing')) {
                graffiti.cancelPlayback({cancelAnimation:true});
              }
              break;
            case 16: // shift key
              state.setShiftKeyIsDown(true);
              state.updateDrawingState([ { change: 'stickerOnGrid', data: true } ]);
              //console.log('Graffiti: shiftKeyIsDown');
              break;
              // case 13: // enter key
              // case 18: // meta key
              // case 91: // option key
              //   break;
            default:
              break; // let any other keys pass through
          }
        }
        
        if (stopProp) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }

        return true;
      },

      handleKeyup: (e) => {
        // console.log('keyUp e.which:', e.which);
        const keyCode = e.which;
        if ((keyCode === graffiti.skipKeyCode) && (graffiti.skipKeyDownTimer !== undefined)) {
          graffiti.clearSkipKeyDownTimer();
          graffiti.toggleRecordingSkip();
          return true;
        }
        return false;
      },

      // If the skip key was down then we want to cancel the timeout it created, because a mouse click happened (e.g. option-select)
      handleGeneralClick: (e) => {
        console.log('handled a click');
        graffiti.clearSkipKeyDownTimer();
        return false;
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
          return graffiti.handleKeydown(e);
        });

        $('body').keyup((e) => {
          return graffiti.handleKeyup(e);
        });
        
        $('body,.cell').click((e) => {
          graffiti.handleGeneralClick(e);
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


          let doDrawingDisplayUpdate = true;
          const drawingActivity = state.getDrawingStateField('drawingActivity');
          if (drawingActivity === 'sticker') {
            const stickerType = state.getDrawingPenAttribute('stickerType');
            if (stickerType === 'label') {
              // We do not want to update the label during recording because this fn is called via onmousemove.
              // We update the label directly from handleLabelInput(), above, for that special case. Otherwise, we
              // will end up dragging the label around the screen while the mousebutton is down.
              doDrawingDisplayUpdate = false;
            }
          }
          if (doDrawingDisplayUpdate) {
              graffiti.updateDrawingDisplayWhenRecording(previousPointerX, previousPointerY, e.clientX, e.clientY, viewInfo );
          }

          graffiti.updateControlPanelPosition();
          return true;
        };

        // If we were playing a recording when they hit reload, we need to cancel it, restore, and save before we continue. 
        // Needs more testing!!
        window.addEventListener('beforeunload', function (e) {
          console.log('Graffiti: before unload handler.');
          const activity = state.getActivity();
          if ((activity === 'playing') || (activity === 'playbackPaused') || (activity == 'scrubbing')) {
            graffiti.cancelPlaybackNoVisualUpdates();
          }
        });

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

        window.onblur = (e) => {
          //console.log('window lost focus, pausing any playing movie');
          graffiti.pausePlayback();
        },

        // Serialize/deserialize range objects
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

        graffiti.handleSliderDragDebounced = _.debounce(graffiti.handleSliderDrag, 20, true);
        
        console.log('Graffiti: Background setup complete.');
      },

      setRecordingTakeId: (recordingRecord) => {
        if (recordingRecord.activeTakeId === undefined ||
            state.getMovieRecordingStarted()) { // if making a new take, must create a new activeTakeId
          recordingRecord.activeTakeId = utils.generateUniqueId(); // do not set a new activeTakeId if there was already a valid one set for the movie
        }
      },

      storeRecordingInfoInCell: (isOldGraffiti) => {
        let recordingRecord, newRecording, recordingCell, recordingCellId, recordingKey;
        if (isOldGraffiti === undefined) {
          isOldGraffiti = graffiti.selectedTokens.isIntersecting;
        }
        if (isOldGraffiti) { 
          // Prepare to update existing recording
          recordingCell = graffiti.selectedTokens.recordingCell;
          recordingCellId = graffiti.selectedTokens.recordingCellId;
          recordingKey = graffiti.selectedTokens.recordingKey;
          recordingRecord = state.getManifestSingleRecording(recordingCellId, recordingKey);
          graffiti.previousActiveTakeId = recordingRecord.activeTakeId;
          graffiti.setRecordingTakeId(recordingRecord);
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
        if (graffiti.selectedTokens.noTokensPresent) {
          return;
        }
        const recordingCellInfo = state.getRecordingCellInfo();
        const recordingCell = recordingCellInfo.recordingCell;
        const cm = recordingCell.code_mirror;
        const startLoc = cm.posFromIndex(graffiti.selectedTokens.range.start);
        const endLoc = cm.posFromIndex(graffiti.selectedTokens.range.end);
        cm.setSelections([ { anchor: startLoc, head: endLoc } ]);        
        graffiti.selectedTokens = utils.findSelectionTokens(recordingCell, graffiti.tokenRanges, state);
        graffiti.highlightIntersectingGraffitiRange();
      },

      // Edit an existing graffiti, or if we are creating a new one, set up some default values.
      // If creating a new graffiti in markdown text, jump directly to the movie recording phase.
      editGraffiti: () => {
        let editableText;

        graffiti.changeActivity('graffiting');
        state.setLastEditActivityTime();
        const isNewGraffiti = !graffiti.selectedTokens.isIntersecting;
        const isOldGraffiti = !isNewGraffiti;
        const recordingRecord = graffiti.storeRecordingInfoInCell(isOldGraffiti);
        const activeCellIndex = Jupyter.notebook.get_selected_index();
        const isMarkdownCell = (recordingRecord.cellType === 'markdown');
        const isCodeCell = (recordingRecord.cellType === 'code');
        const graffitiEditCell = Jupyter.notebook.insert_cell_above('markdown');
        const editCellIndex = utils.findCellIndexByCellId(utils.getMetadataCellId(graffitiEditCell.metadata));
        Jupyter.notebook.select(editCellIndex); // cell *must* be selected before unrender() called by set_text() below will actually unrender the cell correctly.

        if (isNewGraffiti || isCodeCell || (isMarkdownCell && isOldGraffiti)) {
          utils.setMetadataCellId(graffitiEditCell.metadata,utils.generateUniqueId());
          utils.refreshCellMaps();
          state.setGraffitiEditCellId(utils.getMetadataCellId(graffitiEditCell.metadata));
        }

        if (isNewGraffiti) {
          if (isMarkdownCell) {
            // Set up some reasonable options for Graffiti in markdown. Author can, of course, opt to change these any time.
            editableText = localizer.getString('BELOW_TYPE_MARKDOWN') +
                           "%%play_on_click\n" +
                           "%%hide_player_after_playback_complete\n" +
                           "%%hide_play_button\n";
          } else {
            editableText = localizer.getString('BELOW_TYPE_MARKDOWN') +
                           graffiti.selectedTokens.allTokensString;
          }
        } else {
          // Use whatever author put into this graffiti previously
          editableText = recordingRecord.markdown; 
        }

        graffitiEditCell.set_text(editableText);
        //console.log('editor about to unrender');
        //graffitiEditCell.unrender();

        if (isCodeCell || isOldGraffiti) { 
          // For code cell graffiti or non-new markdown graffiti, let us edit the tip contents by scrolling to the edit cell
          Jupyter.notebook.scroll_to_cell(Math.max(0,activeCellIndex),500);
          const selectedCell = Jupyter.notebook.get_selected_cell();
          selectedCell.unselect();
          graffitiEditCell.select();
          graffitiEditCell.code_mirror.focus();
          graffitiEditCell.code_mirror.setSelection( { line:2, ch:0}, { line:10000, ch:10000} );
        }

        if (isMarkdownCell && isNewGraffiti) {
          // Proceed directly to recording a movie, assuming we want to persist this new graffiti (no way to cancel)
          graffiti.finishGraffiti(true).then(() => {
            graffiti.setRecordingTakeId(recordingRecord);
            // Force this function to treat this as a new movie even though we've automatically created the manifest entry.
            graffiti.beginMovieRecordingProcess(true, recordingRecord);
          });
        }
      },

      finishGraffiti: (doSave) => {
        const activity = state.getActivity();
        if (activity !== 'graffiting') {
          return;
        }

        const recordingCellInfo = state.getRecordingCellInfo();
        const recordingCell = recordingCellInfo.recordingCell;

        const editCellIndex = utils.findCellIndexByCellId(state.getGraffitiEditCellId());

        let editCellContents = '';
        if (editCellIndex !== undefined) {
          const editCell = utils.findCellByCellId(state.getGraffitiEditCellId());
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
            recording.hidePlayButton = tooltipCommands.hidePlayButton
            recording.narratorName = tooltipCommands.narratorName;
            recording.narratorPicture = tooltipCommands.narratorPicture;
            recording.stickerImageUrl = tooltipCommands.stickerImageUrl;
            recording.saveToFile = tooltipCommands.saveToFile;
            recording.terminalCommand = tooltipCommands.terminalCommand;

            state.updateUsageStats({
              type:'create',
              data: {
                createDate:   recording.createDate,
                cellId:       recordingCellInfo.recordingCellId,
                recordingKey: recordingCellInfo.recordingKey,
                numTakes:     (recording.takes === undefined ? 0 : Object.keys(recording.takes).length),
              }
            });
            
            console.log('Graffiti: finishGraffiti: we got these stats:', state.getUsageStats());

          } else { // Not saving (recording cancelled by user), so make sure we remove this record from the manifest before saving.
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

        return new Promise((resolve) => {
          utils.saveNotebook(() => {

            // need to reselect graffiti text that was selected in case it somehow got unselected
            //recordingCell.code_mirror.setSelections(recordingCellInfo.selections);
            graffiti.sitePanel.animate({ scrollTop: recordingCellInfo.scrollTop}, 500);
            if (doSave && recordingCellInfo.recordingRecord.cellType === 'markdown') {
              recordingCell.render();
            }
            graffiti.changeActivity('idle');
            recordingCell.code_mirror.focus();
            if (doSave) {
              graffiti.refreshGraffitiHighlights({cell: recordingCell, clear: false});
              graffiti.forcedGraffitiTooltipRefresh = true;
            } else {
              graffiti.refreshGraffitiHighlights({cell: recordingCell, clear: true});
            }
            graffiti.refreshGraffitiTooltipsDebounced();
            graffiti.refreshAllGraffitiSideMarkers();
            resolve();
          });
        });
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
        utils.saveNotebook(() => {
          graffiti.updateControlPanels();
        });
      },


      removeAllGraffitis: (graffitiDisabled) => {
        const manifest = state.getManifest(); // save manifest before we wipe it out
        state.setManifest({}); // clear ALL graffiti in the manifest
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
              graffiti.refreshGraffitiSideMarkers(recordingCell);
            }
          }
        }
        storage.storeManifest();
        graffiti.highlightIntersectingGraffitiRange();
        graffiti.refreshGraffitiTooltips();
        graffiti.updateControlPanels();

        if (graffitiDisabled) {
          if (Jupyter.notebook.metadata.hasOwnProperty('graffiti')) {
            storage.deleteDataDirectory(Jupyter.notebook.metadata.graffiti.id);
            storage.removeGraffitiIds();
            graffiti.changeAccessLevel('view');
            graffiti.updateSetupButton();
          }
        }

        utils.saveNotebook(() => {

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
        });

      },

      refreshAfterDeletions: (recordingCell) => {
        graffiti.highlightIntersectingGraffitiRange();
        graffiti.refreshGraffitiHighlights({cell: recordingCell, clear: true});
        graffiti.refreshGraffitiSideMarkers(recordingCell);
        graffiti.refreshGraffitiTooltips();
        graffiti.updateControlPanels();
      },

      removeGraffiti: (recordingCell, recordingKey) => {
        graffiti.removeGraffitiCore(recordingCell, recordingKey);
        if (state.removeManifestEntry(utils.getMetadataCellId(recordingCell.metadata), recordingKey)) {
          storage.storeManifest();
          graffiti.refreshAfterDeletions(recordingCell);
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

      editSkips: () => {
        state.setEditingSkips(true);
        state.setReplacingSkips(true);
        graffiti.loadAndPlayMovie('tip');
      },

      // Confirm clearing any existing skips.
      clearAllSkipsWithConfirm: () => {
        const btn1 = localizer.getString('SKIPS_DIALOG_CONFIRM_1');
        const btn2 = localizer.getString('SKIPS_DIALOG_CANCEL');
        let btns = {};
        btns[btn1] = {
          click: (e) => {
            console.log('Graffiti: You clicked ok, you want clear all skips.');
            state.clearSkipsRecords();
            graffiti.updateSkipsBar();
          }
        };
        btns[btn2] = {
          click: (e) => { 
            console.log('Graffiti: you cancelled:', $(e.target).parent()); 
          }
        };

        dialog.modal({
          title: localizer.getString('SKIPS_DIALOG_TITLE'),
          body: localizer.getString('SKIPS_DIALOG_BODY'),
          sanitize:false,
          buttons: btns
        });
      },

      removeUnusedTakes: (recordingFullId) => {
        const parts = utils.parseRecordingFullId(recordingFullId);
        const recordingCell = utils.findCellByCellId(parts.recordingCellId);
        if (recordingCell !== undefined) {
          storage.removeUnusedTakes(parts.recordingCellId, parts.recordingKey);
          graffiti.refreshAfterDeletions(recordingCell);
        }
      },

      removeAllUnusedTakes: () => {
        const manifest = state.getManifest(); // save manifest before we wipe it out
        let recording, recordingCellId, recordingCell, recordingIds, recordingKeys, deletedTakes = 0;
        for (recordingCellId of Object.keys(manifest)) {
          console.log('Graffiti: Removing unused takes from cell:', recordingCellId);
          recordingKeys = Object.keys(manifest[recordingCellId]);
          if (recordingKeys.length > 0) {
            recordingCell = utils.findCellByCellId(recordingCellId);
            for (recordingKey of recordingKeys) {
              console.log('Graffiti: Removing unused takes from recording id:', recordingKey);
              recording = manifest[recordingCellId][recordingKey];
              deletedTakes += storage.removeUnusedTakesCore(recordingCellId, recordingKey);
            }
          }
        }
        storage.storeManifest();
        graffiti.highlightIntersectingGraffitiRange();
        graffiti.refreshGraffitiTooltips();
        graffiti.updateControlPanels();

        utils.saveNotebook(() => {
          if (deletedTakes === 0) {
            deletedTakes = 'all';
          } else {
            storage.storeManifest();
            storage.cleanUpExecutorCell();
            utils.saveNotebook();
          }

          const title = 'Unused takes removed.';
          const body = 'We removed ' + deletedTakes + ' unused takes.'
          dialog.modal({
            title: title,
            body: body,
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

      removeAllUnusedTakesWithConfirmation: () => {
        dialog.modal({
          title: 'Are you sure you want to remove ALL unused takes from this notebook?',
          body: 'Note: this cannot be undone.',
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                console.log('Graffiti: You clicked ok, you want to remove unused takes.');
                graffiti.removeAllUnusedTakes();

              }
            },
            'Cancel': { click: (e) => { console.log('Graffiti: you cancelled:', $(e.target).parent()); } },
          }
        });
      },

      removeUnusedTakesWithConfirmation: (recordingFullId) => {
        dialog.modal({
          title: 'Are you sure you want to remove unused takes from this recording?',
          body: 'Note: this cannot be undone.',
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                console.log('Graffiti: You clicked ok, you want to remove unused takes.');
                graffiti.removeUnusedTakes(recordingFullId);

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
        graffiti.refreshGraffitiTooltipsDebounced();
      },

      //
      // Recording control functions
      //

      setPendingRecording: () => {
        console.log('Graffiti: Setting pending recording.');
        graffiti.changeActivity('recordingPending');
        state.restoreCellStates('selections'); // reset selections to when you clicked to begin the recording
      },

      beginMovieRecordingProcess: (isOldGraffiti, recordingRecord) => {
        // Preserve the state of all cells and selections before we begin recording so we can restore when the recording is done.
        state.storeCellStates();
        graffiti.preRecordingScrollTop = state.getScrollTop();
        state.setMovieRecordingStarted(true);
        if (recordingRecord === undefined) {
          recordingRecord = graffiti.storeRecordingInfoInCell(isOldGraffiti);
        }
        if (recordingRecord.cellType === 'markdown') {
          if (!graffiti.selectedTokens.noTokensPresent) {
            graffiti.selectedTokens.recordingCell.render();
          }
        }
        graffiti.setPendingRecording();
      },

      addCMEventsToSingleCell: (cell) => {
        graffiti.CMEvents[utils.getMetadataCellId(cell.metadata)] = true;
        const cm = cell.code_mirror;
        cm.on('focus', (cm, e) => {
          //console.log('Graffiti: CM focus:' , cm, e);
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
          let affectedCell = utils.findCellByCodeMirror(cm);
          if (affectedCell === undefined) {
            utils.refreshCellMaps();
            affectedCell = utils.findCellByCodeMirror(cm);
            console.log('Graffiti: cursorActivity handler had to refreshCellMaps twice. Should never occur!');
          }
          state.storeCellIdAffectedByActivity(utils.getMetadataCellId(affectedCell.metadata));
          state.storeHistoryRecord('selections');
          graffiti.refreshGraffitiSideMarkers(affectedCell);
        });

        cm.on('change', (cm, changeObj) => {
          //console.log('change activity:', changeObj);
          const affectedCell = utils.findCellByCodeMirror(cm);
          if (affectedCell !== undefined) {
            state.storeCellIdAffectedByActivity(utils.getMetadataCellId(affectedCell.metadata));
            state.storeHistoryRecord('contents');
            if (state.getActivity() === 'idle') {
              state.setHighlightsRefreshCellId(utils.getMetadataCellId(affectedCell.metadata));
              setTimeout(graffiti.updateRefreshableCell, 250); // set up to refresh side markers shortly after changes
            }
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
          graffiti.refreshGraffitiTooltipsDebounced();
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
          // console.log('cell select event fired, e, cell:',e, cell.cell);
          //console.log('select cell store selections');
          state.storeHistoryRecord('selectCell');
          graffiti.refreshGraffitiTooltipsDebounced();
          graffiti.updateControlPanels();
        });

        Jupyter.notebook.events.on('create.Cell', (e, results) => {
          //console.log('create.Cell fired');
          //console.log(results);
          const newCell = results.cell;
          const newCellIndex = results.index;
          let newCellId;
          if (utils.getMetadataCellId(newCell.metadata) === undefined) { 
            // Do not assign a graffiti id if we already have one. This may happen when applyCellListToNotebook is reinserting cells from the history
            // and has set the new cell's id to the value of a historical cell's id.
            newCellId = utils.setMetadataCellId(newCell.metadata,utils.generateUniqueId());
          } else {
            newCellId = utils.getMetadataCellId(newCell.metadata);
          }
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
              terminalLib.removeTerminal(deletedCellId);
            }
          }
          state.storeHistoryRecord('contents');
        });

        Jupyter.notebook.events.on('finished_execute.CodeCell', (e, results) => {
          //console.log('Graffiti: Finished execution event fired, e, results:',e, results);
          utils.refreshCellMaps();
          state.storeHistoryRecord('contents');
          graffiti.resizeCanvases();
          graffiti.redrawAllDrawingsWhenRecording(); // need to do this because resizeCanvases erases all canvases
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
          if ((activity === 'graffiting') &&
              (utils.getMetadataCellId(results.cell.metadata) === state.getGraffitiEditCellId())) {
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
          // console.log('Graffiti: Kernel shell reply event fired, e, results:',e, results);
          utils.refreshCellMaps();
          const activity = state.getActivity();
          if (activity === 'idle') {
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
        state.storeTerminalsContentsInHistory();
        state.setSpeakingStatus(false); // if we were still speaking, record a history record that will terminate that state during playback.
        state.finalizeHistory();
        state.finalizeSkipRecords();
        state.addCancelTimeSkipRecord();
        if (useCallback) {
          state.dumpHistory();
        }
        state.clearAnimationIntervals();

        // This will use the callback defined in setAudioStorageCallback to actually persist the
        // whole recording, if useCallback (passed in to this fn) is true.
        audio.stopRecording();
        console.log('Graffiti: stopRecordingCore is refreshing.');
        state.restoreCellStates('contents');
        graffiti.updateAllGraffitiDisplays();
        graffiti.wipeAllStickerDomCanvases();
        graffiti.resetStickerCanvases();
        graffiti.deactivateAllPens();
        graffiti.removeCellsAddedByPlaybackOrRecording();
        graffiti.hideLabelInputBoxes();
        state.restoreCellStates('selections');
        state.restoreLineNumbersStates();
        graffiti.sitePanel.animate({ scrollTop: graffiti.preRecordingScrollTop }, 750);
        graffiti.selectIntersectingGraffitiRange();
        state.deleteTrackingArrays();
        state.clearDisplayedTipInfo();
        terminalLib.saveOrRestoreTerminalOutputs('restore');
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
          // utils.saveNotebook( () => { console.log('Graffiti: cancelled recording.') });;
        }
      },

      toggleRecording: () => {
        const currentActivity = state.getActivity();
        if (currentActivity !== 'playing') {
          if (currentActivity === 'recording') {

            //
            // End movie recording.
            //

            console.log('Graffiti: Now ending movie recording');
            state.blockRecording(); // this is here because a race condition can happen right at the end of recording
            state.resetSkipStatus();
            graffiti.setNotifier(localizer.getString('PLEASE_WAIT_STORING_MOVIE'));
            graffiti.showControlPanels(['graffiti-notifier']);
            graffiti.showSavingScrim();
            storage.setMovieCompleteCallback(graffiti.hideSavingScrim);
            graffiti.stopRecordingCore(true);
            state.unblockRecording();
            graffiti.clearJupyterMenuHint();
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

            terminalLib.saveOrRestoreTerminalOutputs('save');
            state.resetPlayState();
            graffiti.changeActivity('recording');
            graffiti.clearSkipKeyDownTimer();
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

            state.startAnimationInterval('recording',
                                         () => {
                                           //console.log('Moving recording time ahead');
                                           if (graffiti.runOnceOnNextRecordingTick !== undefined) {
                                             graffiti.runOnceOnNextRecordingTick();
                                             graffiti.runOnceOnNextRecordingTick = undefined;
                                           }
                                           graffiti.updateTimeDisplay(state.getTimeRecordedSoFar());
                                           graffiti.updateDrawingOpacity();
                                         },
                                         graffiti.recordingIntervalMs);

            // Flash a red recording bullet while recording is ongoing, every second. 
            state.startAnimationInterval('recordingIndicator',
                                         () => {
                                           if (state.getTimeRecordedSoFar() % 2000 > 1000) {
                                             $('#graffiti-recording-flash-icon').css({background:'rgb(245,245,245)'});
                                           } else {
                                             $('#graffiti-recording-flash-icon').css({background:'rgb(255,0,0)'});
                                           }
                                         },
                                         graffiti.recordingIntervalMs);
            
            console.log('Graffiti: Started recording');
          }
        }
      },

      endRecordingByKeyPress: () => {
        const activity = state.getActivity();
        if (activity === 'recording') {
          graffiti.toggleRecording();
        } else if (activity === 'recordingPending') {
          graffiti.changeActivity('idle');
          graffiti.clearJupyterMenuHint();
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
        //console.log('applyScrollNudge, useTrailingVelocity:', useTrailingVelocity);
        const clientHeight = document.documentElement.clientHeight;
        const topbarHeight = $('#header').height();
        //const bufferY = clientHeight / 9;
        const bufferY = clientHeight / 6;
        const minAllowedCursorY = topbarHeight + bufferY;
        const maxAverageVelocity = 0.5;
        const minBottomBufferY = 150; // approximately 1.5x the height of bottom bar in udacity classroom
        const maxAllowedCursorY = clientHeight - Math.max(bufferY, minBottomBufferY);
        let mustNudgeCheck = !useTrailingVelocity;
        let nudgeIncrements = graffiti.scrollNudgeQuickIncrements;
        
        // Watch trailing average of cursor. If the average over twenty samples is in a nudge zone, then nudge
        if (useTrailingVelocity) {
          nudgeIncrements = ((state.getActivity === 'scrubbing') ? 1.0 : graffiti.scrollNudgeSmoothIncrements);
          //const trailingAverageSize = 85;
          const trailingAverageSize = 10;
          if (graffiti.scrollNudgeAverages.length > 0) {
            if (((graffiti.scrollNudgeAverages[graffiti.scrollNudgeAverages.length-1].x === position.x) &&
                 (graffiti.scrollNudgeAverages[graffiti.scrollNudgeAverages.length-1].y === position.y)) ||
                (graffiti.scrollNudgeAverages[graffiti.scrollNudgeAverages.length-1].t === record.startTime)) {
              return; // cursor didn't move or time didn't change, dont record velocity
            }
          }
          if (record.inTopBarArea !== undefined && record.inTopBarArea) {
            //console.log('Ignoring cursor activity recorded above the site panel');
            return; // ignore the cursor when it is above the site panel
          }
          graffiti.scrollNudgeAverages.push({t:record.startTime, pos: { x: position.x, y: position.y }});
          if (graffiti.scrollNudgeAverages.length > trailingAverageSize) {
            graffiti.scrollNudgeAverages.shift();
            let velocities = [], distance, timeDiff;
            for (let i = 1; i < graffiti.scrollNudgeAverages.length; ++i) {
              // This is highly mathematically inefficient but maybe in this scale of things, it's ok.
              distance =
                Math.sqrt(
                  Math.pow((graffiti.scrollNudgeAverages[i].pos.y - graffiti.scrollNudgeAverages[i-1].pos.y),2) +
                  Math.pow((graffiti.scrollNudgeAverages[i].pos.x - graffiti.scrollNudgeAverages[i-1].pos.x),2) );
              timeDiff = graffiti.scrollNudgeAverages[i].t - graffiti.scrollNudgeAverages[i-1].t;
              velocities.push(distance / timeDiff );
            }
            const averageVelocity = Math.abs(utils.computeArrayAverage(velocities));
            //console.log('averageVelocity:', averageVelocity);
            mustNudgeCheck = mustNudgeCheck || (averageVelocity < maxAverageVelocity);
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
            //console.log('nudging:', graffiti.scrollNudge.amount);
          } else {
            //console.log('not nudging, y', position.y, 'maxY', maxAllowedCursorY);
          }
        }
      },

      applyScrollNudgeAtCell: (cell, record, selChange) => {
        const cellId = utils.getMetadataCellId(cell.metadata);
        const cellRects = utils.getCellRects(cell);
        let selectionRecord, selections;
        if (record.cellsSelections !== undefined) {
          selectionRecord = record.cellsSelections[cellId];
        }
        if (selectionRecord !== undefined) {
          selections = selectionRecord.selections;
        } else {
          const code_mirror = cell.code_mirror;
          selections = code_mirror.listSelections();
        }

        if (selections.length !== 0) {
          const cellOffsetY = selections[0].head.line * (graffiti.cmLineHeight + graffiti.cmLineFudge);
          const offsetPosition = {
            x: cellRects.innerCellRect.left, 
            y: cellOffsetY + cellRects.innerCellRect.top
          }
          //console.log('applyScrollNudgeAtCell:offsetPosition:', offsetPosition, 'cellId', cellId, 'selChange', selChange);
          graffiti.applyScrollNudge(offsetPosition, record, false);
        }
      },

      calculateMappedScrollDiff: (record) => {
        const currentNotebookPanelHeight = graffiti.notebookPanel.height();
        let mappedScrollDiff = 0;
        if (record !== undefined) {          
          mappedScrollDiff = (record.scrollDiff / record.notebookPanelHeight) * currentNotebookPanelHeight;
        }
        return mappedScrollDiff;
      },

      doScrollNudging: (record, viewIndex) => {
        const currentScrollTop = graffiti.sitePanel.scrollTop();
        let newScrollTop = currentScrollTop;
        mappedScrollDiff = graffiti.calculateMappedScrollDiff(record);
        if (graffiti.scrollNudge !== undefined) {
          //console.log('updateDisplay, nudgeAmount:', graffiti.scrollNudge.amount, 'counter:', graffiti.scrollNudge.counter);
          if (graffiti.scrollNudge !== undefined) {
            let scrollNudgeAmount = 0;
            graffiti.scrollNudge.counter--;
            if (graffiti.scrollNudge.counter > 0) {
              scrollNudgeAmount = graffiti.scrollNudge.amount;
              //console.log('Going to nudge scroll by:', scrollNudgeAmount, 'counter:', graffiti.scrollNudge.counter);
              newScrollTop = currentScrollTop + scrollNudgeAmount;
            } else {
              graffiti.scrollNudge = undefined; // stop nudging
            }
          }
        }
        // Only apply a user-recorded scroll diff if we haven't applied it already. When this function is called with no parameters, then
        // it is only doing "maintenance nudging", ie over-time nudging to keep the most important zones of interest in the viewport.
        // console.log('Now applying mappedScrollDiff:', mappedScrollDiff);
        const skipMappedScrollDiff = (viewIndex !== undefined) &&
                                      (graffiti.lastScrollViewId !== undefined && graffiti.lastScrollViewId === viewIndex);
        //console.log('skipMappedScrollDiff', skipMappedScrollDiff);
        if (!skipMappedScrollDiff) {
          newScrollTop += mappedScrollDiff;
          graffiti.lastScrollViewId = viewIndex;
        }

        graffiti.setSitePanelScrollTop(newScrollTop);
      },

      updateDrawingCore: (record) => {
        //console.log('updateDrawingCore:', record);
        record.hoverCell = utils.findCellByCellId(record.cellId);

        switch (record.drawingActivity) {
          case 'draw':
            graffiti.placeCanvas(record.cellId, record.pen.permanence);
            graffiti.setCanvasStyle(record.cellId, record.pen.type, record.pen.dash, record.pen.color, record.pen.permanence);
            // console.log('inPromptArea:', record.pen.inPromptArea, 'downInMarkdown:', record.pen.downInMarkdown );
            const positions = graffiti.processPositionsForCellTypeScaling(record, 'positions');
            graffiti.updateDrawingDisplay(record.cellId, 
                                          positions.start.x, 
                                          positions.start.y,
                                          positions.end.x, 
                                          positions.end.y,
                                          record.pen.type,
                                          record.pen.permanence);
            break;
          case 'sticker':
            graffiti.drawStickersForCell(record.cellId, record);
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
        const startIndex = ((drawingFrameIndex.rangeStart === undefined) ? drawingFrameIndex.index : drawingFrameIndex.rangeStart);
        const endIndex = drawingFrameIndex.index;
        let index, record;
        for (index = startIndex; index <= endIndex; ++index) {
          record = state.getHistoryItem('drawings', index);
          graffiti.updateDrawingCore(record);
        }
      },

      updatePointer: (record) => {
        if (record.hoverCell !== undefined) {
          const offsetPositionScaled = graffiti.processPositionsForCellTypeScaling(record, 'cursor');
          const cellRects = utils.getCellRects(record.hoverCell);        
          const offsetPosition = { x: cellRects.cellRect.left + offsetPositionScaled.start.x - graffiti.halfBullseye,
                                   y: cellRects.cellRect.top + offsetPositionScaled.start.y - graffiti.halfBullseye
          };
          graffiti.applyScrollNudge(offsetPosition, record, true);

          const lastPosition = state.getLastRecordedCursorPosition();
          if ((offsetPosition.x !== lastPosition.x) || (offsetPosition.y !== lastPosition.y)) {
            // Show cursor whenever it's moved by user
            //console.log('Showing cursor:', offsetPosition, lastPosition);
            graffiti.undimGraffitiCursor();
            const offsetPositionPx = { left: offsetPosition.x + 'px', top: offsetPosition.y + 'px'};
            graffiti.graffitiCursorShell.css(offsetPositionPx);
            const hoverCellId = record.cellId;
            if (terminalLib.isTerminalCell(hoverCellId)) {
              graffiti.activateTerminalGraffitiCursor();
            } else {
              graffiti.activateNormalGraffitiCursor();
            }
          }            
          state.setLastRecordedCursorPosition(offsetPosition);
        }
      },

      updateView: (viewIndex) => {
        //console.log('updateView, viewIndex:', viewIndex);
        let record = state.getHistoryItem('view', viewIndex);
        record.hoverCell = utils.findCellByCellId(record.cellId);

        // Make sure the hoverCell shows line numbers if they were visible during recording; otherwise all registration will be off
        // by the width of the line number gutter.
        if (record.hoverCell !== undefined) { // make sure we were actually hovering over a cell before we try to tweak the gutter.
          if (record.hasOwnProperty('lineNumbersVisible')) { // some early recordings won't have this property
            const cm = record.hoverCell.code_mirror;
            const currentlyVisible = cm.options.lineNumbers;
            if (record.lineNumbersVisible != cm.options.lineNumbers) {
              record.hoverCell.toggle_line_numbers();
            }
          }
        }

        // Select whatever cell is currently selected
        if (record.selectedCellId !== undefined) {
          const selectedCellIndex = utils.findCellIndexByCellId(record.selectedCellId); // we should use a map to speed this up
          //console.log('about to select index:', selectedCellIndex, record.selectedCellId)
          Jupyter.notebook.select(selectedCellIndex);
        }

        // Handle pointer updates and canvas updates, as well as cell focus changes
        if (record.subType === 'pointer') {
          //console.log('pointerUpdate is true, record:', record);
          graffiti.updatePointer(record);
        } else {
          //if (record.subType === 'selectCell') {
          //  console.log('record', record);
          //}
          graffiti.dimGraffitiCursor();
          if (record.selectedCell !== undefined) {
            if ((record.subType === 'focus') || (record.subType === 'selectCell')) {
              //console.log('processing focus/selectCell, record:', record);
              const selectedCell = utils.findCellByCellId(record.selectedCellId);
              if (selectedCell !== undefined) {
                if (utils.getMetadataCellId(record.selectedCell.metadata) === utils.getMetadataCellId(record.hoverCell.metadata)) {
                  selectedCell.focus_cell();
                  if (record.subType === 'focus') {
                    const code_mirror = selectedCell.code_mirror;
                    if (!code_mirror.state.focused) {
                      code_mirror.focus();
                    }
                    code_mirror.getInputField().focus();
                  }
                }
              }
            }
          }
        }

        if (record.hoverCell !== undefined) {
          const cm = record.hoverCell.code_mirror;
          // Update innerScroll if required
          cm.scrollTo(record.innerScroll.left, record.innerScroll.top);
          //console.log('updateView is calling doScrollNudging');
          graffiti.doScrollNudging(record, viewIndex);
        }
      },

      updateCellSelections: (cell,cm, selections) => {
        const currentScrollTop = graffiti.sitePanel.scrollTop();
        cm.setSelections(selections);
        utils.refreshCodeMirrorSelection(cell);
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
            // active = selectionRecord.active;
            cell = utils.findCellByCellId(cellId);
            if (cell !== undefined) {
              code_mirror = cell.code_mirror;
              currentSelections = utils.cleanSelectionRecords(code_mirror.listSelections());
              //console.log('cellId, selections, currentSelections, subType:', cellId, selections, currentSelections, record.subType);

              if (!(_.isEqual(selections,currentSelections))) {
                graffiti.dimGraffitiCursor();

                graffiti.updateCellSelections(cell,code_mirror, selections);

                //console.log('nudge check, cellId', cellId, 'code_mirror.state.focused',code_mirror.state.focused);
                
                if (code_mirror.state.focused) {
                  // If we made a selections update this frame, AND we are focused in it,
                  // make sure that we keep it in view. We need to compute the
                  // offset position of the *head* of the selection where the action is.
                  // console.log('setting selections with selections:', selections);
                  graffiti.applyScrollNudgeAtCell(cell, record, true);
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
          for (let cellId of cellAdditions) {
            deleteCellIndex = utils.findCellIndexByCellId(cellId);
            if (deleteCellIndex !== undefined) {
              //console.log('Going to delete:', cellId, 'at index:', deleteCellIndex);
              Jupyter.notebook.delete_cell(deleteCellIndex);
              utils.refreshCellMaps();
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
        let deletableCellId;
        if (numCellsPresent > 0) {
          // First figure out which cells are extra and need to be deleted on this cell
          let deleteCellId, deleteCellIndex;
          const cellAdditions = state.getCellAdditions(); // all cells added during this recording
          const cellAdditionsIds = Object.values(cellAdditions);
          // Any cells that may have been added during the movie, not present in this timeframe, must be deleted.
          const deletableCellIds = _.difference(cellAdditionsIds, cellsPresentIds); 
          //console.log('deletableCellIds', deletableCellIds, cellAdditions, cellsPresentIds);
          for (deletableCellId of deletableCellIds) {
            // console.log('Graffiti: Trying to delete cellid:', deletableCellId);
            deleteCellIndex = utils.findCellIndexByCellId(deletableCellId);
            if (deleteCellIndex !== undefined) {
              //console.log('Going to delete:', deleteCellId, 'at index:', deleteCellIndex);
              Jupyter.notebook.delete_cell(deleteCellIndex);
            }
          }

          // Now figure out which cells are missing and need to be added in. Add them in above whatever position 
          // they were recorded in, or right after the last present cell (whichever is greater), to try to match
          // its position from the recording time. This works ok because usually content creators will add a 
          // cell after another specific cell.
          let i, checkCellId, foundCell, newCell, cellPosition, previousCellPosition, previousPlusOne;
          for (i = 0; i < cellsPresentIds.length; ++i) {
            checkCellId = cellsPresentIds[i];
            foundCell = utils.findCellByCellId(checkCellId);
            if (foundCell === undefined) {
              cellPosition = cellsPresentThisFrame[checkCellId];
              if (i > 0) {
                previousCellPosition = utils.findCellIndexByCellId(cellsPresentIds[i - 1]);
                previousPlusOne = previousCellPosition + 1;
                if (previousPlusOne > cellPosition) {
                  cellPosition = previousPlusOne;
                }
              }              
              newCell = Jupyter.notebook.insert_cell_above('code', cellPosition);
              utils.setMetadataCellId(newCell.metadata, checkCellId);
              state.storePlaybackCellAddition(checkCellId, cellPosition);
              mustRefreshCellMaps = true;
              console.log('Graffiti: Just inserted new cell, cellId:', checkCellId, 'at position', cellPosition);
              // This causes excessive scrolling and isn't really necessary if the author moves the cursor to a new cell anyway
              // graffiti.applyScrollNudgeAtCell(newCell, record, false);
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
        let cellId, contents, outputs, frameContents, frameOutputs, renderedFrameOutput = false;
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
              renderedFrameOutput = renderedFrameOutput || state.restoreCellOutputs(cell, frameOutputs);
            }
          }
        }
        graffiti.setSitePanelScrollTop(currentScrollTop); // restore scrollTop because changing selections messes with it
        if (renderedFrameOutput) {
          graffiti.resizeCanvases();
          graffiti.redrawAllDrawings();
        }
      },

      updateTerminals: (index) => {
        const record = state.getHistoryItem('terminals', index);
        const termRecords = record.terminals;
        let focusedTerminal = undefined;
        if (termRecords !== undefined) {
          const terminalsContents = state.getHistoryTerminalsContents();
          for (let i = 0; i < termRecords.length; ++i) {
            terminalLib.setTerminalContents($.extend(true, termRecords[i], { 
              incremental: (state.getActivity() === 'playing'), 
              terminalsContents: terminalsContents,
            }));
            if (termRecords[i].isFocused) {
              focusedTerminal = termRecords[i].id;
            }
          }
        }
        terminalLib.focusTerminal(focusedTerminal);        
      },

      updateSpeaking: (index) => {
        const record = state.getHistoryItem('speaking', index);
        //console.log('Processing speaking record', index, record);
        if (state.scanningIsOn()) {
          if (record.speaking) {
            console.log('Begun speaking.');
            state.setCurrentPlaySpeed('scanInactive');
            state.setSpeakingStatus(true);
          } else {
            console.log('Stopped speaking.');
            state.setCurrentPlaySpeed('scanActive');
            state.setSpeakingStatus(false);
          }
//          console.log('playTimes:regular', state.playTimes['regular'].total,
//                      'scanActive:',  state.playTimes['scanActive'].total, 
//                      'scanInactive', state.playTimes['scanInactive'].total);
          audio.updateAudioPlaybackRate();
        }
      },

      updateDisplay: (frameIndexes) => {
        const currentScrollTop = graffiti.sitePanel.scrollTop();
        if (state.shouldUpdateDisplay('contents', frameIndexes.contents)) {
          graffiti.updateContents(frameIndexes.contents.index, currentScrollTop);
        }
        if (state.shouldUpdateDisplay('selections', frameIndexes.selections)) {
          graffiti.updateSelections(frameIndexes.selections.index, currentScrollTop);
        }
        if (state.shouldUpdateDisplay('drawings', frameIndexes.drawings)) {
          if (state.getActivity() !== 'scrubbing') {
            // console.log('calling updateDrawings from updateDisplay');
            graffiti.updateDrawings(frameIndexes.drawings);
          }
        }
        if (state.shouldUpdateDisplay('terminals', frameIndexes.terminals)) {
          graffiti.updateTerminals(frameIndexes.terminals.index);
        }
        if (state.shouldUpdateDisplay('speaking', frameIndexes.speaking)) {
          //console.log(state.history.processed);
          graffiti.updateSpeaking(frameIndexes.speaking.index);
        }
        if (state.shouldUpdateDisplay('view', frameIndexes.view)) {
          graffiti.updateView(frameIndexes.view.index);
          //console.log('updated view:', frameIndexes.view.index, 'currentScrollTop', currentScrollTop, 'new scrollTop', graffiti.sitePanel.scrollTop());
        }

      },

      // update the timer display for play or recording
      updateTimeDisplay: (playedSoFar) => {
        const activity = state.getActivity();
        const playTimeDisplay = utils.formatTime(playedSoFar, { includeMillis: false });
        const recordingTimeDisplay = utils.formatTime(playedSoFar, { includeMillis: true });
        const durationDisplay = utils.formatTime(state.getHistoryDuration(), { includeMillis: false });
        let totalTimeDisplay;
        if ((activity === 'recording') || state.getEditingSkips()) {
          totalTimeDisplay = recordingTimeDisplay;
        } else {
          totalTimeDisplay = playTimeDisplay + '/' + durationDisplay;
        }
        const recorderTimeElem = (activity === 'recording' ? $('#graffiti-time-display-recording') : $('#graffiti-time-display-playback'));
        recorderTimeElem.text(totalTimeDisplay);
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

      // When jumping around, or if we reached the end of playback and the next playback will reset to beginning, then we may need to attempt to recalculate 
      // and apply the raw scrollTop (excluding any nudging, so it's approximate).
      applyRawCalculatedScrollTop: (viewIndex) => {
        let record, i, calculatedScrollTop = graffiti.prePlaybackScrolltop;
        for (i = 0; i < viewIndex; ++i) {
          record = state.getHistoryItem('view', i);
          calculatedScrollTop += graffiti.calculateMappedScrollDiff(record);
        }
        graffiti.sitePanel.scrollTop(calculatedScrollTop);
      },

      // Skip around by X seconds forward or back.
      jumpPlayback: (direction, jumpAmount) => {
        const previousPlayState = state.getActivity();
        graffiti.pausePlayback();
        const timeElapsed = state.getTimePlayedSoFar();
        //console.log('jumpPlayback timeElapsed',timeElapsed);
        let t, frameIndexes;
        if (state.scanningIsOn()) {
          t = state.findSpeakingStartNearestTime(timeElapsed,direction, jumpAmount);
        } else {
          t = Math.max(0, Math.min(timeElapsed + (jumpAmount * 1000 * direction * state.getPlayRateScalar()), state.getHistoryDuration() - 1 ));
        }
        // console.log('Graffiti: t:', t);
        state.resetPlayTimes(t);
        frameIndexes = state.getHistoryRecordsAtTime(t);
        state.clearSetupForReset();
        state.resetProcessedArrays();
        graffiti.wipeAllStickerDomCanvases();
        graffiti.updateDisplay(frameIndexes);
        graffiti.updateSlider(t);
        graffiti.updateTimeDisplay(t);
        graffiti.updateSkipsBar();
        graffiti.redrawAllDrawings(t);
        if (previousPlayState === 'playing') {
          graffiti.startPlayback();
        }
        graffiti.updateAllGraffitiDisplays();
        graffiti.applyRawCalculatedScrollTop(frameIndexes.view.index);
      },

      handleSliderDrag: () => {
        // Handle slider drag
        const target = $('#graffiti-recorder-range');
        const timeLocation = target.val() / 1000;
        //console.log('handleSliderDrag, slider value:', target.val());
        const t = Math.min(state.getHistoryDuration() * timeLocation, state.getHistoryDuration() - 1);
        // Now we need to set the time we are going to start with if we play from here.
        state.resetPlayTimes(t);
        state.clearSetupForReset();
        state.resetProcessedArrays();
        graffiti.undimGraffitiCursor();
        const frameIndexes = state.getHistoryRecordsAtTime(t);
        graffiti.wipeAllStickerDomCanvases();
        graffiti.updateDisplay(frameIndexes); // can replay scroll diffs, and in playback use cumulative scroll diff
        graffiti.updateTimeDisplay(t);
        graffiti.updateSkipsBar();
        graffiti.redrawAllDrawings(t);
        graffiti.applyRawCalculatedScrollTop(frameIndexes.view.index);
      },

      handleTerminalsEvents: (event) => {
        if (state.getActivity() === 'recording') {
          // If we are recording, we need to record latest terminal output for replay
          //console.log('Terminal output event:', event.data.portion);
          state.storeTerminalsState([event]);
          state.storeHistoryRecord('terminals');
        }
      },

      pausePlaybackNoVisualUpdates: () => {
        if (state.getActivity() === 'playing') {
          graffiti.changeActivity('playbackPaused');
          audio.pausePlayback();
          //console.log('Graffiti: pausePlaybackNoVisualUpdates');
          state.setPlayTimeEnd();
          // Make sure, if some markdown was selected, that the active code_mirror textarea reengages to get keystrokes.
          graffiti.updateSelectedCellSelections(graffiti.sitePanel.scrollTop()); 
          state.updateUsageStats({
            type:'play',
            data: {
              actions: ['updateCurrentPlayTime']
            }
          });
        }
      },

      // Pause any ongoing playback
      pausePlayback: () => {
        if (state.getActivity() !== 'playing')
          return;

        graffiti.pausePlaybackNoVisualUpdates();

        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltips();
        state.clearAnimationIntervals();
        utils.saveNotebook(() => {
          console.log('Graffiti: Stopped playback.');
        });
      },

      cancelPlaybackNoVisualUpdates: () => {
        const accessLevel = state.getAccessLevel();
        graffiti.pausePlaybackNoVisualUpdates();
        state.updateUsageStats({
          type:'play',
          data: {
            actions: ['updateTotalPlayTime']
          }
        });
        state.resetPlayState();
        graffiti.changeActivity('idle');
        if (state.getDontRestoreCellContentsAfterPlayback()) {
          console.log('Graffiti: not restoring cell contents.');
        } else {
          graffiti.removeCellsAddedByPlaybackOrRecording();
          state.restoreCellStates('contents');
          state.restoreCellStates('selections');
          state.restoreLineNumbersStates();
        }
        state.setDontRestoreCellContentsAfterPlayback(false); // make sure by default we restore contents.
        terminalLib.saveOrRestoreTerminalOutputs('restore');  // restore any terminals affected by playback
        utils.saveNotebook();
        console.log('Graffiti: Got these stats:', state.getUsageStats());
      },

      cancelPlaybackFinish: (cancelAnimation) => {
        graffiti.resetStickerCanvases();
        graffiti.cancelRapidPlay();
        graffiti.graffitiCursorShell.hide();
        graffiti.clearCanvases('all');
        graffiti.refreshAllGraffitiHighlights();
        graffiti.refreshGraffitiTooltips(); 
        graffiti.updateControlPanels();
        graffiti.highlightIntersectingGraffitiRange();
        graffiti.clearJupyterMenuHint();

        if (cancelAnimation) {
          graffiti.sitePanel.animate({ scrollTop: graffiti.prePlaybackScrolltop }, 750);
        }
      },

      cancelPlayback: (opts) => {
        console.log('Graffiti: cancelPlayback called');
        const activity = state.getActivity();
        if ((activity !== 'playing') && (activity !== 'playbackPaused') && (activity !== 'scrubbing')) {
          return;
        }

        console.log('Graffiti: Cancelling playback');
        graffiti.cancelPlaybackNoVisualUpdates();
        state.clearAnimationIntervals();
        state.clearNarratorInfo();
        graffiti.cancelPlaybackFinish(opts.cancelAnimation);

/*
        if (state.getEditingSkips()) {
          const skippedMovie = state.getPlayableMovie('tip');
          storage.writeOutMovieData(skippedMovie, state.getJSONHistory()).then(() => {
            state.setEditingSkips(false);
            graffiti.cancelPlaybackFinish(opts.cancelAnimation);
          });
        } else {
          graffiti.cancelPlaybackFinish(opts.cancelAnimation);
        }
*/
      },

      startPlayback: () => {
        // Start playback
        const activity = state.getActivity();
        // Prevent playing while playing already. Not sure how this occurs so trapping for it here
        if (activity === 'playing') {
          console.trace('Cannot start playing because already playing.');
          return;
        }

        console.log('Graffiti: Starting playback, current activity:', activity);
        if ((activity === 'idle') || (activity === 'notifying') || (activity === 'playbackPending')) {
          // If just starting to play back, store all cells current contents so we can restore them when you cancel playback.
          // utils.saveNotebook();
          state.setScrollTop(graffiti.sitePanel.scrollTop());
          state.setCurrentPlaySpeed('regular');
          state.setSpeakingStatus(false);
          terminalLib.clearTerminalsContentsPositions();
          state.resetPlayTimes();
          graffiti.updateSlider(0);
          graffiti.prePlaybackScrolltop = state.getScrollTop();
          graffiti.lastScrollViewId = undefined;
          graffiti.lastDrawIndex = undefined;
          graffiti.lastDrawingEraseIndex = undefined;
          state.storeCellStates();
          state.clearCellOutputsSent();
          terminalLib.saveOrRestoreTerminalOutputs('save');
          graffiti.scrollNudgeAverages = [];
          graffiti.setJupyterMenuHint(localizer.getString('PRESS_ESC_TO_END_MOVIE_PLAYBACK'));
          const stickerImageCandidateUrl = state.getStickerImageCandidateUrl();
          if (stickerImageCandidateUrl !== undefined) {
            state.setStickerImageUrl(stickerImageCandidateUrl);
          } else {
            state.setStickerImageUrl(undefined);
          }
          if (state.getEditingSkips()) {
            graffiti.updateSkipsBar();
          }
        }

        if ((activity === 'idle') || (activity === 'notifying') || (activity === 'playbackPaused') || (activity === 'playbackPending')) {
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
          graffiti.removeCellsAddedByPlaybackOrRecording();
          graffiti.applyRawCalculatedScrollTop(0);
        }

        if (state.getCurrentPlaySpeed() === 'scan') {
          state.setPlayTimeBegin('regular'); // all scanning playback starts at regular playback speed initially until speaking starts and ends
        }

        state.setPlaybackStartTime(utils.getNow() - state.getTimePlayedSoFar());
        state.setPlayStartTimeToNow();

        if (!state.getMute()) {
          audio.startPlayback(state.getTimePlayedSoFar());
        }

        // Set up main playback loop
        state.startAnimationInterval('playback',        
                                     () => {
                                       //console.log('Moving playback time ahead.');
                                       const playedSoFar = state.getTimePlayedSoFar();
                                       const endOfPlayableTime = state.getHistoryDuration();
                                       if (playedSoFar >= endOfPlayableTime) {
                                         // reached end of recording naturally, so set up for restart on next press of play button
                                         //console.log('end of recording reached, playedSoFar:', playedSoFar, 'duration', state.getHistoryDuration());
                                         state.setupForReset();
                                         graffiti.togglePlayback();
                                       } else {
                                         graffiti.updateSlider(playedSoFar);
                                         graffiti.updateTimeDisplay(playedSoFar);
                                         const frameIndexes = state.getHistoryRecordsAtTime(playedSoFar);
                                         graffiti.updateDisplay(frameIndexes);
                                         //console.log('play interval, now=', utils.getNow());
                                       }
                                     },
                                     graffiti.playbackIntervalMs);
      },

      togglePlayback: () => {
        const activity = state.getActivity();
        if (activity !== 'recording') {
          if (activity === 'playing') {
            state.clearAnimationIntervals();
            if (state.getHidePlayerAfterPlayback() && state.getSetupForReset() && (!state.getEditingSkips())) {
              graffiti.cancelPlayback({ cancelAnimation: true});
            } else {
              graffiti.pausePlayback();
              //console.log('total play time:', utils.getNow() - playStartedAt);
            }
          } else {
            graffiti.startPlayback();
            playStartedAt = utils.getNow();
            //console.log('started playback at:', playStartedAt);
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
        console.log('Graffiti: playMovieViaUserClick starts.');
        const activity = state.getActivity();
        if (activity === 'playbackPending') {
          console.log('Graffiti: not playing movie via user click because another movie is pending.');
          return; // prevent rapid clicks on graffiti where play_to_click is active.
        }
        graffiti.cancelPlayback({cancelAnimation:false});
        graffiti.changeActivity('playbackPending');
        const playableMovie = state.getPlayableMovie('tip');
        if (playableMovie === undefined) {
          console.log('Graffiti: no playable movie known.');
          return;
        }
        //console.log('playableMovie', playableMovie);
        if (state.getDontRestoreCellContentsAfterPlayback()) {
          // If this movie is set to NOT restore cell contents, give the user a chance to opt-out of playback.
          const dialogContent = localizer.getString('REPLACE_CONFIRM_BODY_1');
          const modalButtons = {};
          modalButtons[localizer.getString('REPLACE_CONFIRM_BODY_2')] = 
            {
              click: (e) => {
                console.log('Graffiti: you want to preserve cell contents after playback.');
                // Must restore playable movie values because jupyter dialog causes the tip to hide, which clears the playableMovie
                state.setPlayableMovie('tip', playableMovie.recordingCellId, playableMovie.recordingKey);
                state.setDontRestoreCellContentsAfterPlayback(false);
                graffiti.loadAndPlayMovie('tip');
              }
            };
          modalButtons[localizer.getString('REPLACE_CONFIRM_BODY_3')] =
            { 
              click: (e) => { 
                // Must restore playable movie values because jupyter dialog causes the tip to hide, which clears the playableMovie
                state.setPlayableMovie('tip', playableMovie.recordingCellId, playableMovie.recordingKey);
                state.setDontRestoreCellContentsAfterPlayback(true);
                graffiti.loadAndPlayMovie('tip'); 
              }
            };
          const confirmModal = dialog.modal({
            title: localizer.getString('PLAY_CONFIRM'),
            body: dialogContent,
            sanitize:false,
            buttons: modalButtons,
          });
          confirmModal.on('hidden.bs.modal', (e) => { 
            console.log('Graffiti: escaped the dontRestoreCellContents modal.');
          });
        } else {
          graffiti.loadAndPlayMovie('tip');
        }
      },

      executeSaveToFileDirectives: (recording) => {
        if (recording.saveToFile !== undefined) {
          if (recording.saveToFile.length > 0) {
            let saveToFileEntry, fileContents, cell;
            // Loop over all directives and save all files.
            for (let i = 0; i < recording.saveToFile.length; ++i) {
              saveToFileEntry = recording.saveToFile[i];
              cell = utils.findCellByCellId(saveToFileEntry.cellId);
              if (cell !== undefined) {
                fileContents = cell.get_text();
                storage.writeTextToFile({ path: saveToFileEntry.path, 
                                          contents: fileContents,
                                          stripCRs: false });
              }
            }
            storage.cleanUpExecutorCell();
          }
        }
      },

      cleanupAfterLoadAndPlayDidNotPlay: () => {
        graffiti.clearJupyterMenuHint();
        graffiti.changeActivity('idle');
        graffiti.updateControlPanels();
        utils.saveNotebook();
      },

      startLoadedMovie: (recording, playableMovie) => {
        console.log('Graffiti: Movie loaded for cellId, recordingKey:', playableMovie.recordingCellId, playableMovie.recordingKey);

        state.setNarratorInfo('name', recording.narratorName);
        state.setNarratorInfo('picture', recording.narratorPicture);
        if (playableMovie.cellType === 'markdown') {
          playableMovie.cell.render(); // always render a markdown cell first before playing a movie on a graffiti inside it
        }
        state.updateUsageStats({
          type: 'setup',
          data: {
            cellId:        playableMovie.recordingCellId,
            recordingKey:  playableMovie.recordingKey,
            activeTakeId:  playableMovie.activeTakeId,
          }
        });            
        state.updateUsageStats({
          type:'play',
          data: {
            actions: ['resetCurrentPlayTime', 'incrementPlayCount']
          }
        });
        graffiti.togglePlayback();
        graffiti.hideTip();
      },

      loadAndPlayMovie: (kind) => {
        const playableMovie = state.getPlayableMovie(kind);
        if (playableMovie === undefined) {
          console.log('Graffiti: no playable movie defined.');
          return;
        }

        console.log('Graffiti: playableMovie:', playableMovie);
        const activity = state.getActivity();
        const recording = state.getManifestSingleRecording(playableMovie.recordingCellId, playableMovie.recordingKey);
        // If we are in cellExecuteChoice state, we don't want to run a movie at all, we just want to wire a button to the graffiti associated with this movie.
        const executionSourceChoiceId = state.getExecutionSourceChoiceId();
        if (executionSourceChoiceId !== undefined) {
          const targetGraffitiId = utils.composeGraffitiId(playableMovie.recordingCellId, playableMovie.recordingKey);
          const executionSourceChoiceCell = utils.findCellByCellId(executionSourceChoiceId);
          utils.setCellGraffitiConfigEntry(executionSourceChoiceCell, 'executeCellViaGraffiti', targetGraffitiId ); // needs to be set by the content author
          state.clearExecutionSourceChoiceId();
          graffiti.cleanupAfterLoadAndPlayDidNotPlay();
          graffiti.setJupyterMenuHint(localizer.getString('CELL_EXECUTE_CHOICE_SET'));
        } else {
          // Execute any "save code cell contents to files" directives
          graffiti.executeSaveToFileDirectives(recording);
          if (recording.terminalCommand !== undefined) {
            const terminalCommand = recording.terminalCommand;
            terminalLib.runTerminalCommand(terminalCommand.terminalId, terminalCommand.command, true);
            if (activity !== 'recording') {
              graffiti.cleanupAfterLoadAndPlayDidNotPlay(); // clean up *unless* we are recording; then we should just let things keep going.
            }
            
            state.updateUsageStats({
              type: 'terminalCommand',
              data: {
                cellId:        playableMovie.recordingCellId,
                recordingKey:  playableMovie.recordingKey,
                command:       recording.terminalCommand,
              }
            });
            return; // we are done if we ran a terminal command, don't bother to load any movies for playback.
          }
        }


        // next line seems to be extraneous and buggy because we create a race condition with the control panel. however what happens if a movie cannot be loaded?
        // graffiti.cancelPlayback({cancelAnimation:false}); // cancel any ongoing movie playback b/c user is switching to a different movie

        $('#graffiti-movie-play-btn').html('<i>' + localizer.getString('LOADING') + '</i>').prop('disabled',true);
        graffiti.setJupyterMenuHint(localizer.getString('LOADING_PLEASE_WAIT'));
        const historyData = state.getFromMovieCache('history', playableMovie);
        const audioData   = state.getFromMovieCache('audio',   playableMovie);
        if ((historyData !== undefined) && (audioData !== undefined)) {
          state.setHistory(historyData);
          audio.setRecordedAudio(audioData);
          graffiti.startLoadedMovie(recording, playableMovie);
        } else {
          storage.fetchMovie(playableMovie).then( (movieData) => {
            state.setHistory(movieData.history);
            audio.setRecordedAudio(movieData.audio);
            graffiti.startLoadedMovie(recording, playableMovie);
          }).catch( (ex) => {
            graffiti.changeActivity('idle');
            dialog.modal({
              title: localizer.getString('MOVIE_UNAVAILABLE'),
              body:  localizer.getString('MOVIE_UNAVAILABLE_EXPLANATION'),
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
            graffiti.cleanupAfterLoadAndPlayDidNotPlay();
          });
        }
      },

      playRecordingById: (recordingCellId, recordingKey) => {
        const recording = state.setPlayableMovie('api', recordingCellId, recordingKey);
        if (recording !== undefined) {
          graffiti.loadAndPlayMovie('api');
        } else {
          // Putting an error message in console for this failure mode is gentler than the dialog box put up by loadAndPlayMovie(),
          // because if we are being called by an autoplay movie that was on a delete cell, the
          // endless dialog boxes would drive the user crazy (because they could not remove the graffiti from our manifest)
          console.log('Graffiti: not playing movie ' + recordingCellId + ':' + recordingKey + ', as it was not available.');
        }
      },      

      playRecordingByIdString: (recordingFullId) => {
        const parts = utils.parseRecordingFullId(recordingFullId);
        graffiti.playRecordingById(parts.recordingCellId, parts.recordingKey);
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
                title: localizer.getString('ACCESS_MICROPHONE_PROMPT'),
                body: localizer.getString('ACCESS_MICROPHONE_ADVISORY'),
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
          storage.ensureNotebookGetsGraffitiId();
          storage.ensureNotebookGetsFirstAuthorId();
          utils.assignCellIds();
          utils.saveNotebook(() => {
            graffiti.refreshAllGraffitiHighlights();
            graffiti.refreshGraffitiTooltipsDebounced();
          });
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
            buttonLabel = localizer.getString('HIDE_GRAFFITI_EDITOR');
            graffiti.changeAccessLevel('create');
          } else {
            buttonLabel = localizer.getString('SHOW_GRAFFITI_EDITOR');
            graffiti.changeAccessLevel('view');
          }
        } else {
          if (level === 'create') {
            buttonLabel = localizer.getString('SHOW_GRAFFITI_EDITOR');
            graffiti.changeAccessLevel('view');
          } else {
            buttonLabel = localizer.getString('HIDE_GRAFFITI_EDITOR');
            graffiti.changeAccessLevel('create');
          }
        }
        $('#graffiti-setup-button span:last').text(buttonLabel);
      },

      showCreatorsChooser: () => {
        graffiti.setNotifier(localizer.getString('YOU_CAN_FILTER'));
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
                  'Now you can copy and unpack that archive file anywhere Graffiti is supported, using the terminal command: ' +
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
        let buttonContents = '<div id="graffiti-setup-button" class="btn-group"><button class="btn btn-default" title="' + localizer.getString('ENABLE_GRAFFITI') + '">';

        if (!notebook.metadata.hasOwnProperty('graffiti')) {
          // This notebook has never been graffiti-ized, or it just got un-graffiti-ized
          const existingSetupButton = $('#graffiti-setup-button');
          if (existingSetupButton.length > 0) {
            existingSetupButton.remove();
          }
          buttonLabel = localizer.getString('ACTIVATE_GRAFFITI');
          setupForSetup = true;
        } else {
          // This notebook has already been graffiti-ized. Render the setup button for view mode,
          // which is the default mode to start.
          buttonLabel = localizer.getString('SHOW_GRAFFITI_EDITOR');
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
          title: localizer.getString('ACTIVATE_GRAFFITI_CONFIRM'),
          body: localizer.getString('ACTIVATE_GRAFFITI_ADVISORY'),
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                console.log('Graffiti: You clicked ok');
                storage.ensureNotebookGetsGraffitiId();
                storage.ensureNotebookGetsFirstAuthorId();
                utils.saveNotebook(() => {
                  graffiti.initInteractivity();
                  graffiti.toggleAccessLevel('view');
                  graffiti.activateAudio(); // request microphone access in case switching to 'create' mode later
                  $('#graffiti-setup-button').unbind('click').click(() => {
                    graffiti.toggleAccessLevel();
                  });
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
      removeUnusedTakes: (recordingFullId) => { graffiti.removeUnusedTakesWithConfirmation(recordingFullId) },
      removeAllUnusedTakes: () => { graffiti.removeAllUnusedTakesWithConfirmation() },
      removeAllGraffiti:  graffiti.removeAllGraffitisWithConfirmation,
      disableGraffiti: graffiti.disableGraffitiWithConfirmation,
      setAccessLevel: (level) => { graffiti.toggleAccessLevel(level) },
      transferGraffitis: () => { graffiti.transferGraffitis() },
      packageGraffitis: () => { graffiti.packageGraffitis() },
      getUsageStats: () => { return state.getUsageStats() },
      selectionSerializer: selectionSerializer,
      controlTerminal: (opts) => { graffiti.controlTerminal(opts) },
      // showCreatorsChooser: graffiti.showCreatorsChooser, // demo only
    }

  })();

  return Graffiti;

});

// affected files
//      modified:   jupytergraffiti/js/graffiti.js
//	modified:   jupytergraffiti/js/loader.js
//	modified:   jupytergraffiti/js/state.js
//	modified:   jupytergraffiti/js/storage.js
//	modified:   jupytergraffiti/js/utils.js
