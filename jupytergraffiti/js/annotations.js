define([
  'base/js/dialog',
  './LZString.js',
  './state.js',
  './utils.js',
  './audio.js',
  './storage.js',
  'components/marked/lib/marked'
], function(dialog, LZString, state, utils, audio, storage, marked) {
  const Annotations = (function() {
    const annotations = {

      init: () => {
        console.log('Annotations constructor running.');
        utils.loadCss([
          'jupytergraffiti/css/font-awesome.min.css',
          'jupytergraffiti/css/annotations.css'
        ]);

        const location = document.location;

        state.init();
        const currentAccessLevel = state.getAccessLevel();
        if (currentAccessLevel === 'create') { // this should never happen, ie accessLevel of create should never be the default
          audio.init(state);
        }

        annotations.LZString = LZString;
        annotations.rewindAmt = 1; /*seconds */
        annotations.CMEvents = {};
        annotations.sitePanel = $('#site');
        annotations.notebookPanel = $('#notebook');
        annotations.notebookContainer = $('#notebook-container');

        annotations.storageInProcess = false;
        annotations.newScrollTop = 0;
        annotations.savedScrollTop = undefined;
        annotations.highlightMarkText = undefined;
        annotations.cmLineHeight = 17.0001; // line height of code mirror lines as styled in Jupyter
        annotations.cmLineFudge = 8; // buffer between lines
        annotations.tokenRanges = {};
        annotations.canvases = {};

        // for right now, we are only loading manifests for the creator(teacher), not for viewers (students). 
        // this is why we pass undefined for the authorId (first parameter)
        storage.loadManifest(undefined, currentAccessLevel).then(() => {
          annotations.initInteractivity()
        }).catch(() => {
          console.log('Not setting up Graffiti because this notebook has never had any authoring done yet (no recordingId).');
        });
      },

      initInteractivity: () => {
        audio.setAudioStorageCallback(storage.storeMovie);
        annotations.addCMEvents();
        setTimeout(() => { 
          annotations.setupControls(); 
          annotations.setNotification('Graffiti is loaded and ready for use.', () => { annotations.clearNotification(); }, 5000);
        }, 500); // this timeout avoids too-early rendering of hidden recorder controls

        annotations.refreshAllAnnotationHighlights();
        annotations.refreshAnnotationTips();
      },

      //i nspired by https://www.codicode.com/art/how_to_draw_on_a_html5_canvas_with_a_mouse.aspx
      // and : http://perfectionkills.com/exploring-canvas-drawing-techniques/

      placeCanvas: (cellId, canvasType) => {
        if (annotations.canvases[cellId] !== undefined) {
          //console.log('not adding ' + canvasType + ' canvas to this cell, already exists.');
          return;
        }
        const cell = utils.findCellByCellId(cellId);
        const cellElement = $(cell.element[0]);
        const canvasClass = 'recorder-canvas-' + canvasType;
        const existingCanvas = cellElement.find('.' + canvasClass);
        const cellRect = cellElement[0].getBoundingClientRect();
        $('<div class="recorder-canvas-outer"><canvas /></div>').appendTo(cellElement);
        const newCellCanvasDiv = cellElement.find('.recorder-canvas-outer:first');
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

        annotations.canvases[cellId] = {
          div: newCellCanvasDiv,
          canvas: newCellCanvas,
          ctx: ctx,
          cellRect: cellRect
        };
      },
      
      setCanvasStyle: (cellId, canvasType) => {
        const canvas = annotations.canvases[cellId];
        const ctx = canvas.ctx;
        if (canvasType === 'highlight') {
          ctx.strokeStyle = 'rgb(255,255,0)';
          ctx.shadowColor = 'rgb(255,255,0)';
          ctx.lineWidth = 15;
          ctx.shadowBlur = 35;
          ctx.globalAlpha = 0.5;
        } else { // lines are default although if erase activated, we will ignore this style and use clearRect
          ctx.strokeStyle = 'rgb(0,0,0)';
          ctx.shadowColor = 'rgb(0,0,0)';
          ctx.shadowBlur = 1;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 1.0;
        }
      },

      clearCanvas: (cellId) => {
        const canvas = annotations.canvases[cellId];
        const ctx = canvas.ctx;
        const cellRect = canvas.cellRect;
        ctx.clearRect(0, 0, cellRect.width, cellRect.height);
      },
      
      clearAllCanvases: () => {
        for (let cellId of Object.keys(annotations.canvases)) {
          annotations.clearCanvas(cellId);
        }
      },

      updateGarnishDisplay: (cellId, ax, ay, bx, by, garnishStyle) => {
        //console.log('updateGarnishDisplay');
        if (annotations.canvases.hasOwnProperty(cellId)) {
          const ctx = annotations.canvases[cellId].ctx;
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

      updateGarnishDisplayIfRecording: (ax, ay, bx, by, viewInfo) => {
        if (state.getActivity() === 'recording') {
          const lastGarnishInfo = state.getLastGarnishInfo();
          if (viewInfo.garnishing) {
            annotations.placeCanvas(viewInfo.cellId, viewInfo.garnishStyle);
            annotations.setCanvasStyle(viewInfo.cellId, viewInfo.garnishStyle);
            const cellRect = viewInfo.cellRect;
            annotations.updateGarnishDisplay(viewInfo.cellId, 
                                             ax - cellRect.left,
                                             ay - cellRect.top, 
                                             bx - cellRect.left,
                                             by - cellRect.top,
                                             viewInfo.garnishStyle);
            state.setLastGarnishInfo(bx, by, viewInfo.garnishing, viewInfo.garnishStyle, viewInfo.cellId);
          } else {
            // finished garnishing so set this garnish to fade out, if it's a highlighting garnish. line garnishes don't fade
            if (lastGarnishInfo.garnishing) {
              state.setLastGarnishInfo(bx, by, viewInfo.garnishing, viewInfo.garnishStyle, viewInfo.cellId);
            }
          }
        }
      },

      // extract any tooltip commands
      extractTooltipCommands: (markdown) => {
        const commandParts = markdown.match(/^%%(([^\s]*)\s(.*))$/mg);
        let partsRecord;
        if (commandParts === null)
          return undefined;
        if (commandParts.length > 0) {
          partsRecord = {
            buttonName: undefined,
            captionPic: '',
            caption: ''
          };
          let parts;
          for (let i = 0; i < commandParts.length; ++i) {
            parts = commandParts[i].match(/^(\S+)\s(.*)/).slice(1);
            switch (parts[0].toLowerCase()) {
              case '%%button_name':
                partsRecord.buttonName = parts[1];
                break;
              case '%%caption_pic':
                partsRecord.captionPic = utils.renderMarkdown(parts[1]);
                break;
              case '%%caption':
                partsRecord.caption = parts[1];
                break;
            }
          }
        }
        return partsRecord;
      },

      // Refresh the markDoc calls for any particular cell based on recording data

      // ******************************************************************************************************************************************
      // we should store the ranges we get back for the recordings so we can tell if the cursor is in any of them on cursorActivity
      // ******************************************************************************************************************************************

      refreshAnnotationHighlights: (params) => {
        const recordings = state.getManifestRecordingsForCell(params.cell.metadata.cellId);
        const cm = params.cell.code_mirror;
        const marks = cm.getAllMarks();
        let markClasses;
        if (params.clear) {
          for (let mark of marks) {
            mark.clear();
          }
        } else {
          markClasses = marks.map((mark) => { return mark.className }).join(' ').replace(/annotation-highlight /g, '');
        }
        const allTokens = utils.collectCMTokens(cm);
        const cellId = params.cell.metadata.cellId;
        annotations.tokenRanges[cellId] = {};
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
                annotations.tokenRanges[cellId][recordingKey] = range;
                if (params.clear || (!params.clear && markClasses !== undefined && markClasses.indexOf(recordingKey) === -1)) {
                  // don't call markText twice on a previously marked range
                  marker = 'an-' + recording.cellId + '-' + recordingKey;
                  cm.markText({ line:range.start.line, ch:range.start.ch},
                              { line:range.end.line,   ch:range.end.ch  },
                              { className: 'annotation-highlight ' + marker });
                }
              }
            }
          }
        }
      },

      refreshAllAnnotationHighlights: () => {
        const cells = Jupyter.notebook.get_cells();
        for (let cell of cells) {
          annotations.refreshAnnotationHighlights({ cell: cell, clear: true });
        }
      },

      refreshAnnotationTips: () => {
        const tips = $('.annotation-highlight');
        //console.log('tips:', tips);
        //console.log('refreshAnnotationTips: binding mousenter/mouseleave');
        tips.unbind('mouseenter mouseleave').bind('mouseenter mouseleave', (e) => {
          const highlightElem = $(e.target);
          const idMatch = highlightElem.attr('class').match(/an-(id_.[^\-]+)-(id_[^\s]+)/);
          if (idMatch !== undefined) {
            const cellId = idMatch[1];
            const recordingId = idMatch[2];
            const hoverCell = utils.findCellByCellId(cellId);
            const hoverCellElement = hoverCell.element[0];
            const hoverCellElementPosition = $(hoverCellElement).position();
            const outerInputElement = $(hoverCellElement).find('.CodeMirror-lines');
            const recording = state.getManifestSingleRecording(cellId, recordingId);
            let existingTip = annotations.notebookContainer.find('.annotation-tip');
            if (e.type === 'mouseleave') {
              state.setTipTimeout(() => { existingTip.hide(); }, 500);
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
                  const tooltipCommands = annotations.extractTooltipCommands(recording.markdown);
                  let headlineMarkdown = '';
                  if (tooltipCommands !== undefined) {
                    headlineMarkdown = '<div class="headline">' +
                                       ' <div>' + tooltipCommands.captionPic + '</div><div>' + tooltipCommands.caption + '</div>' +
                                       '</div>';
                  }
                  if (recording !== undefined) {
                    contentMarkdown = utils.renderMarkdown(recording.markdown)
                  }
                  let tooltipContents = headlineMarkdown + '<div class="parts">' + '<div class="info">' + contentMarkdown + '</div>';
                  if (recording.hasMovie) {
                    const buttonName = (((tooltipCommands !== undefined) && (tooltipCommands.buttonName !== undefined)) ? tooltipCommands.buttonName : 'Play Movie');
                    tooltipContents +=
                      '   <div class="movie"><button class="btn btn-default btn-small" id="moviePlay" cell-id="' + cellId + '" recording-id="' + recordingId + '">' +
                      buttonName + '</button></div>';
                  }
                  tooltipContents += '</div>';

                  if (existingTip.length === 0) {
                    existingTip = $('<div class="annotation-tip" id="annotation-tip">' + tooltipContents + '</div>')
                      .prependTo(annotations.notebookContainer);
                    existingTip.bind('mouseenter mouseleave', (e) => {
                      //console.log(e.type === 'mouseenter' ? 'entering tooltip' : 'leaving tooltip');
                      if (e.type === 'mouseenter') {
                        state.clearTipTimeout();
                      } else {
                        existingTip.hide();
                      }
                    });
                  } else {
                    existingTip.find('#moviePlay').unbind('click');
                    existingTip.html(tooltipContents);
                  }
                  existingTip.find('#moviePlay').click((e) => {
                    console.log('click in tip');
                    state.clearTipTimeout();
                    existingTip.hide();
                    e.stopPropagation(); // for reasons unknown even still propogates to the codemirror editing area undeneath
                    const button = $(e.target);
                    const tipCellId = button.attr('cell-id');
                    const tipRecordingId = button.attr('recording-id');
                    const activity = state.getActivity();
                    annotations.loadAndPlayMovie(tipCellId, tipRecordingId);
                    return false;
                  });
                  const outerInputOffset = outerInputElement.offset();
                  const highlightElemOffset = highlightElem.offset();
                  const existingTipHeight = existingTip.height();
                  const tipLeft = parseInt(Math.min(outerInputElement.width() - existingTip.width(),
                                                    Math.max(highlightElemOffset.left, outerInputOffset.left)));
                  const tipPosition = { left: tipLeft,
                                        top: parseInt(highlightElemOffset.top - outerInputOffset.top) - existingTipHeight - 20 };
                  //console.log('outerInputOffset:', outerInputOffset, 'highlightElemOffset:', highlightElemOffset, 'tipPosition:', tipPosition);
                  //console.log('tipPosition.top:', tipPosition.top);
                  const highlightElemRect = highlightElem[0].getBoundingClientRect();
                  const headerRect = $('#header')[0].getBoundingClientRect();
                  // if the highlight element is in the upper half of the notebook panel area. flip the tooltip to be below the highlightElem
                  const rectDifference = highlightElemRect.top - headerRect.bottom - 20;
                  if (rectDifference < existingTipHeight ) {
                    tipPosition.top = highlightElemOffset.top - outerInputOffset.top + annotations.cmLineHeight + annotations.cmLineFudge;
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

      updateTimeDisplay: (playedSoFar) => {
        const timeDisplay = utils.formatTime(playedSoFar);
        const recorderTimeDisplay = $('.recorder-time-display:first');
        recorderTimeDisplay.text(timeDisplay);
        /*
           // Update recording flasher icon
           const now = utils.getNow();
           if (now % 1000 < 500) {
           $('#recorder-flasher').hide();
           } else {
           $('#recorder-flasher').show();
           }
         */
      },

      setupBackgroundEvents: () => {
        // Handle rubber banding scrolling that occurs on short notebooks so cursor doesn't look wrong (possibly, only chrome?).
        console.log('setupBackgroundEvents');

        annotations.sitePanel.on('scroll', (e) => {
          const notebookPanelHeight = annotations.notebookPanel.height();
          const viewInfo = utils.collectViewInfo(state.getPointerPosition().y,
                                                 annotations.notebookPanel.height(),
                                                 annotations.sitePanel.scrollTop(),
                                                 state.getGarnishing(),
                                                 state.getGarnishStyle());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('scroll');
          return true;
        });

        $('body').keydown((e) => {
          const activity = state.getActivity();
          let stopProp = false;
          //console.log('keydown e:', e);
          switch (e.which) {
            case 32: // space key stops playback
              if (activity === 'playing') {
                stopProp = true;
                annotations.togglePlayBack();
              }
              break;
            case 27: // escape key stops playback, cancels pendingRecording, and completes regular recording in process
              stopProp = true;
              switch (activity) {
                case 'recording':
                  annotations.toggleRecording();
                  annotations.updateControlsDisplay();
                  break;
                case 'recordingPending':
                  annotations.clearPendingRecording();
                  break;
                case 'playing':
                case 'playbackPaused':
                  annotations.cancelPlayback();
                  break;
              }
              break;
            case 13:
              if (e.altKey) {
                console.log('alt key pressed with return', e);
                annotations.finishAnnotation(true);
                stopProp = true;
              }
              break;
            case 18:
              if (activity === 'recording') {
                console.log('Start highlight garnishing.');
                state.setGarnishing(true);
                (e.metaKey) ? state.setGarnishStyle('erase') : state.setGarnishStyle('highlight');
                stopProp = true;
              }
              break;
            case 91:
              if (activity === 'recording') {
                console.log('Start line garnishing.');
                state.setGarnishing(true);
                (e.altKey) ? state.setGarnishStyle('erase') : state.setGarnishStyle('line');
                stopProp = true;
              }
              break;
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

        annotations.sitePanel.on('click', (e) => {
          //console.log('notebook panel click event:',e);
          const target = $(e.target);
          //annotations.handleControlsClick(target);
          return true;
        });

        window.onmousemove = (e) => {
          //console.log('cursorPosition:[',e.clientX, e.clientY, ']');
          //console.log('mouse_e:', e.pageX, e.pageY);
          const previousPointerPosition = state.getPointerPosition();
          const previousPointerX = previousPointerPosition.x;
          const previousPointerY = previousPointerPosition.y;
          state.storePointerPosition( e.clientX, e.clientY ); // keep track of current pointer position at all times
          const viewInfo = utils.collectViewInfo(e.clientY, 
                                                 annotations.notebookPanel.height(), 
                                                 annotations.sitePanel.scrollTop(),
                                                 state.getGarnishing(),
                                                 state.getGarnishStyle());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('pointer');
          annotations.updateGarnishDisplayIfRecording(previousPointerX, previousPointerY, e.clientX, e.clientY, viewInfo );
          return true;
        };

        // if we were playing a recording when they hit reload, we need to cancel it, restore, and save before we continue
        window.onbeforeunload = (e) => {
          annotations.cancelPlaybackNoVisualUpdates();
        };

        console.log('Annotations: background setup complete.');
      },

      setupControls: () => {
        const lastButton = $('.btn-group:last');
        const panel = $('<div id="recorder-controls"></div>');
        panel.appendTo(lastButton);
        let recordHtml = '';

        recordHtml +=
          '<div id="recorder-record-controls">' +
          '  <div id="recorder-record-controls-inner">' +
          '    <button class="btn btn-default" id="btn-edit-annotation"><i class="fa fa-pencil"></i>&nbsp; <span>Edit</span></button>' +
          '    <button class="btn btn-default" id="btn-finish-annotation" title="Save Annotation"><i class="fa fa-pencil"></i>' +
          '&nbsp;<span>Save Annotation</span></button>' +
          '    <a href="#" class="cancel" title="Cancel">Cancel changes</a>' +
          '    <div class="recorder-time-display-recording"></div>' +
          '    <button class="btn btn-default" id="btn-start-recording" title="Record movie for this annotation">' +
          '<i class="fa fa-film recorder-button"></i>&nbsp;<span>Record</span></button>' +
          '    <button class="btn btn-default recorder-hidden" id="btn-finish-recording" title="finish recording"><i class="fa fa-pause recorder-stop-button"></i>' +
          '&nbsp;Finish</button>' +
          '    <button class="btn btn-default" id="btn-remove-annotation" title="Remove Annotation"><i class="fa fa-trash"></i></button>' +
          '    <div class="recorder-hint">&nbsp;</div>' +
          '    <div id="recorder-api-key">&nbsp;</div>' +
          '  </div>' +
          '</div>';

        recordHtml +=
          '<div id="recorder-playback-controls">' +
          '  <div id="recorder-playback-inner">' +
          '    <div class="recorder-playback-buttons">' +
          '      <button class="btn btn-default btn-play" id="btn-play" title="start playback">' +
          '        <i class="fa fa-play"></i>' +
          '      </button>' +
          '      <button class="btn btn-default recorder-hidden" id="btn-stop-play" title="stop playback">' +
          '        <i class="fa fa-pause"></i>' +
          '      </button>' +
          '    </div>' +
          '    <div class="recorder-range">' +
          '      <input title="scrub" type="range" min="0" max="1000" value="0" id="recorder-range"></input>' +
          '    </div>' +
          '    <div class="recorder-time-display"></div>' +
          '    <div class="recorder-skip-buttons">' +
          '      <button class="btn btn-default btn-rewind" id="btn-rewind" title="go back ' + annotations.rewindAmt + ' second">' +
          '        <i class="fa fa-backward"></i>' +
          '      </button>' +
          '      <button class="btn btn-default btn-forward" id="btn-forward" title="jump forward ' + annotations.rewindAmt + ' second">' +
          '        <i class="fa fa-forward"></i>' +
          '      </button>' +
          '      <button class="btn btn-default btn-sound-on" id="btn-sound-on" title="mute">' +
          '        <i class="fa fa-volume-up"></i>' +
          '      </button>' +
          '      <button class="btn btn-default btn-sound-off recorder-hidden" id="btn-sound-off" title="unmute">' +
          '        <i class="fa fa-volume-off"></i>' +
          '      </button>' +
          '      <div class="cancel" title="Cancel Playback"><span>Pause</span> to interact at any time, or <span>Cancel playback</span></div>' +
          '    </div>' +
          '  </div>' +
          '  <i id="recorder-cursor" name="cursor" class="recorder-cursor"><img src="jupytergraffiti/css/transparent_bullseye2.png"></i>' +
          '</div>' +
          '<div id="recorder-notifier"></div>';
        //'  <i id="recorder-cursor" name="cursor" class="fa fa-mouse-pointer recorder-cursor">&nbsp;</i>' +

        $('#recorder-controls').html(recordHtml);

        $('#recorder-range').on('mousedown', (e) => {
          //console.log('slider:mousedown');
          annotations.stopPlayback(); // stop playback if playing when you start to scrub
          annotations.clearAllCanvases();
          state.setActivity('scrubbing');
        });
        $('#recorder-range').on('mouseup', (e) => {
          //console.log('slider:mouseup')
          state.setActivity('playbackPaused');
          annotations.updateAllAnnotationDisplays();
        });

        $('#recorder-range').on('input', annotations.handleSliderDrag);
        annotations.recordingCursor = $('#recorder-cursor');

        $('#btn-start-recording').click((e) => { annotations.beginMovieRecordingProcess(); });
        $('#btn-finish-recording').click((e) => { annotations.toggleRecording(); });
        $('#btn-edit-annotation').click((e) => { annotations.editAnnotation('annotating'); });
        $('#btn-finish-annotation').click((e) => { annotations.finishAnnotation(true); });
        $('#btn-remove-annotation').click((e) => { annotations.removeAnnotationPrompt(); });
        $('#recorder-record-controls .cancel').click((e) => { annotations.finishAnnotation(false); });
        $('#recorder-playback-controls .cancel span:first').click((e) => { annotations.stopPlayback(); });
        $('#recorder-playback-controls .cancel span:last').click((e) => { annotations.cancelPlayback(); });
        $('#recorder-api-key').click((e) => { $('#recorder-api-key input').select(); });

        $('#btn-play, #btn-stop-play').click((e) => { annotations.togglePlayBack(); });
        $('#btn-forward,#btn-rewind').click((e) => {
          // console.log('btn-forward/btn-rewind clicked');
          let direction = 1;
          if (($(e.target).attr('id') === 'btn-rewind') || ($(e.target).hasClass('fa-backward'))) {
            direction = -1;
          }
          annotations.stopPlayback();
          const timeElapsed = state.getPlaybackTimeElapsed();
          const t = Math.max(0, Math.min(timeElapsed + (annotations.rewindAmt * 1000 * direction), state.getHistoryDuration() - 1 ));
          console.log('t:', t);
          const frameIndexes = state.getHistoryRecordsAtTime(t);
          state.clearSetupForReset();
          state.setPlaybackTimeElapsed(t);
          annotations.updateDisplay(frameIndexes);
          annotations.updateSlider(t);
          annotations.updateAllAnnotationDisplays();
        });

        $('#btn-sound-on, #btn-sound-off').on('click', (e) => {
          console.log('volume toggle')
          if (state.getMute()) {
            state.setMute(false);
            $('#btn-sound-off').hide();
            $('#btn-sound-on').show();
            if (state.getActivity() === 'playing') {
              audio.startPlayback(state.getTimePlayedSoFar());
            }
          } else {
            state.setMute(true);
            $('#btn-sound-on').hide();
            $('#btn-sound-off').show();
            if (state.getActivity() === 'playing') {
              audio.stopPlayback();
            }
          }
        });

        console.log('Annotations controls set up.');

        annotations.setupBackgroundEvents();
      },

      storeRecordingInfoInCell: () => {
        let recordingRecord, newRecording, recordingCell, recordingCellId, recordingKey;
        if (annotations.selectedTokens.isIntersecting) { 
          // Prepare to update existing recording
          recordingCell = annotations.selectedTokens.recordingCell;
          recordingCellId = annotations.selectedTokens.recordingCellId;
          recordingKey = annotations.selectedTokens.recordingKey;
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
            createDate: utils.getNow(),
            inProgress: true,
            tokens: $.extend({}, annotations.selectedTokens.tokens),
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
          scrollTop: annotations.sitePanel.scrollTop()
        });

        return recordingCell;
      },

      highlightIntersectingAnnotationRange: () => {
        const cell = annotations.selectedTokens.recordingCell;
        const cm = cell.code_mirror;
        const startLoc = cm.posFromIndex(annotations.selectedTokens.start);
        const endLoc = cm.posFromIndex(annotations.selectedTokens.end);
        annotations.highlightMarkText = cm.markText(startLoc, endLoc, { className: 'annotation-selected' });
      },

      editAnnotation: (newState) => {
        state.setActivity(newState);
        annotations.updateControlsDisplay();
        annotations.storeRecordingInfoInCell();

        const activeCellIndex = Jupyter.notebook.get_selected_index();
        const annotationEditCell = Jupyter.notebook.insert_cell_above('markdown');

        annotationEditCell.metadata.cellId = utils.generateUniqueId();
        let editableText = '';
        let finishLabel = 'Save Annotation';
        let finishIconClass = 'fa-pencil';
        $('#btn-finish-annotation i').removeClass('fa-film, fa-pencil');
        if (annotations.selectedTokens.isIntersecting) {
          editableText = annotations.selectedTokens.markdown; // use whatever author put into this annotation previously
          if (state.getActivity() === 'recordingLabelling') {
            finishLabel = 'Start Movie Recording';
            finishIconClass = 'fa-film';
          }
        } else {
          if (state.getActivity() === 'recordingLabelling') {
            finishLabel = 'Start Movie Recording';
            finishIconClass = 'fa-film';
            editableText = 'Enter any markdown to describe your movie, then click "Start Movie Recording", above.' + "\n";
          } else {
            editableText = 'Enter your markdown for the annotation here and then click "Save Annotation" above.' + "\n";
            // Add whatever tokens are selected for initial annotation
          }
          editableText += annotations.selectedTokens.tokens.allTokensString;
        }
        $('#btn-finish-annotation i').addClass(finishIconClass);
        $('#btn-finish-annotation span').text(finishLabel);

        annotationEditCell.set_text(editableText);
        annotationEditCell.unrender();
        Jupyter.notebook.scroll_to_cell(Math.max(0,activeCellIndex),500);
        const selectedCell = Jupyter.notebook.get_selected_cell();
        selectedCell.unselect();
        annotationEditCell.select();
        annotationEditCell.code_mirror.focus();
        annotationEditCell.code_mirror.execCommand('selectAll');

        annotations.annotationEditCellId = annotationEditCell.metadata.cellId;

        annotations.setRecorderHint('Alt- or Option-Enter to save your entry.');

      },

      finishAnnotation: (doSave) => {
        const activity = state.getActivity();
        if (activity !== 'annotating' && activity !== 'recordingLabelling')
          return;

        const recordingCellInfo = state.getRecordingCellInfo();
        const recordingCell = recordingCellInfo.recordingCell;

        $('#recorder-record-controls').hide();
        $('#btn-record').show();
        $('#btn-edit-annotation').show();
        $('#btn-finish-annotation').hide();
        $('#btn-remove-annotation').hide();
        $('#recorder-record-controls .cancel').hide();

        const editCellIndex = utils.findCellIndexByCellId(annotations.annotationEditCellId);

        let editCellContents = '';
        if (editCellIndex !== undefined) {
          const editCell = utils.findCellByCellId(annotations.annotationEditCellId);
          editCellContents = editCell.get_text();
          Jupyter.notebook.delete_cell(editCellIndex);

          // Save the annotation text into the right cell recording.
          const recordings = state.getManifestRecordingsForCell(recordingCellInfo.recordingCellId);
          if (doSave) {
            if (recordingCellInfo.newRecording) {
              recordings[recordingCellInfo.recordingKey] = recordingCellInfo.recordingRecord;
            }
            recordings[recordingCellInfo.recordingKey].markdown = editCellContents;
          }
        }
        storage.storeManifest();
        utils.saveNotebook();

        // need to reselect annotation text that was selected in case it somehow got unselected
        //recordingCell.code_mirror.setSelections(recordingCellInfo.selections);
        annotations.sitePanel.animate({ scrollTop: recordingCellInfo.scrollTop}, 500);
        if (doSave && state.getActivity() === 'recordingLabelling') {
          annotations.setPendingRecording();
        } else {
          state.setActivity('idle');
          recordingCell.code_mirror.focus();
          annotations.clearRecorderHint();
          annotations.refreshAnnotationHighlights({cell: recordingCell, clear: false});
          annotations.refreshAnnotationTips();
        }
        annotations.updateControlsDisplay();
      },

      removeAnnotationCore: (recordingCell, recordingKey) => {
        const recordingCellId = recordingCell.metadata.cellId;
        storage.deleteMovie(recordingCellId, recordingKey);
      },


      removeAllAnnotations: () => {
        const manifest = state.getManifest(); // save manifest before we wipe it out
        state.setManifest({});
        let recordingCellId, recordingCell, recordingIds, recordingKeys, destructions = 0;
        for (recordingCellId of Object.keys(manifest)) {
          console.log('Removing recordings from cell:', recordingCellId);
          recordingKeys = Object.keys(manifest[recordingCellId]);
          if (recordingKeys.length > 0) {
            recordingCell = utils.findCellByCellId(recordingCellId);
            for (recordingKey of recordingKeys) {
              console.log('Removing recording id:', recordingKey);
              destructions++;
              annotations.removeAnnotationCore(recordingCell, recordingKey);
              annotations.refreshAnnotationHighlights({cell: recordingCell, clear: true});
            }
          }
        }
        storage.storeManifest();
        if (annotations.highlightMarkText !== undefined) {
          annotations.highlightMarkText.clear();
        }
        annotations.refreshAnnotationTips();
        annotations.updateControlsDisplay();
        utils.saveNotebook();

        dialog.modal({
          title: 'Your notebook is now cleaned of all graffiti.',
          body: 'We removed ' + destructions + ' graffitis. Feel free to create new ones.',
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                console.log('You clicked ok, you want to remove ALL annotations');
              }
            }
          }
        });

      },

      removeAnnotation: (recordingCell, recordingKey) => {
        annotations.removeAnnotationCore(recordingCell, recordingKey);
        if (state.removeManifestEntry(recordingCell.metadata.cellId, recordingKey)) {
          if (annotations.highlightMarkText !== undefined) {
            annotations.highlightMarkText.clear();
          }
          annotations.refreshAnnotationHighlights({cell: recordingCell, clear: true});
          annotations.refreshAnnotationTips();
          annotations.updateControlsDisplay();
          storage.storeManifest();
          utils.saveNotebook();
        }
      },

      removeAllAnnotationsWithConfirmation: () => {
        dialog.modal({
          title: 'Are you sure you want to remove ALL annotations from this notebook?',
          body: 'Note: this cannot be undone.',
          sanitize:false,
          buttons: {
            'OK': {
              click: (e) => {
                console.log('You clicked ok, you want to remove ALL annotations');
                annotations.removeAllAnnotations();

              }
            },
            'Cancel': { click: (e) => { console.log('you cancelled:', $(e.target).parent()); } },
          }
        });

      },

      removeAnnotationPrompt: () => {
        if (annotations.selectedTokens.isIntersecting) {
          const recordingCell = annotations.selectedTokens.recordingCell;
          const recordingCellId = recordingCell.metadata.cellId;
          const recordingKey = annotations.selectedTokens.recordingKey;
          const recording = state.getManifestSingleRecording(recordingCellId,recordingKey);
          const content = '<b>Annotated string:</b>&nbsp;<i>' + recording.tokens.allTokensString + '</i><br/>' +
                          '<b>Annotation:</b>' + utils.renderMarkdown(recording.markdown) + '<br/><br/>' +
                          '(Note: this cannot be undone.)<br/>';
          dialog.modal({
            title: 'Are you sure you want to remove this annotation?',
            body: content,
            sanitize:false,
            buttons: {
              'OK': {
                click: (e) => {
                  console.log('you clicked ok, you want to remove annotation:',
                              $(e.target).parent());
                  annotations.removeAnnotation(recordingCell, recordingKey);

                }
              },
              'Cancel': { click: (e) => { console.log('you cancelled:', $(e.target).parent()); } },
            }
          });
        }
      },

      updateControlsDisplay: (cm) => {
        let activeCell;
        if (cm !== undefined) {
          activeCell = utils.findCellByCodeMirror(cm);
        } else {
          activeCell = Jupyter.notebook.get_selected_cell();
        }
        //console.log('updateControlsDisplay, activity:', state.getActivity());
        const cellId = activeCell.metadata.cellId;
        const activity = state.getActivity();
        switch (activity) {
          case 'recordingLabelling':
            $('#recorder-record-controls,#btn-finish-annotation,#recorder-record-controls .cancel').show();
            $('#btn-start-recording,#btn-edit-annotation,#btn-remove-annotation,#recorder-record-controls #recorder-api-key').hide();
            break;
          case 'recordingPending':
            $('#recorder-record-controls').show();
            $('#btn-start-recording,#btn-finish-recording,#btn-edit-annotation,#btn-finish-annotation,#recorder-record-controls .cancel,' +
              '#recorder-record-controls #recorder-api-key').hide();
            break;
          case 'recording':
            $('#recorder-record-controls,#recorder-record-controls .recorder-time-display-recording:first,#btn-finish-recording').show();
            $('#btn-start-recording,#btn-edit-annotation,#btn-finish-annotation,#btn-finish-annotation,#recorder-record-controls .cancel,' + 
              '#recorder-record-controls #recorder-api-key').hide();
            break;
          case 'playing':
            $('#recorder-record-controls, #btn-play').hide();
            $('#recorder-playback-controls, #recorder-playback-controls .recorder-time-display:first, #btn-stop-play').show();
            break;
          case 'playbackPaused':
            $('#recorder-record-controls, #btn-stop-play').hide();
            $('#recorder-playback-controls, #btn-play').show();
            break;
          case 'annotating':
            $('#recorder-record-controls,#btn-finish-annotation,#recorder-record-controls .cancel').show();
            $('#btn-start-recording,#btn-edit-annotation,#recorder-record-controls #recorder-api-key').hide();
            break;
          case 'idle':
            $('#recorder-record-controls,#btn-start-recording,#btn-edit-annotation, #recorder-record-controls #recorder-api-key').show();
            $('#btn-finish-recording, #btn-finish-annotation,#recorder-record-controls .recorder-time-display-recording:first').hide();
            $('#recorder-record-controls .cancel, #recorder-playback-controls').hide();
            // Check if anchor or head of current selection is inside an existing recording token set. Controls will be different if so.
            let rangeKey, range;
            let annotationBtnText = 'Create';
            let recordBtnText = 'Record';
            $('#btn-edit-annotation').attr({title:'Create Annotation'});
            if (annotations.highlightMarkText) {
              annotations.highlightMarkText.clear();
            }
            annotations.editableAnnotation = undefined;
            annotations.selectedTokens = utils.findSelectionTokens(activeCell, annotations.tokenRanges, state);
            $('#recorder-record-controls #recorder-api-key').hide();
            if (annotations.selectedTokens.noTokensPresent || state.getAccessLevel() === 'view') {
              $('#recorder-record-controls').hide();
            } else {
              if (annotations.selectedTokens.isIntersecting) {
                annotationBtnText = 'Edit';
                $('#btn-edit-annotation').attr({title:'Edit Annotation'});
                $('#btn-remove-annotation').show();
                annotations.highlightIntersectingAnnotationRange();
                //console.log('selectedTokens:', annotations.selectedTokens);
                if (annotations.selectedTokens.hasMovie) {
                  //console.log('this recording has a movie');
                  recordBtnText = 'Re-record';
                  $('#btn-start-recording').attr({title:'Re-record Movie'})
                  $('#recorder-record-controls #recorder-api-key').html('Movie api key:<span><input type="text" value="' + 
                                                                        annotations.selectedTokens.recordingCellId + '_' + 
                                                                        annotations.selectedTokens.recordingKey + '" /></span>');
                  $('#recorder-record-controls #recorder-api-key').show();
                } else {
                  recordBtnText = 'Record';
                  $('#btn-start-recording').attr({title:'Record Movie'})
                }
              }
            }
            $('#btn-edit-annotation span').text(annotationBtnText);
            $('#btn-start-recording span').text(recordBtnText);
            break;
        }
      },

      updateAllAnnotationDisplays: () => {
        annotations.refreshAllAnnotationHighlights();
        annotations.refreshAnnotationTips();
        annotations.updateControlsDisplay();
      },

      clearNotification: (force) => {
        const notifier = $('#recorder-notifier');
        notifier.find('span:first').unbind('click');
        if (force) {
          notifier.hide();
        } else {
          notifier.fadeOut(1500);
        }
      },

      setNotification: (notification, cb, timeout) => {
        const notifier = $('#recorder-notifier');
        notifier.html(notification).show();
        if (cb !== undefined) {
          setTimeout(cb, timeout);
        }
      },

      setNotificationClickable: (notification, cb) => {
        const notifier = $('#recorder-notifier');
        notifier.html(notification).show();
        if (cb !== undefined) {
          notifier.find('span:first').bind('click', cb);
        }
      },

      //
      // Recording control functions
      //

      setRecorderHint: (hint, cb) => {
        const recorderHintDisplay = $('.recorder-hint:first');
        recorderHintDisplay.html(hint).show();
        if (cb !== undefined) {
          recorderHintDisplay.find('span:first').bind('click', cb);
        }
      },

      clearRecorderHint: () => {
        const recorderHintDisplay = $('.recorder-hint:first');
        recorderHintDisplay.find('span:first').unbind('click');
        recorderHintDisplay.hide();
      },

      setPendingRecording: () => {
        if (state.getActivity() === 'recording') {
          annotations.toggleRecording(); // stop current recording
          annotations.updateControlsDisplay();
        } else {
          console.log('Setting pending recording');
          annotations.setRecorderHint('Click anywhere to begin recording movie. (ESC to cancel)');
          state.setActivity('recordingPending');
          annotations.updateControlsDisplay();
          state.restoreCellStates('selections'); // reset selections to when you clicked to begin the recording
        }
      },

      clearPendingRecording: () => {
        annotations.clearRecorderHint();
        state.setActivity('idle');
      },

      beginMovieRecordingProcess: () => {
        // Preserve the state of all cells and selections before we begin recording so we can restore when the recording is done.
        state.storeCellStates();
        annotations.editAnnotation('recordingLabelling');
      },

      addCMEventsToSingleCell: (cell) => {
        annotations.CMEvents[cell.metadata.cellId] = true;
        const cm = cell.code_mirror;
        cm.on('focus', (cm, e) => {
          //console.log('CM focus:' , cm, e);
          // Check to see if we jumped from another cell to this cell with the arrow keys. If we did and we're recording, we need to
          // create a focus history record because jupyter is not firing the select cell event in those cases.
          if (state.getActivity() === 'recording') {
            if (cell.metadata.cellId !== state.getSelectedCellId()) {
              state.saveSelectedCellId(cell.metadata.cellId);
              state.storeHistoryRecord('focus');
            }
          }
          if (state.getActivity() === 'recordingPending') {
            console.log('now starting movie recording');
            annotations.toggleRecording();
          }
          annotations.updateControlsDisplay();
        });

        cm.on('cursorActivity', (cm, e) => {
          //console.log('cursorActivity');
          annotations.updateControlsDisplay(cm);
          //console.log('annotations.selectedTokens:', annotations.selectedTokens);
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
            annotations.refreshAnnotationHighlights({cell: affectedCell, clear: true});
          }
        });

        cm.on('mousedown', (cm, e) => {
          //console.log('mousedown, e:', e);
          annotations.clearNotification(true); // immediately clear notification if present
        });

        cm.on('refresh', (cm, e) => {
          //console.log('**** CM refresh event ****');
        });

        cm.on('update', (cm, e) => {
          //console.log('**** CM update event ****');
          annotations.refreshAnnotationTips();
        });

        cm.on('scroll', (cm, e) => {
          const pointerPosition = state.getPointerPosition();
          const viewInfo = utils.collectViewInfo(pointerPosition.y, 
                                                 annotations.notebookPanel.height(), 
                                                 annotations.sitePanel.scrollTop(),
                                                 state.getGarnishing(),
                                                 state.getGarnishStyle());
          state.storeViewInfo(viewInfo);
          state.storeHistoryRecord('innerScroll');
        });

      },

      addCMEventsToCells: () => {
        const inputCells = Jupyter.notebook.get_cells();
        for (let cell of inputCells) {
          // Don't rebind if already bound
          if (!annotations.CMEvents.hasOwnProperty(cell.metadata.cellId)) {
            annotations.addCMEventsToSingleCell(cell);
          }
        }
      },

      // Bind all select, create, delete, execute  cell events at the notebook level
      addCMEvents: () => {
        annotations.addCMEventsToCells();

        Jupyter.notebook.events.on('select.Cell', (e, cell) => {
          //console.log('cell select event fired, e, cell:',e, cell.cell);
          //console.log('select cell store selections');
          state.storeHistoryRecord('focus');
          annotations.refreshAnnotationTips();
        });

        Jupyter.notebook.events.on('create.Cell', (e, results) => {
          //console.log('create.Cell fired');
          //console.log(results);
          const newCell = results.cell;
          const newCellIndex = results.index;
          newCell.metadata.cellId = utils.generateUniqueId();
          annotations.addCMEventsToSingleCell(newCell);
          state.storeHistoryRecord('contents');
        });

        Jupyter.notebook.events.on('delete.Cell', (e) => {
          annotations.stopPlayback();
          state.storeHistoryRecord('contents');
        });

        Jupyter.notebook.events.on('finished_execute.CodeCell', (e, results) => {
          console.log('Finished execution event fired, e, results:',e, results);
          state.storeHistoryRecord('contents');
        });

        Jupyter.notebook.events.on('shell_reply.Kernel', (e, results) => {
          console.log('Kernel shell reply event fired, e, results:',e, results);
          if (state.getStorageInProcess()) {
            storage.clearStorageInProcess();
            annotations.updateAllAnnotationDisplays();
          }
        });

      },


      toggleRecording: () => {
        const currentActivity = state.getActivity();
        if (currentActivity !== 'playing') {
          if (currentActivity === 'recording') {

            //
            // Stop movie recording currently underway.
            //

            annotations.clearAllCanvases();
            state.finalizeHistory();
            state.dumpHistory();
            clearInterval(state.getRecordingInterval());
            // This will use the callback defined in setAudioStorageCallback to actually persist everything.
            audio.stopRecording();
            $('#recorder-range').removeAttr('disabled');
            annotations.setRecorderHint('Movie saved. Now you can <span>play this movie</span>.', annotations.startPlayback);
            state.setActivity('idle');
            console.log('toggleRecording refreshing.');
            state.restoreCellStates('contents');
            annotations.updateAllAnnotationDisplays();
            annotations.sitePanel.animate({ scrollTop: state.getScrollTop() }, 750);
            state.restoreCellStates('selections');
            console.log('Stopped recording.');
          } else {

            //
            // Start new movie recording.
            //

            const recordingCellInfo = state.getRecordingCellInfo();
            if (recordingCellInfo == undefined) {
              // Error condition, cannot start recording without an active cell
              console.log('Cannot begin recording, no cell chosen to store recording.');
              return;
            }
            console.log('Begin recording for cell id:', recordingCellInfo.recordingCellId);

            state.setActivity('recording');
            state.setMovieRecordingStarted(true);
            state.assignCellIds();
            state.initHistory({
              storageCellId: recordingCellInfo.recordingCellId,
            });

            audio.startRecording();
            $('#recorder-range').attr('disabled',1);
            annotations.setRecorderHint('ESC: complete recording. Alt: draw lines. Option: draw highlights. Both:Erase.');
//            state.storeHistoryRecord('selections'); // is this necessary?
            state.setScrollTop(annotations.sitePanel.scrollTop());
            state.setGarnishing(false);

            state.setRecordingInterval(
              setInterval(() => {
                //console.log('Moving time ahead.');
                annotations.updateTimeDisplay(state.getTimeRecordedSoFar());
              }, 10)
            );
            console.log('Started recording');
          }
        }
      },

      //
      // Movie playback code begins
      //

      updateFocus: (index) => {
        const focusRecord = state.getHistoryItem('focus', index);
        const currentlySelectedCell = Jupyter.notebook.get_selected_cell();
        if (currentlySelectedCell.metadata.hasOwnProperty('cellId') && currentlySelectedCell.metadata.cellId !== focusRecord.activeCellId) {
          const activeCellIndex = utils.findCellIndexByCellId(focusRecord.activeCellId); // we should use a map to speed this up
          Jupyter.notebook.select(activeCellIndex);
          const activeCell = utils.findCellByCellId(focusRecord.activeCellId);
          if (activeCell !== undefined) {
            activeCell.code_mirror.focus();
          }
        }
      },


      updatePointer: (record) => {
        if (record.hoverCell !== undefined) {
          const hoverCellElement = $(record.hoverCell.element[0]);
          const cellRect = hoverCellElement[0].getBoundingClientRect();
          const innerCell = hoverCellElement.find('.inner_cell')[0];
          const innerCellRect = innerCell.getBoundingClientRect();
          //console.log('hoverCellId:', record.hoverCell.metadata.cellId, 'rect:', innerCellRect);
          const dxScaled = parseInt(innerCellRect.width * record.dx);
          const dyScaled = parseInt(innerCellRect.height * record.dy);
          const offsetPosition = {
            x : innerCellRect.left + dxScaled,
            y : innerCellRect.top + dyScaled
          };
          const lastPosition = state.getLastRecordingCursorPosition();
          const lastGarnishInfo = state.getLastGarnishInfo();
          if (record.garnishing) {
            //console.log('lastGarnishInfo:', lastGarnishInfo);
            annotations.placeCanvas(record.cellId,record.garnishStyle);
            annotations.setCanvasStyle(record.cellId, record.garnishStyle);
            // We are currently garnishing, so draw next portion of garnish on canvas.
            //console.log('garnishing from:', lastGarnishInfo.x, lastGarnishInfo.y, '->', dxScaled, dyScaled);
            const garnishOffset = { x: dxScaled + (innerCellRect.left - cellRect.left), y: dyScaled + (innerCellRect.top - cellRect.top) };
            if (lastGarnishInfo.garnishing && lastGarnishInfo.garnishCellId == record.cellId) {
              annotations.updateGarnishDisplay(record.cellId, lastGarnishInfo.x, lastGarnishInfo.y, garnishOffset.x + 0.5, garnishOffset.y + 0.5, record.garnishStyle);
            }
            state.setLastGarnishInfo(garnishOffset.x, garnishOffset.y, record.garnishing, record.garnishStyle, record.cellId);
          } else {
            if (lastGarnishInfo.garnishing) {
              // garnish rendering just ended
              state.setLastGarnishInfo(dxScaled, dyScaled, record.garnishing, record.garnishStyle, record.cellId);
            }
          }
          if ((offsetPosition.x !== lastPosition.x) || (offsetPosition.y !== lastPosition.y)) {
            // Show cursor whenever it's moved by user
            //console.log('Showing cursor:', offsetPosition, lastPosition);
            const offsetPositionPx = { left: offsetPosition.x + 'px', top: offsetPosition.y + 'px'};
            annotations.recordingCursor.css(offsetPositionPx);
          }
          state.setLastRecordingCursorPosition(offsetPosition);
        }
      },

      updateView: (viewIndex) => {
        let record = state.getHistoryItem('view', viewIndex);
        record.hoverCell = utils.findCellByCellId(record.cellId);

        // Select whatever cell is currently selected
        if (record.selectedCellId !== undefined) {
          const selectedCellIndex = utils.findCellIndexByCellId(record.selectedCellId); // we should use a map to speed this up
          //console.log('about to select index:', selectedCellIndex)
          Jupyter.notebook.select(selectedCellIndex);
          const selectedCell = utils.findCellByCellId(record.selectedCellId);
          if (selectedCell !== undefined) {
            selectedCell.code_mirror.focus();
          }
        }

        if (record.pointerUpdate) {
          annotations.recordingCursor.show();
          annotations.updatePointer(record);
        } else {
          annotations.recordingCursor.hide();
        }

        // Update innerScroll if required
        if (record.hoverCell) {
          const cm = record.hoverCell.code_mirror;
          cm.scrollTo(record.innerScroll.left, record.innerScroll.top);


          // Compute mapped scrollTop for this timeframe
          const currentNotebookPanelHeight = annotations.notebookPanel.height();
          const scrollRatio = record.scrollTop / record.notebookPanelHeight;
          const mappedScrollTop = scrollRatio * currentNotebookPanelHeight;

          // Compute offset to hoverCell from history value mapped to current panel height, to current cell position
          const hoverCellElement = $(record.hoverCell.element[0]);
          const hoverCellTop = hoverCellElement.position().top;
          const mappedTop = (record.cellPositionTop / record.notebookPanelHeight) * currentNotebookPanelHeight;
          const positionDifference = hoverCellTop - mappedTop;

          // Compute difference in cell sizes of the history hoverCell size to current cell size, and subtract half of that difference
          // in order to offset cell size changes
          const mappedHeight = record.innerCellRect.height * (record.notebookPanelHeight / currentNotebookPanelHeight);
          const heightDiff = $(hoverCellElement.find('.inner_cell')[0]).height() - mappedHeight;
          const heightDiffAdjustment = -0.5 * heightDiff;

          // Now the updated scrollTop is computed by adding all three values together.
          const scrollTop = parseInt(mappedScrollTop + positionDifference + heightDiffAdjustment);

          const currentScrollTop = annotations.sitePanel.scrollTop();
          if (currentScrollTop !== scrollTop) {
            annotations.sitePanel.scrollTop(scrollTop);
          }
        }
      },

      updateSelections: (index) => {
        // Preserve scrollTop position because latest CM codebase sometimes seems to change it when you setSelections.
        const currentScrollTop = annotations.sitePanel.scrollTop();
        
        const record = state.getHistoryItem('selections', index);
        let selectionsUpdated = false;
        let cellId, cell, selections, code_mirror, currentSelections, active;
        for (cellId of Object.keys(record.cellsSelections)) {
          selections = record.cellsSelections[cellId].selections;
          active = record.cellsSelections[cellId].active;
          cell = utils.findCellByCellId(cellId);
          if (cell !== undefined) {
            code_mirror = cell.code_mirror;
            currentSelections = utils.cleanSelectionRecords(code_mirror.listSelections());
            //console.log('cellId, selections, currentSelections:', cellId, selections, currentSelections);
            if (!(_.isEqual(selections,currentSelections))) {
              //console.log('updating selection, rec:', record, 'sel:', selections, 'cell:', cell);
              annotations.recordingCursor.hide();
              code_mirror.setSelections(selections);
              selectionsUpdated = true;
            }
          }
        }
        if (selectionsUpdated) {
          if (annotations.sitePanel.scrollTop() !== currentScrollTop) {
            console.log('Jumped scrolltop');
            annotations.sitePanel.scrollTop(currentScrollTop);
          }
        }
      },

      // Also, store outputs in content records and when a cell is executed create a content record.
      // On output change, back reference should be updated as well as contents change.

      updateContents: (index) => {
        const contentsRecord = state.getHistoryItem('contents', index);
        const cells = Jupyter.notebook.get_cells();
        let cellId, contents, outputs, frameContents, frameOutputs;
        for (let cell of cells) {
          if (cell.cell_type === 'code') {
            cellId = cell.metadata.cellId;
            contents = cell.get_text();
            outputs = cell.output_area.outputs;
            if (contentsRecord.cellsContent.hasOwnProperty(cellId)) {
              frameContents = state.extractDataFromContentRecord(contentsRecord.cellsContent[cellId].contentsRecord, cellId);
              if (frameContents !== undefined && frameContents !== contents) {
                cell.set_text(frameContents);
              }
              frameOutputs = state.extractDataFromContentRecord(contentsRecord.cellsContent[cellId].outputsRecord, cellId);
              if (frameOutputs !== undefined && frameOutputs.length > 0 && (!(_.isEqual(outputs, frameOutputs)))) {
                cell.clear_output();
                const output_type = frameOutputs[0].output_type;
                if ((output_type === 'display_data' || output_type === 'stream') || (output_type === 'error')) {
                  if ((output_type === 'stream') ||
                      (output_type === 'error') ||
                      (frameOutputs[0].hasOwnProperty('data') && !frameOutputs[0].data.hasOwnProperty('application/javascript'))) {
                    cell.output_area.handle_output({header: { msg_type: frameOutputs[0].output_type }, content: frameOutputs[0]});
                  }
                }
              }
            }
          }
        }
      },

      updateDisplay: (frameIndexes) => {
        annotations.updateContents(frameIndexes.contents);
        annotations.updateSelections(frameIndexes.selections);
        annotations.updateView(frameIndexes.view);
      },

      updateSlider: (playedSoFar) => {
        const ratio = playedSoFar / state.getHistoryDuration();
        const sliderVal = ratio * 1000;
        //console.log('updateSlider, playedSoFar:', playedSoFar, 'sliderVal:', sliderVal);
        const slider = $('#recorder-range');
        slider.val(sliderVal);
      },

      updateTimeDisplay: (timeSoFar) => {
        const timeDisplay = utils.formatTime(timeSoFar);
        const activity = state.getActivity();
        const recorderTimeDisplay = (activity === 'recording' ? $('.recorder-time-display-recording:first') : $('.recorder-time-display:first'));
        recorderTimeDisplay.text(timeDisplay);
      },

      //
      // Playback functions
      //

      handleSliderDrag: () => {
        // Handle slider drag
        const target = $('#recorder-range');
        const timeLocation = target.val() / 1000;
        //console.log('slider value:', timeLocation);
        state.clearSetupForReset();
        annotations.recordingCursor.show();
        const t = Math.min(state.getHistoryDuration() * timeLocation, state.getHistoryDuration() - 1);
        // Now we need to set the time we are going to start with if we play from here.
        state.setPlaybackTimeElapsed(t);
        const frameIndexes = state.getHistoryRecordsAtTime(t);
        annotations.updateDisplay(frameIndexes);
        annotations.updateTimeDisplay(t);
      },

      // Stop any ongoing playback
      stopPlayback: () => {
        if (state.getActivity() !== 'playing')
          return;

        clearInterval(state.getPlaybackInterval());
        state.setActivity('playbackPaused');
        annotations.togglePlayButtons();
        audio.stopPlayback();
        state.setPlaybackTimeElapsed();
        // annotations.dockCursor();

        annotations.refreshAllAnnotationHighlights();
        annotations.refreshAnnotationTips();
        annotations.updateControlsDisplay();

        // Save after play stops, so if the user reloads we don't get the annoying dialog box warning us changes were made.
        // annotations.saveNotebook();

        console.log('Stopped playback.');
      },

      cancelPlaybackNoVisualUpdates: () => {
        annotations.stopPlayback();
        state.setGarnishing(false);
        state.resetPlayState();
        state.setActivity('idle');
        state.restoreCellStates('contents');
        utils.saveNotebook();
        state.restoreCellStates('selections');
      },

      cancelPlayback: () => {
        const activity = state.getActivity();
        if ((activity !== 'playing') && (activity !== 'playbackPaused')) {
          return;
        }

        console.log('cancelling playback');
        annotations.cancelPlaybackNoVisualUpdates();
        annotations.recordingCursor.hide();
        annotations.clearAllCanvases();
        annotations.refreshAllAnnotationHighlights();
        annotations.refreshAnnotationTips();
        annotations.updateControlsDisplay();
        annotations.sitePanel.animate({ scrollTop: state.getScrollTop() }, 750);
      },

      startPlayback: () => {
        // start playback
        console.log('Starting playback.');
        const activity = state.getActivity();
        if (activity === 'idle') {
          // If just starting to play back, store all cells current contents so we can restore them when you cancel playback.
          utils.saveNotebook();
          annotations.clearRecorderHint(); // clear any recorder hint e.g. "play your new movie"
          state.setLastGarnishInfo(0,0,false, 'highlight'); // make sure we've turned off any garnishing flag from a previous interrupted playback
          state.setScrollTop(annotations.sitePanel.scrollTop());
          state.storeCellStates();
          // Restore all cell outputs seen when a recording began
          //annotations.restoreAllCellOutputs();
        }

        annotations.clearAllCanvases();
        annotations.recordingCursor.show();
        state.setActivity('playing');

        annotations.togglePlayButtons();

        if (state.resetOnNextPlay) {
          console.log('Resetting for first play.');
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
              annotations.togglePlayBack();
              state.setupForReset();
            } else {
              annotations.updateSlider(playedSoFar);
              annotations.updateTimeDisplay(playedSoFar);
              const frameIndexes = state.getHistoryRecordsAtTime(playedSoFar);
              annotations.updateDisplay(frameIndexes);
            }
          }, 10)
        );
      },

      togglePlayBack: () => {
        const activity = state.getActivity();
        if (activity !== 'recording') {
          if (activity === 'playing') {
            annotations.stopPlayback();
          } else {
            annotations.startPlayback();
          }
          annotations.updateControlsDisplay();
        }
      },

      loadAndPlayMovie: (cellId, recordingId) => {
        annotations.cancelPlayback(); // cancel any ongoing movie playback b/c user is switching to a different movie
        storage.loadMovie(cellId, recordingId).then( () => {
          console.log('Movie loaded for cellId, recordingId:', cellId, recordingId);
          annotations.togglePlayBack();
        }).catch( (ex) => {
          dialog.modal({
            title: 'Movie is not available.',
            body: 'We are sorry, we could not load this movie at this time. Please contact the author of this Notebook for help.',
            sanitize:false,
            buttons: {
              'OK': { click: (e) => { console.log('Missing movie acknowledged.'); } }
            }
          });

          console.log('could not load movie:', ex);
        });

      },

      togglePlayButtons: () => {
        if (state.getActivity() === 'playing') {
          $('#btn-play').hide();
          $('#btn-stop-play').show();
        } else if (state.getActivity() === 'idle') {
          $('#btn-play').show();
          $('#btn-stop-play').hide();
        }
      },

      playRecordingById: (recordingFullId) => {
        const parts = recordingFullId.split('_');
        const cellId = parts[0];
        const recordingId = parts[1];
        annotations.loadAndPlayMovie(cellId, recordingId);
      },

      playRecordingByIdWithPrompt: (recordingFullId, promptMarkdown) => {
        const promptHtml = '<span>' + utils.renderMarkdown(promptMarkdown) + '</span>';
        
        annotations.setNotificationClickable(promptHtml, () => {
          annotations.clearNotification(true);
          annotations.playRecordingById(recordingFullId);
        });
      },

      changeAccessLevel: (level) => {
        if (level === 'create') {
          if (!state.getAudioInitialized()) {
            audio.init();
            state.setAudioInitialized();
          }
          state.setAuthorId(0); // currently hardwiring this to creator(teacher) ID, which is always 0. Eventually we will replace this with 
                                // individual author ids
          storage.ensureNotebookGetsGraffitiId();
          state.assignCellIds();
          utils.saveNotebook();
          annotations.initInteractivity();
        }          
        state.setAccessLevel(level); 
        annotations.updateControlsDisplay();
      },
    };

    // Functions exposed externally to the Python API.
    return {
      init: annotations.init,
      playRecordingById: annotations.playRecordingById,
      playRecordingByIdWithPrompt: (recordingFullId, promptMarkdown) => { annotations.playRecordingByIdWithPrompt(recordingFullId, promptMarkdown) },
      cancelPlayback: annotations.cancelPlayback,
      removeAllAnnotations: annotations.removeAllAnnotationsWithConfirmation,
      setAccessLevel: (level) => { annotations.changeAccessLevel(level) },
    }

  })();

  return Annotations;

});
