const canvas = document.getElementById("scratchCanvas");

const ctx = canvas.getContext("2d");

function resizeCanvas(){

    canvas.width = canvas.offsetWidth;

    canvas.height = canvas.offsetHeight;

}

resizeCanvas();

window.addEventListener("resize",resizeCanvas);