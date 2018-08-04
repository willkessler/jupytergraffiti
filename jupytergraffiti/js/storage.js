define([
  './state.js',
  './audio.js',
  './utils.js',
  './LZString.js'
], function (state,audio,utils, LZString) {

  const storage = {
    constructMoviePath: (recordingCellId, recordingKey) => {
      const notebook = Jupyter.notebook;
      if (!notebook.metadata.hasOwnProperty('recordingId')) {
        notebook.metadata['recordingId'] = utils.generateUniqueId();
      }
      const notebookRecordingId = notebook.metadata['recordingId'];
      const dirName = "recording_data/" +
                      notebookRecordingId.replace('-','_') + '/' +
                      recordingCellId.replace('-','_') + '/' +
                      recordingKey;
      return dirName;
    },

    ensureNotebookGetsRecordingId: (currentAccessLevel) => {
      // make sure a new notebook gets a recording id
      const notebook = Jupyter.notebook;
      if (currentAccessLevel === 'create') {
        if (!notebook.metadata.hasOwnProperty('recordingId')) {
          notebook.metadata['recordingId'] = utils.generateUniqueId();
        }
      }
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
      console.log('clearStorageInProcess saving manifest.');
      storage.storeManifest('author');
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
      const dirName = storage.constructMoviePath(recordingCellInfo.recordingCellId, recordingCellInfo.recordingKey);
      const jsonMeta = JSON.stringify(recordingMetaData).replace(/\"/g,'\\"');
      let bashScript = "import os\n";
      bashScript += 'os.system("mkdir -p ' + dirName + '")' + "\n";
      bashScript += "with open('" + dirName + '/' + "audio.txt', 'w') as f:\n";
      bashScript += "    f.write('" + encodedAudio + "')\n";
      bashScript += "with open('" + dirName + '/' + "history.txt', 'w') as f:\n";
      bashScript += "    f.write('" + base64CompressedHistory + "')\n";
      bashScript += "with open('" + dirName + '/' + "meta.json', 'w') as f:\n";
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
    // mode is either 'author' or 'student-<123>' where <123> is the id of a student's graffiti.
    // This version of the system only supports author manifests.
    loadManifest: (mode, currentAccessLevel) => {
      const notebook = Jupyter.notebook;
      if (!notebook.metadata.hasOwnProperty('recordingId')) {
        if (currentAccessLevel !== 'create') {
          console.log('loadManifest is bailing early because we are not in "create" mode and this notebook has no recordingId.');
          return Promise.reject();
        }
        notebook.metadata['recordingId'] = utils.generateUniqueId();
      }
      const notebookRecordingId = notebook.metadata['recordingId'];
      let manifestPath = 'recording_data/manifests/';
      if (mode === 'author') {
        manifestPath += 'author/manifest_' + notebookRecordingId.replace('-','_').replace('id_','') + '.json';
      } else {
        console.log('Cannot load student graffitis yet.');
        return;
      }
      console.log('Loading manifest from:', manifestPath);
      const credentials = { credentials: 'include' };

      return fetch(manifestPath, credentials).then((response) => {
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
          const manifestDataParsed = JSON.parse(uncompressedManifestString);
          state.setManifest(manifestDataParsed);
        }
      });
    },

    storeManifest: (mode, studentId) => {
      const manifest = state.getManifest();
      const notebookRecordingId = Jupyter.notebook.metadata['recordingId'];
      let manifestPath = "recording_data/manifests/", manifestFile;
      if (mode === 'author') {
        manifestPath += "author";
        manifestFile = "manifest_" + notebookRecordingId.replace('-','_').replace('id_','') + '.json';
      } else {
        console.log('Cannot save student graffiti for studentId:', studentId, ' yet.');
        return;
      }
      manifestPath += '/';
      console.log('Saving manifest to:', manifestPath);
      let bashScript = "import os\n";
      const base64CompressedManifest = LZString.compressToBase64(JSON.stringify(manifest));
      bashScript += 'os.system("mkdir -p ' + manifestPath + '")' + "\n";
      bashScript += "with open('" + manifestPath + manifestFile + "', 'w') as f:\n";
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
    loadMovie: (recordingCellId, recordingId) => {

      // This optimization may be causing a bug where the wrong movie plays.
      //      if (recordingId === state.getCurrentRecordingId()) {
      //        return Promise.resolve();
      //      }

      state.setCurrentRecordingId(recordingId);
      const notebookRecordingId = Jupyter.notebook.metadata['recordingId'];
      const dirName = "./recording_data/" + notebookRecordingId.replace('-', '_') + '/' + recordingCellId.replace('-','_')  + '/' + recordingId;
      const metaUrl = dirName + '/meta.json';
      const credentials = { credentials: 'include'};
      storage.successfulLoad = false; /* assume we cannot fetch this recording ok */
      console.log('loading movie from metaUrl:', metaUrl);
      return fetch(metaUrl, credentials).then((response) => {
        if (!response.ok) {
          throw Error(response.statusText);
        }
        return response.json();
      }).then((metaInfo) => {
        const historyUrl = dirName + '/history.txt';
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
            console.log('Loaded previous history.');
            console.log(parsedHistory);
            const audioUrl = dirName + '/audio.txt';
            return fetch(audioUrl, { credentials: 'include' }).then((response) => {
              if (!response.ok) {
                throw Error(response.statusText);
              }
              return response.text();
            }).then(function(base64CompressedAudio) {
              try {
                audio.setRecordedAudio(base64CompressedAudio);
                storage.successfulLoad = true;
                state.setCurrentRecordingId(recordingId);
              } catch(ex) {
                console.log('Could not parse saved audio, ex:', ex);
              }
            });
          } catch (ex) {
            console.log('Could not parse previous history, ex :',ex);
          }
        });
      }).catch((ex) => {
        console.log('Could not fetch metadata file for history, ex:', ex);
        return Promise.reject('Could not fetch metadata file');
      });
    },

    deleteMovie: (recordingCellId, recordingId) => {
      const dirName = storage.constructMoviePath(recordingCellId, recordingId);
      const deletePython = "import os\nos.system('rm -r " + dirName + "')\n";
      console.log('deleteMovie:', deletePython);

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
