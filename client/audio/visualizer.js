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
const BASE_CONFIG = {
  minPitch: 20,
  maxPitch: 100,
  noteHeight: 1.5,
  pixelsPerTimeStep: 44
};

class Visualizer {
  constructor(clicksPerQuarter = 1) {
    this.TICKS_PER_BAR = 4 * clicksPerQuarter;
    this.TICKS_PER_TWO_BAR = 2 * this.TICKS_PER_BAR;
    
    this.svgInput = document.getElementById('svgInput');
    this.svgMelody = document.getElementById('svgMelody');
    this.svgDrums = document.getElementById('svgDrums');
    this.bar = document.getElementById('timeline');
    
    this.barLocations = Array(this.TICKS_PER_TWO_BAR).fill().map((v,i)=>i);
    this.vizMelody = this.vizDrums = null;
    
    this.input = {notes:[]};
    this.melody = {notes:[]};
    this.drums = {notes:[]};
    
    this.cfgInput = this.makeConfig('255, 255, 255');
    this.cfgMelody = this.makeConfig('255, 215, 0');
    this.cfgDrums = this.makeConfig('123, 225, 225');
    
    this.barOffset = 0;
    this.barHasBeenRestarted = false;
  }
  
  reset() {
    this.svgInput.innerHTML = '';
    this.svgMelody.innerHTML = '';
    this.svgDrums.innerHTML = '';
    
    this.input.notes = [];
    this.melody.notes = [];
    this.drums.notes = [];
    this.barHasBeenRestarted = false;
    this.barOffset = 0;
    
  }
  
  setTotalTime(t) {
    this.input.totalTime = this.melody.totalTime = this.drums.totalTime = t;
    // There's 260 pixels available for every timestep
    const p = Math.floor(260/t);
    this.cfgInput.pixelsPerTimeStep = this.cfgMelody.pixelsPerTimeStep = this.cfgDrums.pixelsPerTimeStep = p;
  }
  
  restartBar() {
    if (this.barOffset >= this.TICKS_PER_BAR) {
      // We are restarting the timeline in the second bar. This means that we want 
      // the timeline to be the index of this click in a single bar.
      for (let i = 0; i < this.barLocations.length; i++) {
        const newIndex = i >= this.TICKS_PER_BAR ? i - this.TICKS_PER_BAR : i + this.TICKS_PER_BAR;
        this.barLocations[i] = newIndex;
      }
    } else {
      this.barLocations = Array(this.TICKS_PER_TWO_BAR).fill().map((v,i)=>i);
    }
    this.barHasBeenRestarted = true;
    this.advanceBar(this.barOffset);
  }
  
  advanceBar(click) {
    let index = click;
    
    if (!this.barHasBeenRestarted) {
      this.barOffset = click;
    } else {
      // Wrap the time correctly, since the beginning of the
      // 2 bar chunk might actually now be the second bar.
      index = this.barLocations[click];
    }
    this.bar.style.left = `${index/this.TICKS_PER_TWO_BAR * 100}%`;
  }
  
  showInput(note, timeOffset) {
    this.input.notes.push({
      pitch: note.pitch, 
      startTime: note.startTime - timeOffset, 
      endTime: note.endTime - timeOffset, 
      velocity: note.velocity
    });
    
    this.vizInput = new window.core.PianoRollSVGVisualizer(this.input, this.svgInput, this.cfgInput);
  }
  
  showMelody(melody, muted) {
    if (muted) {
      this.svgMelody.innerHTML = '';
      return;
    }
    
    // Has anything even changed?
    // if (this.melody.notes.length !== 0 && this.melody === melody) {
    //   console.log("nothing changed in the melody");
    //   return;
    // }
    
    this.melody = melody;
    this.vizMelody = new window.core.PianoRollSVGVisualizer(this.melody, this.svgMelody, this.cfgMelody);
  }
  
  showDrums(drums, muted) {
    if (muted) {
      this.svgDrums.innerHTML = '';
      return;
    }
    
    // Has anything even changed?
    // if (this.drums === drums) {
    //   console.log("nothing changed in the melody");
    //   return;
    // }
    
    this.drums = drums;
    this.vizDrums = new window.core.PianoRollSVGVisualizer(this.drums, this.svgDrums, this.cfgDrums);
  }
  
  clearInput() {
    this.svgInput.innerHTML = '';
    this.input.notes = [];
  }
  
  makeConfig(color) {
    // I don't trust objects anymore, man.
    const cfg = JSON.parse(JSON.stringify(BASE_CONFIG));
    cfg.noteRGB = color;
    return cfg;
  }
}