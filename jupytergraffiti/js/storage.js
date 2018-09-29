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
  //     authors/
  //      id_0 (creator)/
  //        manifest.json
  //        cells/
  //          id_1234/
  //             graffitis/
  //               id_1234/
  //      id_123 (viewer)/
  //        manifest.json
  //        cells/
  //          id_1234/
  //            graffitis/
  //              id_1234

  const storage = {

    ensureNotebookGetsGraffitiId: () => {
      // make sure a new notebook gets a recording id
      const notebook = Jupyter.notebook;
      if (!notebook.metadata.hasOwnProperty('graffitiId')) {
        notebook.metadata['graffitiId'] = utils.generateUniqueId();
      }
      utils.assignCellIds();
      utils.refreshCellMaps();
      console.log('Notebook is now ready to use Graffiti.');
    },

    constructBasePath: () => {
      const notebook = Jupyter.notebook;
      if (!notebook.metadata.hasOwnProperty('graffitiId')) {
        notebook.metadata['graffitiId'] = graffitiId;
      }
      // hardwired to only load author recordings for now
      const basePath = "jupytergraffiti_data/notebooks/" + notebook.metadata['graffitiId'] + '/authors/id_' + state.getAuthorId() + '/';
      return basePath;
    },

    constructManifestPath: () => {
      const basePath = storage.constructBasePath();
      return { path: basePath, file: 'manifest.json' };
    },

    constructGraffitiPath: (pathParts) => {
      const basePath = storage.constructBasePath();
      const graffitiPath = basePath + 
                           'cells/' + pathParts.recordingCellId + '/' + 
                           'graffitis/' + pathParts.recordingKey + '/';
      return graffitiPath;
    },

    clearStorageInProcess: () => {
      const recordingCellInfo = state.getRecordingCellInfo();
      const recording = state.getManifestSingleRecording(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey);
      if (recording !== undefined) {
        recording.inProgress = false;
        recording.hasMovie = state.getMovieRecordingStarted();
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
      console.log(jsonHistory);
      const base64CompressedHistory = LZString.compressToBase64(jsonHistory);
      const encodedAudio = audio.getRecordedAudio();

      const numCells = Jupyter.notebook.get_cells().length;
      const recordingMetaData = {
        duration: state.getHistoryDuration()
      };
      const graffitiPath = storage.constructGraffitiPath({
        recordingCellId: recordingCellInfo.recordingCellId,
        recordingKey: recordingCellInfo.recordingKey
      });
      const jsonMeta = JSON.stringify(recordingMetaData).replace(/\"/g,'\\"');
      let bashScript = "import os\n";
      bashScript += 'os.system("mkdir -p ' + graffitiPath + '")' + "\n";
      bashScript += "with open('" + graffitiPath + "audio.txt', 'w') as f:\n";
      bashScript += "    f.write('" + encodedAudio + "')\n";
      bashScript += "with open('" + graffitiPath + "history.txt', 'w') as f:\n";
      bashScript += "    f.write('" + base64CompressedHistory + "')\n";
      bashScript += "with open('" + graffitiPath + "meta.json', 'w') as f:\n";
      bashScript += "    f.write('" + jsonMeta + "')\n";
      console.log(bashScript);
      Jupyter.notebook.kernel.execute(bashScript,
                                      undefined,
                                      {
                                        silent: false,
                                        store_history: false,
                                        stop_on_error : true
                                      });

    },

    // Load the manifest for this notebook.
    // Manifests contain information about all the recordings present in this notebook.
    // This version of the system only supports author manifests.
    loadManifest: (currentAccessLevel) => {
      const notebook = Jupyter.notebook;
      if (!notebook.metadata.hasOwnProperty('graffitiId')) {
        if (currentAccessLevel !== 'create') {
          console.log('Graffiti: loadManifest is bailing early because we are not in "create" mode and this notebook has no graffitiId.');
          return Promise.reject();
        } else {
          storage.ensureNotebookGetsGraffitiId();
        }
      }
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
          console.log('uncompressed manifest:', uncompressedManifestString);
          const manifestDataParsed = JSON.parse(uncompressedManifestString);
          state.setManifest(manifestDataParsed);
        }
      });
    },

    storeManifest: () => {
      const manifest = state.getManifest();
      const manifestInfo = storage.constructManifestPath();
      console.log('Graffiti: Saving manifest to:', manifestInfo.file);
      let bashScript = "import os\n";
      const base64CompressedManifest = LZString.compressToBase64(JSON.stringify(manifest));
      const manifestFullFilePath = manifestInfo.path + manifestInfo.file;
      bashScript += 'os.system("mkdir -p ' + manifestInfo.path + '")' + "\n";
      bashScript += "with open('" + manifestFullFilePath + "', 'w') as f:\n";
      bashScript += "    f.write('" + base64CompressedManifest + "')\n";
      console.log(bashScript);
      Jupyter.notebook.kernel.execute(bashScript,
                                      undefined,
                                      {
                                        silent: false,
                                        store_history: false,
                                        stop_on_error : true
                                      });

    },

    //
    // Load a movie.
    // Returns a promise.
    //
    loadMovie: (recordingCellId, recordingKey) => {

      const notebookRecordingId = Jupyter.notebook.metadata['graffitiId'];
      const graffitiPath = storage.constructGraffitiPath( {
        recordingCellId: recordingCellId,
        recordingKey: recordingKey
      });
      const metaUrl = graffitiPath + 'meta.json';
      const credentials = { credentials: 'include'};
      storage.successfulLoad = false; /* assume we cannot fetch this recording ok */
      console.log('Graffiti storage: loading movie from metaUrl:', metaUrl);
      return fetch(metaUrl, credentials).then((response) => {
        if (!response.ok) {
          throw Error(response.statusText);
        }
        return response.json();
      }).then((metaInfo) => {
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
        });
      }).catch((ex) => {
        console.log('Graffiti: Could not fetch metadata file for history, ex:', ex);
        return Promise.reject('Could not fetch metadata file');
      });
    },

    deleteMovie: (recordingCellId, recordingKey) => {
      const graffitiPath = storage.constructGraffitiPath({ 
        recordingCellId: recordingCellId, 
        recordingKey: recordingKey 
      });
      const deletePython = "import os\nos.system('rm -r " + graffitiPath + "')\n";
      console.log('Graffiti: deleteMovie:', deletePython);

      this.Jupyter.notebook.kernel.execute(deletePython,
                                           undefined,
                                           {
                                             silent: false,
                                             store_history: false,
                                             stop_on_error : true
                                           });


    },

    transferGraffitis: () => {
      const notebook = Jupyter.notebook;
      let originalGraffitiId;
      if (notebook.metadata.hasOwnProperty('graffitiId')) {
        originalGraffitiId = notebook.metadata.graffitiId;
        delete(notebook.metadata['graffitiId']);
      }
      storage.ensureNotebookGetsGraffitiId();
      utils.saveNotebook();
      const newGraffitiId = notebook.metadata.graffitiId;
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

  }

  return(storage);
});
