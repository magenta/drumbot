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
const express = require('express');
const bodyParser = require('body-parser');

const mm = require('@magenta/music/node/music_vae');
const mmcore = require('@magenta/music/node/core');
//const tf = require('@tensorflow/tfjs-node');

// Fix: magenta.js uses performance.now() for timing logging
// And fetch for the checkpoint, so fake both :/
if (!global.performance) global.performance = require('perf_hooks').performance;
global.fetch = require('node-fetch');

// If you run this locally, and not on Glitch, you might not have the
// env variables set.
const PORT = process.env && process.env.PORT ? process.env.PORT : 9876;
const mvae = new mm.MusicVAE('https://storage.googleapis.com/magentadata/js/checkpoints/groovae/tap2drum_2bar');
warmUpModel();

// http://expressjs.com/en/starter/static-files.html
const app = express();
app.use(express.static('client'));
app.use(bodyParser.json());

app.get('/', function(request, response) {
  response.sendFile(__dirname + '/client/index.html');
});

app.post('/drumify', async function(request, response) {
  if (!mvae.isInitialized()) {
    await mvae.initialize();
  }
  const original_ns = request.body;
  const ns = fixSequence(original_ns);

  const temperature = ns.temperature || 1;
  const drums = await drumify(ns, ns.tempos[0].qpm, temperature);

  // Some drums are too quiet and they don't sound great, so mute them completely.
  for (let i = 0; i < drums.notes.length; i++) {
    const note = drums.notes[i];
    note.instrument = 1;
    if (note.velocity < 10) {
      note.velocity = 0;
    }
  }

  // Sometimes the first drum comes with a startTime < 0, so fix that.
  if (drums.notes[0].startTime < 0) {
    drums.notes[0].startTime = 0;
  }
  response.send(drums);
});

async function warmUpModel() {
  await mvae.initialize();

  // Warm up the model.
  const ns = {notes: [{pitch:60, velocity: 100, startTime: 0, endTime: 1}]}
  const quantizedNS = mmcore.sequences.quantizeNoteSequence(ns, 4);
  await drumify(quantizedNS, 80);

  app.listen(PORT, function() {
    console.log('Your app is listening on port ' + PORT);
  });
}

async function drumify(ns, tempo, temperature) {
  const z = await mvae.encode([ns]);
  const output = await mvae.decode(z, temperature, undefined, undefined, tempo);
  z.dispose();
  return output[0];
}

// From experimenting, Groovae is really picky about the timing
// of the input, and it works best if the sequence
// is actually looking quantized.
function fixSequence(ns) {
  // unquantized -> quantized -> unquantized
  const quant = mmcore.sequences.quantizeNoteSequence(ns, 4);
  const unquant = mmcore.sequences.unquantizeSequence(quant);

  for (let i = 0; i < unquant.notes.length; i++) {
    delete unquant.notes[i].quantizedStartStep;
    delete unquant.notes[i].quantizedEndStep;
  }
  delete unquant.totalQuantizedSteps;
  delete unquant.quantizationInfo;

  return unquant;
}
