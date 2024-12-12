const button = document.querySelector("button");
const pedalTypeSwitchDiv = document.getElementById('pedal-type-switch');
const modeKnobDiv = document.getElementById('mode-knob');
const rateKnobDiv = document.getElementById('rate-knob');
const depthKnobDiv = document.getElementById('depth-knob');
const pedalCover = document.getElementById('pedal-cover');

let soundNodes = []
let guitarEffectsChain = []
let context = null
let guitarSample
let guitarTimeline = 0.0

let rateKnob = new ContinuousDial(rateKnobDiv, 0, 100, -120, 120, 50, applySampleEffects)
let depthKnob = new ContinuousDial(depthKnobDiv, 0, 100, -120, 120, 50, applySampleEffects)
let modeKnob = new FixedDial(modeKnobDiv, [-78, -106, -137, -167, 164, 134, 103], 3, applySampleEffects)

// Settings
const BPM = 120
const GUITAR_VOLUME = 1.0
const GUITAR_GAIN = 400
const DAMPING_START = 0
const DAMPING_DURATION = 0.03
const GUITAR_PLAYING_ERRORS = 0.07
const DEBUG_MODE = false


async function init() {
    context = new AudioContext()

    guitarSample = await loadGuitarSample()

    let guitarGain = context.createGain()
    guitarGain.gain.value = GUITAR_VOLUME

    guitarEffectsChain = [guitarGain, context.destination]

    guitarGain.connect(context.destination)
}

async function loadSample(path) {
    return fetch(path)
        .then(response => response.arrayBuffer())
        .then(buffer => context.decodeAudioData(buffer))
}

async function loadGuitarSample() {
    return await loadSample('./sound/sample02.mp3')
}

function createGuitarSource() {
    const source = context.createBufferSource()
    source.buffer = guitarSample
    return source
}

const randomFloat = (min, max) => Math.random() * (max - min) + min;

const LFO_RANDOM = 0
const LFO_SQUARE = 1
const LFO_TRIANGLE = 2
const LFO_SINE = 3
const LFO_ENV_D = 4
const LFO_ENV_P = 5
const LFO_ENV_R = 6

const VIBRATO = 0
const CHORUS = 1
const TREMOLO = 2

let pedalType = VIBRATO;

pedalTypeSwitchDiv.onclick = () => {
    if (pedalType == VIBRATO) {
        pedalType = CHORUS
        pedalCover.src = 'img/chorus_pedal.jpg'
    } else if (pedalType == CHORUS) {
        pedalType = TREMOLO
        pedalCover.src = 'img/tremolo_pedal.jpg'
    } else if (pedalType == TREMOLO) {
        pedalType = VIBRATO
        pedalCover.src = 'img/vibrato_pedal.jpg'
    }

    applySampleEffects()
}

function lfo(sampleNumber, sampleRate, lfoType, frequency, depth) {
    const time = sampleNumber / sampleRate

    const x = 2 * Math.PI * frequency * time

    if (lfoType == LFO_SINE) {
	    return depth * Math.sin(x)

    } else if (lfoType == LFO_TRIANGLE) {
        const magic = x/(2*Math.PI)
        const triangle = 2 * Math.abs( 2*(magic - Math.floor(0.5 + magic)) ) - 1
        return depth * triangle

    } else if (lfoType == LFO_SQUARE) {
        return depth * Math.sign( depth * Math.sin(x) )

    } else {
        return depth * Math.sin(x)
    }
}

function remap(x, inMin, inMax, outMin, outMax) {
    return (x - inMin) * (outMax - outMin) / (inMax - inMin) + outMin
}

function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max)
}

let prevTime = 0

function playSample() {
    {
        const sample = createGuitarSource()
        sample.onended = () => {
            for (let i = 0; i < soundNodes.length; ++i) {
                soundNodes[i].stop(0)
            }
            soundNodes = []
        }
        sample.connect(guitarEffectsChain[0])
        sample.start()
        soundNodes.push(sample)
    }

    if (pedalType == CHORUS) {
        const sample = createGuitarSource()
        sample.connect(guitarEffectsChain[0])
        sample.start()
        soundNodes.push(sample)
    }

    prevTime = context.currentTime

    applySampleEffects()
}

const COOLDOWN = 0.1 // s
let cooldown = 0

function applySampleEffects() {
    if (context == null) {
        return
    }

    const dt = context.currentTime - prevTime
    prevTime = context.currentTime
    cooldown -= dt
    cooldown = clamp(cooldown, 0, COOLDOWN)

    if (cooldown > 0) {
        return
    }

    if (soundNodes.length == 0) {
        return
    }

    let sampleNode = soundNodes[0]

    sampleNode.detune.cancelScheduledValues(context.currentTime)

    const seconds = guitarSample.duration
    const startTime = context.currentTime

    const lfoSampleRate = 256
    const lfoTime = lfoSampleRate * seconds

    const lfoType = modeKnob.mode
    const lfoRate = remap(rateKnob.value, 0, 100, 0, 10)
    const lfoDepth = pedalType == TREMOLO
        ? remap(depthKnob.value, 0, 100, 0, 1)
        : remap(depthKnob.value, 0, 100, 0, 60)

    for (var sampleNumber = 0; sampleNumber < lfoTime; sampleNumber++) {
        const value = lfo(sampleNumber, lfoSampleRate, lfoType, lfoRate, lfoDepth)
        const time = startTime + sampleNumber/lfoSampleRate

        //console.log(value, time)

        if (pedalType == VIBRATO || pedalType == CHORUS) {
            sampleNode.detune.setValueAtTime(value, time)
        } else if (pedalType == TREMOLO) {
            guitarEffectsChain[0].gain.setValueAtTime(value + lfoDepth/2, time)
        }
    }

    guitarTimeline += seconds

    cooldown = COOLDOWN
}

button.onclick = async () => {
    if (!context) {
        await init();
    }

    for (let i = 0; i < soundNodes.length; ++i) {
        soundNodes[i].stop(0)
    }
    soundNodes = []

    guitarTimeline = 0
    cooldown = 0
    playSample()
};
