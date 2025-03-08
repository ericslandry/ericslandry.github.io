const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const speedDisplay = document.getElementById('speed');
const distanceSelect = document.getElementById('distance');
const debugDisplay = document.getElementById('debug');

let lastX = null, lastY = null, lastTime = null;
let pixelDistance = null; // To store the pixel distance for calibration
const METERS_TO_KMH = 3.6; // m/s to km/h

// Set canvas size explicitly to 480x640
function resizeCanvas() {
    canvas.width = 480;
    canvas.height = 640;
    debugDisplay.textContent = `Debug Info: Canvas set to ${canvas.width}x${canvas.height}`;
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
        debugDisplay.textContent = `Debug Info: Camera error - ${error.message}`;
        alert('Camera error: ' + error.message);
    });

// Use tracking.js to track a colored object
function startTracking() {
    const tracker = new tracking.ColorTracker(['magenta', 'cyan', 'yellow', 'red']);
    tracker.setMinDimension(5); // Lowered to detect smaller objects
    tracker.setMinGroupSize(10); // Minimum pixel group size for detection

    tracker.on('track', event => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (event.data.length > 0) {
            const rect = event.data[0]; // Track the first detected object
            const x = rect.x + rect.width / 2; // Center of the object
            const y = rect.y + rect.height / 2;

            // Draw a rectangle around the tracked object
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

            let debugText = `Debug Info: Tracked at x:${x.toFixed(2)}, y:${y.toFixed(2)}, size:${rect.width}x${rect.height}`;

            // Calculate speed in km/h
            if (lastX !== null && lastY !== null && lastTime !== null) {
                const now = performance.now();
                const dt = (now - lastTime) / 1000; // Time in seconds
                const dx = x - lastX;
                const dy = y - lastY;
                const distancePx = Math.sqrt(dx * dx + dy * dy); // Pixels moved

                debugText += `\nDistance: ${distancePx.toFixed(2)} px, Time: ${dt.toFixed(4)} s`;

                // Calibrate on first significant movement
                if (pixelDistance === null && distancePx > 20) {
                    pixelDistance = distancePx;
                    debugText += `\nCalibrated: ${pixelDistance.toFixed(2)} px = ${distanceSelect.value} m`;
                }

                // Calculate speed if calibrated
                if (pixelDistance !== null) {
                    const selectedDistanceM = parseFloat(distanceSelect.value); // Meters from dropdown
                    const pixelsToMeters = selectedDistanceM / pixelDistance; // Meters per pixel
                    const distanceM = distancePx * pixelsToMeters; // Meters moved
                    const speedMS = distanceM / dt; // Meters per second
                    const speedKMH = speedMS * METERS_TO_KMH; // Kilometers per hour
                    speedDisplay.textContent = `Speed: ${speedKMH.toFixed(2)} km/h`;
                    debugText += `\nSpeed: ${speedKMH.toFixed(2)} km/h`;
                } else {
                    speedDisplay.textContent = `Speed: Move object ${distanceSelect.value}m to calibrate`;
                }
            } else {
                debugText += `\nFirst frame, initializing position`;
            }

            debugDisplay.textContent = debugText;

            lastX = x;
            lastY = y;
            lastTime = now;
        } else {
            speedDisplay.textContent = `Speed: 0 km/h`;
            debugDisplay.textContent = `Debug Info: No object detected`;
        }
    });

    tracking.track('#video', tracker, { camera: true });
    debugDisplay.textContent = `Debug Info: Tracking started`;
}

// Recalibrate when distance changes
distanceSelect.addEventListener('change', () => {
    pixelDistance = null; // Reset calibration
    debugDisplay.textContent = `Debug Info: Distance changed to ${distanceSelect.value} m, recalibration needed`;
});