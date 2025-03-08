const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const speedDisplay = document.getElementById('speed');
const distanceSelect = document.getElementById('distance');
const debugDisplay = document.getElementById('debug');

let lastX = null, lastY = null, lastTime = null;
let pixelDistance = null;
const METERS_TO_KMH = 3.6;

function updateDebug(text) {
    debugDisplay.textContent = text + '\n' + debugDisplay.textContent;
    if (debugDisplay.textContent.split('\n').length > 10) {
        debugDisplay.textContent = debugDisplay.textContent.split('\n').slice(0, 10).join('\n');
    }
}

function resizeCanvas() {
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    updateDebug(`Canvas set to ${canvas.width}x${canvas.height}`);
}

navigator.mediaDevices.getUserMedia({ 
    video: { 
        facingMode: 'environment',
        width: { ideal: 480 },
        height: { ideal: 640 }
    } 
})
    .then(stream => {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            resizeCanvas();
            startTracking();
        };
    })
    .catch(error => {
        updateDebug(`Camera error: ${error.message}`);
        alert('Camera error: ' + error.message);
    });

function startTracking() {
    const tracker = new tracking.ColorTracker(['red']); // Focus on red for your object
    tracker.setMinDimension(2); // Very sensitive
    tracker.setMinGroupSize(2); // Detect small areas
    tracker.setStepSize(1);    // Fine-grained search

    tracker.on('track', event => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (event.data.length > 0) {
            const rect = event.data[0];
            const x = rect.x + rect.width / 2;
            const y = rect.y + rect.height / 2;

            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

            let debugText = `Tracked at x:${x.toFixed(2)}, y:${y.toFixed(2)}, size:${rect.width}x${rect.height}`;

            if (lastX !== null && lastY !== null && lastTime !== null) {
                const now = performance.now();
                const dt = (now - lastTime) / 1000;
                const dx = x - lastX;
                const dy = y - lastY;
                const distancePx = Math.sqrt(dx * dx + dy * dy);

                debugText += `\nDistance: ${distancePx.toFixed(2)} px, Time: ${dt.toFixed(4)} s`;

                if (pixelDistance === null && distancePx > 5) { // Lower threshold for Pixel 7
                    pixelDistance = distancePx;
                    debugText += `\nCalibrated: ${pixelDistance.toFixed(2)} px = ${distanceSelect.value} m`;
                }

                if (pixelDistance !== null) {
                    const selectedDistanceM = parseFloat(distanceSelect.value);
                    const pixelsToMeters = selectedDistanceM / pixelDistance;
                    const distanceM = distancePx * pixelsToMeters;
                    const speedMS = distanceM / dt;
                    const speedKMH = speedMS * METERS_TO_KMH;
                    speedDisplay.textContent = `Speed: ${speedKMH.toFixed(2)} km/h`;
                    debugText += `\nSpeed: ${speedKMH.toFixed(2)} km/h`;
                } else {
                    speedDisplay.textContent = `Speed: Calibrating...`;
                }
            } else {
                debugText += `\nInitializing position`;
            }

            updateDebug(debugText);

            lastX = x;
            lastY = y;
            lastTime = now;
        } else {
            speedDisplay.textContent = `Speed: 0 km/h`;
            updateDebug(`No object detected`);
        }
    });

    tracking.track('#video', tracker, { camera: true });
    updateDebug(`Tracking started`);
}

distanceSelect.addEventListener('change', () => {
    pixelDistance = null;
    updateDebug(`Distance changed to ${distanceSelect.value} m, recalibration needed`);
});

window.addEventListener('resize', resizeCanvas);