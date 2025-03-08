// Constants
const VIDEO_WIDTH = 480;
const VIDEO_HEIGHT = 640;
const FPS = 60;

// DOM Elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const speedDisplay = document.querySelector('.speed');
const debugDisplay = document.getElementById('debug');
const calibrationSelect = document.getElementById('calibration-distance');

// State
let pixelToMeterRatio = null;
let lastPosition = null;
let lastTime = null;
let debugLines = [];

// Initialize video stream
async function initVideo() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: VIDEO_WIDTH },
                height: { ideal: VIDEO_HEIGHT }
            }
        });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            adjustCanvasSize();
            startTracking();
        };
    } catch (err) {
        logDebug(`Error accessing camera: ${err}`);
    }
}

// Adjust canvas size on resize
function adjustCanvasSize() {
    const aspectRatio = video.videoWidth / video.videoHeight;
    const container = document.querySelector('.video-container');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    if (containerWidth / containerHeight > aspectRatio) {
        canvas.style.width = `${containerHeight * aspectRatio}px`;
        canvas.style.height = `${containerHeight}px`;
    } else {
        canvas.style.width = `${containerWidth}px`;
        canvas.style.height = `${containerWidth / aspectRatio}px`;
    }
}

window.addEventListener('resize', adjustCanvasSize);

// Tracking setup
function startTracking() {
    const tracker = new tracking.ObjectTracker(['face', 'eye', 'mouth']);
    tracker.setInitialScale(1);
    tracker.setStepSize(1.7);
    tracker.setEdgesDensity(0.1);
    tracker.setMinDimension(20); // Adjust for human at 5m

    tracking.track('#video', tracker, { camera: true });

    tracker.on('track', (event) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (event.data.length > 0) {
            const rect = event.data[0]; // Track the first detected object
            drawTrackingRect(rect);
            calculateSpeed(rect);
            logDebug(`Tracked at x:${rect.x}, y:${rect.y}, size:${rect.width}x${rect.height}`);
        } else {
            logDebug('No human detected');
            speedDisplay.textContent = 'Speed: 0 km/h';
            lastPosition = null; // Reset tracking
        }
    });

    // Fallback motion detection
    if (!event.data.length) {
        motionDetectionFallback();
    }
}

// Draw red rectangle around tracked object
function drawTrackingRect(rect) {
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

// Speed calculation
function calculateSpeed(rect) {
    const currentTime = performance.now();
    const currentPosition = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };

    if (!pixelToMeterRatio) {
        calibrate(currentPosition, currentTime);
        return;
    }

    if (lastPosition && lastTime) {
        const dx = currentPosition.x - lastPosition.x;
        const dy = currentPosition.y - lastPosition.y;
        const pixelDistance = Math.sqrt(dx * dx + dy * dy);
        const timeDiff = (currentTime - lastTime) / 1000; // in seconds

        if (pixelDistance > 5) { // Significant movement threshold
            const meters = pixelDistance * pixelToMeterRatio;
            const speedMps = meters / timeDiff; // meters per second
            const speedKmph = (speedMps * 3.6).toFixed(2); // km/h

            speedDisplay.textContent = `Speed: ${speedKmph} km/h`;
            logDebug(`Distance: ${pixelDistance.toFixed(0)} px, Time: ${timeDiff.toFixed(4)} s`);
            logDebug(`Speed: ${speedKmph} km/h`);
        }
    }

    lastPosition = currentPosition;
    lastTime = currentTime;
}

// Calibration
function calibrate(currentPosition, currentTime) {
    if (!lastPosition || !lastTime) {
        lastPosition = currentPosition;
        lastTime = currentTime;
        return;
    }

    const dx = currentPosition.x - lastPosition.x;
    const dy = currentPosition.y - lastPosition.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    if (pixelDistance > 5) { // Significant movement
        const realDistance = parseFloat(calibrationSelect.value);
        pixelToMeterRatio = realDistance / pixelDistance;
        logDebug(`Calibrated: ${pixelDistance.toFixed(0)} px = ${realDistance} m`);
        lastPosition = null; // Reset after calibration
    }
}

// Fallback motion detection
function motionDetectionFallback() {
    const previousFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    requestAnimationFrame(() => {
        const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let totalDiff = 0;
        let movementX = 0;
        let movementY = 0;

        for (let i = 0; i < previousFrame.data.length; i += 4) {
            const diff = Math.abs(previousFrame.data[i] - currentFrame.data[i]);
            totalDiff += diff;
            if (diff > 50) { // Threshold for significant change
                const pixelIndex = i / 4;
                movementX += pixelIndex % canvas.width;
                movementY += Math.floor(pixelIndex / canvas.width);
            }
        }

        if (totalDiff > 10000) { // Arbitrary threshold for movement
            logDebug('Motion detected (fallback)');
        }
    });
}

// Debug logging
function logDebug(message) {
    debugLines.push(message);
    if (debugLines.length > 10) debugLines.shift();
    debugDisplay.textContent = debugLines.join('\n');
}

// Start the app
initVideo();