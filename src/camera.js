/**
 * Camera Utility Wrapper
 * Manages user webcam permissions, streams, and front/back camera toggling.
 */
export class CameraManager {
  constructor() {
    this.stream = null;
    this.facingMode = 'user'; // 'user' for front-facing, 'environment' for back-facing
    this.videoElement = null;
  }

  /**
   * Initializes the webcam stream on the provided HTML5 Video Element.
   * @param {HTMLVideoElement} videoElement - The target video element to bind stream.
   * @returns {Promise<MediaStream>} The active media stream.
   */
  async start(videoElement) {
    this.videoElement = videoElement;
    this.stop(); // Stop any active streams first

    const constraints = {
      video: {
        facingMode: this.facingMode,
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 }
      },
      audio: false // No audio input needed for visual gesture tracking
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      
      return new Promise((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play();
          resolve(this.stream);
        };
      });
    } catch (error) {
      console.error("Camera access failed:", error);
      throw error;
    }
  }

  /**
   * Stops all tracks in the active stream.
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  /**
   * Toggles between front and back camera.
   * @returns {Promise<MediaStream>} The new active stream.
   */
  async toggleFacingMode() {
    if (!this.videoElement) return null;
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    return this.start(this.videoElement);
  }

  /**
   * Checks if the camera is active.
   */
  isActive() {
    return this.stream !== null && this.stream.active;
  }
}
