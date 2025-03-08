const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const speedDisplay = document.getElementById('speed');

let lastX = null, lastY = null, lastTime = null;

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
    const tracker = new tracking.ColorTracker(['magenta', 'cyan', 'yellow']); // Adjust colors as needed
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

            // Calculate speed
            if (lastX !== null && lastY !== null) {
                const now = performance.now();
                const dt = (now - lastTime) / 1000; // Time in seconds
                const dx = x - lastX;
                const dy = y - lastY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const speed = distance / dt; // Pixels per second
                speedDisplay.textContent = `Speed: ${speed.toFixed(2)} px/s`;
            }

            lastX = x;
            lastY = y;
            lastTime = performance.now();
        }
    });

    tracking.track('#video', tracker, { camera: true });
}