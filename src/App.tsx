import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import './App.css';

const NOTES = ['B', 'A#', 'A', 'G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];
const OCTAVES = [4, 3, 2, 1];
const MIN_MEASURES = 1;
const MAX_MEASURES = 16;
const BEATS_PER_MEASURE = 4;
const DEFAULT_BPM = 120;

const CHORDS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  'major7': [0, 4, 7, 11],
  'minor7': [0, 3, 7, 10],
  'dominant7': [0, 4, 7, 10]
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVE_RANGE = [1, 2, 3, 4, 5, 6];

const DRUM_MAPPING = [
  { label: 'Open Hat', note: 'F#', octave: 3 },
  { label: 'Closed Hat', note: 'F', octave: 3 },
  { label: 'Snare', note: 'D', octave: 3 },
  { label: 'High Tom', note: 'C', octave: 3 },
  { label: 'Low Tom', note: 'A', octave: 2 },
  { label: 'Kick', note: 'C', octave: 2 },
];

const INSTRUMENT_SETTINGS = {
  piano: {
    name: 'Piano',
    type: 'synth',
    synth: Tone.Synth,
    options: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 1 },
      volume: -5
    }
  },
  guitar: {
    name: 'Acoustic Guitar',
    type: 'sampler',
    options: {
      // 關鍵修正：請確保你的 public/guitar/ 資料夾內有這些檔案
      // 建議先只保留你確定存在的檔案，Tone.js 會自動計算音高
      urls: {
        "E2": "E2.wav",
        "A2": "A2.wav",
        "A5": "A5.wav",
        "C4": "C4.wav",
        
        "A4": "A4.wav",
        
      },
      baseUrl: "/guitar/",
      volume: -5,
      release: 1
    }
  },
  violin: {
    name: 'Violin',
    type: 'synth',
    synth: Tone.FMSynth,
    options: {
      harmonicity: 3.01,
      modulationIndex: 14,
      oscillator: { type: "triangle" },
      envelope: { attack: 0.2, decay: 0.3, sustain: 0.5, release: 0.8 },
      modulation: { type: "square" },
      modulationEnvelope: { attack: 0.2, decay: 0.01, sustain: 1, release: 0.5 },
      volume: -10
    }
  },
  drum: {
    name: 'Real Drums',
    type: 'sampler',
    options: {
      urls: {
        "C2": "kick.wav",
        "A2": "tomLow.wav",
        "C3": "tomHigh.wav",
        "D3": "snare.wav",
        "F3": "hihatClosed.wav",
        "F#3": "hihatOpen.wav",
      },
      baseUrl: "/drums/",
      volume: -2,
    }
  }
};

type InstrumentType = keyof typeof INSTRUMENT_SETTINGS;
type TrackData = { [key: string]: boolean };
type AllTracks = { [key in InstrumentType]: TrackData };
type PlaybackType = 'all' | 'current' | null;

const App: React.FC = () => {
  const [showChordSelector, setShowChordSelector] = useState(false);
  const [selectedChord, setSelectedChord] = useState('major');
  const [selectedRoot, setSelectedRoot] = useState('C');
  const [selectedOctave, setSelectedOctave] = useState(4);
  const [chordDuration, setChordDuration] = useState(1);

  const [tracks, setTracks] = useState<AllTracks>(() => {
    const initialTracks: any = {};
    Object.keys(INSTRUMENT_SETTINGS).forEach(key => {
      initialTracks[key] = {};
    });
    return initialTracks;
  });

  const [playbackType, setPlaybackType] = useState<PlaybackType>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const [measures, setMeasures] = useState(4);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [lastToggled, setLastToggled] = useState<{ note: string, octave: number, step: number } | null>(null);
  const [beatDivisions, setBeatDivisions] = useState<{ [key: number]: number }>({});
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentType>('piano');

  // 新增：追蹤 Sampler 是否載入完成
  const [isSamplesLoaded, setIsSamplesLoaded] = useState(false);

  const synths = useRef<{ [key: string]: Tone.PolySynth | Tone.Sampler } | null>(null);
  const playbackTypeRef = useRef<PlaybackType>(null);
  const selectedInstrumentRef = useRef<InstrumentType>('piano');
  const lastPlayedStep = useRef<number>(-1);

  useEffect(() => {
    selectedInstrumentRef.current = selectedInstrument;
  }, [selectedInstrument]);

  useEffect(() => {
    const newSynths: { [key: string]: Tone.PolySynth | Tone.Sampler } = {};

    Object.entries(INSTRUMENT_SETTINGS).forEach(([key, setting]) => {
      if (setting.type === 'sampler') {
        newSynths[key] = new Tone.Sampler({
          urls: setting.options.urls,
          baseUrl: setting.options.baseUrl,
          volume: setting.options.volume,
          release: setting.options.release || 1,
          onload: () => {
            console.log(`${key} loaded successfully`);
            setIsSamplesLoaded(true);
          },
          onerror: (err) => {
            console.error(`Failed to load samples for ${key}:`, err);
          }
        }).toDestination();
      } else if (setting.type === 'synth') {
        const synth = new Tone.PolySynth(setting.synth, setting.options as any).toDestination();
        synth.volume.value = setting.options.volume;
        newSynths[key] = synth;
      }
    });

    synths.current = newSynths;
    Tone.Transport.bpm.value = bpm;

    return () => {
      if (synths.current) {
        Object.values(synths.current).forEach(s => s.dispose());
      }
    };
  }, []);

  const addChord = () => {
    if (selectedInstrument === 'drum') return;

    const rootIndex = NOTE_NAMES.indexOf(selectedRoot);
    if (rootIndex === -1) return;

    const chordIntervals = CHORDS[selectedChord as keyof typeof CHORDS] || [];
    const newNotes = { ...tracks[selectedInstrument] };
    const startBeat = currentStep;
    const endStep = Math.min(startBeat + (chordDuration * 4), measures * 16);

    for (let step = startBeat; step < endStep; step++) {
      chordIntervals.forEach(interval => {
        const noteIndex = (rootIndex + interval) % 12;
        const octaveOffset = Math.floor((rootIndex + interval) / 12);
        const noteName = NOTE_NAMES[noteIndex];
        const noteOctave = selectedOctave + octaveOffset;

        if (noteOctave >= 1 && noteOctave <= 6) {
          const noteId = `${noteName}${noteOctave}-${step}`;
          newNotes[noteId] = true;
        }
      });
    }

    setTracks(prev => ({ ...prev, [selectedInstrument]: newNotes }));
    setShowChordSelector(false);
  };

  const playChordPreview = () => {
    if (selectedInstrument === 'drum') return;
    const rootIndex = NOTE_NAMES.indexOf(selectedRoot);
    if (rootIndex === -1) return;
    const chordIntervals = CHORDS[selectedChord as keyof typeof CHORDS] || [];
    const now = Tone.now();

    // 安全檢查：確保 Sampler 載入才播放
    const synth = synths.current?.[selectedInstrument];
    if (INSTRUMENT_SETTINGS[selectedInstrument].type === 'sampler' && !isSamplesLoaded) {
      console.warn("Samples not loaded yet");
      return;
    }

    chordIntervals.forEach((interval, i) => {
      const noteIndex = (rootIndex + interval) % 12;
      const octaveOffset = Math.floor((rootIndex + interval) / 12);
      const noteName = NOTE_NAMES[noteIndex];
      const noteOctave = selectedOctave + octaveOffset;
      if (noteOctave >= 1 && noteOctave <= 6) {
        const note = `${noteName}${noteOctave}`;
        if (synth) {
          try {
            synth.triggerAttackRelease(note, '8n', now + (i * 0.05));
          } catch (e) {
            console.warn(`Cannot play note ${note}:`, e);
          }
        }
      }
    });
  };

  const updateMeasures = (newMeasures: number) => {
    const clampedMeasures = Math.min(Math.max(newMeasures, MIN_MEASURES), MAX_MEASURES);
    setMeasures(clampedMeasures);
    if (currentStep >= clampedMeasures * 16) {
      setCurrentStep(0);
      if (playbackType !== null) Tone.Transport.position = '0:0:0';
    }
  };

  useEffect(() => {
    Tone.Transport.bpm.value = bpm;
  }, [bpm]);

  const toggleSplitAtPlayhead = () => {
    const currentBeatIndex = Math.floor(currentStep / 4);
    setBeatDivisions(prev => {
      const currentDiv = prev[currentBeatIndex] || 1;
      const nextDiv = currentDiv === 1 ? 2 : currentDiv === 2 ? 4 : 1;
      return { ...prev, [currentBeatIndex]: nextDiv };
    });
  };

  const toggleNote = (note: string, octave: number, noteStep: number, forceState?: boolean) => {
    const noteId = `${note}${octave}-${noteStep}`;
    const newState = forceState !== undefined ? forceState : !tracks[selectedInstrument][noteId];
    setTracks(prev => ({
      ...prev,
      [selectedInstrument]: { ...prev[selectedInstrument], [noteId]: newState }
    }));
    setLastToggled({ note, octave, step: noteStep });

    if (newState && synths.current) {
      const synth = synths.current[selectedInstrument];
      // 關鍵修正：對於 Sampler，如果 buffer 沒載入，不要觸發
      if (INSTRUMENT_SETTINGS[selectedInstrument].type === 'sampler' && !isSamplesLoaded) {
        return;
      }
      try {
        synth.triggerAttackRelease(`${note}${octave}`, '16n');
      } catch (e) {
        // 捕獲 "buffer not set" 錯誤，防止整個 App 崩潰
        console.warn(`Sample for ${note}${octave} missing or not loaded.`);
      }
    }
  };

  const stopPlayback = () => {
    Tone.Transport.cancel();
    Tone.Transport.stop();
    setPlaybackType(null);
    playbackTypeRef.current = null;
  };

  const startPlayback = async (type: 'all' | 'current') => {
    if (playbackType === type) { stopPlayback(); return; }
    await Tone.start();
    setPlaybackType(type);
    playbackTypeRef.current = type;
    const m = Math.floor(currentStep / 16);
    const b = Math.floor((currentStep % 16) / 4);
    const s = currentStep % 4;
    Tone.Transport.position = `${m}:${b}:${s}`;
    lastPlayedStep.current = currentStep - 1;
    Tone.Transport.cancel();
    Tone.Transport.scheduleRepeat(repeat, '16n');
    Tone.Transport.start();
  };

  const repeat = (time: number) => {
    const transportPos = Tone.Transport.position.toString();
    const beats = transportPos.split(':').map(Number);
    const stepPos = (beats[0] * 16) + (beats[1] * 4) + Math.round(beats[2]);
    const totalSteps = measures * 16;
    const currentStepPos = stepPos % totalSteps;

    setCurrentStep(currentStepPos);

    if (currentStepPos !== lastPlayedStep.current) {
      lastPlayedStep.current = currentStepPos;
      const currentMode = playbackTypeRef.current;

      const instrumentKeys = currentMode === 'all'
        ? (Object.keys(INSTRUMENT_SETTINGS) as InstrumentType[])
        : [selectedInstrumentRef.current];

      instrumentKeys.forEach((inst) => {
        const track = tracks[inst];
        const synth = synths.current?.[inst];
        const settings = INSTRUMENT_SETTINGS[inst];

        if (synth && track) {
          // 如果是 Sampler 但還沒載入完，跳過播放
          if (settings.type === 'sampler' && !isSamplesLoaded) return;

          Object.keys(track).forEach(key => {
            const [noteWithOctave, stepStr] = key.split('-');
            const step = parseInt(stepStr);

            if (step === currentStepPos && track[key]) {
              try {
                if (inst === 'drum') {
                  synth.triggerAttackRelease(noteWithOctave, '16n', time);
                } else {
                  const prevKey = `${noteWithOctave}-${currentStepPos - 1}`;
                  const isContinuation = currentStepPos > 0 && track[prevKey];

                  if (!isContinuation) {
                    let durationSteps = 1;
                    let nextStep = currentStepPos + 1;
                    while (track[`${noteWithOctave}-${nextStep}`]) {
                      durationSteps++;
                      nextStep++;
                    }
                    const durationTime = Tone.Time('16n').toSeconds() * durationSteps;
                    synth.triggerAttackRelease(noteWithOctave, durationTime, time);
                  }
                }
              } catch (e) {
                console.warn(`Failed to play ${noteWithOctave}:`, e);
              }
            }
          });
        }
      });
    }
  };

  const isCurrentTimeInRange = (stepStart: number, stepSpan: number) => {
    return currentStep >= stepStart && currentStep < (stepStart + stepSpan);
  };

  const renderGridRow = (rowType: 'header' | 'note', note?: string, octave?: number) => {
    const totalBeats = measures * BEATS_PER_MEASURE;
    const beatElements = [];
    for (let b = 0; b < totalBeats; b++) {
      const division = beatDivisions[b] || 1;
      const stepSize = 4 / division;
      const cells = [];
      for (let i = 0; i < division; i++) {
        const absoluteStep = (b * 4) + (i * stepSize);
        const isCurrent = isCurrentTimeInRange(absoluteStep, stepSize);
        if (rowType === 'header') {
          cells.push(
            <div key={absoluteStep} className={`beat-header-cell ${isCurrent ? 'active' : ''}`}
              onClick={() => {
                Tone.Transport.position = `${Math.floor(absoluteStep / 16)}:${Math.floor((absoluteStep % 16) / 4)}:${absoluteStep % 4}`;
                setCurrentStep(absoluteStep);
              }}>
              {i === 0 ? b + 1 : ''}
            </div>
          );
        } else {
          const active = tracks[selectedInstrument][`${note}${octave}-${absoluteStep}`];
          cells.push(
            <div key={absoluteStep} className={`note-cell ${active ? 'active' : ''} ${isCurrent ? 'current' : ''}`}
              onMouseDown={() => toggleNote(note!, octave!, absoluteStep)}
              onMouseEnter={() => isMouseDown && lastToggled && toggleNote(note!, octave!, absoluteStep, !tracks[selectedInstrument][`${lastToggled.note}${lastToggled.octave}-${lastToggled.step}`])} />
          );
        }
      }
      beatElements.push(<div key={b} className="beat-container">{cells}</div>);
    }
    return beatElements;
  };

  return (
    <div className="app" onMouseUp={() => setIsMouseDown(false)} onMouseDown={() => setIsMouseDown(true)}>
      <h1>Music Maker Pro</h1>
      <div className="controls">
        <div className="playback-group">
          <button onClick={() => startPlayback('current')} className={playbackType === 'current' ? 'active-stop' : ''}>
            {playbackType === 'current' ? '⏹ Stop' : '▶ Play Track'}
          </button>
          <button onClick={() => startPlayback('all')} className={playbackType === 'all' ? 'active-stop' : ''}>
            {playbackType === 'all' ? '⏹ Stop All' : '▶ Play All'}
          </button>
        </div>

        <div className="instrument-control">
          <label>Instrument: </label>
          <select
            value={selectedInstrument}
            onChange={(e) => setSelectedInstrument(e.target.value as InstrumentType)}
            className="instrument-select"
          >
            {Object.entries(INSTRUMENT_SETTINGS).map(([k, s]) => <option key={k} value={k}>{s.name}</option>)}
          </select>
          {/* 載入提示 */}
          {INSTRUMENT_SETTINGS[selectedInstrument].type === 'sampler' && !isSamplesLoaded && (
            <span style={{ marginLeft: '10px', color: '#f39c12' }}>Loading samples...</span>
          )}
        </div>

        <div className="bpm-control">
          <label>BPM: {bpm}</label>
          <input type="range" min={40} max={200} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
        </div>
        <div className="measures-control">
          <button onClick={toggleSplitAtPlayhead} className="split-btn">Split @ Playhead</button>
          <button onClick={() => updateMeasures(measures - 1)} className="measure-btn">-</button>
          <span>{measures} Bars</span>
          <button onClick={() => updateMeasures(measures + 1)} className="measure-btn">+</button>
          <button onClick={() => setTracks(p => ({ ...p, [selectedInstrument]: {} }))} className="clear-btn">Clear</button>
        </div>
      </div>

      {selectedInstrument !== 'drum' && (
        <div className="chord-controls">
          <button onClick={() => setShowChordSelector(!showChordSelector)} className="chord-button">Add Chord</button>
          {showChordSelector && (
            <div className="chord-selector">
              <div className="chord-control-group">
                <label>Root:</label>
                <select value={selectedRoot} onChange={(e) => setSelectedRoot(e.target.value)}>
                  {NOTE_NAMES.map(note => <option key={note} value={note}>{note}</option>)}
                </select>
              </div>
              <div className="chord-control-group">
                <label>Octave:</label>
                <select value={selectedOctave} onChange={(e) => setSelectedOctave(Number(e.target.value))}>
                  {OCTAVE_RANGE.map(octave => <option key={octave} value={octave}>{octave}</option>)}
                </select>
              </div>
              <div className="chord-control-group">
                <label>Type:</label>
                <select value={selectedChord} onChange={(e) => setSelectedChord(e.target.value)}>
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                  <option value="major7">Major 7th</option>
                  <option value="minor7">Minor 7th</option>
                  <option value="dominant7">Dominant 7th</option>
                </select>
              </div>
              <div className="chord-control-group">
                <label>Len:</label>
                <select value={chordDuration} onChange={(e) => setChordDuration(Number(e.target.value))}>
                  {[1, 2, 3, 4, 8].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="chord-buttons">
                <button onClick={playChordPreview}>Preview</button>
                <button onClick={addChord}>Add</button>
                <button onClick={() => setShowChordSelector(false)}>Close</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="piano-roll">
        <div className="piano-roll-header">
          <div className="note-label">Beat</div>
          <div className="grid-container">{renderGridRow('header')}</div>
        </div>

        {selectedInstrument === 'drum' ? (
          DRUM_MAPPING.map(drum => (
            <div key={`${drum.note}${drum.octave}`} className="piano-roll-row">
              <div className="note-label drum-label">{drum.label}</div>
              <div className="grid-container">{renderGridRow('note', drum.note, drum.octave)}</div>
            </div>
          ))
        ) : (
          OCTAVES.flatMap(octave => NOTES.map(note => (
            <div key={`${note}${octave}`} className="piano-roll-row">
              <div className="note-label">{note}{octave}</div>
              <div className="grid-container">{renderGridRow('note', note, octave)}</div>
            </div>
          )))
        )}
      </div>
    </div>
  );
};

export default App;