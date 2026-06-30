/**
 * MediaPipe Hands Integration & Overlay Drawer
 * Initializes the WASM vision runtime, fetches hand landmarker models,
 * and handles rendering custom cybernetic overlay graphics onto the canvas.
 *
 * Uses the locally installed @mediapipe/tasks-vision npm package so Vite
 * can bundle the WASM assets correctly without any CDN fetch errors.
 */
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Standard hand joints skeleton connections map
const SKELETON_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index Finger
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle Finger
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring Finger
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky Finger
  [0, 17], [17, 18], [18, 19], [19, 20]
];

export class LandmarkEstimator {
  constructor() {
    this.landmarker = null;
  }

  /**
   * Initializes the MediaPipe Fileset Resolver and HandLandmarker instance.
   * @param {Function} progressCallback - Called during loading updates.
   */
  async initialize(progressCallback) {
    if (this.landmarker) return this.landmarker;

    try {
      if (progressCallback) progressCallback("Initializing WASM engine...");

      // Point FilesetResolver at the WASM files bundled by npm (served by Vite)
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
      );

      if (progressCallback) progressCallback("Downloading Hand Landmark model (~15MB, first time only...");

      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2
      });

      if (progressCallback) progressCallback("Hand tracking ready!");
      return this.landmarker;
    } catch (error) {
      console.error("Failed to initialize MediaPipe Hand Landmarker:", error);
      throw error;
    }
  }

  /**
   * Processes a video frame for hand tracking coordinates.
   * @param {HTMLVideoElement} video - The source video stream.
   * @param {number} timestamp - The current DOMHighResTimeStamp.
   * @returns {Object} Raw landmarker predictions.
   */
  detectFrame(video, timestamp) {
    if (!this.landmarker) return null;
    return this.landmarker.detectForVideo(video, timestamp);
  }

  /**
   * Draws a premium cybernetic hand skeleton overlay.
   * @param {CanvasRenderingContext2D} ctx - Target 2D canvas context.
   * @param {Array} multiHandLandmarks - Landmark list output from MediaPipe.
   */
  draw(ctx, multiHandLandmarks) {
    if (!multiHandLandmarks || multiHandLandmarks.length === 0) return;

    multiHandLandmarks.forEach((landmarks) => {
      // 1. Draw Bones (Skeleton Lines)
      ctx.lineWidth = 3;
      SKELETON_CONNECTIONS.forEach(([startIdx, endIdx]) => {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];

        if (start && end) {
          // Create gradient for premium visual glow
          const grad = ctx.createLinearGradient(
            start.x * ctx.canvas.width,
            start.y * ctx.canvas.height,
            end.x * ctx.canvas.width,
            end.y * ctx.canvas.height
          );
          grad.addColorStop(0, "rgba(99, 102, 241, 0.75)"); // Indigo
          grad.addColorStop(1, "rgba(168, 85, 247, 0.75)"); // Purple

          ctx.strokeStyle = grad;
          ctx.beginPath();
          ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height);
          ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height);
          ctx.stroke();
        }
      });

      // 2. Draw Joints (Knuckles and Fingertips)
      landmarks.forEach((point, idx) => {
        const x = point.x * ctx.canvas.width;
        const y = point.y * ctx.canvas.height;

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);

        // Styling based on landmark role: Fingertips are accented cyan
        if ([4, 8, 12, 16, 20].includes(idx)) {
          ctx.fillStyle = "#22d3ee"; // Cyan
          ctx.shadowBlur = 10;
          ctx.shadowColor = "#22d3ee";
        } else if (idx === 0) {
          ctx.fillStyle = "#ec4899"; // Pink for wrist
          ctx.shadowBlur = 12;
          ctx.shadowColor = "#ec4899";
        } else {
          ctx.fillStyle = "#a855f7"; // Purple for mid joints
          ctx.shadowBlur = 6;
          ctx.shadowColor = "#a855f7";
        }

        ctx.fill();
        
        // Reset shadows for performance
        ctx.shadowBlur = 0;
      });
    });
  }
}
