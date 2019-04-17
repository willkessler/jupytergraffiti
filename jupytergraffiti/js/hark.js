// From: https://github.com/muaz-khan/WebRTC-Experiment/blob/master/hark/hark.js
// original source code is taken from:
// https://github.com/SimpleWebRTC/hark
// copyright goes to &yet team
// edited by Muaz Khan for RTCMultiConnection.js
define([], function () {
  const hark = {

    running: false,

    getMaxVolume: (analyser, fftBins) => {
      let maxVolume = -Infinity;
      analyser.getFloatFrequencyData(fftBins);

      for (let i = 4, ii = fftBins.length; i < ii; i++) {
        if (fftBins[i] > maxVolume && fftBins[i] < 0) {
          maxVolume = fftBins[i];
        }
      }

      return maxVolume;
    },

    on: (event, callback) => {
      hark.events[event] = callback;
    },

    emit: (arg1,arg2,arg3,arg4) => {
      if (hark.events[arg1]) {
        hark.events[arg1](arg2,arg3,arg4);
      }
    },

    looper: () => {
      let interval = (hark.speaking ? hark.talkingInterval : hark.silenceInterval);
      setTimeout( () => {

        //check if stop has been called
        if (!hark.running) {
          return;
        }

        let currentVolume = hark.getMaxVolume(hark.analyser, hark.fftBins);
        hark.emit('volume_change', currentVolume, hark.threshold);

        let history = 0;
        if (currentVolume > hark.threshold && !hark.speaking) {
          // trigger quickly, short history
          for (let i = hark.speakingHistory.length - 3; i < hark.speakingHistory.length; i++) {
            history += hark.speakingHistory[i];
          }
          if (history >= 2) {
            hark.speaking = true;
            hark.emit('speaking');
          }
        } else if (currentVolume < hark.threshold && hark.speaking) {
          for (let j = 0; j < hark.speakingHistory.length; j++) {
            history += hark.speakingHistory[j];
          }
          if (history === 0) {
            hark.speaking = false;
            hark.emit('stopped_speaking');
          }
        }
        hark.speakingHistory.shift();
        hark.speakingHistory.push(0 + (currentVolume > hark.threshold));

        hark.looper();
      }, interval);
    },

    setThreshold: (t) => {
      hark.threshold = t;
    },

    setIntervals: (silenceInterval, talkingInterval) => {
      //console.trace('Called from here:');
      hark.silenceInterval = silenceInterval;
      hark.talkingInterval = talkingInterval;
    },

    // Poll the analyser node to determine if speaking
    // and emit events if changed
    start: () => {
      hark.running = true;
      hark.looper();
    },

    stop:  () => {
      hark.running = false;
      hark.emit('volume_change', -100, hark.threshold);
      if (hark.speaking) {
        hark.speaking = false;
        hark.emit('stopped_speaking');
      }
    },

    init: (stream, options) => {
      const audioContextType = window.webkitAudioContext || window.AudioContext;

      hark.events = {};

      // make it not break in non-supported browsers
      if (!audioContextType) return hark;

      options = options || {};
      // Config
      const smoothing = (options.smoothing || 0.1);

      hark.play = options.play;
      hark.historySize = options.historySize || 10;
      hark.silenceInterval = (options.silenceInterval || 10);
      hark.talkingInterval = (options.talkingInterval || 100);
      hark.threshold = options.threshold || -50;

      // Setup Audio Context
      if (!window.audioContext00) {
        window.audioContext00 = new audioContextType();
      }

      const gainNode = audioContext00.createGain();
      gainNode.connect(audioContext00.destination);
      // don't play for self
      gainNode.gain.value = 0;

      hark.analyser = audioContext00.createAnalyser();
      hark.analyser.fftSize = 512;
      hark.analyser.smoothingTimeConstant = smoothing;
      hark.fftBins = new Float32Array(hark.analyser.fftSize);

      //WebRTC Stream
      const sourceNode = audioContext00.createMediaStreamSource(stream);

      sourceNode.connect(hark.analyser);

      if (hark.play) hark.analyser.connect(audioContext00.destination);

      hark.speaking = false;

      hark.speakingHistory = [];
      for (let i = 0; i < hark.historySize; i++) {
        hark.speakingHistory.push(0);
      }
    }
  };

  return hark;

});
