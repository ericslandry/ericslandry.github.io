const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const speedDisplay = document.getElementById('speed');
const distanceSelect = document.getElementById('distance');

let lastX = null, lastY = null, lastTime = null;
let pixelDistance = null; // To store the pixel distance for calibration
const METERS_TO_KMH = 3.6; // m/s to km/h

// Set canvas size to match video
function resizeCanvas() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
}

// Start the camera
navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            resizeCanvas();
            startTracking();
        };
    })
    .catch(error => alert('Camera error: ' + error.message));

// Use tracking.js to track a colored object
function startTracking() {
    const tracker = new tracking.ColorTracker(['magenta', 'cyan', 'yellow', 'red']);
    tracker.setMinDimension(10); // Minimum size of tracked object in pixels

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

            // Calculate speed in km/h
            if (lastX !== null && lastY !== null && lastTime !== null) {
                const now = performance.now();
                const dt = (now - lastTime) / 1000; // Time in seconds
                const dx = x - lastX;
                const dy = y - lastY;
                const distancePx = Math.sqrt(dx * dx + dy * dy); // Pixels moved

                // Update pixelDistance for calibration on first significant movement
                if (pixelDistance === null && distancePx > 20) { // Threshold to ensure movement
                    pixelDistance = distancePx;
                }

                // Calculate speed if calibrated
                if (pixelDistance !== null) {
                    const selectedDistanceM = parseFloat(distanceSelect.value); // Meters from dropdown
                    const pixelsToMeters = selectedDistanceM / pixelDistance; // Meters per pixel
                    const distanceM = distancePx * pixelsToMeters; // Meters moved
                    const speedMS = distanceM / dt; // Meters per second
                    const speedKMH = speedMS * METERS_TO_KMH; // Kilometers per hour
                    speedDisplay.textContent = `Speed: ${speedKMH.toFixed(2)} km/h`;
                } else {
                    speedDisplay.textContent = `Speed: Move object ${distanceSelect.value}m to calibrate`;
                }
            }

            lastX = x;
            lastY = y;
            lastTime = performance.now();
        } else {
            speedDisplay.textContent = `Speed: 0 km/h`; // Reset if no object detected
        }
    });

    tracking.track('#video', tracker, { camera: true });
}

// Recalibrate when distance changes
distanceSelect.addEventListener('change', () => {
    pixelDistance = null; // Reset calibration when distance changes
});