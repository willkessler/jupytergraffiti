define([
  './state.js',
  './hark.js',
], function (state,hark) {

  const audio = {

    init: (cbs) => {
      console.log('Graffiti audio constructor.');
      audio.executeCallback = true; // by default always execute the storage callback

      // fork getUserMedia for multiple browser versions, for the future
      // when more browsers support MediaRecorder
      navigator.getUserMedia = ( navigator.getUserMedia ||
                                 navigator.webkitGetUserMedia ||
                                 navigator.mozGetUserMedia ||
                                 navigator.msGetUserMedia);
      if (navigator.getUserMedia) {
        //console.log('getUserMedia supported.');
        navigator.getUserMedia (
          { // constraints - only audio needed for this app
            audio: true
          },
          // Success callback
          function(stream) {
            const mediaRecorder = new MediaRecorder(stream);
      	    mediaRecorder.ondataavailable = audio.saveRecordedAudio;
            audio.storeMediaRecorder(mediaRecorder);
            cbs.succeed();

            hark.init(stream, { threshold:-65 });
            hark.on('speaking', () => { 
              state.setSpeakingStatus(true);
              console.log('speaking started');
            });
            hark.on('stopped_speaking', () => { 
              state.setSpeakingStatus(false);
              console.log('speaking ended');
            });
            //hark.on('volume_change', (currentVolume, threshold) => { console.log('volume change,', currentVolume, threshold) });
            
          },

          // Error callback
          function(err) {
            console.log('Graffiti: The following getUserMedia error occured: ' + err);
            cbs.fail();
          }
        )
      } else {
        console.log('Graffiti: getUserMedia not supported on your browser!');
      }
    },

    storeMediaRecorder: (mediaRecorder) => {
      audio.mediaRecorder = mediaRecorder;
      console.log('Graffiti: Media recorder ready and stored.');
      return true;
    },
    
    isAvailable: () => {
      return (audio.mediaRecorder !== undefined);
    },

    storeAudio: (audioObj) => {
      audio.audioObj = audioObj;
    },

    updateAudioPlaybackRate: () => {
      const scalar = state.getPlayRateScalar();
      //const scalar = (rawScalar === 1.0 ? rawScalar : rawScalar * 0.85);
      //console.log('updateAudioPlaybackRate, scalar:', scalar);
      audio.audioObj.playbackRate = scalar;
    },

    // Special thanks to: https://developers.google.com/web/updates/2017/06/play-request-was-interrupted 
    // for handling of weird "play was interrupted" chrome exception.
    playAudio: (elapsedTime) => {
      audio.setAudioPosition(elapsedTime);
      audio.updateAudioPlaybackRate();
      let playPromise = audio.audioObj.play();
      if (playPromise !== undefined) {
        playPromise.then(_ => {
          audio.playBeganOK = true;
        })
        .catch(error => {
          audio.playBeganOK = false;
          console.log('Graffiti: audio error:', error);
        });
      }
    },

    pauseAudio: () => {
      if (audio.playBeganOK) {
        audio.audioObj.pause();
      } else {
        console.log('Graffiti: cannot pause audio because audio playback did not begin successfully.');
        // Try again in one second if we fail. Sometimes there's a race condition if audio is stopped really quickly after it begins
        setTimeout(() => {
          if (audio.playBeganOK) {
            audio.audioObj.pause();
          }
        }, 1000);
      }
    },

    // Set time of audio clip, cf:
    // http://stackoverflow.com/questions/9563887/setting-html5-audio-position
    setAudioPosition: (elapsedTime) => {
      audio.audioObj.currentTime = elapsedTime / 1000; // note that we keep elapsed time in ms, but the MSDN API wants currentTime in seconds
    },

    storeRecordedAudio: (base64String) => {
      // console.log('storing audio base64String :', base64String);
      audio.recordedAudioString = base64String;
    },

    getRecordedAudio: () => {
      return(audio.recordedAudioString || '');
    },

    setRecordedAudio: (b64String) => {
      //console.log('Fetching from ', b64String);
      const labeledAudio = 'data:video/webm;base64,' + b64String;
      const audioObj = new Audio(labeledAudio);
      audioObj.load();
      audio.storeAudio(audioObj);
    },

    setAudioStorageCallback: (cb) => {
      audio.audioStorageCallback = cb;
    },

    startRecording: () => {
      if (audio.mediaRecorder !== undefined) {
        audio.mediaRecorder.start();
        hark.start(); // start checking for silences
        console.log('Graffiti:', audio.mediaRecorder.state);
        console.log("Graffiti: Audio recording started");
      } else {
        console.log('Graffiti: Audio recording cannot start, access not granted.');
      }
    },

    stopRecording: () => {
      if (audio.mediaRecorder !== undefined) {
        audio.mediaRecorder.stop();
        hark.stop(); // stop checking for silences
        console.log("Graffiti: Audio recording stopped");
      } else {
        console.log('Graffiti: Audio recording cannot stop, access not granted.');
      }
    },

    startPlayback: (elapsedTime) => {
      audio.playAudio(elapsedTime);
    },

    pausePlayback: () => {
      audio.pauseAudio();
    },

    setExecuteCallback: (value) => {
      audio.executeCallback = value;
    },

    saveRecordedAudio: (e) => {
      //console.log("Audio data available");

      // console.log('Graffiti: Audio data:', e.data);
      const reader = new FileReader();
      reader.addEventListener("loadend", function() {
        // reader.result contains the contents of blob as a typed array
        let bufferArray = reader.result;
        // From: https://stackoverflow.com/questions/9267899/arraybuffer-to-base64-encoded-string
        // For going backwards, use https://stackoverflow.com/questions/16245767/creating-a-blob-from-a-base64-string-in-javascript and note comment about ie10
        let base64String = btoa([].reduce.call(new Uint8Array(bufferArray),function(p,c){return p+String.fromCharCode(c)},''));
        //console.log(base64String);
        audio.storeRecordedAudio(base64String);
        if (audio.executeCallback) {
          // This callback is actually: storage:storeMovie().
          audio.audioStorageCallback();
        }
      });
      reader.readAsArrayBuffer(e.data);

      const audioUrl = window.URL.createObjectURL(e.data);
      // This works so nice and simple. From: http://stackoverflow.com/questions/33755524/how-to-load-audio-completely-before-playing (first answer)
      const audioObj = new Audio (audioUrl);
      audioObj.load();

      // Set time of clip for scrubbing: 
      // http://stackoverflow.com/questions/9563887/setting-html5-audio-position

      audio.storeAudio(audioObj);
    },

  }
        
  return(audio);

});

