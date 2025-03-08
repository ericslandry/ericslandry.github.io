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

function logDebug(text) {
    debugLogArray.push(new Date().toLocaleTimeString() + ': ' + text);
    if (debugLogArray.length > 10) debugLogArray.shift();
    if (debugPopup.classList.contains('active')) {
        debugLogs.textContent = debugLogArray.join('\n');
    }
}

function resizeCanvas() {
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    logDebug(`Canvas set to ${canvas.width}x${canvas.height}`);
}

function closePopup(id) {
    document.getElementById(id).classList.remove('active');
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
        logDebug(`Camera error - ${error.message}`);
        alert('Camera error: ' + error.message);
    });

function startTracking() {
    const tracker = new tracking.ColorTracker(['red', 'green', 'blue', 'yellow', 'magenta', 'cyan']);
    tracker.setMinDimension(2);
    tracker.setMinGroupSize(3);
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

                if (pixelDistance === null && distancePx > 10) {
                    pixelDistance = distancePx;
                    debugText += `\nCalibrated: ${pixelDistance.toFixed(2)} px = ${distanceSelect.value} m`;
                }

                if (pixelDistance !== null) {
                    const selectedDistanceM = parseFloat(distanceSelect.value);
                    const pixelsToMeters = selectedDistanceM / pixelDistance;
                    const distanceM = distancePx * pixelsToMeters;
                    const speedMS = distanceM / dt;
                    const speedKMH = speedMS * METERS_TO_KMH;
                    speedDisplay.textContent = speedKMH.toFixed(2);
                    debugText += `\nSpeed: ${speedKMH.toFixed(2)} km/h`;
                } else {
                    speedDisplay.textContent = '0';
                    logDebug(`Waiting for calibration: Move ${distanceSelect.value}m`);
                }
            } else {
                debugText += `\nFirst frame, initializing position`;
            }

            logDebug(debugText);

            lastX = x;
            lastY = y;
            lastTime = now;
        } else {
            speedDisplay.textContent = '0';
            logDebug(`No object detected`);
        }
    });

    tracking.track('#video', tracker, { camera: true });
    logDebug(`Tracking started`);
}

debugBtn.addEventListener('click', () => {
    debugPopup.classList.add('active');
    debugLogs.textContent = debugLogArray.join('\n');
});

settingsBtn.addEventListener('click', () => {
    settingsPopup.classList.add('active');
});

distanceSelect.addEventListener('change', () => {
    pixelDistance = null;
    logDebug(`Distance changed to ${distanceSelect.value} m, recalibration needed`);
});

window.addEventListener('resize', resizeCanvas);