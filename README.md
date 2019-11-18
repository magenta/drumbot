DrumBuddy
=================
Need a drummer but don't know somebody? Try DrumBuddy!
Play real-time music with a machine learning drummer that drums based on your melody.

## How does it work?
This app uses an open-source Magenta model called Drumify. 
It is able to convert a constant-velocity 'tap' pattern into a drum pattern.

DrumBuddy records 2 bars of your melody, removes the pitches from it (so that it's a sequence of taps), 
and then sends it to the model. 

All of the machine learning code happens in the background, on a Node server, so that your realtime audio is never interrupted

You can read more about how the model was trained on the [Magenta blog](https://magenta.tensorflow.org/groovae)!
