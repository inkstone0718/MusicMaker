import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import './App.css';

const NOTES = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];
const OCTAVES = [4, 3, 2, 1]; // Higher octaves first (top to bottom)
const MIN_MEASURES = 1;
const MAX_MEASURES = 16;
const BEATS_PER_MEASURE = 4;
const MIN_BPM = 40;
const MAX_BPM = 200;
const DEFAULT_BPM = 120;


const App: React.FC = () => {
  const [notes, setNotes] = useState<{ [key: string]: boolean }>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [measures, setMeasures] = useState(4);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [lastToggled, setLastToggled] = useState<{ note: string, octave: number, beat: number } | null>(null);
  const [showChordSelector, setShowChordSelector] = useState(false);
  const [selectedChord, setSelectedChord] = useState('major');
  const [selectedRoot, setSelectedRoot] = useState('C');
  const [selectedOctave, setSelectedOctave] = useState(4);
  const [chordDuration, setChordDuration] = useState(1); // Default to 1 beat
  const synth = useRef<Tone.PolySynth | null>(null);

  // Chord definitions
  const CHORDS = {
    major: [0, 4, 7],         // Major third + Minor third
    minor: [0, 3, 7],         // Minor third + Major third
    augmented: [0, 4, 8],     // Major third + Major third
    diminished: [0, 3, 6],    // Minor third + Minor third
    'major7': [0, 4, 7, 11],  // Major triad + Major 7th
    'minor7': [0, 3, 7, 10],  // Minor triad + Minor 7th
    'dominant7': [0, 4, 7, 10] // Major triad + Minor 7th
  };

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const OCTAVE_RANGE = [1, 2, 3, 4, 5, 6];
  const lastPlayedBeat = useRef<number>(-1);

  // Initialize audio
  useEffect(() => {
    synth.current = new Tone.PolySynth(Tone.Synth).toDestination();
    synth.current.volume.value = -8;
    Tone.Transport.bpm.value = bpm;

    return () => {
      if (synth.current) {
        synth.current.dispose();
      }
    };
  }, []);

  // Update number of measures
  const updateMeasures = (newMeasures: number) => {
    // Ensure the number of measures is within the allowed range
    const clampedMeasures = Math.min(Math.max(newMeasures, MIN_MEASURES), MAX_MEASURES);
    setMeasures(clampedMeasures);

    // If current position exceeds the new number of measures, reset the position
    const totalBeats = clampedMeasures * BEATS_PER_MEASURE;
    if (currentBeat >= totalBeats) {
      setCurrentBeat(0);
      if (isPlaying) {
        Tone.Transport.position = '0:0:0';
      }
    }
  };

  // Update BPM when it changes
  useEffect(() => {
    Tone.Transport.bpm.value = bpm;
    // When BPM changes, cancel any existing schedules
    Tone.Transport.cancel();
    if (isPlaying) {
      Tone.Transport.scheduleRepeat(repeat, '16n');
    }
  }, [bpm, isPlaying]);

  const toggleNote = (note: string, octave: number, beat: number, forceState?: boolean) => {
    const noteId = `${note}${octave}-${beat}`;

    // Use forceState if provided, otherwise toggle the state
    const newState = forceState !== undefined ? forceState : !notes[noteId];

    setNotes(prev => ({
      ...prev,
      [noteId]: newState
    }));

    // Record the last toggled cell
    setLastToggled({ note, octave, beat });

    // Play note when cell is activated
    if (newState) {
      const noteToPlay = `${note}${octave}`;
      synth.current?.triggerAttackRelease(noteToPlay, '8n');
    }
  };

  // Clear all notes
  const clearAllNotes = () => {
    setNotes({});
  };

  // Add chord at current beat position with specified duration
  const addChord = () => {
    const rootIndex = NOTE_NAMES.indexOf(selectedRoot);
    if (rootIndex === -1) return;

    const chordIntervals = CHORDS[selectedChord as keyof typeof CHORDS] || [];
    const newNotes = { ...notes };

    // Use current playhead position
    const startBeat = currentBeat;
    const endBeat = Math.min(startBeat + chordDuration, measures * BEATS_PER_MEASURE);

    // Add each note in the chord for each beat in the duration
    for (let beat = startBeat; beat < endBeat; beat++) {
      chordIntervals.forEach(interval => {
        const noteIndex = (rootIndex + interval) % 12;
        const octaveOffset = Math.floor((rootIndex + interval) / 12);
        const noteName = NOTE_NAMES[noteIndex];
        const noteOctave = selectedOctave + octaveOffset;

        // Ensure octave is within valid range
        if (noteOctave >= 1 && noteOctave <= 6) {
          const noteId = `${noteName}${noteOctave}-${beat}`;
          newNotes[noteId] = true;
        }
      });
    }

    setNotes(newNotes);
    setShowChordSelector(false);
  };

  // Play the currently selected chord
  const playChord = () => {
    const rootIndex = NOTE_NAMES.indexOf(selectedRoot);
    if (rootIndex === -1) return;

    const chordIntervals = CHORDS[selectedChord as keyof typeof CHORDS] || [];
    const now = Tone.now();
    
    chordIntervals.forEach((interval, i) => {
      const noteIndex = (rootIndex + interval) % 12;
      const octaveOffset = Math.floor((rootIndex + interval) / 12);
      const noteName = NOTE_NAMES[noteIndex];
      const noteOctave = selectedOctave + octaveOffset;
      
      if (noteOctave >= 1 && noteOctave <= 6) {
        const note = `${noteName}${noteOctave}`;
        synth.current?.triggerAttackRelease(note, '1n', now + (i * 0.1));
      }
    });
  };

  const handleBeatHeaderClick = (beat: number) => {
    // Calculate target position (measure:beat:ticks)
    const targetMeasure = Math.floor(beat / BEATS_PER_MEASURE);
    const targetBeat = beat % BEATS_PER_MEASURE;
    const position = `${targetMeasure}:${targetBeat}:0`; // Format for Tone.js

    if (isPlaying) {
      // If currently playing, stop playback first
      Tone.Transport.cancel();
      Tone.Transport.stop();
      setIsPlaying(false);
    }

    // Update cursor position
    setCurrentBeat(beat);
    lastPlayedBeat.current = beat - 1;
    Tone.Transport.position = position;
  };

  const playPause = async () => {
    try {
      if (isPlaying) {
        // Stop playback
        Tone.Transport.cancel();
        Tone.Transport.stop();
        setIsPlaying(false);
      } else {
        // Start playback
        await Tone.start();
        
        // Calculate the current cursor position in Tone.Transport format
        const measure = Math.floor(currentBeat / BEATS_PER_MEASURE);
        const beat = currentBeat % BEATS_PER_MEASURE;
        const position = `${measure}:${beat}:0`;
        
        // Set Transport position to current cursor position
        Tone.Transport.position = position;
        // Update last played beat to be one before current, so the next beat triggers note playback
        lastPlayedBeat.current = currentBeat - 1;
        
        // Set up repeat callback
        Tone.Transport.cancel(); // Ensure any existing repeats are cancelled
        Tone.Transport.scheduleRepeat(repeat, '16n');
        
        // 開始播放
        Tone.Transport.start();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Playback error:', error);
      setIsPlaying(false);
    }
  };

  const repeat = (time: number) => {
    // Get the current beat based on the transport position
    const transportPos = Tone.Transport.position.toString();
    const beats = transportPos.split(':').map(Number);
    const currentTransportBeat = beats[0] * BEATS_PER_MEASURE + beats[1];
    const totalBeats = measures * BEATS_PER_MEASURE;
    const currentBeat = currentTransportBeat % totalBeats;

    // Update the visual position
    setCurrentBeat(currentBeat);

    // Only play notes if we've moved to a new beat
    if (currentBeat !== lastPlayedBeat.current) {
      lastPlayedBeat.current = currentBeat;

      // Play all notes for the current beat
      OCTAVES.forEach(octave => {
        NOTES.forEach(note => {
          const noteId = `${note}${octave}-${currentBeat}`;
          if (notes[noteId]) {
            const noteToPlay = `${note}${octave}`;
            synth.current?.triggerAttackRelease(noteToPlay, '8n', time);
          }
        });
      });
    }
  };

  // Clean up on unmount and when playback state changes
  useEffect(() => {
    return () => {
      if (isPlaying) {
        Tone.Transport.cancel();
        Tone.Transport.stop();
      }
    };
  }, [isPlaying]);

  // Handle mouse enter event for cells
  const handleCellMouseEnter = (note: string, octave: number, beat: number) => {
    if (isMouseDown && lastToggled) {
      // Make sure we don't toggle the same cell repeatedly
      if (lastToggled.note !== note || lastToggled.octave !== octave || lastToggled.beat !== beat) {
        // Get the state of the last toggled cell
        const lastState = notes[`${lastToggled.note}${lastToggled.octave}-${lastToggled.beat}`] || false;
        // Set the current cell state to match the last toggled cell's state
        toggleNote(note, octave, beat, !lastState);
      }
    }
  };

  return (
    <div
      className="app"
      onMouseDown={() => setIsMouseDown(true)}
      onMouseUp={() => setIsMouseDown(false)}
      onMouseLeave={() => setIsMouseDown(false)} // 防止鼠标移出后仍然保持按下状态
    >
      <h1>Music Maker</h1>
      <div className="controls">
        <button 
          onClick={playPause}
          className={`play-button ${isPlaying ? 'stop' : 'play'}`}
        >
          {isPlaying ? '⏹️ Stop' : '▶️ Play'}
        </button>
        <div className="bpm-control">
          <label htmlFor="bpm-slider">Tempo: {bpm} BPM</label>
          <input
            id="bpm-slider"
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            disabled={isPlaying}
          />
        </div>
        <div className="measures-control">
          <button 
            onClick={() => updateMeasures(measures - 1)}
            disabled={measures <= MIN_MEASURES || isPlaying}
            className="measure-btn"
            title="Decrease number of measures"
          >
            -
          </button>
          <button
            onClick={() => updateMeasures(measures + 1)}
            disabled={measures >= MAX_MEASURES || isPlaying}
            className="measure-btn"
            title="Increase number of measures"
          >
            +
          </button>
          <span className="measures-display">{measures} measures</span>
        </div>
        <button
          onClick={clearAllNotes}
          className="clear-btn"
          disabled={isPlaying}
          title="Clear all notes"
        >
          Clear
        </button>
      </div>

      {/* Add chord button */}
      <div className="chord-controls">
        <button 
          onClick={() => setShowChordSelector(!showChordSelector)}
          className="chord-button"
          title="Add chord"
        >
          Add Chord
        </button>
        
        {/* Chord selector */}
        {showChordSelector && (
          <div className="chord-selector">
            <div className="chord-selector-content">
              <h3>Add Chord</h3>
              <div className="chord-controls">
                <div className="chord-control-group">
                  <label>Root:</label>
                  <select 
                    value={selectedRoot}
                    onChange={(e) => setSelectedRoot(e.target.value)}
                  >
                    {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(note => (
                      <option key={note} value={note}>{note}</option>
                    ))}
                  </select>
                </div>
                
                <div className="chord-control-group">
                  <label>Octave:</label>
                  <select 
                    value={selectedOctave}
                    onChange={(e) => setSelectedOctave(Number(e.target.value))}
                  >
                    {OCTAVE_RANGE.map(octave => (
                      <option key={octave} value={octave}>{octave}</option>
                    ))}
                  </select>
                </div>
                
                <div className="chord-control-group">
                  <label>Chord Type:</label>
                  <select 
                    value={selectedChord}
                    onChange={(e) => setSelectedChord(e.target.value)}
                  >
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                    <option value="augmented">Augmented</option>
                    <option value="diminished">Diminished</option>
                    <option value="major7">Major 7th</option>
                    <option value="minor7">Minor 7th</option>
                    <option value="dominant7">Dominant 7th</option>
                  </select>
                </div>
                
                <div className="chord-control-group">
                  <label>Duration (beats):</label>
                  <select 
                    value={chordDuration}
                    onChange={(e) => setChordDuration(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 6, 8, 12, 16].map(duration => (
                      <option key={duration} value={duration}>
                        {duration} {duration === 1 ? 'beat' : 'beats'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="chord-buttons">
                <button 
                  onClick={playChord}
                  className="play-chord-button"
                  title="Preview chord"
                >
                  Preview
                </button>
                <button 
                  onClick={addChord}
                  className="add-chord-button"
                  title="Add to current measure"
                >
                  Add
                </button>
                <button 
                  onClick={() => setShowChordSelector(false)}
                  className="cancel-button"
                  title="Cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="piano-roll">
        <div className="piano-roll-header">
          <div className="note-label"></div>
          {Array.from({ length: measures * BEATS_PER_MEASURE }).map((_, beat) => (
            <div
              key={beat}
              className={`beat-header ${currentBeat === beat ? 'active' : ''}`}
              onClick={() => handleBeatHeaderClick(beat)}
              style={{ cursor: isPlaying ? 'pointer' : 'default' }}
              title={isPlaying ? `Click to move to measure ${Math.floor(beat / BEATS_PER_MEASURE) + 1}, beat ${(beat % BEATS_PER_MEASURE) + 1}` : ''}
            >
              {beat % BEATS_PER_MEASURE === 0 ? (beat / BEATS_PER_MEASURE) + 1 : ''}
            </div>
          ))}
        </div>

        {OCTAVES.flatMap(octave =>
          NOTES.map(note => (
            <div key={`${note}${octave}`} className="piano-roll-row">
              <div className="note-label">
                {note}{octave}
              </div>
              {Array.from({ length: measures * BEATS_PER_MEASURE }).map((_, beat) => {
                const noteId = `${note}${octave}-${beat}`;
                const isActive = notes[noteId] || false;
                return (
                  <div
                    key={beat}
                    className={`note-cell ${isActive ? 'active' : ''} ${currentBeat === beat ? 'current' : ''
                      }`}
                    onMouseDown={() => toggleNote(note, octave, beat)}
                    onMouseEnter={() => handleCellMouseEnter(note, octave, beat)}
                    onMouseUp={() => setIsMouseDown(false)}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default App;