/*
Human Speed Estimator App
Description: Uses the phone’s rear camera and tracking.js to estimate the speed of a human.
It first attempts face tracking (Option 1) and, if no detection occurs, falls back to a simple motion detection (Option 2).
It includes a calibration step based on a dropdown, and now a button to copy debug logs.
*/

// Global variables
let video = document.getElementById('video');
let overlay = document.getElementById('overlay');
let overlayCtx = overlay.getContext('2d');
let speedDisplay = document.getElementById('speedDisplay');
let calibrationSelect = document.getElementById('calibrationSelect');
let debugTextDiv = document.getElementById('debugText');
let copyDebugButton = document.getElementById('copyDebugButton');

let calibrationDone = false;
let pixelPerMeter = null; // pixels per meter conversion ratio
let prevCenter = null;
let prevTime = null;
let debugLines = [];
let currentDetection = null; // current detection object: {x, y, width, height}

// Fallback variables for motion detection
let motionCanvas = document.createElement('canvas');
let motionCtx = motionCanvas.getContext('2d');
let prevFrameData = null;
const motionThreshold = 30; // pixel difference threshold
const minMovementPixels = 5; // minimum pixel movement for calibration

// --- Camera Setup ---
function setupCamera() {
  const constraints = {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 480 },
      height: { ideal: 640 }
    },
    audio: false
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
        adjustCanvasSize();
      };
    })
    .catch(err => {
      console.error("Error accessing camera: ", err);
      addDebugLine("Error accessing camera: " + err);
    });
}

// Adjust the overlay and motion canvas sizes to match the video
function adjustCanvasSize() {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  
  motionCanvas.width = video.videoWidth;
  motionCanvas.height = video.videoHeight;
}

// --- Debug Logging ---
function addDebugLine(line) {
  const timestamp = new Date().toLocaleTimeString();
  debugLines.push(`[${timestamp}] ${line}`);
  if (debugLines.length > 10) {
    debugLines.shift();
  }
  debugTextDiv.textContent = debugLines.join('\n');
}

// Allow user to copy the debug logs to the clipboard for feedback.
copyDebugButton.addEventListener('click', () => {
  const debugReport = debugLines.join('\n');
  navigator.clipboard.writeText(debugReport)
    .then(() => {
      addDebugLine('Debug logs copied to clipboard.');
    })
    .catch(err => {
      console.error('Error copying debug logs: ', err);
      addDebugLine('Error copying debug logs: ' + err);
    });
});

// Reset calibration when the user selects a new calibration distance
calibrationSelect.addEventListener('change', () => {
  calibrationDone = false;
  pixelPerMeter = null;
  prevCenter = null;
  prevTime = null;
  addDebugLine("Calibration reset. Selected distance: " + calibrationSelect.value + " m");
});

// --- Tracking (Option 1 using tracking.js) ---
let tracker = new tracking.ObjectTracker('face');
tracker.setMinDimension(20);
tracker.setStepSize(1);

tracker.on('track', function(event) {
  if (event.data.length > 0) {
    // Use the first detected face as the tracked target.
    let rect = event.data[0];
    currentDetection = rect;
    drawOverlay(rect);
    processTracking(rect);
  } else {
    // No detection from tracking.js—log and allow the fallback to run.
    currentDetection = null;
    addDebugLine("No human detected by tracking.js.");
  }
});

// Start tracking on the video element
function startTracking() {
  tracking.track(video, tracker);
}

// --- Processing Tracking Data ---
function processTracking(rect) {
  // Calculate the center point of the detected rectangle.
  let center = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
  let currentTime = performance.now();
  
  if (prevCenter && prevTime) {
    let dx = center.x - prevCenter.x;
    let dy = center.y - prevCenter.y;
    let pixelDistance = Math.sqrt(dx * dx + dy * dy);
    let dt = (currentTime - prevTime) / 1000; // seconds
    
    if (!calibrationDone) {
      if (pixelDistance > minMovementPixels) {
        // Calibrate using the selected distance from the dropdown.
        let calibDistance = parseFloat(calibrationSelect.value);
        pixelPerMeter = pixelDistance / calibDistance;
        calibrationDone = true;
        addDebugLine(`Calibrated: ${pixelDistance.toFixed(2)} px = ${calibDistance} m (ratio: ${pixelPerMeter.toFixed(2)} px/m)`);
      }
    } else {
      // Calculate speed in km/h.
      let distanceMeters = pixelDistance / pixelPerMeter;
      let speedMps = distanceMeters / dt;
      let speedKmh = speedMps * 3.6;
      speedDisplay.textContent = `Speed: ${speedKmh.toFixed(2)} km/h`;
      addDebugLine(`Distance: ${pixelDistance.toFixed(2)} px, Time: ${dt.toFixed(4)} s, Speed: ${speedKmh.toFixed(2)} km/h`);
    }
  }
  prevCenter = center;
  prevTime = currentTime;
}

// --- Drawing the Overlay ---
function drawOverlay(rect) {
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
  overlayCtx.strokeStyle = 'red';
  overlayCtx.lineWidth = 2;
  overlayCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

// --- Motion Detection Fallback (Option 2) ---
function motionDetectionFallback() {
  // Draw the current video frame into the offscreen motion canvas.
  motionCtx.drawImage(video, 0, 0, motionCanvas.width, motionCanvas.height);
  let currentFrame = motionCtx.getImageData(0, 0, motionCanvas.width, motionCanvas.height);
  
  if (prevFrameData) {
    let diffX = 0, diffY = 0, count = 0;
    // Sample pixels (step every 8 pixels to reduce computation)
    let step = 8;
    for (let y = 0; y < currentFrame.height; y += step) {
      for (let x = 0; x < currentFrame.width; x += step) {
        let index = (y * currentFrame.width + x) * 4;
        let rDiff = Math.abs(currentFrame.data[index] - prevFrameData.data[index]);
        let gDiff = Math.abs(currentFrame.data[index+1] - prevFrameData.data[index+1]);
        let bDiff = Math.abs(currentFrame.data[index+2] - prevFrameData.data[index+2]);
        let totalDiff = rDiff + gDiff + bDiff;
        if (totalDiff > motionThreshold) {
          diffX += x;
          diffY += y;
          count++;
        }
      }
    }
    if (count > 0) {
      let avgX = diffX / count;
      let avgY = diffY / count;
      // Define an arbitrary bounding box around the centroid.
      let boxSize = 50;
      let rect = {
        x: avgX - boxSize / 2,
        y: avgY - boxSize / 2,
        width: boxSize,
        height: boxSize
      };
      currentDetection = rect;
      drawOverlay(rect);
      processTracking(rect);
      addDebugLine(`Motion fallback: Detected movement at (${avgX.toFixed(0)}, ${avgY.toFixed(0)})`);
    } else {
      addDebugLine("Motion fallback: No significant movement detected.");
    }
  }
  prevFrameData = currentFrame;
}

// --- Animation Loop ---
function animationLoop() {
  // If tracking.js has not detected a target, try the motion fallback.
  if (!currentDetection) {
    motionDetectionFallback();
  }
  requestAnimationFrame(animationLoop);
}

// --- Resize Handling ---
window.addEventListener('resize', adjustCanvasSize);

// --- Initialize the App ---
setupCamera();
startTracking();
animationLoop();