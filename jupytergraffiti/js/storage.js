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

    ensureNotebookGetsGraffitiId: () => {
      // Make sure a new notebook gets a recording id
      const notebook = Jupyter.notebook;
      if (!notebook.metadata.hasOwnProperty('graffiti')) {
        notebook.metadata['graffiti'] = { 
          id: utils.generateUniqueId()
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
      let graffitiPath = storage.constructGraffitiMoviePath(pathParts) + 'takes/' + pathParts.activeTakeId + '/';
      return graffitiPath;
    },

    clearStorageInProcess: () => {
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
      state.setStorageInProcess(false);
      state.setMovieRecordingStarted(false);
      console.log('Graffiti: clearStorageInProcess saving manifest.');
      storage.storeManifest();
      utils.saveNotebook();
    },

    storeMovie: () => {
      state.setStorageInProcess(true);
      const recordingCellInfo = state.getRecordingCellInfo();

      const notebook = Jupyter.notebook;
      const jsonHistory = state.getJSONHistory();
      if (jsonHistory !== undefined) {
        //console.log(jsonHistory);
        const base64CompressedHistory = LZString.compressToBase64(jsonHistory);
        const encodedAudio = audio.getRecordedAudio();

        const numCells = Jupyter.notebook.get_cells().length;
        const graffitiPath = storage.constructGraffitiTakePath({
          recordingCellId: recordingCellInfo.recordingCellId,
          recordingKey: recordingCellInfo.recordingKey,
          activeTakeId: recordingCellInfo.recordingRecord.activeTakeId
        });
        let pythonScript = "import os\n";
        pythonScript += utils.addCR('os.system("mkdir -p ' + graffitiPath + '")');
        pythonScript += utils.addCR("with open('" + graffitiPath + "audio.txt', 'w') as f:");
        pythonScript += utils.addCR("    f.write('" + encodedAudio + "')");
        pythonScript += utils.addCR("with open('" + graffitiPath + "history.txt', 'w') as f:");
        pythonScript += utils.addCR("    f.write('" + base64CompressedHistory + "')");
        let bashScript = utils.addCR('mkdir -p ' + graffitiPath);;
        bashScript += utils.addCR('cd ' + graffitiPath);;
        bashScript += utils.addCR('echo "' + encodedAudio + '" > audio.txt');
        bashScript += utils.addCR('echo "' + base64CompressedHistory + '" > history.txt');
        //console.log(pythonScript);
        //console.log(bashScript);
        utils.sysCmdExec(pythonScript, bashScript);
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
      console.log('saving manifest:', manifest);
      const manifestInfo = storage.constructManifestPath();
      console.log('Graffiti: Saving manifest to:', manifestInfo.file);
      const base64CompressedManifest = LZString.compressToBase64(JSON.stringify(manifest));
      const manifestFullFilePath = manifestInfo.path + manifestInfo.file;
      let pythonScript = utils.addCR("import os");
      pythonScript += utils.addCR('os.system("mkdir -p ' + manifestInfo.path + '")');
      pythonScript += utils.addCR("with open('" + manifestFullFilePath + "', 'w') as f:");
      pythonScript += utils.addCR("    f.write('" + base64CompressedManifest + "')");

      let bashScript = utils.addCR('mkdir -p ' + manifestInfo.path);
      bashScript += utils.addCR('cd ' + manifestInfo.path);
      bashScript += utils.addCR('echo "' + base64CompressedManifest + '" > ' + manifestInfo.file);

      utils.sysCmdExec(pythonScript, bashScript);

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
        activeTakeId: activeTakeId,
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
          const parsedHistory = JSON.parse(uncompressedHistory);
          state.storeWholeHistory(parsedHistory);
          console.log('Graffiti: Loaded previous history.');
          console.log(parsedHistory);
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
      const bashScript = utils.addCR('rm -r "' + graffitiPath + '"');
      const pythonScript = utils.addCR("import os\nos.system(" + bashScript + ")");
      utils.sysCmdExec(pythonScript, bashScript);
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
      utils.saveNotebook();
      const newGraffitiId = notebook.metadata.graffiti.id;
      const notebookPath = "jupytergraffiti_data/notebooks/";
      const sourceTree = notebookPath + originalGraffitiId;
      const destTree = notebookPath + newGraffitiId;
      const copyPython = "import shutil\nshutil.copytree('" + sourceTree + "','" + destTree + "')\n";
      console.log('Graffiti: transferGraffitis will run:', copyPython);

      this.Jupyter.notebook.kernel.execute(copyPython,
                                           undefined,
                                           {
                                             silent: false,
                                             store_history: false,
                                             stop_on_error : true
                                           });

      return Promise.resolve(); // not really doing this right but...
    },

    packageGraffitis: () => {
      utils.saveNotebook();
      const notebook = Jupyter.notebook;
      const notebookName = notebook.get_notebook_name();
      const archiveName = 'graffiti_archive_' + utils.generateUniqueId().replace('id_','') + '.tgz';
      const packagePython = "import os\nos.system('tar zcf " + archiveName + " " + '"' + notebookName + '.ipynb"' + " jupytergraffiti_data')\n";
      console.log('Graffiti: packageGraffitis will run:', packagePython);

      this.Jupyter.notebook.kernel.execute(packagePython,
                                           undefined,
                                           {
                                             silent: false,
                                             store_history: false,
                                             stop_on_error : true
                                           });

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
      const deletePython = "import os\nos.system('rm -r " + notebookStoragePath + "')\n";
      console.log('Graffiti: deleteNotebookStorage:', deletePython);

      this.Jupyter.notebook.kernel.execute(deletePython,
                                           undefined,
                                           {
                                             silent: false,
                                             store_history: false,
                                             stop_on_error : true
                                           });
    },

  }

  return(storage);
});
