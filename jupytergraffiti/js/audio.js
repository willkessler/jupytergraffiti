define([
  './state.js',
], function (state) {

  const audio = {

    init: (state) => {
      console.log('Annotations audio constructor.');
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
          },

          // Error callback
          function(err) {
            console.log('The following getUserMedia error occured: ' + err);
          }
        )
      } else {
        console.log('getUserMedia not supported on your browser!');
      }
    },

    storeMediaRecorder: (mediaRecorder) => {
      audio.mediaRecorder = mediaRecorder;
      console.log('Media recorder ready and stored.');
    },
    
    storeAudio: (audioObj) => {
      audio.audioObj = audioObj;
    },

    playAudio: (elapsedTime) => {
      audio.setAudioPosition(elapsedTime);
      audio.audioObj.play();
    },

    pauseAudio: () => {
      audio.audioObj.pause();
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
      audio.mediaRecorder.start();
      console.log(audio.mediaRecorder.state);
      console.log("Audio recording started");
    },

    stopRecording: () => {
      audio.mediaRecorder.stop();
      console.log("Audio recording stopped");
    },

    startPlayback: (elapsedTime) => {
      audio.playAudio(elapsedTime);
    },

    stopPlayback: () => {
      audio.pauseAudio();
    },

    saveRecordedAudio: (e) => {
      //console.log("Audio data available");

      console.log('Audio data:', e.data);
      const reader = new FileReader();
      reader.addEventListener("loadend", function() {
        // reader.result contains the contents of blob as a typed array
        let bufferArray = reader.result;
        // From: https://stackoverflow.com/questions/9267899/arraybuffer-to-base64-encoded-string
        // For going backwards, use https://stackoverflow.com/questions/16245767/creating-a-blob-from-a-base64-string-in-javascript and note comment about ie10
        let base64String = btoa([].reduce.call(new Uint8Array(bufferArray),function(p,c){return p+String.fromCharCode(c)},''));
        //console.log(base64String);
        audio.storeRecordedAudio(base64String);
        audio.audioStorageCallback();
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

