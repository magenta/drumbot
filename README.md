DrumBot
=================
Need a drummer but don't know anybody? Try DrumBot!
Play real-time music with a machine learning drummer that drums based on your melody.

## How does it work?
This app uses an open-source Magenta model called Drumify, which is is able
to convert a constant-velocity 'tap' pattern into a drum pattern.

DrumBot records 2 bars of your melody, removes the pitches from it
(so that it's a sequence of taps), and then sends it to the model, which is
running on a Node server. Even though the model could run in your browser, we
run the slightly expensive machine learning code in the background, on the
Node server, so that your realtime audio is never interrupted.

You can read more about how the model was trained on the [Magenta blog](https://magenta.tensorflow.org/groovae)!

## How to run locally
After cloning this repo, run:

```
npm install
npm start
```
Depending on your connection, this will take a bit of time (it needs to download a model checkpoint that's about 50MB). You will also see a warning that `This browser does not support Tone.js` -- ignore that. It's a red herring :)

This will start the local Node server on port `9876`. In your browser, navigate to
[localhost:9876](http://localhost:9876/) to view the app.
