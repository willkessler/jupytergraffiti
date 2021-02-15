define([
  'jupytergraffiti/js/utils.js',
  'jupytergraffiti/js/terminals.js',
], function (utils, terminalLib) {
  const state = {
    init: () => {
      console.log('Graffiti: state constructor running.');
      state.history = undefined;
      state.manifest = {};
      state.movieCache = {
        history: {},
        audio: {}
      };
      state.accessLevel = 'view'; // one of 'create' or 'view'. If 'create' then we can create new graffitis, otherwise we can only view them
      state.authorId = undefined; // set when we activivateGraffiti or load a manifest
      state.authorType = 'creator';  // currently hardwired to be creator (teacher).
      state.audioInitialized = false;
      state.recordingBlocked = false;
      state.activity = 'idle'; // one of "recording", "playing", "idle"
      state.previousActivity = undefined;
      state.shouldUpdateCellContentsDuringPlayback = false;
      state.pointer = { x : 0, y: 0 };
      state.windowSize = state.getWindowSize();
      state.resetOnNextPlay = false;
      state.recordedAudioString = '';
      state.audioStorageCallback = undefined;
      state.frameArrays = ['view', 'selections', 'contents', 'drawings', 'terminals', 'speaking', 'skip'];
      state.scrollTop = undefined;
      state.selectedCellId = undefined;
      state.mute = false;
      state.compressedPlayTimeDuration = 0.25 * 1000; // millis. make compressed time "really fast". It won't really compress down to this few seconds though, JS is too slow.
      state.playSpeeds = { 
        'regular' : 1.0,       // playback rate at speed it was originally recorded
        'rapid'   : 2.0,       // playback rate when watching entire recording fast, either a multiplier of real-time, or a "compressed time" multiplier
        'compressed' : 1.0,    // this is not a play rate, but a target time to compress skips into
        'scanInactive' : 1.0,  // playback rate while watching non-silence (speaking) in the recording (defunct)
        'scanActive' : 3.0     // playback rate while watching silence (no speaking) in the recordin (defunct)
      };
      state.currentPlaySpeed = 'regular';
      state.userChoicePlaySpeed = 'regular';
      state.rapidScanActive = false; // whether rapidscan is activate at this moment (it's activated during silent moments so we play faster)
      state.recordedCursorPosition = { x: -1000, y: -1000 };
      state.viewInfo = undefined;
      state.recordingCellInfo = {};
      state.tipTimeout = undefined;
      state.displayedTipInfo = undefined;
      state.movieRecordingStarted = false;
      state.cellsAffectedByActivity = {};
      state.terminalsAffectedByActivity = undefined;
      state.drawingFadeClockAllowed = true;
      state.drawingFadeStart;
      state.drawingFadeDuration = 1000;
      state.drawingFadePreFadeDelay = 2000;
      state.maxDrawingOpacity = 0.5;
      state.drawingOpacity = state.maxDrawingOpacity;
      state.totalDrawingFadeDuration = state.drawingFadePreFadeDelay + state.drawingFadeDuration;
      state.lastEditActivityTime = undefined;
      state.controlPanelDragging = false;
      state.controlPanelDragOffset = { x: 0, y: 0 };
      state.playableMovies = {};
      state.currentlyPlayingMovie = undefined;
      state.selectionSerialized = undefined;
      state.hidePlayerAfterPlayback = false;
      state.dontRestoreCellContentsAfterPlayback = false; // this is something the author can decide with a tooltip command.
      state.cellOutputsSent = {};
      state.stickerImageUrl = undefined;
      state.stickerImageCandidateUrl = undefined;
      state.cellIdsAddedDuringRecording = {};
      state.userId = undefined;
      state.workspace = {};
      state.speakingStatus = false; // true when the graffiti creator is currently speaking (not silent)
      state.currentSkipRecord = 0;
      state.appliedSkipRecord = undefined;
      state.totalSkipTimeForRecording = 0;
      state.cellStates = {
        contents: {},
        changedCells: {},
        selections: {}
      };
      state.skippedTimeSoFar = 0;
      state.animationIntervalIds = {};
      state.playbackCellAdditions = {};
      state.highlightsRefreshCellId = undefined;
      state.graffitiEditCellId = undefined;
      state.narratorInfo = {};
      state.narratorInfoIsRendered = false;
      state.shiftKeyIsDown = false;
      state.shiftKeyWentDown = false;
      state.scaleCursorWithWindow = false;
      state.terminalState = undefined;
      state.applyingRawCalculatedScrollTop = true; // turned off when applying skips, but usually on during scrubbing
      state.cellIdToGraffitiMap = {}; // maps which graffitis are present in which cells. Used for autosave cells.

      // Usage statistic gathering for the current session (since last load of the notebook)
      state.usageStats = {
        notebookLoadedAt: utils.getNow(),
        created: {},   // how many graffiti were created
        played: {},    // how much time and how many plays were done
        terminalCommands: {}, // what terminal commands were executed by graffiti
        insertDataFromFile: {}, // how many times we've done insert data from file (e.g. how many times "Show solution" type buttons were pressed) per graffiti
        userSkips: {}, // which graffiti have been skipped around on by the user (scrubbed)
        totalTipsShown: 0,  // how many times we've shown tips
        totalUniqueTipsShown: 0,
        totalUniquePlays: 0,
        totalPlaysAllGraffiti: 0,
        totalPlayTimeAllGraffiti: 0,
        totalTerminalCommandsRun: 0,
        totalInsertDataFromFile: 0,
        totalUserSkips: 0,
        uniqueTips: {},
      };        
      state.statsKey = undefined;

      // Set up a default version of the drawing state object. This gets updated during drawing activity.
      state.drawingState = {
        drawingModeActivated: false,     // when true a drawing tool is selected
        drawingActivity: 'draw',         // One of 'draw', 'fade', 'wipe', 'sticker'. Note that 'drawing activity' includes using the eraser tool and stickering
        cellId: undefined,
        positions: {
          start: { x: 0, y: 0 },
          end: { x: 0, y: 0 }
        },
        promptWidth: 0,
        pen: {
          isDown: false, // becomes true when the pen is down, ie user has clicked and held the mouse button
          mouseDownPosition: { x : 0, y: 0 },
          downInMarkdown: false,    // Whether the pen went down in a markdown cell
          downInPromptArea: false,  // Whether the pen went down in the prompt area
          inPromptArea: false,      // True if the pen is in Jupyter's "prompt" div. This part of drawings/stickers will not be scaled in X, only in Y (if in markdown cell)
          permanence: 'temporary', // default: ink disappears after a second of inactivity
          type: 'line', // one of 'line', 'highlight', 'eraser', 'sticker'
          color: 'black',
          dash: 'solid', // one of 'solid', 'dashed'
          fill: 'none', // one of 'none', '#xyz'
          fillOpacity: 0
        },
        stickersRecords: {}, // This contains records of all stickers drawn to date during a recording, or since the last fadeout in a recording.
        stickerOnGrid: false,
        opacity: state.maxDrawingOpacity
      };

      state.skipping = false; // true if we are currently recording a skip
      state.skipTypes = {
        rapid: 1,
        absolute: 2,
        compressed: 3
      };
      state.skipInfo = {
        type: state.skipTypes.absolute,
        factor: 0
      };

      state.END_RECORDING_KEYDOWN_TIMEOUT = 1200;      

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

    refreshCellIdToGraffitiMap: () => {
      state.cellIdToGraffitiMap = {};
      const manifest = state.getManifest();
      let recording, recordingCellId, recordingKeys, i, saveToFileEntry, cellId;
      for (recordingCellId of Object.keys(manifest)) {
        recordingKeys = Object.keys(manifest[recordingCellId]);
        for (recordingKey of recordingKeys) {
          recording = manifest[recordingCellId][recordingKey];
          if ((recording.saveToFile !== undefined) && (recording.saveToFile.length > 0)) {
            for (i = 0; i < recording.saveToFile.length; ++i) {
              saveToFileEntry = recording.saveToFile[i];
              cellId = saveToFileEntry.cellId;
              if (state.cellIdToGraffitiMap[cellId] === undefined) {
                state.cellIdToGraffitiMap[cellId] = [];
              }
              state.cellIdToGraffitiMap[cellId].push(saveToFileEntry.path);
            }
          }
        }
      }
      //console.log('Graffiti: cellIdToGraffitiMap:', state.cellIdToGraffitiMap);

    },

    getCellIdToGraffitiMap: (cellId) => {
      return state.cellIdToGraffitiMap[cellId];
    },

    // compute aggregate stats for this manifest: total number and time of all graffitis, how many cells have graffitis, etc.
    computeManifestStats: () => {
      const manifest = state.manifest;
      const cells = Jupyter.notebook.get_cells();
      let totals = {
        totalGraffitis: 0,          // how many graffitis in this notebook
        totalCells: cells.length,   // how many cells in this notebook
        totalCellsWithGraffitis: 0, // how many cells have graffitis
        maxGraffitiPerCell: 0,      // the maximum number of graffitis in any one cell
        maxTakesPerGraffiti: 0,     // the maximum number of takes for any one graffiti to date
        totalRecordedTime: 0,       // total play time of all graffitis
      }        
      let recording, recordingCells, recordingCellId, recordingKeys;
      let lenCheck, activeTakeId, takes;
      recordingCells = Object.keys(manifest);
      if (recordingCells.length > 0) {
        for (recordingCellId of Object.keys(manifest)) {
          if (recordingCellId !== 'stats') { // we don't want to gather stats on the stats themselves!
            recordingKeys = Object.keys(manifest[recordingCellId]);
            totals.totalCellsWithGraffitis++;
            lenCheck = recordingKeys.length;
            if (lenCheck > 0) {
              if (lenCheck > totals.maxGraffitiPerCell) {
                totals.maxGraffitiPerCell = lenCheck;
              }
              for (recordingKey of recordingKeys) {
                recording = manifest[recordingCellId][recordingKey];
                totals.totalGraffitis++;
                takes = recording.takes;
                if (takes !== undefined) {
                  activeTakeId = recording.activeTakeId;
                  if (takes[activeTakeId] !== undefined) {
                    totals.totalRecordedTime += takes[activeTakeId].duration;
                  }
                  lenCheck = Object.keys(takes).length;
                  if (lenCheck > totals.maxTakesPerGraffiti) {
                    totals.maxTakesPerGraffiti = lenCheck;
                  }
                }
              }
            }
          }
        }
      }
      return totals;
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

    getUserId: () => {
      return state.userId;
    },

    setUserId: (userId) => {
      state.userId = userId;
    },

    getWorkspace: () => {
      return state.workspace;
    },

    setWorkspace: (workspace) => {
      state.workspace = workspace;
    },

    getSpeakingStatus: () => {
      return state.speakingStatus;
    },

    setSpeakingStatus: (speakingStatus) => {
      state.speakingStatus = speakingStatus;
      state.storeHistoryRecord('speaking'); // record speaking status, if we are currently recording
    },
    

    clearHighlightsRefreshableCell: () => {
      state.highlightsRefreshCellId = undefined;
    },

    isSkipping: () => {
      return state.skipping;
    },

    isLastSkipRecord: () => {
      return ((state.currentSkipRecord !== undefined) && (state.history.skip !== undefined) && (state.currentSkipRecord === state.history.skip.length - 1));
    },

    startSkipping: () => {
      state.skipping = true;
    },

    stopSkipping: () => {
      state.skipping = false;
    },

    toggleSkipping: () => {
      state.skipping = !state.skipping;
      state.storeSkipRecord();
    },

    getCurrentSkipRecord: () => {
      return state.currentSkipRecord;
    },

    // If the current time is in the current (or next) skip record, return the skip record.
    timeInSkipRecordRange: (t) => {
      if (state.currentSkipRecord !== undefined) {
        const record = state.history.skip[state.currentSkipRecord];
        //console.log('timeInSkipRecordRange, checking time t', t, 'against record', record);
        if ((record.startTime <= t) && (t < record.endTime) && (state.appliedSkipRecord !== state.currentSkipRecord)) {
          return record;
        }
      }
      return undefined;
    },

    setAppliedSkipRecord: () => {
      state.appliedSkipRecord = state.currentSkipRecord;
      state.skippedTimeSoFar += state.currentSkipRecord.endTime - state.currentSkipRecord.startTime;
    },
    
    clearAppliedSkipRecord: () => {
      state.appliedSkipRecord = undefined;
    },

    getSkipInfo: () => {
      return state.skipInfo;
    },

    setSkipInfo: (info) => {
      if (info === undefined) {
        state.skipInfo = {
          type: state.skipTypes['absolute'],
          factor: 0,
        };
      } else {
        state.skipInfo = {
          type:   info.type,
          factor: info.factor,
        };
      }
    },

    getTotalSkipTimeForRecording: () => {
      return state.totalSkipTimeForRecording;
    },

    setTotalSkipTimeForRecording: () => {
      let record;
      state.totalSkipTimeForRecording = 0;
      if (state.history.skip !== undefined) {
        for (let i = 0; i < state.history.skip.length; ++i) {
          record = state.history.skip[i];
          // record.status is legacy, we only want to use status -1 skips from these skip records.
          if ((record.status === undefined) || ((record.status !== undefined) && record.status === -1)) { 
            state.totalSkipTimeForRecording += record.endTime - record.startTime;
          }
        }
      }
    },

    // Set the current or next skip record by scanning from 0 to the time given, looking
    // for a skip record that either straddles the time given, or is greater than the time
    // given (next skip record).
    updateCurrentSkipRecord: () => {
      const t = state.getTimePlayedSoFar();
      let record;
      state.currentSkipRecord = undefined;
      state.skippedTimeSoFar = 0;
      if (state.history.skip !== undefined) {
        for (let i = 0; i < state.history.skip.length; ++i) {
          record = state.history.skip[i];
          if (record.endTime < t) { // keep track of total skip time up to the current time played
            state.skippedTimeSoFar += record.endTime - record.startTime;
          }
          if (((record.startTime <= t) && (t < record.endTime)) ||
              (record.startTime > t)) {
            state.currentSkipRecord = i;
            break;
          }
        }
      }
    },

    createSkipRecord: () => {
      return {}; // there is no data needed in a skip record, just the fact that it exists and has a start and end time is sufficient.
    },

    // Create an absolute skip record for the very end of the recording for the time it was being cancelled (ctrl-key held down).
    addCancelTimeSkipRecord: () => {
      state.skipping = true;
      const record = state.createSkipRecord();
      record.startTime = state.history.duration - state.END_RECORDING_KEYDOWN_TIMEOUT;
      record.endTime = state.history.duration - 1;
      state.history['skip'].push(record);

      console.log('Graffiti: after addCancelTimeSkipRecord, skip history:', state.history['skip']);
    },

    getSkipsRecords: () => {
      return state.history['skip'];
    },

    clearSkipsRecords: () => {
      state.history['skip'] = [];
    },

    storeSkipRecord: () => {
      const numRecords = state.history['skip'].length;
      if (!state.skipping) {
        if (numRecords > 0) {
          // Close off last record created with an end time, if it exists.
          const lastRecord = state.history['skip'][numRecords - 1];
          if (!lastRecord.hasOwnProperty('endTime')) {
            lastRecord.endTime = utils.getNow();
            console.log('Graffiti: closed off previous record:', lastRecord);
            if (lastRecord.endTime - lastRecord.startTime < 10) {
              // Delete this record as it has insignificant time in it, ie user just flipped the button on and off.
              state.history['skip'].pop();
            } 
          }
        }
      } else {
        // Only add a new skip record when beginning a skip period.
        state.storeHistoryRecord('skip');
      }
      console.log('after storeSkipRecord, skip history:', state.history['skip']);
    },

    getSkippedTimeSoFar: () => {
      return state.skippedTimeSoFar;
    },

    getShiftKeyIsDown: () => {
      return state.shiftKeyIsDown;
    },

    setShiftKeyIsDown: (val) => {
      state.shiftKeyIsDown = val;
    },

    getShiftKeyWentDown: () => {
      return state.shiftKeyWentDown;
    },

    setShiftKeyWentDown: () => {
      state.shiftKeyWentDown = true;
    },

    clearShiftKeyWentDown: () => {
      state.shiftKeyWentDown = false;
    },

    getScaleCursorWithWindow: () => {
      return state.scaleCursorWithWindow;
    },

    clearScaleCursorWithWindow: () => {
      state.scaleCursorWithWindow = false;
    },

    setScaleCursorWithWindow: () => {
      state.scaleCursorWithWindow = true;
    },

    getApplyingRawCalculatedScrollTop: () => {
      return state.applyingRawCalculatedScrollTop;
    },

    activateApplyingRawCalculatedScrollTop: () => {
      state.applyingRawCalculatedScrollTop = true;
    },

    deactivateApplyingRawCalculatedScrollTop: () => {
      state.applyingRawCalculatedScrollTop = false;
    },

    getGraffitiEditCellId: () => {
      return state.graffitiEditCellId;
    },

    setGraffitiEditCellId: (cellId) => {
      state.graffitiEditCellId = cellId;
    },

    getNarratorInfo: (which) => {
      return state.narratorInfo[which];
    },

    clearNarratorInfo: () => {
      state.narratorInfo = {};
    },

    setNarratorInfo: (which, val) => {
      state.narratorInfo[which] = val;
    },

    getNarratorInfoIsRendered: () => {
      return state.narratorInfoIsRendered;
    },

    setNarratorInfoIsRendered: (val) => {
      state.narratorInfoIsRendered = val;
    },

    scanForSpeakingStatus: () => {
      targetTime = state.getTimePlayedSoFar();
      const lastSpeakingIndex = state.getIndexUpToTime('speaking', targetTime);
      let currentSpeakingStatus = true; // assume we are speaking initially, in case we don't have any speaking records at all.
      if (lastSpeakingIndex !== undefined) {
        for (let index = 0; index < lastSpeakingIndex; ++index) {
          record = state.getHistoryItem('speaking', index);
          currentSpeakingStatus = record.speaking;
        }
      }
      return currentSpeakingStatus;
    },

    setHighlightsRefreshCellId: (cellId) => {
      state.highlightsRefreshCellId = cellId;
    },

    getHighlightsRefreshCellId: () => {
      return state.highlightsRefreshCellId;
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

    // deprecated, we are now relying on watching for width changes to #notebook-container to adjust for window size changes
    getStoredWindowSize: () => {
      return state.windowSize;
    },

    // deprecated, we are now relying on watching for width changes to #notebook-container to adjust for window size changes
    windowSizeChanged: () => {
      const currentWindowSize = state.getWindowSize();
      const previousWindowSize = state.getStoredWindowSize();
      if ((previousWindowSize.width !== currentWindowSize.width) || (previousWindowSize.height !== currentWindowSize.height)) {
        state.windowSize = state.getWindowSize();
        return true;
      }
      return false;
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

    getStickerImageUrl: (stickerImageUrl) => {
      return state.stickerImageUrl;
    },

    setStickerImageUrl: (stickerImageUrl) => {
      state.stickerImageUrl = stickerImageUrl;
    },

    getStickerImageCandidateUrl: (stickerImageCandidateUrl) => {
      return state.stickerImageCandidateUrl;
    },

    // We set this in setPlayableMovie(). 
    // When we start playing a movie, we use this to set the final candidate for the movie, which was set by %%custom_sticker in tooltip.
    setStickerImageCandidateUrl: (stickerImageCandidateUrl) => {
      state.stickerImageCandidateUrl = stickerImageCandidateUrl;
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

    rapidIsOn: () => {
      return state.currentPlaySpeed === 'rapid';
    },

    scanningIsOn: () => {
      //console.log('scanning is on, currentPlaySpeed:', state.currentPlaySpeed);
      return (state.currentPlaySpeed === 'scanActive' || state.currentPlaySpeed === 'scanInactive');
    },

    getCurrentPlaySpeed: () => {
      return state.currentPlaySpeed;
    },

    resetPlayTimes: (preset) => {
      //console.log('resetPlayTimes, preset:', preset);
      state.playTimes = {};
      for (let type of Object.keys(state.playSpeeds)) {
        state.playTimes[type] = {
          start:undefined,
          total: 0,
        };
      };
      if (preset !== undefined) {
        state.playTimes['regular'] = {
          start: utils.getNow(),
          total: preset
        }
      };
    },

    setPlayTimeBegin: (kind) => {
      state.playTimes[kind].start = utils.getNow();
    },

    setPlayTimeEnd: (kind) => {
      let playSpeed = state.currentPlaySpeed;
      if (kind !== undefined) {
        playSpeed = kind;
      }
      state.playTimes[playSpeed].total += utils.getNow() - state.playTimes[playSpeed].start; // real-time spent watching at this given playSpeed
    },


    // play speed types are 'regular', 'rapid', and 'scan'.
    setCurrentPlaySpeed: (kind) => {
      if (state.activity === 'playing') {
        if (state.currentPlaySpeed !== kind) {
          state.setPlayTimeEnd();
          state.setPlayTimeBegin(kind);
        }
      }
      state.currentPlaySpeed = kind;        
      //console.log('currentPlaySpeed:', state.currentPlaySpeed, 'playTimes', state.playTimes);
    },

    getUserChoicePlaySpeed: () => {
      return state.userChoicePlaySpeed;
    },

    storeUserChoicePlaySpeed: (userChoicePlaySpeed) => {
      state.userChoicePlaySpeed = userChoicePlaySpeed;
    },

    getPlayRateScalar: () => {
      return state.playSpeeds[state.currentPlaySpeed];
    },

    setPlayRate: (kind, newPlayRate) => {
      state.playSpeeds[kind] = newPlayRate;      
    },

    setCompressedTimePlayRate: (duration, timeTarget) => {
      const accelerationFactor = duration / timeTarget;
      state.setPlayRate('compressed', accelerationFactor);
      // console.log('duration, timeTarget, accelerationFactor:', duration,timeTarget, accelerationFactor);
    },

    setPlayStartTimeToNow: () => {
      state.playTimes[state.currentPlaySpeed].start = utils.getNow();
    },

    shouldUpdateDisplay: (kind, frameIndex) => {
      if (frameIndex === undefined) {
        return false;
      }
      if (_.contains(state.history.processed[kind],frameIndex.index)) {
        return false; // during playback, we've already processed this record so don't reprocess it.
      }
      state.history.processed[kind].push(frameIndex.index);
      return true;
    },

    resetProcessedArrays: () => {
      if (state.history !== undefined) {
        state.history.processed = [];
        for (let arrName of state.frameArrays) {
          state.history.processed[arrName] = [];
        }      
      }
    },

    blockRecording: () => {
      state.recordingBlocked = true;
    },

    unblockRecording: () => {
      state.recordingBlocked = false;
    },

    getUsageStats: () => {
      const usageStats = $.extend(true, {}, state.usageStats, 
                                  state.computeManifestStats());
      usageStats.totalUniqueTipsShown = Object.keys(state.usageStats.uniqueTips).length;
      usageStats.statsGatheredAt = utils.getNow();
      delete(usageStats['uniqueTips']);

      //console.log('Graffiti: getUsageStats() is returning:', usageStats);
      return usageStats;
    },

    updateUsageStats: (opts) => {
      const data = opts.data;
      const type = opts.type;
      const playStats = state.usageStats.played;
      const createStats = state.usageStats.created;
      let cellId, recordingKey, activeTakeId, statsKey;
      if ((type === 'create') || (type === 'setup') || (type === 'terminalCommand') || (type === 'tip') || (type === 'insertDataFromFile')) {
        cellId = data.cellId;
        recordingKey = data.recordingKey;
      }
      switch (type) {
        case 'create': // this usage record is about creating a graffiti
          statsKey = utils.composeGraffitiId(cellId, recordingKey);
          if (!createStats.hasOwnProperty(statsKey)) {
            createStats[statsKey] = {
              createDate: data.createDate,
              numEditsThisSession: 0
            };
          }
          createStats[statsKey].numEditsThisSession++;
          createStats[statsKey].numTakes = data.numTakes;
          break;
        case 'setup': // this usage record is about viewing a graffiti
          activeTakeId = data.activeTakeId;
          statsKey = utils.composeGraffitiId(cellId, recordingKey, activeTakeId);
          if (!playStats.hasOwnProperty(statsKey)) {
            const epochTime = utils.getNow();
            playStats[statsKey] = {
              totalTime: 0, 
              totalTimeThisPlay: 0,
              epochTime: epochTime,
              maxViewingTime: 0,
              totalPlays: 0,
              totalPlaysRightAfterLoad: 0, // total of all plays that happened "from scratch", ie you just loaded the graffiti, not a play event triggered
                                           // by pressing play after you paused the graffiti
              recordingDuration: state.history.duration,
              userHitEscape: false, // becomes true if user uses escape key to terminate playback. If totalPlayTime is zero and this is true, it is probably because 
                                    // the graffiti took too long to load and the user got impatient and terminated playback early.
            };
          }
          state.currentStatsKey = statsKey;
          break;
        case 'tip':
          state.usageStats.totalTipsShown++;
          const tipKey = utils.composeGraffitiId(cellId, recordingKey);
          if (!state.usageStats.uniqueTips.hasOwnProperty(tipKey)) {
            state.usageStats.uniqueTips[tipKey] = 0;
          }
          state.usageStats.uniqueTips[tipKey]++;
          break;
        case 'insertDataFromFile':
          statsKey = utils.composeGraffitiId(cellId, recordingKey);
          // Right now, we only record that we show something via this graffiti, not that we hide something.
          // we also increment the total number of times any show/hide button is clicked
          state.usageStats.totalInsertDataFromFile++;
          if (!state.usageStats.insertDataFromFile.hasOwnProperty(statsKey)) {
            state.usageStats.insertDataFromFile[statsKey] = 0;
          }
          state.usageStats.insertDataFromFile[statsKey]++;
          break;
        case 'terminalCommand':
          const terminalCommandsStats = state.usageStats.terminalCommands;
          statsKey = utils.composeGraffitiId(cellId, recordingKey);
          state.usageStats.totalTerminalCommandsRun++;
          if (!terminalCommandsStats.hasOwnProperty(statsKey)) {
            terminalCommandsStats[statsKey] = {
              commands: [],
              numRunsThisSession: 0
            };
          } 
          terminalCommandsStats[statsKey].numRunsThisSession++;
          terminalCommandsStats[statsKey].commands.push(data.command);
          break;
        case 'userSkips':
          // We count user skips separately.
          state.usageStats.totalUserSkips++;
          if (!state.usageStats.userSkips.hasOwnProperty(state.currentStatsKey)) {
            state.usageStats.userSkips[state.currentStatsKey] = 0;
          }
          state.usageStats.userSkips[state.currentStatsKey]++;
          break;
        case 'play':
          const usageRecord = playStats[state.currentStatsKey];
          for (let action of data.actions) {
            switch (action) {
              case 'resetCurrentPlayTime':
                delete(usageRecord['currentPlayTime']);
                usageRecord.totalTimeThisPlay = 0;
                usageRecord.totalPlaysRightAfterLoad++;
                break;
              case 'updateCurrentPlayTime':
                usageRecord.currentPlayTime = Math.round(state.getTimePlayedSoFar());
                break;
              case 'updateTotalPlayTime':
                if (state.currentStatsKey !== undefined) {
                  usageRecord.totalTime += usageRecord.currentPlayTime;
                  // totalTimeThisPlay represents the amount of time played back since the user started this video playing. This is not the same as
                  // totalTime, which represents the amount of time played back for this video since the notebook was loaded. In other words, if the
                  // user played this video twice all the way through, totalTime would contain 2x the recordingDuration, but totalTimeThisPlay would 
                  // only contain 1x the recordingDuration.
                  usageRecord.totalTimeThisPlay = Math.min(usageRecord.recordingDuration, usageRecord.currentPlayTime + usageRecord.totalTimeThisPlay);
                  usageRecord.maxViewingTime = Math.min(usageRecord.recordingDuration, Math.max(usageRecord.maxViewingTime, usageRecord.totalTimeThisPlay));
                  state.usageStats.totalPlayTimeAllGraffiti += usageRecord.currentPlayTime;
                  delete(usageRecord['currentPlayTime']);
                }
                break;
              case 'incrementPlayCount':
                usageRecord.totalPlays++;
                state.usageStats.totalPlaysAllGraffiti++;
                state.usageStats.totalUniquePlays = Object.keys(playStats).length;
                break;
              case 'userHitEscape':
                usageRecord.userHitEscape = true;
                break;
            }
          }
      }
      //console.log('updateUsageStats:', state.usageStats);
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
          // Copy important fields from the "live" sticker records into the drawing state; these will be persisted as sticker records
          // inside drawing records for later playback.
          // NB: we don't include label stickers that don't have text labels at all, these are just displayed for guidance while placing the sticker

          stickersRecords.push({
            positions: { start: { x: sticker.positions.start.x, y: sticker.positions.start.y },
                         end:   { x: sticker.positions.end.x, y: sticker.positions.end.y } },
            innerCellRect: {
              left: sticker.innerCellRect.left,
              top:  sticker.innerCellRect.top,
              width:  sticker.innerCellRect.width,
              height:  sticker.innerCellRect.height,
            },
            pen: {
              stickerType: sticker.pen.stickerType,
              color: sticker.pen.color,
              dash:  sticker.pen.dash,
              fill:  sticker.pen.fill,
              fillOpacity:  sticker.pen.fillOpacity,
              permanence: sticker.pen.permanence,
              label: sticker.pen.label,
              downInMarkdown: sticker.pen.downInMarkdown,
              downInPromptArea: sticker.pen.downInPromptArea,
              inPromptArea: sticker.pen.inPromptArea,
            },
            stickerOnGrid: sticker.stickerOnGrid,
            promptWidth: sticker.promptWidth,
          });
        }
      }
      state.drawingState.stickersRecords = stickersRecords;
      //console.log('stickersRecords:', stickersRecords);
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
          case 'isDown':
            drawingState.pen.isDown = data;
            break;
          case 'mouseDownPosition':
            drawingState.pen.mouseDownPosition = { x: data.x, y: data.y };
            break;
          case 'downInMarkdown':
            drawingState.pen.downInMarkdown = data; // whether the drawing/stickering started in a markdown cell
            break;
          case 'downInPromptArea':
            drawingState.pen.downInPromptArea = data; // whether the drawing/stickering started in the prompt area
            break;
          case 'inPromptArea':
            drawingState.pen.inPromptArea = data; // whether the drawing/stickering in the .prompt div
            break;
          case 'promptWidth':
            drawingState.promptWidth = data;
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
              case 'label':
              case 'custom':
                // all these cases have an implicit fill type of 'none'
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
          case 'label':
            // a label is actually a sticker that's just typed text
            drawingState.pen.label = data;
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

    startAnimationInterval: (name, cb, timing) => {
      if (state.animationIntervalIds[name] !== undefined) {
        clearInterval(state.animationIntervalIds[name]);
      }
      state.animationIntervalIds[name] = setInterval(cb, timing);      
    },

    clearAnimationIntervals: () => {
      const ids = Object.keys(state.animationIntervalIds);
      for (let id of ids) {
        if (state.animationIntervalIds[id] !== undefined) {
          clearInterval(state.animationIntervalIds[id]);
          delete(state.animationIntervalIds[id]);
        }
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
      state.resetPlayTimes();
      state.resetProcessedArrays();
    },

    getActivity: () => {
      return state.activity;
    },

    setActivity: (newState) => {
      console.log('Graffiti: Setting activity to:', newState);
      state.activity = newState;
    },

    getPreviousActivity: () => {
      return state.previousActivity;
    },

    storePreviousActivity: () => {
      state.previousActivity = state.activity;
    },

    restorePreviousActivity: () => {
      state.activity = state.previousActivity;
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
      // console.trace('storeRecordingCellInfo:', cellInfo);
      state.recordingCellInfo = cellInfo;
    },

    getPlayableMovie: (kind) => {
      return state.playableMovies[kind];
    },

    setPlayableMovie: (kind, cellId, recordingKey, hoverCellId) => {
      let cellIndex = undefined;
      if (hoverCellId !== undefined) {
        cellIndex = utils.findCellIndexByCellId(hoverCellId);
      }
      const cell = utils.findCellByCellId(cellId);
      const cellType = (cell === undefined ? undefined : cell.cell_type);
      const recording = state.getManifestSingleRecording(cellId, recordingKey);
      const activeTakeId = recording.activeTakeId;
      state.playableMovies[kind] = { 
        recordingCellId: cellId, 
        recordingKey: recordingKey, 
        activeTakeId: activeTakeId, 
        cell: cell, 
        cellIndex: cellIndex, 
        cellType: cellType 
      };
      state.setStickerImageCandidateUrl(recording.stickerImageUrl);

      //console.trace('setPlayableMovie, kind:', kind, 'cellId:', cellId, 'recordingKey:',recordingKey, 'playableMovies:', state.playableMovies);
      return recording;
    },

    clearPlayableMovie: (kind) => {
      //console.trace('Graffiti: clearing playable movie of kind', kind);
      state.playableMovies[kind] = undefined;
    },

    getMovieRecordingStarted: () => {
      return state.movieRecordingStarted;
    },

    setMovieRecordingStarted: (status) => {
      state.movieRecordingStarted = status;
    },

    getCurrentlyPlayingMovie: () => {
      return state.currentlyPlayingMovie;
    },

    setCurrentlyPlayingMovie: (movie) => {
      state.currentlyPlayingMovie = movie;
    },

    getHidePlayerAfterPlayback: () => {
      return state.hidePlayerAfterPlayback;
    },

    setHidePlayerAfterPlayback: (status) => {
      state.hidePlayerAfterPlayback = status;
    },

    getDontRestoreCellContentsAfterPlayback: () => {
      return state.dontRestoreCellContentsAfterPlayback;
    },

    setDontRestoreCellContentsAfterPlayback: (status) => {
      //console.trace('setDontRestoreCellContentsAfterPlayback:', status);
      state.dontRestoreCellContentsAfterPlayback = status;
    },

    clearCellOutputsSent: () => {
      state.cellOutputsSent = {};
    },

    getCellAdditions: () => {
      if (state.history !== undefined) {
        const  allAdditions = _.union(Object.keys(state.history.cellAdditions), Object.keys(state.playbackCellAdditions));
        return allAdditions;
      }
      return undefined;
    },

    storeCellAddition: (cellId,position) => {
      if (state.activity === 'recording') {
        state.history.cellAdditions[cellId] = position;
        //console.log('cellAdditions:', state.cellAdditions);
      }
    },

    storePlaybackCellAddition: (cellId, position) => {
      state.playbackCellAdditions[cellId] = position;
    },

    clearCellAdditions: () => {
      state.history.cellAdditions = {};
      state.playbackCellAdditions = {};
    },

    storeTerminalsState: (newState) => {
      state.terminalsState = newState; // state of one or more terminals at any given time
    },

    getShouldUpdateCellContentsDuringPlayback: () => {
      return state.shouldUpdateCellContentsDuringPlayback;
    },

    setShouldUpdateCellContentsDuringPlayback: (val) => {
      state.shouldUpdateCellContentsDuringPlayback = val;
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
      console.log('Graffiti: Dumping JSON history');
      console.log("Graffiti: =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
      console.log('Graffiti:', state.history);
      console.log("Graffiti: =-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-");
    },

    createViewRecord: (subType) => {
      const drawingState = state.drawingState;
      const pen = drawingState.pen;
      const downInMarkdown = ((pen.isDown) && pen.downInMarkdown);
      const downInPromptArea = ((pen.isDown) && pen.downInPromptArea);
      const drawingActivity = (pen.isDown ? drawingState.drawingActivity : undefined);
      const stickerCellId = ((pen.isDown && drawingState.drawingActivity == 'sticker') ? drawingState.cellId : undefined);
      let stickerInfo = undefined, stickerCellWidth = 0, stickerCellHeight = 0;
      if (stickerCellId !== undefined) {
        const stickerCell = utils.findCellByCellId(stickerCellId);
        const stickerCellElement = $(stickerCell.element[0]).find('.inner_cell');
        const bbox = stickerCellElement[0].getBoundingClientRect();
        stickerCellWidth = bbox.width;
        stickerCellHeight = bbox.height;
        stickerInfo = { cellId: stickerCellId, width:stickerCellWidth, height: stickerCellHeight };
      }
      const topBarHeight = $('#header').height();
      const inTopBarArea = state.pointer.y < topBarHeight;

      return $.extend({}, state.viewInfo, {
        x: state.pointer.x - parseInt(state.viewInfo.outerCellRect.left),
        y: state.pointer.y - parseInt(state.viewInfo.outerCellRect.top),
        downInMarkdown: downInMarkdown,
        downInPromptArea: downInPromptArea,
        drawingActivity: drawingActivity,
        inTopBarArea: inTopBarArea,
        subType: subType,
        speakingStatus: state.speakingStatus,
        scrollDiff: state.viewInfo.scrollDiff,
        selectedCellId: state.selectedCellId,
        stickerInfo: stickerInfo
      });
    },

    createDrawingRecord: (opts) => {
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

      // Remove drawing status fields that are not needed in history records
      delete(record['drawingModeActivated']);
      delete(record.pen['isDown']);
      delete(record.pen['mouseDownPosition']);
      delete(record['wipe']);
      delete(record['stickerActive']);
      delete(record['stickerOnGrid']);
      if (opts.stickering) {
        // Remove unnecessary items which have more precise info in each sticker record for this drawing frame.
        delete(record['positions']);
        delete(record['pen']);
        delete(record['promptWidth']);
        delete(record['innerCellRect']);
      }
      //console.log('createDrawingRecord:', record);
      return record;
    },

    // drawingRecords (above) contain a hash of stickerRecords, below: all stickers on display during that drawing frame
    createStickerRecord: () => {
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

      // Remove drawing status fields that are not needed in history records
      delete(record.drawingModeActivated);
      delete(record.pen.isDown);
      delete(record.pen['mouseDownPosition']);
      delete(record.wipe);
      // console.log('createStickerRecord:', record);
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
      let cellsContent = {}, cellsPresentThisFrame = {};
      for (let i = 0; i < cells.length; ++i) {
        cell = cells[i];
        const graffitiConfig = utils.getCellGraffitiConfig(cell);
        if (graffitiConfig !== undefined) {
          const graffitiType = graffitiConfig.type;
          if ((graffitiType !== undefined) && (graffitiType === 'terminal')) {
            continue; // don't save terminal cell state here, it's saved by a separate fn
          }
        }
        cellId = utils.getMetadataCellId(cell.metadata);
        cellsPresentThisFrame[cellId] = utils.findCellIndexByCellId(cellId);
        const contents = cell.get_text();
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

      return { cellsContent: cellsContent, cellsPresentThisFrame: cellsPresentThisFrame };
    },

    createTerminalsRecord: () => {
      // Collect display positions of all terminals. If no terminals history has been recorded yet then mark these records as the "first records",
      // which will trigger term.reset() calls during playback.
      const markAsFirstRecord = state.history.terminals.length === 0;
      const terminalsState = terminalLib.getTerminalsStates(markAsFirstRecord);
      return { terminals: terminalsState };
    },

    getHistoryTerminalsContents: () => {
      return state.history.terminalsContents;
    },

    storeTerminalsContentsInHistory: () => {
      state.history.terminalsContents = terminalLib.getTerminalsContents();
    },

    createSpeakingRecord: () => {
      return { speaking: state.speakingStatus };
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
        case 'selectCell':
          record = state.createViewRecord('selectCell');
          type = 'view'; // override passed-in type: focus is a view type
          break;
        case 'drawings':
          record = state.createDrawingRecord({stickering:false});
          break;
        case 'stickers':
          record = state.createDrawingRecord({stickering:true});
          type = 'drawings'; // we store sticker records as arrays within drawing records.
          break;
        case 'selections':
          record = state.createSelectionsRecord();
          break;
        case 'contents':
          record = state.createContentsRecord(true);
          break;
        case 'terminals':
          record = state.createTerminalsRecord();
          break;
        case 'speaking':
          record = state.createSpeakingRecord();
          break;
        case 'skip':
          record = state.createSkipRecord();
          break;
      }
      record.startTime = (time !== undefined ? time : utils.getNow());
      state.history[type].push(record);
    },

    initHistory: (initialValues) => {
      const now = utils.getNow();
      state.history = {
        storageCellId: initialValues.storageCellId,
        recordingStartTime: now,

        // Time tracks: all pointer positions, cell selections and contents over the time of the recording.
        view:        [],                          // pointer move, vertical scroll or innerscroll (scroll inside cell)
        selections:  [],                          // cell selections
        contents:    [],                          // contents state: what cells present, and what their contents are, and cell outputs
        drawings:    [],                          // drawing record, of type: ['draw', 'fade', 'wipe', 'sticker']
        terminals:   [],                          // terminal record. Records (recent) changes to contents of a terminal
        speaking:    [],                          // time ranges where creator is speaking or silent
        skip:        [],                          // time ranges when creator has requested either an acceleration or a time compression

        // Where we are in each track, during playback.
        lastVisited: {
          view:       0,
          selections: 0,
          contents:   0,
          drawings:   0,
          terminals:  0,
          speaking:   0,
          skip:       0,
        },

        cellContentsTracking: {},                  // this enables back-referencing to reduce storage costs on content recording
        cellOutputsTracking:  {},                  // this enables back-referencing to reduce storage costs on output recording
        cellAdditions: {}                          // id's and positions of any cells added during the recording.
      }

      // Set up to keep track of the latest record processed during playback (so we don't process a record twice).
      state.resetProcessedArrays();

      // Store initial state records at the start of recording.
      state.storeHistoryRecord('pointer',    now);
      state.storeHistoryRecord('scroll',     now);
      state.storeHistoryRecord('focus',      now);
      state.storeHistoryRecord('selections', now);
      state.storeHistoryRecord('contents',   now);
      state.storeHistoryRecord('terminals',  now);
    },

    finalizeHistory: () => {
      state.setHistoryDuration();
      state.normalizeTimeframes();
      state.adjustTimeRecords('speaking'); // move timing of speaking records back by 1/10th of a second since they lag
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
      state.history.duration = utils.getNow() - state.history.recordingStartTime;
    },

    adjustTimeRecords: (type) => {
      const historyArray = state.history[type];
      const adjustment = 100; // ms
      if (historyArray.length > 0) {
        for (let i = 0; i < historyArray.length; ++i) {
          historyArray[i].startTime = Math.max(0, historyArray[i].startTime - adjustment);
          historyArray[i].endTime = Math.max(0, historyArray[i].endTime - adjustment);
        }
      }
    },

    findSpeakingStartNearestTime: (t, direction, rewindAmt) => {
      let historyItem, numHistoryItems = 0;
      // Scan for nearest "start speaking" record ...
      let chosenTime = (direction === -1 ? 0 : state.history.duration);
      if (state.history['speaking'] !== undefined) {
        numHistoryItems = state.history['speaking'].length;
      }
      if (numHistoryItems === 0) {
        // no speaking history, just jump by 2s
        if (direction === -1) {
          chosenTime= Math.max(0, t - rewindAmt * 1000);
        } else {
          chosenTime = Math.min(t + rewindAmt * 1000, state.history.duration - 1);
        }
      } else {
        for (let check = 0; check < numHistoryItems; ++check) {
          //console.log('findSpeakingStartNearestTime, check:', check);
          historyItem = state.history['speaking'][check];
          if (historyItem.speaking) {
            if (direction === -1) {
              if (historyItem.startTime > chosenTime && historyItem.endTime < t) {
                chosenTime = historyItem.startTime;
              }
            } else {
              if (historyItem.startTime < chosenTime && historyItem.startTime > t) {
                chosenTime = historyItem.startTime;
              }
            }
          }
        }
      }
      return chosenTime; 
    },

    // When recording finishes, normalize all time frames
    normalizeTimeframes: () => {
      const recordingStartTime = state.history.recordingStartTime;
      const now = utils.getNow();
      for (let arrName of state.frameArrays) {
        let historyArray = state.history[arrName];
        let max = historyArray.length - 1;
        for (let i = 0; i < historyArray.length; ++i) {
          // Only set endTime when not set by some other process (e.g. skipRecs set this on their own).
          if (historyArray[i].endTime === undefined) {
            if ((historyArray.length === 1) || (i === max)) { 
              historyArray[i].endTime = now;
            } else {
              historyArray[i].endTime = historyArray[i+1].startTime;
            }
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
                  // Time skipping happens because browser animationFrame timing isn't that reliable, so to avoid desynching
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
      if (historyArray !== undefined) {
        const historyArrayLength = historyArray.length;
        if (historyArrayLength > 0) {
          for (i = 0; i < historyArrayLength; ++i) {
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
        }
      }
      return undefined;
    },

    getLastFrameIndex: (kind) => {
      return state.history[kind].length;
    },

    getHistoryItem: (kind, index) => {
      if ((index < state.history[kind].length) && (index >= 0)) {
        return state.history[kind][index];
      }
      return undefined;
    },

    setHistory: (history) => {
      state.history = $.extend({}, history);
      state.resetPlayState();
      state.resetProcessedArrays();
    },

    getFromMovieCache: (kind, keys) => {
      const combinedKey = [keys.recordingCellId, keys.recordingKey, keys.activeTakeId].join('_');
      return state.movieCache[kind][combinedKey];
    },

    storeToMovieCache: (kind, keys, data) => {
      const combinedKey = [keys.recordingCellId, keys.recordingKey, keys.activeTakeId].join('_');
      state.movieCache[kind][combinedKey] = data;
    },

                   
    getTimeRecordedSoFar: () => {
      return utils.getNow() - state.history.recordingStartTime;
    },

    // The time played so far is the sum of all the play times at various speeds used so far during this play session, including the (growing) time
    // at the current playSpeed.
    getTimePlayedSoFar: () => {
      const now = utils.getNow();
      let timePlayedSoFar = 0;
      if ((state.playTimes[state.currentPlaySpeed].start !== undefined) && (state.activity === 'playing')) {
        const playRateScalar = state.getPlayRateScalar();
        timePlayedSoFar += (now - state.playTimes[state.currentPlaySpeed].start) * playRateScalar;
      }
      for (let type of Object.keys(state.playSpeeds)) {
        timePlayedSoFar += state.playTimes[type].total * state.playSpeeds[type];
      }
      return timePlayedSoFar;
    },

    // If the current recording is set to replayAllCells, or this cell is among those affected by the history, return true
    graffitiShouldUpdateCellContents: (cellId) => {
      return (state.shouldUpdateCellContentsDuringPlayback || state.history.affectedCellIds.hasOwnProperty(cellId));
    },

    storeCellStates: () => {
      state.cellsAffectedByActivity = {};
      state.terminalsAffectedByActivity = [];
      const cells = Jupyter.notebook.get_cells();
      state.cellStates = {
        contents: state.createContentsRecord(false),
        selections: state.createSelectionsRecord(),
        changedCells: {},
        lineNumberStates: {},
      };
      for (let i = 0, cell; i < cells.length; ++i) {
        cell = cells[i];
        state.cellStates.lineNumberStates[utils.getMetadataCellId(cell.metadata)] = cell.code_mirror.options.lineNumbers;
      }
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
        return false; // no output found, so don't update DOM (e.g. markdown cell)
      if (state.cellOutputsSent[cellId] !== undefined) {
        if (state.cellOutputsSent[cellId] === frameOutputs) {
          // no change to cell output, so don't rerender
          return false;
        }
      }
      const cellDom = $(cell.element);
      const outputArea = cellDom.find('.output');
      //console.log('Sending this output to cellid:', cellId, frameOutputs);
      outputArea.html(frameOutputs).show();
      state.cellOutputsSent[cellId] = frameOutputs;
      return true;
    },

    restoreCellStates: (which) => {
      const affectedIds = Object.keys(state.cellStates.changedCells);
      let selections,cellContents,cellOutputs;
      if (affectedIds.length > 0) {
        let cell, cellState, cellsContent, contentsRecord;
        for (let cellId of affectedIds) {
          // console.log('affectedid:', cellId);
          cell = utils.findCellByCellId(cellId);
          if (cell !== undefined) {
            selections = state.cellStates.selections.cellsSelections[cellId];
            if (which === 'contents') {
              cellsContent = state.cellStates.contents.cellsContent[cellId];
              if (cellsContent !== undefined) {
                contentsRecord = cellsContent.contentsRecord;
                cellContents = state.extractDataFromContentRecord(contentsRecord, cellId);
                if (cellContents !== undefined) {
                  cell.set_text(contentsRecord.data);
                }
                if (typeof(cell.clear_output) === 'function') {
                  cell.clear_output();
                  cellOutputs = state.extractDataFromContentRecord(cellsContent.outputsRecord, cellId);
                  state.restoreCellOutputs(cell, cellOutputs);
                }
              }
            } else { // restoring selections
              if (selections !== undefined) {
                if ((cell.cell_type === 'code') && (selections.active)) { // hack, not coded right
                  cell.code_mirror.focus();
                }
                // console.log('setting selection to :', selections.selections);
                cell.code_mirror.setSelections(selections.selections);
              }
            }
          }
        }
      }
    },

    restoreLineNumbersStates: () => {
      if (state.hasOwnProperty('cellStates')) {
        if (state.cellStates.hasOwnProperty('lineNumberStates')) {
          if (Object.keys(state.cellStates.lineNumberStates).length > 0) {
            let cell;
            for (let cellId of Object.keys(state.cellStates.lineNumberStates)) {
              cell = utils.findCellByCellId(cellId);
              if (cell !== undefined) {
                if (cell.code_mirror.options.lineNumbers != state.cellStates.lineNumberStates[cellId]) {
                  cell.toggle_line_numbers();
                }
              }
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
