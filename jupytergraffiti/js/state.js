define([
  './utils.js',
], function (utils) {
  const state = {
    init: () => {
      console.log('Graffiti: state constructor running.');
      state.history = undefined;
      state.manifest = {};
      state.utils = utils;
      state.accessLevel = 'view'; // one of 'create' or 'view'. If 'create' then we can create new graffitis, otherwise we can only view them
      state.authorId = 0; // defaults to the creator(teacher) in v1 of Graffiti but eventually this will be (potentially) set to a viewer(student) id.
      state.authorType = 'creator';  // currently hardwired to be creator (teacher).
      state.audioInitialized = false;
      state.recordingBlocked = false;
      state.activity = 'idle'; // one of "recording", "playing", "idle"
      state.pointer = { x : 0, y: 0 };
      state.playbackTimeElapsed = 0;
      state.windowSize = state.getWindowSize();
      state.resetOnNextPlay = false;
      state.recordedAudioString = '';
      state.audioStorageCallback = undefined;
      state.frameArrays = ['view', 'selections', 'contents', 'drawings'];
      state.scrollTop = undefined;
      state.selectedCellId = undefined;
      state.mute = false;
      state.rapidPlay = false;
      state.rapidPlayTime = 0;
      state.regularPlayRate = 1.0;
      state.rapidPlayRate = 2.0;
      state.recordedCursorPosition = { x: -1000, y: -1000 };
      state.viewInfo = undefined;
      state.recordingCellInfo = {};
      state.storageInProcess = false;
      state.tipTimeout = undefined;
      state.displayedTipInfo = undefined;
      state.movieRecordingStarted = false;
      state.cellsAffectedByActivity = {};
      state.drawingFadeClockAllowed = true;
      state.drawingFadeStart;
      state.drawingFadeDuration = 1000;
      state.drawingFadePreFadeDelay = 2000;
      state.maxDrawingOpacity = 0.5;
      state.drawingOpacity = state.maxDrawingOpacity;
      state.totalDrawingFadeDuration = state.drawingFadePreFadeDelay + state.drawingFadeDuration;
      state.lastDrawingInfo = { drawinging: false };
      state.lastEditActivityTime = undefined;
      state.controlPanelDragging = false;
      state.controlPanelDragOffset = { x: 0, y: 0 };
      state.playableMovies = {};
      state.selectionSerialized = undefined;
      state.hidePlayerAfterPlayback = false;
      state.dontRestoreCellContentsAfterPlayback = false; // this is something the author can decide with an API call.
      state.cellOutputsSent = {};
      state.lastStickerPositions = undefined;
      state.cellIdsAddedDuringPlayback = {};
      state.cellStates = {
        contents: {},
        changedCells: {},
        selections: {}
      };

      // Set up a default version of the drawing state object. This gets updated during drawing activity.
      state.drawingState = {
        drawingModeActivated: false,     // when true a drawing tool is selected
        drawingActivity: 'draw',         // One of 'draw', 'fade', 'wipe', 'sticker'. Note that 'drawing activity' includes using the eraser tool and stickering
        cellId: undefined,
        positions: {
          start: { x: 0, y: 0 },
          end: { x: 0, y: 0 }
        },
        pen: {
          isDown: false, // becomes true when the pen is down, ie user has clicked and held the mouse button
          mouseDownPosition: { x : 0, y: 0 },
          permanence: 'temporary', // default: ink disappears after a second of inactivity
          type: 'line', // one of 'line', 'highlight', 'eraser', 'sticker'
          color: 'black',
          dash: 'solid', // one of 'solid', 'dashed'
          fill: 'none', // one of 'none', '#xyz'
          fillOpacity: 0
        },
        stickerOnGrid: false,
        stickersRecords: {}, // This contains records of all stickers drawn to date during a recording, or since the last fadeout in a recording.
        opacity: state.maxDrawingOpacity
      };

      
      utils.refreshCellMaps();

    },

    getManifest: () => {
      return state.manifest;
    },

    setManifest: (manifest) => {
      state.manifest = $.extend({}, manifest);
    },

    removeManifestEntry: (recordingCellId, recordingKey) => {
      const recordings = state.getManifestRecordingsForCell(recordingCellId);
      if (recordings != undefined) {
        if (recordings.hasOwnProperty(recordingKey)) {
          delete(recordings[recordingKey]);
          return true;
        }
      }
      return false;
    },

    getManifestSingleRecording: (recordingCellId, recordingKey) => {
      const recordings = state.getManifestRecordingsForCell(recordingCellId);
      if (recordings === undefined) {
        return undefined;
      }
      return recordings.hasOwnProperty(recordingKey) ? recordings[recordingKey] : undefined;
    },

    getManifestRecordingsForCell: (recordingCellId) => {
      return state.manifest.hasOwnProperty(recordingCellId) ? state.manifest[recordingCellId] : undefined;
    },

    setSingleManifestRecording: (recordingCellId, recordingKey, recordingData) => {
      if (!state.manifest.hasOwnProperty(recordingCellId)) {
        state.manifest[recordingCellId] = {};
      }
      state.manifest[recordingCellId][recordingKey] = recordingData;
    },

    getAccessLevel: () => {
      return state.accessLevel;
    },

    setAccessLevel: (level) => {
      state.accessLevel = level;
    },

    getAuthorId: () => {
      return state.authorId;
    },

    setAuthorId: (authorId) => {
      state.authorId = authorId;
    },

    getAuthorType: () => {
      return state.authorType;
    },

    setAuthorType: (authorType) => {
      state.authorType = authorType;
    },

    getAudioInitialized: () => {
      return state.audioInitialized;
    },

    setAudioInitialized: () => {
      state.audioInitialized = true;
    },

    getLastEditActivityTime: () => {
      return state.lastEditActivityTime;
    },

    setLastEditActivityTime: () => {
      state.lastEditActivityTime = utils.getNow();
    },

    clearLastEditActivityTime: () => {
      state.lastEditActivityTime = undefined;
    },

    getControlPanelDragging: () => {
      return state.controlPanelDragging;
    },

    getControlPanelDragOffset: () => {
      return state.controlPanelDragOffset;
    },

    setControlPanelDragOffset: (offset) => {
      state.controlPanelDragOffset = offset;
    },
    
    setControlPanelDragging: (dragging) => {
      state.controlPanelDragging = dragging;
    },

    // Window proportion adjustments for when recording is played on a different sized window than what it was recorded on. Not used any more
    getWindowSize: () => {
      return { width: $(window).width(), height: $(window).height() }
    },

    setTipTimeout: (tipFunc, t) => {
      state.clearTipTimeout();
      state.tipTimeout = setTimeout(tipFunc, t);
    },

    clearTipTimeout: () => {
      if (state.tipTimeout !== undefined) {
        clearTimeout(state.tipTimeout);
        state.tipTimeout = undefined;
      }
    },

    clearDisplayedTipInfo: () => {
      state.displayedTipInfo = undefined;
    },

    setDisplayedTipInfo: (cellId, recordingKey) => {
      state.displayedTipInfo = { cellId: cellId, recordingKey: recordingKey };
    },

    getDisplayedTipInfo: () => {
      return state.displayedTipInfo;
    },

    storeLastStickerPositions: () => {
      if (state.lastStickerPositions === undefined) {
        state.lastStickerPositions = {
          start: { x: state.drawingState.positions.start.x, y: state.drawingState.positions.start.y },
          end:   { x: state.drawingState.positions.end.x, y: state.drawingState.positions.end.y },
          width: Math.abs(state.drawingState.positions.end.x - state.drawingState.positions.start.x),
          height: Math.abs(state.drawingState.positions.end.y - state.drawingState.positions.start.y)
        }
      }
    },

    getLastStickerPositions: () => {
      return state.lastStickerPositions;
    },

    clearLastStickerPositions: () => {
      state.lastStickerPositions = undefined;
    },

    saveSelectedCellId: (cellId) => {
      state.selectedCellId = cellId;
    },

    getSelectedCellId: () => {
      return state.selectedCellId;
    },

    getMute: () => {
      return state.mute;
    },

    setMute: (muteState) => {
      state.mute = muteState;
    },

    getRapidPlayRate: () => {
      return state.rapidPlayRate;
    },

    getRegularPlayRate: () => {
      return state.regularPlayRate;
    },

    getRapidPlay: () => {
      return state.rapidPlay;
    },

    setRapidPlay: (rapidPlay) => {
      if (state.activity === 'playing') {
        if (rapidPlay) {
          state.rapidPlayStartTime = utils.getNow();
        } else {
          state.rapidPlayTime += utils.getNow() - state.rapidPlayStartTime;
        }
      }
      state.rapidPlay = rapidPlay;
    },

    setRapidPlayStartTimeToNowIfOn: () => {
      if (state.rapidPlay && state.activity === 'playing') {
        state.rapidPlayStartTime = utils.getNow();
      }
    },

    resetRapidPlayTime: () => {
      state.rapidPlayTime = 0;
    },

    shouldUpdateDisplay: (kind, frameIndex) => {
      if (frameIndex === undefined) {
        return false;
      }
      if (state.history.processed[kind] === frameIndex.index) {
        return false; // during playback, we've already processed this record so don't reprocess it.
      }
      state.history.processed[kind] = frameIndex.index;
      return true;
    },

    blockRecording: () => {
      state.recordingBlocked = true;
    },

    unblockRecording: () => {
      state.recordingBlocked = false;
    },

    //
    // Drawing utility fns
    //
    getDrawingPenAttribute: (attr) => {
      return state.drawingState.pen[attr];
    },

    getDrawingState: () => {
      return state.drawingState;
    },
    
    getDrawingStateField: (field) => {
      return state.drawingState[field];
    },

    // Store the stickers stages sticker lists for later redrawing during playing/scrubbing
    storeStickersStateForCell: (stickers, cellId) => {
      let stickersRecords = {};
      if ((stickers !== undefined) && (stickers.length > 0)) {
        stickersRecords = [];
        for (let sticker of stickers) {
          stickersRecords.push({
            positions: { start: { x: sticker.positions.start.x, y: sticker.positions.start.y },
                         end:   { x: sticker.positions.end.x, y: sticker.positions.end.y } },
            pen: {
              stickerType: sticker.pen.stickerType,
              color: sticker.pen.color,
              dash:  sticker.pen.dash,
              fill:  sticker.pen.fill,
              fillOpacity:  sticker.pen.fillOpacity,
              permanence: sticker.pen.permanence,
            },
            stickerOnGrid: sticker.stickerOnGrid
          });
        }
      }
      state.drawingState.stickersRecords = stickersRecords;
      // console.log('stickersRecords:', stickersRecords);
    },

    updateDrawingState: (changeSets) => {
      for (let changeSet of changeSets) {
        const change = changeSet.change;
        const data = changeSet.data;
        const drawingState = state.drawingState;
        drawingState.wipe = false; // default, we don't register a wipe state
        switch (change) {
          case 'drawingModeActivated':
            drawingState.drawingModeActivated = data; // a drawing/sticker tool is activated.
            break;
          case 'drawingActivity':
            drawingState.drawingActivity = data; // the drawing mode (mouse is down) : one of 'draw', 'sticker', 'fade', 'wipe' (mutually exclusive)
            break;
          case 'cellId':
            drawingState.cellId = data;
            break;
          case 'mouseDownPosition':
            drawingState.pen.mouseDownPosition = { x: data.x, y: data.y };
            break;
          case 'isDown':
            drawingState.pen.isDown = data;
            break;
          case 'stickerOnGrid':
            drawingState.stickerOnGrid = data;
            break;
          case 'fillOpacity': // if sticker fill is actually visible
            drawingState.pen.fillOpacity = data;
            break;
          case 'penType':
            drawingState.pen.type = data;  // one of 'line', 'highlight', 'eraser', or 'sticker'
            break;
          case 'stickerType':
            drawingState.pen.stickerType = data; // one of many sticker types. if this is set that penType will not be set, and vice versa
            let fill = 'none'; // fill color. this is confusing and needs to be cleaned up a lot
            switch (data) {
              case 'isocelesTriangle':
              case 'rightTriangle':
              case 'ellipse':
              case 'rectangle':          
              case 'leftCurlyBrace':
              case 'rightCurlyBrace':
              case 'symmetricCurlyBraces':
              case 'topBracket':
              case 'bottomBracket':
              case 'leftBracket':
              case 'rightBracket':
              case 'horizontalBrackets':
              case 'verticalBrackets':
              case 'smiley':
              case 'frowney':
              case 'thumbsUp':
              case 'thumbsDown':
              case 'star':
              case 'line':
              case 'lineWithArrow':
                break;
              case 'checkMark':
                fill = '00aa00'; // hardwired to green
                break;
              case 'x':
                fill = 'aa0000'; // hardwired to reddish
                break;
              case 'theta': // greek symbols hardwired to black
              case 'sigma':
                fill = '000000';
                break;
            }
            drawingState.pen.fill = fill; // fill color, if opacity == 1
            break;
          case 'permanence':
            drawingState.pen.permanence = data; // one of 'permanent', 'temporary'
            break;
          case 'positions':
            let bbox = { start: { x: data.positions.start.x, y: data.positions.start.y }, end: { x: data.positions.end.x, y: data.positions.end.y } };
            if (drawingState.pen.penType === 'sticker') {
              if (drawingState.pen.stickerType !== 'line') {
                // Unless we're drawing a line sticker, we want to compute bounding box around the given shape, as it will always be the same orientation, and
                // always have a minimum size
                bbox = { start: { x: Math.min(data.positions.start.x, data.positions.end.x), 
                                  y: Math.min(data.positions.start.y, data.positions.end.y) },
                         end:   { x: Math.max(data.positions.start.x, data.positions.end.x), 
                                  y: Math.max(data.positions.start.y, data.positions.end.y) }
                };
              }
            }
            drawingState.positions = bbox;
            break;
          case 'color':
            drawingState.pen.color = data;
            break;
          case 'dash':
            drawingState.pen.dash = data; // one of 'solid', 'dashed'
            break;
          case 'opacity':
            drawingState.opacity = data; // set during fades of temporary ink
            break;
          case 'wipe':
            drawingState.wipe = true; // after fades are done, this record wipes the temporary canvases clean
            break;
        }
      }
      // console.log('updateDrawingState, state=', state.drawingState);
    },

    resetDrawingOpacity: () => {
      state.drawingState.opacity = state.maxDrawingOpacity;
    },

    getActivePenType: () => {
      return state.drawingState.pen.type;
    },

    getDrawingOpacity: () => {
      return state.drawingOpacity;
    },

    setDrawingOpacity: (opacity) => {
      state.drawingState.drawingOpacity = opacity;
    },

    getMaxDrawingOpacity: () => {
      return state.maxDrawingOpacity;
    },

    resetDrawingOpacity: () => {
      state.drawingState.drawingOpacity = state.maxDrawingOpacity;
    },

    getDrawingFadeTimeSoFar: () => {
      return utils.getNow() - state.drawingFadeStart;
    },

    calculateDrawingOpacity: () => {
      // console.log('drawingFadeCounter', state.drawingFadeCounter);
      const timeSoFar = state.getDrawingFadeTimeSoFar();
      let opacity = state.maxDrawingOpacity;
      if (!state.drawingFadeClockAllowed || timeSoFar < state.drawingFadePreFadeDelay) {
        return { status: 'max', opacity: state.maxDrawingOpacity };
      }
      if (timeSoFar < state.totalDrawingFadeDuration) {
        opacity = ((state.totalDrawingFadeDuration - timeSoFar) / state.drawingFadeDuration) * state.maxDrawingOpacity;
        //console.log('calculateDrawingOpacity:', opacity);
        return { status: 'fade', opacity: opacity };
      }
      return { status: 'fadeDone', opacity: 0 };
    },

    disableDrawingFadeClock: () => {
      state.drawingFadeClockAllowed = false; // not allowed while drawing a drawing
    },

    startDrawingFadeClock: () => {
      // console.log('startDrawingFadeClock');
      state.drawingFadeStart = utils.getNow();
      state.drawingFadeClockAllowed = true;
    },

    getLastRecordedCursorPosition: () => {
      return { x: state.recordedCursorPosition.x, y: state.recordedCursorPosition.y }
    },

    setLastRecordedCursorPosition: (pos) => {
      state.recordedCursorPosition = { x: pos.x, y: pos.y }
    },

    getPlaybackStartTime: () => {
      return state.playbackStartTime;
    },

    setPlaybackStartTime: (startTime) => {
      state.playbackStartTime = startTime;
    },

    getRecordingInterval: () => {
      return state.recordingInterval;
    },

    setRecordingInterval: (interval) => {
      state.recordingInterval = interval;
    },

    getPlaybackInterval: () => {
      return state.playbackInterval;
    },

    setPlaybackInterval: (interval) => {
      state.playbackInterval = interval;
    },

    getPlaybackTimeElapsed: () => {
      return state.playbackTimeElapsed;
    },

    setPlaybackTimeElapsed: (timeElapsed) => {
      if (timeElapsed === undefined) {
        const timePlayedSoFar = state.getTimePlayedSoFar();
        state.playbackTimeElapsed = timePlayedSoFar;
        console.log('Graffiti: setPlaybackTimeElapsed: playbackTimeElapsed=', state.playbackTimeElapsed,
                    'timePlayedSoFar=', timePlayedSoFar, 'playbackStartTime', state.playbackStartTime);
      } else {
        state.playbackTimeElapsed = timeElapsed;
      }
    },

    getSetupForReset: () => {
      return state.resetOnNextPlay;
    },

    clearSetupForReset: () => {
      state.resetOnNextPlay = false;
    },

    setupForReset: () => {
      state.resetOnNextPlay = true;
    },

    getResetOnNextPlay: () => {
      return state.resetOnNextPlay;
    },

    // Set the index back to the beginning
    resetPlayState: () => {
      state.resetOnNextPlay = false;
      state.playbackTimeElapsed = 0;
      state.resetRapidPlayTime();
    },

    getActivity: () => {
      return state.activity;
    },

    setActivity: (newState) => {
      console.log('Graffiti: setting activity to:', newState);
      state.activity = newState;
    },

    getPointerPosition: () => {
      return state.pointer;
    },

    storePointerPosition: (x,y) => {
      state.pointer = { x: x, y: y };
      //console.log('graffiti.state.pointer:', graffiti.state.pointer);
    },

    getViewInfo: () => {
      return state.viewInfo;
    },

    storeViewInfo: (viewInfo) => {
      // console.log('storeViewInfo, hover cellId:', viewInfo.cellId);
      if (viewInfo.cellId !== undefined) { // may not be set if cursor is btwn cells
        state.viewInfo = $.extend({}, viewInfo);
      }
    },

    setSelectionSerialized: (selectionSerialized) => {
      state.selectionSerialized = selectionSerialized;
    },

    clearSelectionSerialized: () => {
      state.selectionSerialized = undefined;
    },

    getSelectionSerialized: () => {
      return state.selectionSerialized;
    },

    getRecordingCellInfo: () => {
      // Copy the latest duration into the recordingCellInfo so we persist it in the manifest, if we have it (for the activeTake only)
      if ((state.history !== undefined) && (state.history.duration !== undefined) &&
          (state.recordingCellInfo.takes !== undefined) && (state.recordingCellInfo.activeTakeId !== undefined)) {
        state.recordingCellInfo.takes[state.recordingCellInfo.activeTakeId].duration = state.history.duration;
      }
      return state.recordingCellInfo;
    },

    storeRecordingCellInfo: (cellInfo) => {
      console.log('storeRecordingCellInfo:', cellInfo);
      state.recordingCellInfo = cellInfo;
    },

    getPlayableMovie: (kind) => {
      return state.playableMovies[kind];
    },

    setPlayableMovie: (kind, cellId, recordingKey, activeTakeId) => {
      const cell = utils.findCellByCellId(cellId);
      state.playableMovies[kind] = { cellId: cellId, recordingKey: recordingKey, activeTakeId: activeTakeId, cell: cell, cellType: cell.cell_type, };
    },

    clearPlayableMovie: (kind) => {
      state.playableMovies[kind] = undefined;
    },

    getMovieRecordingStarted: () => {
      return state.movieRecordingStarted;
    },

    setMovieRecordingStarted: (status) => {
      state.movieRecordingStarted = status;
    },

    getStorageInProcess: () => {
      return state.storageInProcess;
    },

    setStorageInProcess: (status) => {
      state.storageInProcess = status;
    },

    getHidePlayerAfterPlayback: () => {
      return state.hidePlayerAfterPlayback;
    },

    setHidePlayerAfterPlayback: (status) => {
      state.hidePlayerAfterPlayback = status;
    },

    getDontRestoreCellContentsAfterPlayback: () => {
      return state.hidePlayerAfterPlayback;
    },

    setDontRestoreCellContentsAfterPlayback: (status) => {
      state.dontRestoreCellContentsAfterPlayback = status;
    },

    clearCellOutputsSent: () => {
      state.cellOutputsSent = {};
    },

    recordCellIdAddedDuringPlayback: (cellId) => {
      state.cellIdsAddedDuringPlayback[cellId] = true;
      console.log('cellIdsAddedDuringPlayback:', state.cellIdsAddedDuringPlayback);
    },

    clearCellIdsAddedDuringPlayback: () => {
      state.cellsIdsAddedDuringPlayback = {};
    },

    // In any history:
    //
    // Each entry in pointer[] is an object with:
    //   end time of this frame
    //   cursor position relative to active cell
    //   a hash of cell selections
    // Each entry in selection[] is an object with:
    //   end time of this frame
    //   currently active cell id
    //   a hash of all cell selections
    // Each entry in contents[] is an object with:
    //   end time of this frame
    //   hash of all cell contents by id

    dumpHistory: () => {
      console.log('Dumping JSON history');
      console.log("=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
      console.log(state.history);
      console.log("=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
    },

    createViewRecord: (subType) => {
      return $.extend({}, state.viewInfo, {
        x: state.pointer.x - parseInt(state.viewInfo.innerCellRect.left),
        y: state.pointer.y - parseInt(state.viewInfo.innerCellRect.top),
        subType: subType,
        scrollDiff: state.viewInfo.scrollDiff,
        selectedCellId: state.selectedCellId
      });
    },

    createDrawingRecord: () => {
      const cell = utils.findCellByCellId(state.drawingState.cellId);
      const cellRects = utils.getCellRects(cell);
      let record = $.extend(true, {}, {
        innerCellRect: { 
          left: cellRects.innerCellRect.left, 
          top: cellRects.innerCellRect.top,
          width: cellRects.innerCellRect.width,
          height: cellRects.innerCellRect.height
        }
      }, state.drawingState);

      // Remove statuses that are not needed in history records
      delete(record.drawingModeActivated);
      delete(record.pen.isDown);
      delete(record.wipe);
      delete(record.stickerActive);
      //console.log('createDrawingRecord:', record);
      return record;
    },

    createSelectionsRecord: () => {
      const activeCell = Jupyter.notebook.get_selected_cell();
      const cells = Jupyter.notebook.get_cells();
      const cellsSelections = {};
      let cellId, cm, cell, selections, cellSelections, output, outputs0, ourJs;
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        if (cell.cell_type === 'code') {
          cellId = utils.getMetadataCellId(cell.metadata);
          cm = cell.code_mirror;
          selections = utils.cleanSelectionRecords(cm.listSelections());
          output = null;
          ourJs = false; 
          if (cell.output_area.outputs.length > 0) {
            outputs0 = cell.output_area.outputs[0];
            output_type = outputs0.output_type;
            // console.log('checking output area output_type:', output_type);
            if (output_type === 'display_data') {
              if (outputs0.data.hasOwnProperty('application/javascript')) {
                if (outputs0.data['application/javascript'].match(/Graffiti\sjavascript/g) !== null) {
                  ourJs = true;
                }
              }
            }
            if (!ourJs) {
              // Note that we filter out our own javascript outputs-- we don't want to rerun these when we restore cell states or 
              // else we could rerun the whole recording.
              // console.log('recording output for outputs0:', outputs0);
              output = { 
                header: { msg_type: output_type },
                content: outputs0
              };
            }
          } else {
            // if this code cell has no output at time of recording, record that fact for playback
            output = {
              empty: true
            };
          }
          cellSelections = {
            index: i,
            active: cellId === utils.getMetadataCellId(activeCell.metadata),
            selections: selections,
            output: output
          }
          cellsSelections[cellId] = cellSelections;
        }
      }

      return { 
        cellsSelections: cellsSelections,
        // Record text selections in rendered markdown or output areas. These are to be found in state.selectionSerialized (or if none, undefined)
        textSelection: state.selectionSerialized
      };
    },

    extractDataFromContentRecord: (record, cellId) => {
      if (record.backRef !== undefined) {
        if (record.backRefKind === 'contents') {
          return state.history.contents[record.backRef].cellsContent[cellId].contentsRecord.data;
        } else {
          return state.history.contents[record.backRef].cellsContent[cellId].outputsRecord.data;
        }
      }
      return record.data;
    },

    createBackRefRecord: (data, backRefKind, backRefArray, cellId) => {
      let backRef;
      let record = backRefArray[cellId];
      if (record !== undefined) {
        if ( (backRefKind === 'contents' && data === record.data) ||
             (backRefKind === 'outputs'  && _.isEqual(data, record.data)) ) {
          backRef = record.index;
          data = undefined;
        }
      }
      // Store as-yet-unseen contents or outputs for later backref. Delete the backRefKind value to avoid confusion, *unless* we are not bothering 
      // with backref storage (because we're using this function from storeCellStates() via createContentsRecord().
      if (data !== undefined) {
        backRefKind = undefined;
        backRefArray[cellId] = {
          index: state.history.contents.length, // note that this is not the length - 1, because we are still contructing
          // this contents record and haven't pushed it onto the history yet.
          data: data
        }
      }
      return {
        data: data,
        backRefKind: backRefKind,
        backRef: backRef
      }
    },

    createContentsRecord: (doBackRefStore) => {
      let cellId, cell, contents, outputs, contentsBackRefRecord, outputsBackRefRecord;
      const cells = Jupyter.notebook.get_cells();
      let cellsContent = {}, cellIdsList = [];
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        cellId = utils.getMetadataCellId(cell.metadata);
        cellIdsList.push(cellId);
        contents = cell.get_text();
        outputs = undefined;
        // Store the DOM contents of the code cells for rerendering.
        const cellDom = $(cell.element);
        const outputArea = cellDom.find('.output');
        if (outputArea.length > 0) {
          outputs = outputArea.html();
        }

        if (doBackRefStore) {
          contentsBackRefRecord = state.createBackRefRecord(contents, 'contents', state.history.cellContentsTracking, cellId);
          outputsBackRefRecord =  state.createBackRefRecord(outputs,  'outputs',  state.history.cellOutputsTracking,  cellId);
        } else {
          contentsBackRefRecord = { data: contents, backRefKind: 'contents', backRef: undefined };
          outputsBackRefRecord =  { data: outputs,  backRefKind: 'outputs',  backRef: undefined  };
        }

        // console.log('createContentsRecord, outputs:', outputs);
        let cellContent = {
          index: i,
          contentsRecord: contentsBackRefRecord,
          outputsRecord: outputsBackRefRecord
        }
        cellsContent[cellId] = cellContent;
      }

      return { cellsContent: cellsContent, cellIdsList: cellIdsList };
    },

    storeHistoryRecord: (type, time) => {
      if (state.activity !== 'recording' || state.recordingBlocked)
        return;

      let record;
      // Note: we override the type to throw together pointer moves, scroll innerScroll, and focus in one history record type
      switch (type) {
        case 'pointer':
          record = state.createViewRecord('pointer');
          type = 'view'; // override passed-in type: pointer is a view type
          break;
        case 'scroll':
          record = state.createViewRecord('scroll');
          type = 'view'; // override passed-in type: scroll is a view type
          break;
        case 'innerScroll':
          record = state.createViewRecord('innerScroll');
          type = 'view'; // override passed-in type: innerScroll is a view type
          break;
        case 'focus':
          record = state.createViewRecord('focus');
          type = 'view'; // override passed-in type: focus is a view type
          break;
        case 'drawings':
        case 'stickers':
          record = state.createDrawingRecord(); // these are identical, except for the drawingActivity field and related data
          break;
        case 'selections':
          record = state.createSelectionsRecord();
          break;
        case 'contents':
          record = state.createContentsRecord(true);
          break;
      }
      record.startTime = (time !== undefined ? time : state.utils.getNow());
      state.history[type].push(record);
    },

    initHistory: (initialValues) => {
      const now = state.utils.getNow();
      state.history = {
        storageCellId: initialValues.storageCellId,
        recordingStartTime: now,

        // Time tracks: all pointer positions, cell selections and contents over the time of the recording.
        view:        [],                          // pointer move, vertical scroll or innerscroll (scroll inside cell)
        selections:  [],                          // cell selections
        contents:    [],                          // contents state: what cells present, and what their contents are, and cell outputs
        drawings:    [],                          // drawing record, of type: ['draw', 'fade', 'wipe', 'sticker']

        // Where we are in each track, during playback.
        lastVisited: {
          view:       0,
          selections: 0,
          contents:   0,
          drawings:   0
        },

        // What was the latest record processed during playback (so we don't process a record twice)
        processed: {
          view:       undefined,
          selections: undefined,
          contents:   undefined,
          drawings:   undefined
        },
        
        cellContentsTracking: {},                  // this enables back-referencing to reduce storage costs on content recording
        cellOutputsTracking:  {},                  // this enables back-referencing to reduce storage costs on output recording
      }

      // Store initial state records at the start of recording.
      state.storeHistoryRecord('pointer',    now);
      state.storeHistoryRecord('scroll',     now);
      state.storeHistoryRecord('focus',      now);
      state.storeHistoryRecord('selections', now);
      state.storeHistoryRecord('contents',   now);
    },

    finalizeHistory: () => {
      state.setHistoryDuration();
      state.normalizeTimeframes();
      state.setupForReset();
    },

    deleteTrackingArrays: () => {
      // console.log('finalizeHistory: deleting Tracking arrays');
      delete(state.history.cellContentsTracking);
      delete(state.history.cellOutputsTracking);
    },

    getJSONHistory: () => {
      let jsonHistory;
      try {
        jsonHistory = JSON.stringify(state.history);
        return jsonHistory;
      } catch(ex) {
        return undefined;
      }
    },

    getHistoryDuration: () => {
      return state.history.duration;
    },

    setHistoryDuration: () => {
      state.history.duration = state.utils.getNow() - state.history.recordingStartTime;
    },

    // When recording finishes, normalize all time frames
    normalizeTimeframes: () => {
      const recordingStartTime = state.history.recordingStartTime;
      const now = state.utils.getNow();
      debugger;
      for (let arrName of state.frameArrays) {
        let historyArray = state.history[arrName];
        let max = historyArray.length - 1;
        for (let i = 0; i < historyArray.length; ++i) {
          if ((historyArray.length === 1) || (i === max)) {
            historyArray[i].endTime = now;
          } else {
            historyArray[i].endTime = historyArray[i+1].startTime;
          }
          historyArray[i].startTime = historyArray[i].startTime - recordingStartTime;
          historyArray[i].endTime = historyArray[i].endTime - recordingStartTime;
        }
        // console.log('normalized ', historyArray.length, 'records for array', arrName);
      }
    },

    // Get all history record frame types straddling a given time. If given time < time of first record or > time of last record, return undefined.
    getHistoryRecordsAtTime: (t) => {
      let indexes = {}, frame, historyArray, arrName, scanPtr, scanDir, currentFrameIndex, previousFrameIndex, numRecords, skipped = {};
      const historyDuration = state.getHistoryDuration();
      const halfHistory = historyDuration / 2;
      for (arrName of state.frameArrays) {
        skipped[arrName] = -1;
        historyArray = state.history[arrName];
        if (historyArray !== undefined) {
          numRecords = historyArray.length;
          currentFrameIndex = state.history.lastVisited[arrName];
          indexes[arrName] = undefined;
          if (historyArray.length > 0) {
            // Only do a scan if the time is within the band of recorded history. E.g. there may only be drawing
            // history in the middle of all recorded time so don't look for records if you're outside that band.
            if ((t >= historyArray[0].startTime) || (t <= historyArray[historyArray.length - 1].endTime)) {
              previousFrameIndex = currentFrameIndex;
              frame = historyArray[currentFrameIndex];
              if ((t >= frame.startTime) && (t < frame.endTime)) {
                // We're already in the right frame so just return that
                indexes[arrName] = { index: currentFrameIndex, rangeStart: undefined };
              } else {
                // if the distance between the start time of the current frame and t is
                // < 10% of the total duration, start scanning up or
                // down from the current frame until you find the right frame.
                const tDist = t - frame.startTime;
                const tDistAbs = Math.abs(tDist);
                if ((tDistAbs / historyDuration) < 0.1) {
                  scanDir = Math.sign(tDist);
                  scanPtr = currentFrameIndex + scanDir;
                } else {
                  // Scan to find the frame:
                  //  from the beginning of the recording if the time is in the first half of the recording,
                  //  otherwise scan backwards from the end
                  if (t < halfHistory) {
                    scanPtr = 0;
                    scanDir = 1;
                  } else {
                    scanPtr = numRecords - 1;
                    scanDir = -1;
                  }
                }
                // Now scan to find the right frame by looking for t within the time frame.
                while ((scanPtr >= 0) && (scanPtr < numRecords)) {
                  frame = historyArray[scanPtr];
                  if ((t >= frame.startTime) && (t < frame.endTime)) {
                    indexes[arrName] = { index: scanPtr, rangeStart: undefined };
                    state.history.lastVisited[arrName] = scanPtr;
                    break;
                  }
                  scanPtr += scanDir;
                  skipped[arrName]++;
                }
                if ((indexes[arrName] !== undefined) && (indexes[arrName].index !== previousFrameIndex) && (indexes[arrName].index > previousFrameIndex)) {
                  // If we skipped forward a bunch of records to catch up with real time, remember how far we skipped. 
                  // This is needed to make sure we (re)draw everything we recorded during the time that was skipped over.
                  // Time skipping happens because browser setInterval timing isn't that reliable, so to avoid desynching
                  // with the audio track, we sometimes need to skip records.
                  indexes[arrName].rangeStart = previousFrameIndex + 1;
                }                
              }
            }
          }
        }
      }
      //console.log('getHistoryRecordsAtTime:, t=', t, 'records skipped:', skipped, 'indexes[drawings]:', indexes['drawings']);
      return(indexes);
    },

    // Get index of record just before or at the specified time. Used for scrubbing/redrawing drawings/stickers.
    getIndexUpToTime: (kind, t) => {
      let i;
      const historyArray = state.history[kind];
      for (i = 0; i < historyArray.length; ++i) {
        if (historyArray[i].startTime >= t) {
          return i;
        }
      }
      // check to see if time is on or past the last known record.
      i = historyArray.length - 1;
      if (((historyArray[i].startTime < t) && (historyArray[i].endTime >= t)) ||
          (historyArray[i].endTime < t)) {
        return i;
      }

      return undefined;
    },

    getHistoryItem: (kind, index) => {
      if ((index < state.history[kind].length) && (index >= 0)) {
        return state.history[kind][index];
      }
      return undefined;
    },

    storeWholeHistory: (history) => {
      state.history = $.extend({}, history);
      state.resetPlayState();
    },

    getTimeRecordedSoFar: () => {
      return state.utils.getNow() - state.history.recordingStartTime;
    },

    getTimePlayedSoFar: () => {
      const now = utils.getNow();
      let rapidPlayTimeSoFar = state.rapidPlayTime;
      if (state.rapidPlay) {
        rapidPlayTimeSoFar += now - state.rapidPlayStartTime;
      }
      const realTimePlayedSoFar = now - state.playbackStartTime;
      // Add half the rapid play time to the total because rapid play is 2x real time play.
      const correctedTimeSoFar = realTimePlayedSoFar + rapidPlayTimeSoFar / 2;
      return correctedTimeSoFar;
    },

    storeCellStates: () => {
      state.cellsAffectedByActivity = {};
      const cells = Jupyter.notebook.get_cells();
      state.cellStates = {
        contents: state.createContentsRecord(false),
        selections: state.createSelectionsRecord(),
        changedCells: {}
      };
    },

    storeCellIdAffectedByActivity: (cellId) => {
      if (state.activity !== 'playing' && state.activity !== 'recording')
        return;

      //console.log('storeCellIdAffectedByActivity, logging cell: ' + cellId);
      state.cellStates.changedCells[cellId] = true;
    },

    restoreCellOutputs: (cell, frameOutputs) => {
      const cellId = utils.getMetadataCellId(cell.metadata);
      if (frameOutputs === undefined)
        return; // no output found, so don't update DOM (e.g. markdown cell)
      if (state.cellOutputsSent[cellId] !== undefined) {
        if (state.cellOutputsSent[cellId] === frameOutputs) {
          // no change to cell output, so don't rerender
          return;
        }
      }
      const cellDom = $(cell.element);
      const outputArea = cellDom.find('.output');
      //console.log('Sending this output to cellid:', cellId, frameOutputs);
      outputArea.html(frameOutputs).show();
      state.cellOutputsSent[cellId] = frameOutputs;
    },

    restoreCellStates: (which) => {
      const affectedIds = Object.keys(state.cellStates.changedCells);
      let selections,cellContents,cellOutputs;
      if (affectedIds.length > 0) {
        let cell, cellState;
        for (let cellId of affectedIds) {
          // console.log('affectedid:', cellId);
          cell = utils.findCellByCellId(cellId);
          if (cell !== undefined) {
            selections = state.cellStates.selections.cellsSelections[cellId];
            if (which === 'contents') {
              cellContents = state.extractDataFromContentRecord(state.cellStates.contents.cellsContent[cellId].contentsRecord, cellId);
              if (cellContents !== undefined) {
                cell.set_text(state.cellStates.contents.cellsContent[cellId].contentsRecord.data);
              }
              cell.clear_output();
              cellOutputs = state.extractDataFromContentRecord(state.cellStates.contents.cellsContent[cellId].outputsRecord, cellId);
              state.restoreCellOutputs(cell, cellOutputs);
            } else {
              if ((cell.cell_type === 'code') && (selections.active)) {
                cell.code_mirror.focus();
              }
              // console.log('setting selection to :', selections.selections);
              cell.code_mirror.setSelections(selections.selections);
            }
          }
        }
      }
    },

    getScrollTop: () => {
      return state.scrollTop;
    },

    setScrollTop: (scrollTop) => {
      state.scrollTop = scrollTop;
    },

  }

  return(state);

});
