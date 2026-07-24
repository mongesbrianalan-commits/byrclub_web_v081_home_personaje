(() => {

const AudioContextClass =
    window.AudioContext ||
    window.webkitAudioContext;

const audioContext =
    AudioContextClass
        ? new AudioContextClass()
        : null;

function beep({
    frequency = 440,
    duration = 0.08,
    type = "triangle",
    volume = 0.05
}){

    if(!audioContext) return;

    if(audioContext.state==="suspended"){
        audioContext.resume();
    }

    const osc = audioContext.createOscillator();

    const gain = audioContext.createGain();

    osc.type = type;

    osc.frequency.value = frequency;

    gain.gain.value = volume;

    osc.connect(gain);

    gain.connect(audioContext.destination);

    osc.start();

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime+duration
    );

    osc.stop(audioContext.currentTime+duration);

}

function scratch(){

    beep({
        frequency:170,
        duration:.03,
        type:"square",
        volume:.012
    });

}

function reveal(){

    beep({
        frequency:620,
        duration:.10,
        type:"triangle",
        volume:.05
    });

    setTimeout(()=>{

        beep({
            frequency:910,
            duration:.14,
            type:"triangle",
            volume:.04
        });

    },70);

}

function claim(){

    beep({
        frequency:500,
        duration:.08,
        type:"triangle",
        volume:.05
    });

    setTimeout(()=>{

        beep({
            frequency:820,
            duration:.12,
            type:"triangle",
            volume:.04
        });

    },80);

}

window.BYRAudio = {

    scratch,
    reveal,
    claim

};

})();