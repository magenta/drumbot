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
const Tone = window.Tone;

class Metronome {
  constructor(clicksPerQuarter = 1) {
    this.reset();
    this.clicksPerQuarter = clicksPerQuarter;
  }
  
  reset() {
    this.isMuted = false;
    this.isTicking = false;
    this.loclick = new Tone
                        .MembraneSynth({
                          pitchDecay: 0.008,
                          envelope: {attack: 0.001, decay: 0.3, sustain: 0}
                        })
                        .toMaster();
    this.hiclick = new Tone
                        .MembraneSynth({
                          pitchDecay: 0.008,
                          envelope: {attack: 0.001, decay: 0.3, sustain: 0}
                        })
                        .toMaster();
    this.step = -1;
    this.startedAt = null;
  }
  
  /* TickCallback should be an object like 
    {
      clickMark: (time, quarter) => {}, 
      quarterMark: (time, quarter) => {}, 
      barMark: (time) => {},  
    }
  */
  start(bpm, callback) {
    this.reset();
    this.bpm = bpm;
    
    const clicksInBar = 4 * this.clicksPerQuarter;
    const clicksInTwoBars = 2 * clicksInBar;

    this.isTicking = true;
    let click, clickInChunk, quarter, note;
    
    Tone.Transport.bpm.value = bpm;
    Tone.Transport.scheduleRepeat((time) => {
      if (!this.startedAt) this.startedAt = time;
      
      const offsetTime = time - this.startedAt;
      this.step++;
      
      // What is this step in the bar?
      click = this.step % clicksInBar;
      clickInChunk = this.step % clicksInTwoBars;
      quarter = click % this.clicksPerQuarter;
      
      // Every click...
      callback.clickMark(offsetTime, clickInChunk);
      
      // Every quarter...
      if (quarter === 0) {
        callback.quarterMark(offsetTime, Math.floor(click / this.clicksPerQuarter));
      
        if (!this.muted) {
          if (click === 0) {
            this.hiclick.triggerAttack('g5', time, 0.1);
          } else {
            this.loclick.triggerAttack('c5', time, 0.1);
          }
        }
      }
  
      // Every bar...
      if (click === 0) callback.barMark(offsetTime);
    }, `${clicksInBar}n`);
    
    Tone.Transport.start();
  }
  
  stop() {
    this.isTicking = false;
    Tone.Transport.cancel();
    Tone.Transport.stop();
  }
  
  timeish() {
    return Tone.immediate() - this.startedAt;
  }
}