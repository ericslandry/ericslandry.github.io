// DOM Elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const speedDisplay = document.getElementById('speed');
const distanceSelect = document.getElementById('distance');
const calibrateBtn = document.getElementById('calibrate-btn');
const debugText = document.getElementById('debug-text');

// App State
const state = {
    isCalibrating: false,
    isCalibrated: false,
    pixelsPerMeter: null,
    lastPosition: null,
    lastTimestamp: null,
    trackedRect: null,
    debugLines: [],
    motionThreshold: 5, // Minimum pixel change to consider as movement
    trackingLost: false,
    speed: 0,
    frameHistory: [], // Store recent frames for motion detection
    historyLength: 5, // Number of frames to keep for comparison
};

// Constants
const TARGET_WIDTH = 480;
const TARGET_HEIGHT = 640;
const DEBUG_MAX_LINES = 10;
const SPEED_UPDATE_INTERVAL = 200; // ms
const TRACKING_LOST_TIMEOUT = 1000; // ms
const RED_BOX_COLOR = 'rgba(255, 0, 0, 0.5)';

// Add debug message
function addDebug(message) {
    const timestamp = new Date().toLocaleTimeString();
    state.debugLines.unshift(`[${timestamp}] ${message}`);
    
    // Keep only the last N lines
    if (state.debugLines.length > DEBUG_MAX_LINES) {
        state.debugLines.pop();
    }
    
    // Update the debug display
    debugText.textContent = state.debugLines.join('\n');
}

// Initialize video capture
async function initCamera() {
    try {
        const constraints = {
            video: {
                facingMode: 'environment', // Use rear camera
                width: { ideal: TARGET_WIDTH },
                height: { ideal: TARGET_HEIGHT }
            }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise(resolve => {
            video.onloadedmetadata = () => {
                addDebug(`Video initialized: ${video.videoWidth}x${video.videoHeight}`);
                resolve();
            };
        });
        
        // Set canvas dimensions to match video
        resizeCanvas();
        
        // Start tracking
        initTracking();
        
    } catch (error) {
        addDebug(`Camera error: ${error.message}`);
        console.error('Error accessing camera:', error);
    }
}

// Resize canvas to match video dimensions while maintaining aspect ratio
function resizeCanvas() {
    const containerWidth = video.parentElement.clientWidth;
    const containerHeight = video.parentElement.clientHeight;
    
    // Keep aspect ratio
    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = containerWidth / containerHeight;
    
    let width, height;
    
    if (containerRatio > videoRatio) {
        // Container is wider than video
        height = containerHeight;
        width = height * videoRatio;
    } else {
        // Container is taller than video
        width = containerWidth;
        height = width / videoRatio;
    }
    
    canvas.width = width;
    canvas.height = height;
    
    addDebug(`Canvas resized: ${width}x${height}`);
}

// Initialize human tracking
function initTracking() {
    // First try: Use tracking.js object tracker
    try {
        const tracker = new tracking.ObjectTracker('face');
        tracker.setInitialScale(4);
        tracker.setStepSize(2);
        tracker.setEdgesDensity(0.1);
        
        addDebug('Starting face tracking...');
        
        tracking.track('#video', tracker);
        
        tracker.on('track', event => {
            // Clear previous drawings
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (event.data.length === 0) {
                if (!state.trackingLost) {
                    state.trackingLost = true;
                    addDebug('No human detected');
                    
                    // If tracking is lost for too long, reset position
                    setTimeout(() => {
                        if (state.trackingLost) {
                            state.lastPosition = null;
                            state.lastTimestamp = null;
                        }
                    }, TRACKING_LOST_TIMEOUT);
                }
                
                // Fall back to motion detection if tracking.js fails
                useMotionDetection();
                return;
            }
            
            // Reset tracking lost state
            state.trackingLost = false;
            
            // Get the largest face (assuming it's the target human)
            const largestRect = event.data.reduce((largest, rect) => {
                const area = rect.width * rect.height;
                const largestArea = largest ? largest.width * largest.height : 0;
                return area > largestArea ? rect : largest;
            }, null);
            
            if (largestRect) {
                // Scale coordinates to match canvas
                const scaledRect = {
                    x: largestRect.x * canvas.width / video.videoWidth,
                    y: largestRect.y * canvas.height / video.videoHeight,
                    width: largestRect.width * canvas.width / video.videoWidth,
                    height: largestRect.height * canvas.height / video.videoHeight
                };
                
                // Draw rectangle around the tracked object
                ctx.strokeStyle = RED_BOX_COLOR;
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    scaledRect.x, 
                    scaledRect.y, 
                    scaledRect.width, 
                    scaledRect.height
                );
                
                // Store the tracked rectangle
                state.trackedRect = scaledRect;
                
                // Calculate center position
                const centerX = scaledRect.x + scaledRect.width / 2;
                const centerY = scaledRect.y + scaledRect.height / 2;
                const currentPosition = { x: centerX, y: centerY };
                
                // Calculate speed if we have previous position
                calculateSpeed(currentPosition);
                
                addDebug(`Tracked at x:${Math.round(centerX)}, y:${Math.round(centerY)}, size:${Math.round(scaledRect.width)}x${Math.round(scaledRect.height)}`);
            }
        });
    } catch (error) {
        addDebug(`Tracking.js error: ${error.message}. Falling back to motion detection.`);
        console.error('Error with tracking.js:', error);
        useMotionDetection();
    }
}

// Fallback: Use basic motion detection
function useMotionDetection() {
    addDebug('Using motion detection fallback...');
    
    // Create a timer for regular frame processing
    setInterval(() => {
        // Capture current video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get current frame data
        const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // If we have enough frame history, perform motion detection
        if (state.frameHistory.length > 0) {
            const previousFrame = state.frameHistory[0];
            const motionBlobs = detectMotion(previousFrame, currentFrame);
            
            // Clear previous drawings
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // If we found significant motion
            if (motionBlobs.length > 0) {
                // Find the largest blob (assuming it's our human)
                const largestBlob = motionBlobs.reduce((largest, blob) => {
                    return (blob.width * blob.height > largest.width * largest.height) ? blob : largest;
                }, motionBlobs[0]);
                
                // Draw rectangle around the motion
                ctx.strokeStyle = RED_BOX_COLOR;
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    largestBlob.x,
                    largestBlob.y,
                    largestBlob.width,
                    largestBlob.height
                );
                
                // Calculate center position
                const centerX = largestBlob.x + largestBlob.width / 2;
                const centerY = largestBlob.y + largestBlob.height / 2;
                const currentPosition = { x: centerX, y: centerY };
                
                // Calculate speed
                calculateSpeed(currentPosition);
                
                state.trackingLost = false;
                addDebug(`Motion detected at x:${Math.round(centerX)}, y:${Math.round(centerY)}, size:${Math.round(largestBlob.width)}x${Math.round(largestBlob.height)}`);
            } else if (!state.trackingLost) {
                state.trackingLost = true;
                addDebug('No motion detected');
            }
        }
        
        // Update frame history
        state.frameHistory.unshift(currentFrame);
        if (state.frameHistory.length > state.historyLength) {
            state.frameHistory.pop();
        }
    }, 50); // Process frames every 50ms (about 20fps)
}

// Detect motion between two frames
function detectMotion(previousFrame, currentFrame) {
    const width = previousFrame.width;
    const height = previousFrame.height;
    const previous = previousFrame.data;
    const current = currentFrame.data;
    
    // Temp canvas for motion detection
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    const diffImageData = tempCtx.createImageData(width, height);
    const diff = diffImageData.data;
    
    // Create difference image
    for (let i = 0; i < previous.length; i += 4) {
        // Calculate pixel difference (using grayscale for simplicity)
        const prevGray = (previous[i] + previous[i + 1] + previous[i + 2]) / 3;
        const currGray = (current[i] + current[i + 1] + current[i + 2]) / 3;
        const diffValue = Math.abs(prevGray - currGray);
        
        // Apply threshold to remove noise
        const threshold = 25;
        const isSamePixel = diffValue < threshold;
        
        // Set pixel in difference image
        diff[i] = diff[i + 1] = diff[i + 2] = isSamePixel ? 0 : 255;
        diff[i + 3] = 255; // Alpha
    }
    
    // Put differential image in temp canvas
    tempCtx.putImageData(diffImageData, 0, 0);
    
    // Find blobs in the differential image (simplified algorithm)
    const blobs = [];
    const visited = new Uint8Array(width * height);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            
            // If pixel is white (motion) and not visited
            if (!visited[index] && diff[index * 4] === 255) {
                // Find the bounds of this blob using flood fill
                const blob = {
                    minX: x,
                    minY: y,
                    maxX: x,
                    maxY: y
                };
                
                // Simple queue for flood fill
                const queue = [{x, y}];
                visited[index] = 1;
                
                while (queue.length > 0) {
                    const pixel = queue.shift();
                    
                    // Update blob bounds
                    blob.minX = Math.min(blob.minX, pixel.x);
                    blob.minY = Math.min(blob.minY, pixel.y);
                    blob.maxX = Math.max(blob.maxX, pixel.x);
                    blob.maxY = Math.max(blob.maxY, pixel.y);
                    
                    // Check neighboring pixels
                    const neighbors = [
                        {x: pixel.x - 1, y: pixel.y},
                        {x: pixel.x + 1, y: pixel.y},
                        {x: pixel.x, y: pixel.y - 1},
                        {x: pixel.x, y: pixel.y + 1}
                    ];
                    
                    for (const neighbor of neighbors) {
                        if (neighbor.x >= 0 && neighbor.x < width && 
                            neighbor.y >= 0 && neighbor.y < height) {
                            
                            const neighborIndex = neighbor.y * width + neighbor.x;
                            
                            if (!visited[neighborIndex] && diff[neighborIndex * 4] === 255) {
                                queue.push(neighbor);
                                visited[neighborIndex] = 1;
                            }
                        }
                    }
                }
                
                // Calculate width and height
                blob.width = blob.maxX - blob.minX + 1;
                blob.height = blob.maxY - blob.minY + 1;
                blob.x = blob.minX;
                blob.y = blob.minY;
                
                // Only add blobs that are large enough (filter out noise)
                const minBlobSize = 20;
                if (blob.width >= minBlobSize && blob.height >= minBlobSize) {
                    blobs.push(blob);
                }
            }
        }
    }
    
    return blobs;
}

// Calculate and update speed
function calculateSpeed(currentPosition) {
    const now = performance.now();
    
    // If this is the first detection or calibration is in progress
    if (!state.lastPosition || !state.lastTimestamp || state.isCalibrating) {
        state.lastPosition = currentPosition;
        state.lastTimestamp = now;
        return;
    }
    
    // Only update speed periodically to smooth out readings
    if (now - state.lastTimestamp < SPEED_UPDATE_INTERVAL) {
        return;
    }
    
    // Calculate distance in pixels
    const pixelDistance = Math.sqrt(
        Math.pow(currentPosition.x - state.lastPosition.x, 2) +
        Math.pow(currentPosition.y - state.lastPosition.y, 2)
    );
    
    // Skip if movement is below threshold
    if (pixelDistance < state.motionThreshold) {
        return;
    }
    
    // If we're calibrating
    if (state.isCalibrating && !state.isCalibrated) {
        // Get selected calibration distance in meters
        const distanceInMeters = parseFloat(distanceSelect.value);
        
        // Calculate pixels per meter ratio
        state.pixelsPerMeter = pixelDistance / distanceInMeters;
        state.isCalibrated = true;
        state.isCalibrating = false;
        
        addDebug(`Calibrated: ${pixelDistance.toFixed(1)} px = ${distanceInMeters} m (${state.pixelsPerMeter.toFixed(2)} px/m)`);
        
        // Reset for speed calculation
        state.lastPosition = currentPosition;
        state.lastTimestamp = now;
        return;
    }
    
    // Calculate time difference in seconds
    const timeDifference = (now - state.lastTimestamp) / 1000;
    
    // Calculate speed in meters per second
    let speedMps = 0;
    
    if (state.isCalibrated && state.pixelsPerMeter > 0) {
        // If calibrated, use pixels-to-meter ratio
        const distanceInMeters = pixelDistance / state.pixelsPerMeter;
        speedMps = distanceInMeters / timeDifference;
    } else {
        // If not calibrated, use a default estimate for a human at 5m distance
        // This is a rough estimate assuming a 480x640 resolution
        const estimatedPixelsPerMeter = 30; // Rough estimate
        const distanceInMeters = pixelDistance / estimatedPixelsPerMeter;
        speedMps = distanceInMeters / timeDifference;
    }
    
    // Convert to km/h
    const speedKmh = speedMps * 3.6;
    
    // Update speed with smoothing
    state.speed = state.speed * 0.7 + speedKmh * 0.3;
    
    // Only show positive speed and cap at reasonable maximum for walking/running
    const displaySpeed = Math.min(Math.max(state.speed, 0), 40).toFixed(2);
    speedDisplay.textContent = displaySpeed;
    
    addDebug(`Distance: ${pixelDistance.toFixed(1)} px, Time: ${timeDifference.toFixed(4)} s, Speed: ${speedKmh.toFixed(2)} km/h`);
    
    // Update last position and timestamp
    state.lastPosition = currentPosition;
    state.lastTimestamp = now;
}

// Handle calibration button click
calibrateBtn.addEventListener('click', () => {
    state.isCalibrating = true;
    state.isCalibrated = false;
    addDebug(`Starting calibration with ${distanceSelect.value}m distance...`);
    addDebug('Move horizontally to complete calibration');
});

// Handle window resize
window.addEventListener('resize', () => {
    resizeCanvas();
});

// Start the app
document.addEventListener('DOMContentLoaded', () => {
    addDebug('App initialized. Starting camera...');
    initCamera();
});