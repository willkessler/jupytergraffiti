define([
  'jupytergraffiti/js/state.js',
  'jupytergraffiti/js/audio.js',
  'jupytergraffiti/js/utils.js',
  'jupytergraffiti/js/batchRunner.js',
  'jupytergraffiti/js/LZString.js'
], function (state, audio, utils, batchRunner, LZString) {

  //
  // Storage tree is organized like this:
  //
  // jupytergraffiti_data/
  //   notebooks/
  //     id_1234/
  //       authors/
  //        id_1234 (creator)/
  //          manifest.json
  //          cells/
  //            id_1234/
  //               graffitis/
  //                 id_1234/
  //                   takes/
  //                     id_1234/
  //                       audio.txt
  //                       history.txt  
  // Inside the notebook's graffiti metadata, firstAuthorId records the author id of the creator of the very first graffiti in this notebook.
  // For notebooks created at Udacity, these are usually graffiti created by instructors and we use a Udacity id. Otherwise we use a randomly generated id. 

  const storage = {

    defaultKernel: 'python3',
    executorCell: undefined,
    movieCompleteCallback: undefined,
    preloadBatchSize: 4,

    getOSMkdirCommand: (path) => {
      let returnVal;
      if (utils.onWindowsOS()) {
        const winPath = '"' + path.replace(/\//g,"\\") + '"';
        returnVal = 'if not exist ' + winPath + ' ( md ' + winPath + ')' ;
      } else {
	returnVal = 'mkdir -p ' + '"' + path + '"';
      }
      console.log('Graffiti: getOSMkdirCommand, returnVal:', returnVal);
      return (returnVal);
    },

    getOSRmCommand: (path, isFile) => {
      let returnVal;
      if (utils.onWindowsOS()) {
        const winPath = '"' + path.replace(/\//g,"\\") + '"';
	
	returnVal = 'rmdir /s/q ' + winPath;
        if (isFile) {
	  returnVal = 'del ' + winPath;
	}
      } else {
	returnVal = 'rm -r ' + '"' + path + '"';
      }
      console.log('Graffiti: getOSRmCommand, returnVal:', returnVal);
      return(returnVal);
    },

    createExecutorCell: () => {
      if (storage.executorCell === undefined) {
        storage.executorCell = Jupyter.notebook.insert_cell_at_bottom('code');
        state.storePreviousActivity();
        state.setActivity('executing');
      }
      return storage.executorCell;
    },

    runShellCommand: (cmd) => {
      const executorCell = storage.createExecutorCell();
      const currentKernelName = Jupyter.notebook.kernel.name;
      let fullCommand;
      if (currentKernelName === utils.rKernel) {
        // R doesn't support magics so we use internal R system() call.
        // This needs to escape double quotes eventually... 
        fullCommand = "system('" + cmd + "', intern=TRUE)";
      } else {
        fullCommand = '!' + cmd; // this should also work on jupyter on Windows systems
      }
      executorCell.set_text(fullCommand);
      executorCell.execute();
    },

    writeTextToFile: (opts) => {
      const path = opts.path;
      const contents = opts.contents;
      const executorCell = storage.createExecutorCell();
      const currentKernelName = Jupyter.notebook.kernel.name;
      let writeMagic, chunkSize;
      switch (currentKernelName) {
        case utils.cplusplusKernel11:
        case utils.cplusplusKernel14:
        case utils.cplusplusKernel17:
          writeMagic = '%%file';
          chunkSize = 7000;
          break;
        case utils.rKernel:
          break;
        case utils.pythonKernel:
        default:
          writeMagic = '%%writefile';
          chunkSize = 100000;
          break;
      }
      const contentLength = contents.length;
      let chunkPtr = 0, chunk, appendFlag, cmd, rLines = [];
      const pathWithCrs = path + '.cr';
      while (chunkPtr < contentLength) {
        chunk = contents.substr(chunkPtr, chunkSize);
        appendFlag = (chunkPtr === 0 ? ' ' : ' -a ');
        if (currentKernelName === utils.rKernel) {
          // We don't write in this loop if using the R Kernel, we just collect and write with a single command, below
          rLines.push('"' + chunk + '"');
        } else {
          cmd = writeMagic + appendFlag + pathWithCrs + "\n" + chunk;
          executorCell.set_text(cmd);
          executorCell.execute();
        }
        chunkPtr += chunkSize;
      }

      if (currentKernelName === utils.rKernel) {
        // Now write it all out in one fell swoop, cf: https://stackoverflow.com/questions/2470248/write-lines-of-text-to-a-file-in-r
        cmd = 'writeLines(c(' + rLines.join(',') + '), "' + pathWithCrs + '")';
        executorCell.set_text(cmd);
        executorCell.execute();
      }

      let secondaryCmd;
      if (opts.stripCRs) {
        if (utils.onWindowsOS()) {
          const winPath = path.replace(/\//g,"\\");
          const winPathWithCrs = pathWithCrs.replace(/\//g,"\\");
	  // NB: python can use forward slashes in the filename but windows copy command needs backslashes
          cmd = 'python -c "import os;s=open(\'' + pathWithCrs + '\',\'r\').read();open(\'' + pathWithCrs + '\', \'w\').write(s.replace(\'\\n\',\'\'))"';
          secondaryCmd = 'copy "' + winPathWithCrs + '" "' + winPath + '"';
        } else {
          // remove all the CR's produced by the %%writefile appends and write to the final filename
          cmd = '/usr/bin/tr -d "\\n" < ' + '"' + pathWithCrs + '" > ' + '"' + path + '"';
        }
      } else {
        cmd = 'mv "' + pathWithCrs + '" "' + path + '"'; // just rename the .cr file with the final file name
      }        
      storage.runShellCommand(cmd);
      if (secondaryCmd !== undefined) {
        storage.runShellCommand(secondaryCmd);
      }
	storage.runShellCommand(storage.getOSRmCommand(pathWithCrs, true));
    },

    cleanUpExecutorCell: () => {
      const executorCell = storage.createExecutorCell();
      if (executorCell !== undefined) {
        const executorCellId = utils.getMetadataCellId(executorCell.metadata);
        const deleteCellIndex = utils.findCellIndexByCellId(executorCellId);
        if (deleteCellIndex !== undefined) {
          Jupyter.notebook.delete_cell(deleteCellIndex);
        }
        storage.executorCell = undefined;
        state.restorePreviousActivity();
        utils.saveNotebookDebounced();
      }        
    },

    setMovieCompleteCallback: (cb) => {
      storage.movieCompleteCallback = cb;
    },

    executeMovieCompleteCallback: () => {
      if (storage.movieCompleteCallback !== undefined) {
        storage.movieCompleteCallback();
        storage.movieCompleteCallback = undefined;
      }
    },

    ensureNotebookGetsGraffitiId: () => {
      // Make sure a new notebook gets a recording id
      const notebook = Jupyter.notebook;
      if (!notebook.metadata.hasOwnProperty('graffiti')) {
        notebook.metadata['graffiti'] = { 
          id: utils.generateUniqueId(),
          language: 'EN' // defaults to EN but can be changed by the author for their preferred locale, by editing the notebook's metadata
        }
      }
      utils.assignCellIds();
      utils.refreshCellMaps();
      console.log('Graffiti: Notebook is now ready to use Graffiti.');
    },

    ensureNotebookGetsFirstAuthorId: () => {
      // Make sure a new notebook gets a first author id, from whatever auth system is in use.
      const notebook = Jupyter.notebook;
      let metadata = notebook.metadata;
      let firstAuthorId;
      if (!metadata.hasOwnProperty('graffiti')) {
        storage.ensureNotebookGetsGraffitiId();
      }
      if (!metadata.graffiti.hasOwnProperty('firstAuthorId')) {
        firstAuthorId = state.getUserId();
        metadata.graffiti.firstAuthorId = firstAuthorId;
        state.setAuthorId(firstAuthorId);
      } else {
        firstAuthorId = metadata.graffiti.firstAuthorId;
      }

      return firstAuthorId;
    },

    constructBasePath: () => {
      const notebook = Jupyter.notebook;
      if (!notebook.metadata.hasOwnProperty('graffiti')) {
        storage.ensureNotebookGetsGraffitiId();
      }
      // hardwired to only load author recordings for now
      let dataDir = utils.getNotebookGraffitiConfigEntry('dataDir');
      if (dataDir === undefined) {
        dataDir = 'jupytergraffiti_data/';
      } else if (dataDir[dataDir.length - 1] !== '/') {
        dataDir = dataDir + '/';
      }
      const basePath = dataDir + 'notebooks/' + notebook.metadata.graffiti.id + '/authors/' + state.getAuthorId() + '/';
      //console.log('dataDir:', dataDir, 'basePath:', basePath);
      return basePath;
    },

    constructManifestPath: () => {
      const basePath = storage.constructBasePath();
      return { path: basePath, file: 'manifest.json' };
    },

    constructGraffitiMoviePath: (pathParts) => {
      const basePath = storage.constructBasePath();
      const graffitiPath = basePath + 
                           'cells/' + pathParts.recordingCellId + '/' + 
                           'graffitis/' + pathParts.recordingKey + '/';
      return graffitiPath;
    },

    constructGraffitiTakePath: (pathParts) => {
      const graffitiPath = storage.constructGraffitiMoviePath(pathParts) + 'takes/' + pathParts.takeId + '/';
      return graffitiPath;
    },

    constructGraffitiIncludesPath: (pathParts) => {
      const graffitiPath = storage.constructGraffitiMoviePath(pathParts) + 'includes/';
      return graffitiPath;
    },

    constructGraffitiIncludeFileName: (pathParts) => {
      const graffitiPath = 'include_' + pathParts.recordingCellId.replace('id_','') + '_' + 
                           pathParts.recordingKey.replace('id_','') +
                           (pathParts.isMarkdown ? '.md' : '.txt');
      return graffitiPath;
    },
    
    constructGraffitiIncludeFileNameWithPath: (pathParts) => {
      const graffitiPath = storage.constructGraffitiIncludesPath(pathParts);
      const includeFileNameWithPath = graffitiPath + storage.constructGraffitiIncludeFileName(pathParts);
      return includeFileNameWithPath;
    },

    completeMovieStorage: () => {
      const recordingCellInfo = state.getRecordingCellInfo();
      const recording = state.getManifestSingleRecording(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey);
      const hasMovie = state.getMovieRecordingStarted();
      // recording is a pointer into the live manifest hash, so beware that we are modifying state directly when changing it.
      if (recording !== undefined) {
        recording.inProgress = false;
        recording.hasMovie = hasMovie;
      }
      if (hasMovie) {
        // Store the latest take information in the current take for this recording.
        recording.activeTakeId = recordingCellInfo.recordingRecord.activeTakeId;
        if (!recording.hasOwnProperty('takes')) {
          recording.takes = {};
        }
        recording.takes[recording.activeTakeId] = { 
          duration: state.getHistoryDuration(),
          createDate: utils.getNow()
        };
      }
      state.setMovieRecordingStarted(false);
      console.log('Graffiti: completeMovieStorage is saving manifest for recording:', recording, ', current kernel', Jupyter.notebook.kernel.name);
      storage.storeManifest();
      utils.queueSaveNotebookCallback(() => {
        storage.executeMovieCompleteCallback();
      });
      utils.saveNotebookDebounced();
    },

    writeOutIncludeFile: (recordingCellId, recordingKey, isMarkdown, includeFileContents) => {
      const pathParts = {
        recordingCellId: recordingCellId,
        recordingKey:    recordingKey,
        isMarkdown: isMarkdown
      }
      const graffitiPath = storage.constructGraffitiIncludesPath(pathParts);
      const includeFileName = storage.constructGraffitiIncludeFileName(pathParts);
        
      storage.runShellCommand(storage.getOSMkdirCommand(graffitiPath));
      storage.writeTextToFile({ path: graffitiPath + includeFileName,
                                contents: includeFileContents,
                                stripCRs: false });

      storage.cleanUpExecutorCell(graffitiPath);
      return Promise.resolve();
    },

    writeOutMovieData: (movieInfo, jsonHistory, encodedAudio) => {
      //console.log('writeOutMovieData, movieInfo:', movieInfo, 'history:', jsonHistory);
      const graffitiPath = storage.constructGraffitiTakePath({
        recordingCellId: movieInfo.recordingCellId,
        recordingKey:    movieInfo.recordingKey,
        takeId:          movieInfo.activeTakeId
      });

      storage.runShellCommand(storage.getOSMkdirCommand(graffitiPath));
      if (encodedAudio !== undefined) {
        storage.writeTextToFile({ path: graffitiPath + 'audio.txt', 
                                  contents: encodedAudio,
                                  stripCRs: true });
      }
      if (jsonHistory !== undefined) {
        const base64CompressedHistory = LZString.compressToBase64(jsonHistory);
        storage.writeTextToFile({ path: graffitiPath + 'history.txt', 
                                  contents: base64CompressedHistory,
                                  stripCRs: true });
      }
      storage.cleanUpExecutorCell(graffitiPath);
      return Promise.resolve();
    },

    storeMovie: () => {
      const recordingCellInfo = state.getRecordingCellInfo();

      const notebook = Jupyter.notebook;
      const jsonHistory = state.getJSONHistory();
      if (jsonHistory !== undefined) {
        //console.log(jsonHistory);
        const encodedAudio = audio.getRecordedAudio();
        const keys = {
          recordingCellId: recordingCellInfo.recordingCellId,
          recordingKey: recordingCellInfo.recordingKey,
          activeTakeId: recordingCellInfo.recordingRecord.activeTakeId
        };
        storage.writeOutMovieData(
          keys,
          jsonHistory, 
          encodedAudio).then(() => {
            storage.completeMovieStorage();
          });
      } else {
        console.log('Graffiti: could not fetch JSON history.');
      }
    },

    // Load the manifest for this notebook.
    // Manifests contain information about all the recordings present in this notebook.
    // This version of the system only supports author manifests.
    loadManifest: (currentAccessLevel) => {
      const notebook = Jupyter.notebook;
      if (!notebook.metadata.hasOwnProperty('graffiti')) {
        if (currentAccessLevel !== 'create') {
          console.log('Graffiti: loadManifest is bailing early because we are not in "create" mode and this notebook has no graffiti id.');
          return Promise.reject();
        } else {
          storage.ensureNotebookGetsGraffitiId();
        }
      }
      const authorId = storage.ensureNotebookGetsFirstAuthorId();
      state.setAuthorId(authorId);

      const credentials = { credentials: 'include' };
      const manifestInfo = storage.constructManifestPath();
      console.log('Graffiti: Loading manifest from:', manifestInfo);
      const manifestFullFilePath = manifestInfo.path + manifestInfo.file;
      return fetch(manifestFullFilePath, credentials).then((response) => {
        if (!response.ok) {
          // We could not fetch for some reason (maybe manifest file doesn't exist) so initialize an empty manifest
          return(undefined);
        }
        return response.text();
      }).then((base64Str) => {
        if (base64Str === undefined) {
          state.setManifest({});
        } else {
          const uncompressedManifestString = LZString.decompressFromBase64(base64Str);
          //console.log('uncompressed manifest:', uncompressedManifestString);
          const manifestDataParsed = JSON.parse(uncompressedManifestString);
          state.setManifest(manifestDataParsed);
          //console.log('Graffiti Manifest:', manifestDataParsed['id_iermcbu']);
        }
      });
    },

    updateSingleManifestRecordingField: (recordingCellId, recordingKey, field, data) => {
      const recording = state.getManifestSingleRecording(recordingCellId, recordingKey);
      recording[field] = data;
      storage.storeManifest();
    },

    storeManifest: () => {
      const manifest = state.getManifest();
      const manifestInfo = storage.constructManifestPath();
      const base64CompressedManifest = LZString.compressToBase64(JSON.stringify(manifest));
      const manifestFullFilePath = manifestInfo.path + manifestInfo.file;
      console.log('Graffiti: Saving manifest to:', manifestFullFilePath, manifest);
      
      storage.runShellCommand(storage.getOSMkdirCommand(manifestInfo.path));
      storage.writeTextToFile({ path: manifestFullFilePath, 
                                contents: base64CompressedManifest,
                                stripCRs: true });
      storage.cleanUpExecutorCell();
    },

    // Compute the ids of any cells affected during this recording.
    computeAffectedCells: (history) => {
      history.affectedCellIds = {};
      let i, viewRec, drawingRec;

      for (i = 1; i < history.contents.length; ++i) {
        Object.keys(history.contents[i]).map((key) => { 
          if (history.contents[i][key].data !== undefined) {
            history.affectedCellIds[key] = true 
          }
        });
      }
      history.view.map((viewRec) => {
        if ((viewRec.subType === 'focus') || (viewRec.subType === 'innerScroll')) {
          history.affectedCellIds[viewRec.cellId] = true;
        } else if (viewRec.subType === 'selectCell') {
          history.affectedCellIds[viewRec.selectedCellId] = true;
        }
      });
      history.drawings.map((drawRec) => {
        history.affectedCellIds[drawRec.cellId] = true;
      });
      Object.keys(history.cellAdditions).map((key) => {
        history.affectedCellIds[key] = true;
      });
    },

    //
    // Fetch a movie and store it into the movies cache in state.
    // Returns a promise.
    //
    fetchMovie: (data) => {
      // In the case of insert data from file, there may not be an active take/recording, so in 
      // that case don't try to load an associated movie.
      if (data.activeTakeId === undefined) { 
        return Promise.reject('There is no active take on: ' + data.recordingCellId + '_' + data.recordingKey);
      }
      const graffitiPath = storage.constructGraffitiTakePath( {
        recordingCellId: data.recordingCellId,
        recordingKey: data.recordingKey,
        takeId: data.activeTakeId,
      });
      const credentials = { credentials: 'include'};
      storage.successfulLoad = false; /* assume we cannot fetch this recording ok */
      // console.log('Graffiti: storage is loading movie from path:', graffitiPath);
      const historyUrl = graffitiPath + 'history.txt';
      return fetch(historyUrl, credentials).then((response) => {
        if (!response.ok) {
          throw Error(response.statusText);
        }
        return response.text();
      }).then(function(base64CompressedHistory) {
        try {
          //console.log('Loaded history:', base64CompressedHistory);
          const uncompressedHistory = LZString.decompressFromBase64(base64CompressedHistory);
          //console.log('uncompressedHistory:', uncompressedHistory);
          const parsedHistory = JSON.parse(uncompressedHistory);
          // Compute "affected" cells for the history.
          storage.computeAffectedCells(parsedHistory);
          // console.log('Graffiti: Loaded previous history:', parsedHistory);
          const audioUrl = graffitiPath + 'audio.txt';
          return fetch(audioUrl, { credentials: 'include' }).then((response) => {
            if (!response.ok) {
              throw Error(response.statusText);
            }
            return response.text();
          }).then(function(base64CompressedAudio) {
            try {
              //console.log('history', parsedHistory);
              state.storeToMovieCache('history', data, parsedHistory);
              state.storeToMovieCache('audio',   data, base64CompressedAudio);
              storage.successfulLoad = true;
              return ({ history: parsedHistory, audio: base64CompressedAudio });
            } catch(ex) {
              console.log('Graffiti: Could not parse saved audio, ex:', ex);
              return Promise.reject('Could not parse saved audio, ex :' + ex);
            }
          });
        } catch (ex) {
          console.log('Graffiti: Could not parse previous history, ex :',ex);
          return Promise.reject('Could not parse previous history, ex :' + ex);
        }
      }).catch((ex) => {
        console.log('Graffiti: Could not fetch history file for history at',historyUrl);
        return Promise.reject('Could not fetch history file');
      });
    },

    preloadAllMovies: () => {
      let allRecords = [], dataRecord, recordingCellId, recordingKeys, recording;
      const manifest = state.getManifest();
      for (recordingCellId of Object.keys(manifest)) {
        recordingKeys = Object.keys(manifest[recordingCellId]);
        if (recordingKeys.length > 0) {
          for (recordingKey of recordingKeys) {
            recording = state.getManifestSingleRecording(recordingCellId, recordingKey);
            if (recording.activeTakeId !== undefined) {
              dataRecord = { 
                recordingCellId: recordingCellId,
                recordingKey: recordingKey,
                activeTakeId: recording.activeTakeId
              }
              allRecords.push(dataRecord);
            }
          }
        }
      }
      const callback = (data) => {
        return storage.fetchMovie(data).catch((err) => {
          console.log('Graffiti: Could not fetch movie:', data);
        });
      }
      return batchRunner.start(storage.preloadBatchSize, callback, allRecords).then(() => { 
        console.log('Graffiti: preloading completed.');
        state.refreshCellIdToGraffitiMap();
      });
    },

    deleteMovie: (recordingCellId, recordingKey) => {
      const graffitiPath = storage.constructGraffitiMoviePath({ 
        recordingCellId: recordingCellId, 
        recordingKey: recordingKey 
      });
      storage.runShellCommand(storage.getOSRmCommand(graffitiPath,false));
      storage.cleanUpExecutorCell();
    },

    transferGraffiti: () => {
      const notebook = Jupyter.notebook;
      let originalGraffitiId;
      if (notebook.metadata.hasOwnProperty('graffiti')) {
        originalGraffitiId = $.extend(true, {},notebook.metadata.graffiti);
        delete(notebook.metadata['graffiti']);
      }
      storage.ensureNotebookGetsGraffitiId();
      storage.ensureNotebookGetsFirstAuthorId();
      utils.queueSaveNotebookCallback(() => {
        const newGraffitiId = notebook.metadata.graffiti.id;
        const notebookPath = "jupytergraffiti_data/notebooks/";
        const sourceTree = notebookPath + originalGraffitiId;
        const destTree = notebookPath + newGraffitiId;
        storage.runShellCommand('cp -pr ' + sourceTree + ' ' + destTree);
        storage.cleanUpExecutorCell();
      });
      utils.saveNotebookDebounced();

      return Promise.resolve(); // not really doing this right but...
    },

    packageGraffiti: () => {
      //utils.saveNotebookDebounced();
      const notebook = Jupyter.notebook;
      const notebookName = notebook.get_notebook_name();
      const archiveName = 'graffiti_archive_' + utils.generateUniqueId().replace('id_','') + '.tgz';
      const tarCmd = 'tar zcf ' + archiveName + ' "' + notebookName + '.ipynb"' + ' jupytergraffiti_data';
      storage.runShellCommand(tarCmd);
      storage.cleanUpExecutorCell();

      return Promise.resolve(archiveName);
    },

    removeGraffitiIds: () => {
      const cells = Jupyter.notebook.get_cells();
      for (let cell of cells) {
        if (cell.metadata.hasOwnProperty('graffitiCellId')) {
          delete(cell.metadata.graffitiCellId)
        }
      }
      delete(Jupyter.notebook.metadata.graffiti);
      utils.saveNotebookDebounced();
    },

    // Delete all a notebook's stored graffitis and its data directory (but not the global jupytergraffiti_data directory)
    deleteDataDirectory: (graffitiId) => {
      const notebookStoragePath = 'jupytergraffiti_data/notebooks/' + graffitiId;
      storage.runShellCommand(storage.getOSRmCommand(notebookStoragePath,false));
      storage.cleanUpExecutorCell();      
    },

    removeUnusedTakesCore: (recordingCellId, recordingKey) => {
      const recording = state.getManifestSingleRecording(recordingCellId, recordingKey);
      const activeTakeId = recording.activeTakeId;
      let deletedTakes = 0;

      if (recording.takes !== undefined) {
        for (let takeId of Object.keys(recording.takes)) {
          if (takeId !== activeTakeId) {
            const graffitiTakePath = storage.constructGraffitiTakePath({ 
              recordingCellId: recordingCellId, 
              recordingKey: recordingKey,
              takeId: takeId
            });
            storage.runShellCommand(storage.getOSRmCommand(graffitiTakePath, false));
            delete(recording.takes[takeId]);
            deletedTakes++;
          }
        }
      }
      return deletedTakes;
    },

    removeUnusedTakes: (recordingCellId, recordingKey) => {
      const deletedTakes = storage.removeUnusedTakesCore(recordingCellId, recordingKey);
      if (deletedTakes > 0) {
        storage.storeManifest();
        storage.cleanUpExecutorCell();
        utils.saveNotebookDebounced();
      }
    },

    fetchDataFile: (filePath) => {
      const nbDir = utils.getNotebookDirectory();
      let fullPath = '/tree';
      if (nbDir !== undefined) {
        fullPath += '/' + nbDir;
      }
      fullPath += '/' + filePath;
      const reworkedFullPath = utils.reworkFetchPathForVirtualHosts(fullPath);
      return fetch(reworkedFullPath, { credentials: 'include' }).then((response) => {
        if (!response.ok) {
          throw Error(response.statusText);
        }
        return response.text();
      }).catch((ex) => {
        console.log('Graffiti: could not fetch data file at :', filePath);
        return Promise.reject('Could not fetch data file at :' + filePath);
      });
    },

  }

  return(storage);
});
