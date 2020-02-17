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
const NOTE_LENGTH = window.Tone.Time('8n').toSeconds();
const NUM_INPUT_BARS = 2;
let TWO_BAR_LENGTH;
const VELOCITY = 40;
const INSTRUMENT = 26;

// Keep track of where in a 2-bar chunk we are.
let barStartedAt, twoBarCounter, loopOffset;

// Record user input melody.
let canRecordInput, numInputBarsRecorded;

let shouldRegenerateDrums = true;
let midiInDevices, midiOutDevices;
let currentOctave = 4;

const metronome = new Metronome(4);
const visualizer = new Visualizer(4);
const recorder = new InputRecorder();
const audioLoop = new AudioLoop(metronome, visualizer, VELOCITY, INSTRUMENT, () => updateUI('record-ready'));

const piano = audioLoop.playerMelody;
initListeners();

function initListeners() {
  document.getElementById('btnReady').onclick = () => {
    const selection = document.getElementById('selectMidiOut').selectedIndex;
    if (selection > 0) {
      audioLoop.switchToMidi(midiOutDevices[selection]);
    }
    updateUI('ready');
  }
  document.getElementById('btnRecord').onclick = startOrStop;
  document.getElementById('btnPlay').onclick = playRecording;
  document.getElementById('btnSave').onclick = saveRecording;
  document.getElementById('inputMuteDrums').onchange = () => {
    audioLoop.toggleDrums(metronome.timeish());
    updateUI('toggle-drums');
  };
  document.getElementById('inputMuteInput').onchange = () => {
    audioLoop.toggleMelody(metronome.timeish());
    updateUI('toggle-melody');
  }
  document.getElementById('inputMuteClick').onchange = () => {
    metronome.muted = !metronome.muted;
    updateUI('toggle-click');
  };
  document.getElementById('inputMidi').onchange = maybeEnableMidi;
  document.getElementById('inputKeyboard').onchange = maybeEnableMidi;
  document.getElementById('btnOctaveUp').onclick = octaveUp;
  document.getElementById('btnOctaveDown').onclick = octaveDown;
  document.querySelector('.keyboard').onclick = (event) => {
    const button = event.target;
    button.classList.add('down');
    notePressed(parseInt(button.dataset.pitch) + (currentOctave * 12));
    setTimeout(() => button.classList.remove('down'), 150);
  }
}

function startOrStop() {
  const selection = document.getElementById('selectMidiIn').selectedIndex;
  const isUsingMidi = document.getElementById('inputMidi').checked && selection > 0;

  if (metronome.isTicking) {
    metronome.stop();
    if (isUsingMidi) {
      const device = midiInDevices[selection];
      device.onmidimessage = null;
    }
    window.onkeydown = null;
    updateUI('stop');
    recorder.addLoops(audioLoop, metronome.timeish());
  } else {
    updateUI('ready');
    if (isUsingMidi) {
      const device = midiInDevices[selection];
      device.onmidimessage = (msg) => onMidiIn(msg);
    } else {
      window.onkeydown = onKeydown;
    }

    resetInputRelatedThings();

    const bpm = parseFloat(document.getElementById('inputTempo').value);
    TWO_BAR_LENGTH = 60 / bpm * 4 * NUM_INPUT_BARS;
    visualizer.setTotalTime(TWO_BAR_LENGTH);
    recorder.setBpm(bpm);
    metronome.start(bpm, {clickMark: onClickMark, quarterMark: onQuarterMark, barMark: onBarMark});

    updateUI('start');
  }
}

async function onKeydown(e) {
  if (e.repeat) return;

  switch (e.key) {
    case 'n':  // Mute/unmute drums
      audioLoop.toggleDrums(metronome.timeish());
      updateUI('toggle-drums');
      document.getElementById('inputMuteDrums').value = document.getElementById('inputMuteDrums').value === "0" ? 1 : 0;
      break;
    case 'm':  // Mute/unmute input
      audioLoop.toggleMelody(metronome.timeish());
      document.getElementById('inputMuteInput').value = document.getElementById('inputMuteDrums').value === "0" ? 1 : 0;
      updateUI('toggle-melody');
      break;
    case 'b':  // Re-record
      resetInputRelatedThings();
      break;
    case 'v':  // Toggle re-generating the drums.
      shouldRegenerateDrums = !shouldRegenerateDrums;
      updateUI(shouldRegenerateDrums ? 'yes-drums-new' : 'no-drums-new');
      break;
    case 'z':  // Octave up
      octaveUp();
      break;
    case 'x':  // Octave down
      octaveDown();
      break;
    case 'a':  // All the notes we can press.
    case 's':
    case 'd':
    case 'f':
    case 'g':
    case 'h':
    case 'j':
    case 'k':
    case 'w':
    case 'e':
    case 't':
    case 'y':
    case 'u':
      const button = document.querySelector(`.note-${e.key}`);
      button.classList.add('down');
      notePressed(parseInt(button.dataset.pitch) + (currentOctave * 12));
      setTimeout(() => button.classList.remove('down'), 150);
      break;
    default:
      document.body.classList.add('error');
      setTimeout(() => document.body.classList.remove('error'), 150);
      break;
  }
}

async function onMidiIn(msg) {
  const command = msg.data[0];
  const pitch = msg.data[1];
  const velocity = msg.data[2];
  const basePitch = pitch % 12;
  const button = document.querySelector(`.pitch-${basePitch}`);

  if (command === 0x90 && velocity > 0) {
      // note on
      notePressed(pitch);
      button.classList.add('down');
  } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      // note off
      button.classList.remove('down');
  }
}

function notePressed(pitch) {
  const audioTime = window.Tone.immediate();
  const time = Math.max(0, audioTime - metronome.startedAt);

  const n = {
    pitch: pitch,
    velocity: VELOCITY,
    program: INSTRUMENT,
    startTime: time,
    endTime: time + NOTE_LENGTH
  };

  piano.playNote(audioTime, n);
  recorder.saveMelodyNote(n);

  // Should we start saving?
  if (canRecordInput) {
    updateUI('save-start');
    if (!recorder.isRecordingInput) {
      recorder.startRecordingInput(barStartedAt);
      visualizer.restartBar();
    }
    recorder.saveInputNote(n);
    visualizer.showInput(n, 0);
  } else {
    visualizer.showInput(n, loopOffset);
  }
}

function octaveUp() {currentOctave = Math.min(10, currentOctave + 1)};
function octaveDown() {currentOctave = Math.max(2, currentOctave - 1)};

// Display the metronome tick every quarter.
function onQuarterMark(time, quarter) {
  document.getElementById('tickDisplay').textContent = quarter + 1;
}
function onClickMark(time, click) {
  visualizer.advanceBar(click);
}

// Every new bar, see if we're done recording input and we should drumify.
function onBarMark(time) {
  barStartedAt = time;
  twoBarCounter++;

  // Restart the audio loop every 2 bars if we need to.
  if (audioLoop.ready && twoBarCounter === 2) {
    loopOffset = time;

    if (shouldRegenerateDrums) {
      audioLoop.updateDrums(time);
      updateUI('get-drums-new');
    }
    audioLoop.loop(time);
    twoBarCounter = 0;
    visualizer.clearInput();
  }

  // Record user notes if we need to.
  if (recorder.isRecordingInput) numInputBarsRecorded++;

  // Every two bars, get new drums.
  if (!canRecordInput && twoBarCounter === 0) {
    drumifyOnServer(audioLoop.melody);
    return;
  }

  // If we've recorded at least one bar, we've spanned two bars and we should stop.
  if (numInputBarsRecorded == NUM_INPUT_BARS) {
    loopOffset = time;
    const seq = recorder.getInput(TWO_BAR_LENGTH);

    if (seq.notes.length !== 0) {
      updateUI('save-stop');
      canRecordInput = false;

      // Start the audio loop.
      audioLoop.addMelody(seq, time);
      twoBarCounter = 0;
      drumifyOnServer(seq);

      // Stop the metronome.
      if (!metronome.muted) {
        metronome.muted = true;
        updateUI('toggle-click');
        document.getElementById('inputMuteClick').value = 0;
      }
    }
  }
}

function playRecording() {
  if (recorder.isPlaying) {
    updateUI('play-stop');
    recorder.stop();
  } else {
    updateUI('play-start');
    recorder.start(() => updateUI('play-stop'));
  }
}

function saveRecording() {
  window.saveAs(new File([window.core.sequenceProtoToMidi(recorder.full)], 'recording.mid'));
}
async function drumifyOnServer(ns) {
  const temp = parseFloat(document.getElementById('inputTemperature').value);
  if (!shouldRegenerateDrums) {
    return;
  }
  const start = performance.now();
  ns.temperature = temp;

  fetch('/drumify', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(ns)
  }).then((response) => response.json()).then(drums => {
    updateUI(audioLoop.drums ? 'has-drums-new' : 'has-drums');
    //audioLoop.addDrums(drums, metronome.timeish());
    audioLoop.prepareNextDrums(drums);
    console.log('server did drums in (ms)', performance.now() - start);
  });
}

function resetInputRelatedThings() {
  audioLoop.reset();
  recorder.reset();
  visualizer.reset();

  barStartedAt = null;
  canRecordInput = true;
  numInputBarsRecorded = 0;
  twoBarCounter = 0;
  loopOffset = 0;

  document.getElementById('inputMuteDrums').value = 1;
  document.getElementById('inputMuteInput').value = 1;
}

async function maybeEnableMidi() {
  const isUsingMidi = document.getElementById('inputMidi').checked;
  const midiSelect = document.getElementById('midiContainer');
  const midiNotSupported = document.getElementById('textMidiNotSupported');
  const midiIn = document.getElementById('selectMidiIn');
  const midiOut = document.getElementById('selectMidiOut');

  if (!isUsingMidi) {
    midiSelect.hidden = true;
    midiNotSupported.hidden = true;
  } else {
    // Figure out if WebMidi works.
    if (navigator.requestMIDIAccess) {
      midiNotSupported.hidden = true;
      midiSelect.hidden = false;

      const midi = await navigator.requestMIDIAccess();
      const inputs = midi.inputs.values();
      const outputs = midi.outputs.values();
      midiInDevices = [{name: "none (computer keyboard)"}];
      midiOutDevices = [{name: "none (use browser audio)"}];

      for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
        midiInDevices.push(input.value);
      }
      for (let output = outputs.next(); output && !output.done; output = outputs.next()) {
        midiOutDevices.push(output.value);
      }
      midiIn.innerHTML = midiInDevices.map(device => `<option>${device.name}</option>`).join('');
      midiOut.innerHTML = midiOutDevices.map(device => `<option>${device.name}</option>`).join('');
    } else {
      midiNotSupported.hidden = false;
      midiSelect.hidden = true;
    }
  }
}

function updateUI(state) {
  const btnRecord = document.getElementById('btnRecord');
  const btnPlay = document.getElementById('btnPlay');
  const btnSave = document.getElementById('btnSave');
  // not renaming this, sigh.
  const btnMuteDrums = document.getElementById('inputMuteDrums');
  const btnMuteInput = document.getElementById('inputMuteInput');
  const btnMuteMetronome = document.getElementById('inputMuteClick');
  const btnOctaveUp = document.getElementById('btnOctaveUp');
  const btnOctaveDown = document.getElementById('btnOctaveDown');
  const keyboard = document.querySelector('.keyboard');
  const inputTempoLabel = document.getElementById('inputTempo').parentElement;
  const inputTemperatureLabel = document.getElementById('inputTemperature').parentElement;
  const tickDisplay = document.getElementById('tickDisplay');
  const statusUpdate = document.getElementById('statusUpdate');

  switch (state) {
    case 'ready':
      document.querySelector('.preamble').hidden = true;
      document.querySelector('.settings').hidden = true;
      document.querySelector('.main').hidden = false;
      btnPlay.disabled = true;
      btnSave.disabled = true;
      btnMuteDrums.disabled = true;
      btnMuteInput.disabled = true;
      btnMuteMetronome.disabled = true;
      btnOctaveUp.disabled = true;
      btnOctaveDown.disabled = true;
      inputTempoLabel.removeAttribute('disabled');
      inputTempoLabel.hidden = false;
      inputTemperatureLabel.hidden = false;
      tickDisplay.textContent = '☍';
      keyboard.setAttribute('disabled', true);
      break;
    case 'record-ready':
      btnRecord.disabled = false;
      statusUpdate.textContent = 'Press record when ready!';
      break;
    case 'splash':
      document.querySelector('.splash').hidden = false;
      document.querySelector('.main').hidden = true;
      break;
    case 'start':
      document.querySelector('.volume-controls').removeAttribute('disabled');
      btnRecord.querySelector('.text').textContent = 'stop';
      inputTempoLabel.setAttribute('disabled', true);
      inputTemperatureLabel.removeAttribute('disabled');
      btnMuteDrums.disabled = true;
      btnMuteInput.disabled = false;
      btnMuteMetronome.disabled = false;
      btnOctaveUp.disabled = false;
      btnOctaveDown.disabled = false;
      keyboard.removeAttribute('disabled');
      statusUpdate.textContent = 'Waiting for your input. Take as long as you need!';
      metronome.muted = false;
      document.getElementById('inputMuteClick').value = 1;
      break;
    case 'stop':
      document.querySelector('.volume-controls').setAttribute('disabled', true);
      btnRecord.querySelector('.text').textContent = 'record';
      btnPlay.disabled = false;
      btnSave.disabled = false;
      inputTempoLabel.setAttribute('disabled', true);
      inputTemperatureLabel.setAttribute('disabled', true);
      btnMuteDrums.disabled = true;
      btnMuteInput.disabled = true;
      btnMuteMetronome.disabled = true;
      btnOctaveUp.disabled = true;
      btnOctaveDown.disabled = true;
      tickDisplay.textContent = '☍';
      keyboard.setAttribute('disabled', true);
      statusUpdate.textContent = 'Listen to your melody, or start again!';
      tickDisplay.classList.remove('saving');
      document.querySelector('.keyboard-box').classList.remove('saving');
      break;
    case 'has-drums':
      btnMuteDrums.disabled = false;
      statusUpdate.textContent = 'Drums ready; waiting for the next loop...';
      break;
    case 'has-drums-new':
      statusUpdate.textContent = 'New drums ready; waiting for the next loop...';
      break;
    case 'get-drums-new':
      statusUpdate.textContent = 'Getting new drums';
      break;
    case 'no-drums-new':
      statusUpdate.textContent = 'Drums regeneration paused';
      break;
    case 'yes-drums-new':
      statusUpdate.textContent = 'Drums regeneration resumed';
      break;
    case 'drums-start':
      statusUpdate.textContent = 'Starting drums!';
      break;
    case 'play-start':
      keyboard.setAttribute('disabled', true);
      btnPlay.querySelector('.text').textContent = 'stop';
      btnPlay.querySelector('.stop').removeAttribute('hidden');
      btnPlay.querySelector('.play').setAttribute('hidden', true);
      btnRecord.disabled = true;
      btnSave.disabled = true;
      btnMuteDrums.disabled = true;
      btnMuteInput.disabled = true;
      btnMuteMetronome.disabled = true;
      btnOctaveUp.disabled = true;
      btnOctaveDown.disabled = true;
      statusUpdate.textContent = 'How does this sound?';
      break;
    case 'play-stop':
      keyboard.setAttribute('disabled', true);
      btnRecord.disabled = false;
      btnSave.disabled = false;
      btnPlay.querySelector('.text').textContent = 'play';
      btnPlay.querySelector('.play').removeAttribute('hidden');
      btnPlay.querySelector('.stop').setAttribute('hidden', true);
      btnMuteDrums.disabled = true;
      btnMuteInput.disabled = true;
      btnMuteMetronome.disabled = true;
      btnOctaveUp.disabled = true;
      btnOctaveDown.disabled = true;
      statusUpdate.textContent = 'Listen to your melody, or start again!';
      break;
    case 'save-start':
      tickDisplay.classList.add('saving');
      document.querySelector('.keyboard-box').classList.add('saving');
      statusUpdate.textContent = 'Recording your input...';
      break;
    case 'save-stop':
      tickDisplay.classList.remove('saving');
      document.querySelector('.keyboard-box').classList.remove('saving');
      statusUpdate.textContent = 'Generating drums';
      break;
    case 'loading-samples':
      btnRecord.disabled = true;
      btnPlay.disabled = true;
      statusUpdate.textContent = 'Loading soundfont files...';
      break;
    case 'loading-samples-done':
      btnRecord.disabled = false;
      btnPlay.disabled = false;
      statusUpdate.textContent = `Done! ${document.getElementById('dropInstruments').value} ready.`;
      break;
    case 'toggle-drums':
      btnMuteDrums.textContent = audioLoop.drumsMuted ? 'unmute drums' : 'mute drums';
      break;
    case 'toggle-melody':
      btnMuteInput.textContent = audioLoop.melodyMuted ? 'unmute input' : 'mute input';
      break;
    case 'toggle-click':
      btnMuteMetronome.textContent = metronome.muted ? 'unmute click' : 'mute click';
      break;


  }
}
