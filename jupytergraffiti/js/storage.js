define([
  './state.js',
  './audio.js',
  './utils.js',
  './LZString.js'
], function (state,audio,utils, LZString) {

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
    cplusplusKernel: 'xeus-cling-cpp',
    executorCell: undefined,
    movieCompleteCallback: undefined,

    createExecutorCell: () => {
      if (storage.executorCell === undefined) {
        const cells = Jupyter.notebook.get_cells();
        const numCells = cells.length;
        storage.executorCell = Jupyter.notebook.insert_cell_below('code', numCells);
        state.setActivity('executing');
      }
      return storage.executorCell;
    },

    runShellCommand: (cmd) => {
      const executorCell = storage.createExecutorCell();
      executorCell.set_text('!' + cmd);
      executorCell.execute();
    },

    writeTextToFile: (path, contents) => {
      const executorCell = storage.createExecutorCell();
      const currentKernelName = Jupyter.notebook.kernel.name;
      const writeMagic = ((currentKernelName.indexOf(storage.cplusplusKernel) === 0) ? '%%file' : '%%writefile');
      const chunkSize = ((currentKernelName.indexOf(storage.cplusplusKernel) === 0) ? 5000 : 100000);
      // tr -d '\n' < checker.txt > checker2.txt
      const contentLength = contents.length;
      let chunkPtr = 0, chunk, appendFlag, cmd;
      const pathWithCrs = path + '.cr';
      while (chunkPtr < contentLength) {
        chunk = contents.substr(chunkPtr, chunkSize);
        appendFlag = (chunkPtr === 0 ? ' ' : ' -a ');
        cmd = writeMagic + appendFlag + pathWithCrs + "\n" + chunk;
        executorCell.set_text(cmd);
        executorCell.execute();
        chunkPtr += chunkSize;
      }
      executorCell.set_text('!/usr/bin/tr -d "\\n" < ' + pathWithCrs + ' > ' + path); // remove all the CR's produced by the %%writefile appends.
      executorCell.execute();
      executorCell.set_text('!rm ' + pathWithCrs);
      executorCell.execute();
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
      const basePath = 'jupytergraffiti_data/notebooks/' + notebook.metadata.graffiti.id + '/authors/' + state.getAuthorId() + '/';
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
      let graffitiPath = storage.constructGraffitiMoviePath(pathParts) + 'takes/' + pathParts.takeId + '/';
      return graffitiPath;
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
      console.log('Graffiti: completeMovieStorage is saving manifest, current kernel', Jupyter.notebook.kernel.name);
      storage.storeManifest();
      utils.saveNotebook(() => {
        storage.executeMovieCompleteCallback();
        state.setActivity('idle'); // cancel "executing" state
      });
    },

    writeOutMovieData: (movieInfo, jsonHistory, encodedAudio) => {
      console.log('writeOutMovieData, movieInfo:', movieInfo, 'history:', jsonHistory);
      const graffitiPath = storage.constructGraffitiTakePath({
        recordingCellId: movieInfo.recordingCellId,
        recordingKey:    movieInfo.recordingKey,
        takeId:          movieInfo.activeTakeId
      });

      storage.runShellCommand('mkdir -p ' + graffitiPath);
      if (encodedAudio !== undefined) {
        storage.writeTextToFile(graffitiPath + 'audio.txt', encodedAudio);
      }
      if (jsonHistory !== undefined) {
        const base64CompressedHistory = LZString.compressToBase64(jsonHistory);
        storage.writeTextToFile(graffitiPath + 'history.txt', base64CompressedHistory);
      }
      storage.cleanUpExecutorCell(graffitiPath);
    },

    storeMovie: () => {
      const recordingCellInfo = state.getRecordingCellInfo();

      const notebook = Jupyter.notebook;
      const jsonHistory = state.getJSONHistory();
      if (jsonHistory !== undefined) {
        //console.log(jsonHistory);
        const encodedAudio = audio.getRecordedAudio();
        storage.writeOutMovieData(
          {
            recordingCellId: recordingCellInfo.recordingCellId,
            recordingKey: recordingCellInfo.recordingKey,
            activeTakeId: recordingCellInfo.recordingRecord.activeTakeId
          },
          jsonHistory, 
          encodedAudio);
        storage.completeMovieStorage();
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
          console.log('Manifest:', manifestDataParsed);
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
      console.log('Graffiti: Saving manifest to:', manifestFullFilePath);
      
      storage.runShellCommand('mkdir -p ' + manifestInfo.path);
      storage.writeTextToFile(manifestFullFilePath, base64CompressedManifest);
      storage.cleanUpExecutorCell();
    },

    //
    // Load a movie.
    // Returns a promise.
    //
    loadMovie: (recordingCellId, recordingKey, activeTakeId) => {
      const notebookRecordingId = Jupyter.notebook.metadata.graffiti.id;
      const graffitiPath = storage.constructGraffitiTakePath( {
        recordingCellId: recordingCellId,
        recordingKey: recordingKey,
        takeId: activeTakeId,
      });
      const credentials = { credentials: 'include'};
      storage.successfulLoad = false; /* assume we cannot fetch this recording ok */
      console.log('Graffiti: storage is loading movie from path:', graffitiPath);
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
          state.storeWholeHistory(parsedHistory);
          console.log('Graffiti: Loaded previous history:', parsedHistory);
          const audioUrl = graffitiPath + 'audio.txt';
          return fetch(audioUrl, { credentials: 'include' }).then((response) => {
            if (!response.ok) {
              throw Error(response.statusText);
            }
            return response.text();
          }).then(function(base64CompressedAudio) {
            try {
              audio.setRecordedAudio(base64CompressedAudio);
              storage.successfulLoad = true;
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
        console.log('Graffiti: Could not fetch history file for history, ex:', ex);
        return Promise.reject('Could not fetch history file');
      });
    },

    deleteMovie: (recordingCellId, recordingKey) => {
      const graffitiPath = storage.constructGraffitiMoviePath({ 
        recordingCellId: recordingCellId, 
        recordingKey: recordingKey 
      });
      storage.runShellCommand('rm -r ' + graffitiPath);
      storage.cleanUpExecutorCell();
    },

    transferGraffitis: () => {
      const notebook = Jupyter.notebook;
      let originalGraffitiId;
      if (notebook.metadata.hasOwnProperty('graffiti')) {
        originalGraffitiId = $.extend(true, {},notebook.metadata.graffiti);
        delete(notebook.metadata['graffiti']);
      }
      storage.ensureNotebookGetsGraffitiId();
      storage.ensureNotebookGetsFirstAuthorId();
      utils.saveNotebook(() => {
        const newGraffitiId = notebook.metadata.graffiti.id;
        const notebookPath = "jupytergraffiti_data/notebooks/";
        const sourceTree = notebookPath + originalGraffitiId;
        const destTree = notebookPath + newGraffitiId;
        storage.runShellCommand('cp -pr ' + sourceTree + ' ' + destTree);
        storage.cleanUpExecutorCell();
      });

      return Promise.resolve(); // not really doing this right but...
    },

    packageGraffitis: () => {
      //utils.saveNotebook();
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
      utils.saveNotebook();
    },

    // Delete all a notebook's stored graffitis and its data directory (but not the global jupytergraffiti_data directory)
    deleteDataDirectory: (graffitiId) => {
      const notebookStoragePath = 'jupytergraffiti_data/notebooks/' + graffitiId;
      storage.runShellCommand('rm -r ' + notebookStoragePath);
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
            storage.runShellCommand('rm -r ' + graffitiTakePath);
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
        utils.saveNotebook(() => {
          state.setActivity('idle'); // cancel "executing" state
        });
      }
    },

  }

  return(storage);
});
