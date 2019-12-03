/**
 * @license
 * Copyright 2019 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
class AudioLoop {
  constructor(metronome, visualizer, defaultVelocity, defaultInstrument, callback) {
    this.metronome = metronome;
    this.visualizer = visualizer;
    this.events = [];

    this.playerMelody = new window.core.SoundFontPlayer('https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus');
    this.playerDrums = new window.core.SoundFontPlayer('https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus');

    this.playerMelody.callbackObject = {
      run: (note) => {
        if (this.playerMelody) this.playerMelody.currentPart.mute = this.melodyMuted;
      },
      stop: () => {}
    }
    this.playerDrums.callbackObject = {
      run: (note) => {
        if (this.playerDrums) this.playerDrums.currentPart.mute = this.drumsMuted;
      },
      stop: () => {}
    }

    const ns = {notes:[]};
    for (let i = 21; i < 108; i++) {
      ns.notes.push({pitch: i, velocity: defaultVelocity, program: defaultInstrument});
    }
    this.playerMelody.loadSamples(ns).then(callback);
    this.reset();
    this.isUsingMidi = false;
  }

  reset() {
    this.stop();
    this.hasDrums = false;
    this.freezeDrums = false;
    this.drumsMuted = false;
    this.melodyMuted = false;
    this.melody = null
    this.drums = null;
    this.ready = false;
  }

  switchToMidi(device) {
    this.playerMelody = new window.core.MIDIPlayer();
    this.playerMelody.outputs = [device];
    this.playerDrums = new window.core.MIDIPlayer();
    this.playerDrums.outputs = [device];
    this.isUsingMidi = true;

    // Fix the channels. TODO: add this to magenta.
    this.patchDrumsPlayerChannel();
  }

  addMelody(seq, time) {
    this.reset();
    const lastNote = seq.notes[seq.notes.length - 1];
    this.events.push({type:'add-melody', time, seq});
    this.events.push({type:'loop-melody', time});

    this.totalTime = 60 / this.metronome.bpm * 4 /* quarters per bar */ * 2 /*number of bars*/;
    this.melody = seq;
    this.melody.totalTime = this.totalTime;
    this.ready = true;

    this.playerMelody.start(this.melody);
    this.visualizer.showMelody(this.melody, this.melodyMuted);
  }

  updateDrums(time) {
    if (this.nextDrums) {
      this.drums = this.nextDrums;
      this.nextDrums = null;
      this.events.push({type:'add-drums', time, seq: this.drums});
    }
  }

  prepareNextDrums(seq) {
    this.hasDrums = true;
    this.nextDrums = seq;
    this.nextDrums.totalTime = this.totalTime;
    if (!this.isUsingMidi) this.playerDrums.loadSamples(seq);
  }

  loadSamplesForDrums(seq, time) {
    if (!this.isUsingMidi) this.playerDrums.loadSamples(seq);
  }

  loop(time) {
    this.stop();
    const seq = {notes:[]};

    if (this.melody) {
      // if (this.playerMelody.currentPart) {
      //   this.playerMelody.currentPart.mute = this.melodyMuted;
      // }
      if (!this.melodyMuted) {
        this.playerMelody.start(this.melody);
      }
      this.visualizer.showMelody(this.melody, this.melodyMuted);

      this.events.push({type:'loop-melody', time});
      this.addSequenceWithOffset(seq, this.melody, time, -1, -1);
    }
    if (this.drums) {
      // if (this.playerDrums.currentPart) {
      //   this.playerDrums.currentPart.mute = this.drumsMuted;
      // }
      if (!this.drumsMuted) {
        this.playerDrums.start(this.drums);
      }
      this.visualizer.showDrums(this.drums, this.drumsMuted);


      this.events.push({type:'loop-drums', time});
      this.addSequenceWithOffset(seq, this.drums, time, -1, -1);
    }
    return seq;
  }

  stop() {
    // Don't use this.player.stop() because it kills the Tone loop;
    this._stopPlayer(this.playerMelody);
    this._stopPlayer(this.playerDrums);
  }

  _stopPlayer(player) {
    if (player.currentPart) {
      player.currentPart.stop();
      player.currentPart.mute = true;
    }
    window.Tone.Transport.clear(player.scheduledStop);
    player.scheduledStop = undefined;
  }

  isPlaying() {
    return this.playerMelody.isPlaying() || this.playerDrums.isPlaying();
  }

  toggleDrums(time) {
    this.drumsMuted = !this.drumsMuted;
    if (this.playerDrums.currentPart) {
      this.playerDrums.currentPart.mute = this.drumsMuted;
    }
    this.visualizer.showDrums(this.drums, this.drumsMuted);
    this.events.push({type: this.drumsMuted ? 'mute-drums' : 'unmute-drums', time});
  }

  toggleMelody(time) {
    this.melodyMuted = !this.melodyMuted;
    if (this.playerMelody.currentPart) {
      this.playerMelody.currentPart.mute = this.melodyMuted;
    }
    this.visualizer.showMelody(this.melody, this.melodyMuted);
    this.events.push({type: this.melodyMuted ? 'mute-melody' : 'unmute-melody', time});
  }

  addLoops(recording, inputOffset, recordingEndsAt) {
    let drumsMutedAt = -1;
    let melodyMutedAt = -1;
    let currentDrums, currentMelody;

    for (let e = 0; e < this.events.length; e++) {
      const type = this.events[e].type;
      const time = this.events[e].time - inputOffset;

      switch (type) {
        case 'add-drums':
          currentDrums = this.events[e].seq;
          break;
        case 'add-melody':
          currentMelody = this.events[e].seq;
          break;
        case 'mute-drums':
          drumsMutedAt = time;
          break;
        case 'mute-melody':
          melodyMutedAt = time;
          break;
        case 'unmute-drums':
          drumsMutedAt = -1;
          break;
        case 'unmute-melody':
          melodyMutedAt = -1;
          break;
        case 'loop-drums':
          this.addSequenceWithOffset(recording, currentDrums, time, drumsMutedAt, recordingEndsAt);
          break;
        case 'loop-melody':
          this.addSequenceWithOffset(recording, currentMelody, time, melodyMutedAt, recordingEndsAt);
          break;
      }
    }
  }

  addSequenceWithOffset(toSequence, seq, offset, mutedAt, recordingEndsAt) {
    for (let i = 0; i < seq.notes.length; i++) {
      const note = seq.notes[i];
      const offsetStartTime = note.startTime + offset;

      if (recordingEndsAt !== -1 && offsetStartTime >= recordingEndsAt) {
        continue;

      }
      // Only add this note if it's not muted.
      if (mutedAt === -1 || offsetStartTime < mutedAt) {
        toSequence.notes.push({
          pitch: note.pitch,
          velocity: note.velocity,
          program: note.program,
          isDrum: note.isDrum || false,
          instrument: note.instrument || 0,
          startTime: offsetStartTime,
          endTime: note.endTime + offset
        });
      }
    }
  }

  patchDrumsPlayerChannel() {
    this.playerDrums.playNote = function(time, note) {
      // Some good defaults.
      const velocity = note.velocity || 100;
      const length = (note.endTime - note.startTime) * 1000;  // in ms.

      const msgOn = [this.NOTE_ON + 1, note.pitch, velocity];
      const msgOff = [this.NOTE_OFF + 1, note.pitch, velocity];

      const outputs = this.outputs ? this.outputs : this.availableOutputs;
      for (let i = 0; i < outputs.length; i++) {
        this.sendMessageToOutput(outputs[i], msgOn);
        this.sendMessageToOutput(
            outputs[i], msgOff, window.performance.now() + length);
      }
    }
  }
}
