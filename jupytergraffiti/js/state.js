define([
  './utils.js',
], function (utils) {
  const state = {
    init: () => {
      console.log('Graffiti: state constructor running.');
      state.history = undefined;
      state.manifest = {};
      state.utils = utils;
      state.accessLevel = 'create'; // one of 'create' or 'view'. If 'create' then we can create new graffitis, otherwise we can only view them
      state.authorId = 0; // defaults to the creator(teacher) in v1 of Graffiti but eventually this will be (potentially) set to a viewer(student) id.
      state.authorType = 'creator';  // currently hardwired to be creator (teacher).
      state.audioInitialized = false;
      state.activity = 'idle'; // one of "recording", "playing", "idle"
      state.pointer = { x : 0, y: 0 };
      state.playbackTimeElapsed = 0;
      state.windowSize = state.getWindowSize();
      state.resetOnNextPlay = false;
      state.recordedAudioString = '';
      state.audioStorageCallback = undefined;
      state.frameArrays = ['view', 'selections', 'contents'];
      state.scrollTop = undefined;
      state.selectedCellId = undefined;
      state.mute = false;
      state.recordingCursorPosition = { x: -1000, y: -1000 };
      state.viewInfo = undefined;
      state.recordingCellInfo = {};
      state.storageInProcess = false;
      state.tipTimeout = undefined;
      state.movieRecordingStarted = false;
      state.cellsAffectedByActivity = {};
      state.garnishing = false;
      state.garnishStyle = 'highlight'; // one of: 'highlight' or 'line'
      state.garnishColor = '000000';
      state.garnishPermanence = 'permanent'; // one of: 'permanent', 'temporary'
      state.lastGarnishInfo = { garnishing: false };
      state.lastEditActivityTime = undefined;
      state.controlPanelDragging = false;
      state.controlPanelDragOffset = { x: 0, y: 0 };
      state.playableMovies = {};
      state.hotspot = {};
      state.selectionSerialized = undefined;
      state.hidePlayerAfterPlayback = false;
      state.dontRestoreCellContentsAfterPlayback = false; // this is something the author can decide with an API call.
      state.cellOutputsSent = {};
      state.cellStates = {
        contents: {},
        changedCells: {},
        selections: {}
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

    getGarnishing: () => {
      return state.garnishing;
    },

    setGarnishing: (status) => {
      state.garnishing = status;
    },

    getLastGarnishInfo: () => {
      return state.lastGarnishInfo;
    },

    setLastGarnishInfo: (x, y, garnishing, garnishStyle, garnishColor, garnishCellId) => {
      state.lastGarnishInfo = {
        garnishing: garnishing,
        garnishStyle: garnishStyle,
        garnishColor: garnishColor,
        garnishCellId: garnishCellId,
        x: x,
        y: y
      }
    },

    getGarnishStyle: () => {
      return state.garnishStyle;
    },

    setGarnishStyle: (style) => {
      state.garnishStyle = style;
    },

    getGarnishColor: () => {
      return state.garnishColor;
    },

    setGarnishColor: (color) => {
      state.garnishColor = color;
    },

    getGarnishPermanence: () => {
      return state.garnishPermanence;
    },

    setGarnishPermanence: (newValue) => {
      state.garnishPermanence = newValue; // one of "permanent", "temporary"
    },

    getLastRecordingCursorPosition: () => {
      return { x: state.recordingCursorPosition.x, y: state.recordingCursorPosition.y }
    },

    setLastRecordingCursorPosition: (pos) => {
      state.recordingCursorPosition = { x: pos.x, y: pos.y }
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
        state.playbackTimeElapsed = state.utils.getNow() - state.getPlaybackStartTime();
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
      if (viewInfo.cellId !== undefined) {
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
      return state.recordingCellInfo;
    },

    storeRecordingCellInfo: (cellInfo) => {
      // console.log('storeRecordingCellInfo');
      state.recordingCellInfo = cellInfo;
    },

    getPlayableMovie: (kind) => {
      return state.playableMovies[kind];
    },

    setPlayableMovie: (kind, cellId, recordingKey) => {
      const cell = utils.findCellByCellId(cellId);
      state.playableMovies[kind] = { cellId: cellId, recordingKey: recordingKey, cell: cell, cellType: cell.cell_type };
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

    getHotspot: () => {
      return state.hotspot;
    },

    setHotspot: (hotspot) => {
      state.hotspot = { cellId: hotspot.cellId, pointerPosition: $.extend({}, hotspot.pointerPosition) };
    },

    nudgeHotspot: (nudgeAmount) => {
      state.hotspot.pointerPosition.y += nudgeAmount;
    },

    setHotspotFromHistory: () => {
      if (state.history !== undefined) {
        if (state.history.hotspot !== undefined) {
          state.setHotspot(state.history.hotspot);
        }
      }
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

    createViewRecord: (opts) => {
      return $.extend({}, state.viewInfo, {
        dx: (state.pointer.x - state.viewInfo.innerCellRect.left)  / state.viewInfo.innerCellRect.width,
        dy: (state.pointer.y - state.viewInfo.innerCellRect.top)   / state.viewInfo.innerCellRect.height,
        scrollDiff: state.viewInfo.scrollDiff,
        innerCellRectWidth: state.viewInfo.innerCellRect.width,
        innerCellRectHeight: state.viewInfo.innerCellRect.height,
        pointerUpdate: opts.pointerUpdate,
        focusUpdate: opts.focusUpdate,
        clearTemporaryCanvases: opts.clearTemporaryCanvases,
        selectedCellId: state.selectedCellId
      });
    },

    createSelectionsRecord: () => {
      const activeCell = Jupyter.notebook.get_selected_cell();
      const cells = Jupyter.notebook.get_cells();
      const cellsSelections = {};
      let cellId, cm, cell, selections, cellSelections, executed, output, outputs0, ourJs;
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        if (cell.cell_type === 'code') {
          cellId = cell.metadata.cellId;
          cm = cell.code_mirror;
          selections = utils.cleanSelectionRecords(cm.listSelections());
          executed = false;
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
              executed = true;
            }
          } else {
            // if this code cell has no output at time of recording, record that fact for playback
            output = {
              empty: true
            };
            executed = false;
          }
          cellSelections = {
            index: i,
            active: cellId === activeCell.metadata.cellId,
            selections: selections,
            executed: executed,
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
      let cellsContent = {};
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        cellId = cell.metadata.cellId;
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

      return { cellsContent: cellsContent };
    },

    storeHistoryRecord: (type, time) => {
      if (state.getActivity() !== 'recording')
        return;

      let record;
      // Note: we override the type to throw together pointer moves, scroll innerScroll, and focus in one history record type
      switch (type) {
        case 'pointer':
          record = state.createViewRecord({ pointerUpdate: true,  focusUpdate: false, clearTemporaryCanvases: false });
          type = 'view';
          break;
        case 'scroll':
          record = state.createViewRecord({ pointerUpdate: false, focusUpdate:false, clearTemporaryCanvases: false });
          type = 'view';
          break;
        case 'innerScroll':
          record = state.createViewRecord({ pointerUpdate: false, focusUpdate:false, clearTemporaryCanvases: false });
          type = 'view';
          break;
        case 'focus':
          record = state.createViewRecord({ pointerUpdate: false, focusUpdate:true, clearTemporaryCanvases: false });
          type = 'view';
          break;
        case 'clearTemporaryCanvases':
          record = state.createViewRecord({ pointerUpdate: false, focusUpdate:false, clearTemporaryCanvases: true });
          type = 'view';
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

        // This is the hotspot where the recording began, ie where the author first clicked to begin recording
        hotspot: {
          cellId: state.viewInfo.cellId,
          pointerPosition: { x: state.viewInfo.pointerPosition.x, y: state.viewInfo.pointerPosition.y }
        },
        
        // Time tracks: all pointer positions, cell selections and contents over the time of the recording.
        view:        [],                          // pointer move, vertical scroll or innerscroll (scroll inside cell)
        selections:  [],                          // cell selections
        contents:    [],                          // contents state: what cells present, and what their contents are, and cell outputs

        // Where we are in each track, during playback.
        lastVisited: {
          view: 0,
          selections: 0,
          contents: 0
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
      console.log('finalizeHistory: deleting Tracking arrays');
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
      for (let arrName of state.frameArrays) {
        let historyArray = state.history[arrName];
        let max = historyArray.length - 1;
        for (let i = 0; i < historyArray.length; ++i) {
          if ((historyArray.length === 1) || (i === max)) {
            historyArray[i].endTime = now;
          } else {
            historyArray[i].endTime = historyArray[i+1].startTime;
          }
          historyArray[i].endTime = historyArray[i].endTime - recordingStartTime;
          historyArray[i].startTime = historyArray[i].startTime - recordingStartTime;
        }
      }
    },

    // Get all history record frame types straddling a given time.
    getHistoryRecordsAtTime: (t) => {
      let indexes = {}, frame, historyArray, arrName, scanPtr, scanDir, currentFrameIndex, numRecords;
      for (arrName of state.frameArrays) {
        historyArray = state.history[arrName];
        numRecords = historyArray.length;
        currentFrameIndex = state.history.lastVisited[arrName];
        indexes[arrName] = null;
        if (historyArray.length > 0) {
          frame = historyArray[currentFrameIndex];
          if ((t >= frame.startTime) && (t < frame.endTime)) {
            // We're already in the right frame so just return that
            indexes[arrName] = currentFrameIndex;
          } else {
            // if the distance between the start time of the current frame and t is
            // < 10% of the total duration, start scanning up or
            // down from the current frame until you find the right frame.
            const tDist = t - frame.startTime;
            const tDistAbs = Math.abs(tDist);
            if ((tDistAbs / state.getHistoryDuration()) < 0.1) {
              scanDir = Math.sign(tDist);
              scanPtr = currentFrameIndex + scanDir;
            } else {
              // Scan to find the frame:
              //  from the beginning of the recording if the time is in the first half of the recording,
              //  otherwise scan backwards from the end
              if (t < state.getHistoryDuration() / 2) {
                scanPtr = 0;
                scanDir = 1;
              } else {
                scanPtr = numRecords - 1;
                scanDir = -1;
              }
            }
            while ((scanPtr >= 0) && (scanPtr < numRecords)) {
              frame = historyArray[scanPtr];
              if ((t >= frame.startTime) && (t < frame.endTime)) {
                indexes[arrName] = scanPtr;
                state.history.lastVisited[arrName] = scanPtr;
                break;
              }
              scanPtr += scanDir;
            }
          }
        }
      }
      return(indexes);
    },

    // Get index of record just before or at the specified time. Used for scrubbing/redrawing garnishes.
    getIndexUpToTime: (kind, t) => {
      let i;
      const historyArray = state.history[kind];
      for (i = 0; i < historyArray.length; ++i) {
        if (historyArray[i].startTime >= t) {
          return i;
        }
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
      return state.utils.getNow() - state.getPlaybackStartTime();
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
      const activity = state.getActivity();
      if (activity !== 'playing' && activity !== 'recording')
        return;

      //console.log('storeCellIdAffectedByActivity, logging cell: ' + cellId);
      state.cellStates.changedCells[cellId] = true;
    },

    restoreCellOutputs: (cell, frameOutputs) => {
      const cellId = cell.metadata.cellId;
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
