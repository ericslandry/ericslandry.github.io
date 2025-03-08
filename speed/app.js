const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const speedDisplay = document.getElementById('speed');
const distanceSelect = document.getElementById('distance');
const debugBtn = document.getElementById('debugBtn');
const settingsBtn = document.getElementById('settingsBtn');
const debugPopup = document.getElementById('debugPopup');
const debugLogs = document.getElementById('debugLogs');
const settingsPopup = document.getElementById('settingsPopup');

let lastX = null, lastY = null, lastTime = null;
let pixelDistance = null;
const METERS_TO_KMH = 3.6;
let debugLogArray = [];

// Log debug info to array
function logDebug(text) {
    debugLogArray.push(text);
    if (debugLogArray.length > 10) debugLogArray.shift(); // Keep last 10 logs
    debugLogs.textContent = debugLogArray.join('\n');
}

// Set canvas size explicitly to 480x640
function resizeCanvas() {
    canvas.width = 480;
    canvas.height = 640;
    logDebug(`Canvas set to ${canvas.width}x${canvas.height}`);
}

// Start the camera with constrained resolution
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
        logDebug(`Camera error - ${error.message}`);
        alert('Camera error: ' + error.message);
    });

// Use tracking.js to track a colored object
function startTracking() {
    const tracker = new tracking.ColorTracker(['magenta', 'cyan', 'yellow', 'red', 'green']);
    tracker.setMinDimension(3);
    tracker.setMinGroupSize(5);
    tracker.setStepSize(1);

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

                if (pixelDistance === null && distancePx > 15) {
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
                    speedDisplay.textContent = `Speed: Move ${distanceSelect.value}m to calibrate`;
                }
            } else {
                debugText += `\nFirst frame, initializing position`;
            }

            logDebug(debugText);

            lastX = x;
            lastY = y;
            lastTime = now;
        } else {
            speedDisplay.textContent = `Speed: 0 km/h`;
            logDebug(`No object detected`);
        }
    });

    tracking.track('#video', tracker, { camera: true });
    logDebug(`Tracking started`);
}

// Button event listeners
debugBtn.addEventListener('click', () => {
    debugPopup.classList.remove('hidden');
});

settingsBtn.addEventListener('click', () => {
    settingsPopup.classList.remove('hidden');
});

distanceSelect.addEventListener('change', () => {
    pixelDistance = null;
    logDebug(`Distance changed to ${distanceSelect.value} m, recalibration needed`);
});