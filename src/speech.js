/**
 * Web Speech Synthesis (TTS) Module
 * Handles loading system voices and generating natural spoken audio
 * outputs for both English and Hindi.
 */

export class SpeechSynthesisManager {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = [];
    this.englishVoice = null;
    this.hindiVoice = null;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.isSpeaking = false;

    // Load voices immediately and set up voice-change listeners
    this.loadVoices();
    if (this.synth && typeof this.synth.addEventListener === 'function') {
      this.synth.addEventListener('voiceschanged', () => this.loadVoices());
    } else if (this.synth) {
      this.synth.onvoiceschanged = () => this.loadVoices();
    }
  }

  /**
   * Fetches available voices from the browser and finds the best English/Hindi voices.
   */
  loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();

    // 1. Identify best Hindi Voice
    // Try prioritizing Google Hindi, then Apple Lekha/Siri, then any hi-IN voice
    this.hindiVoice = this.voices.find(v => v.lang === 'hi-IN' && v.name.includes('Google')) ||
                      this.voices.find(v => v.lang === 'hi-IN' && v.name.includes('Lekha')) ||
                      this.voices.find(v => v.lang.startsWith('hi')) ||
                      null;

    // 2. Identify best English Voice
    // Prioritize Google US English, Siri, Samantha, or any en-US voice
    this.englishVoice = this.voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
                        this.voices.find(v => v.lang === 'en-US' && v.name.includes('Siri')) ||
                        this.voices.find(v => v.lang === 'en-US' && v.name.includes('Samantha')) ||
                        this.voices.find(v => v.lang.startsWith('en')) ||
                        null;
  }

  /**
   * Synthesizes and speaks text out loud in the designated language.
   * @param {string} text - Text to speak.
   * @param {string} lang - Language code: 'en' or 'hi'.
   * @param {Function} onStartCallback - Triggered when playback begins.
   * @param {Function} onEndCallback - Triggered when playback finishes.
   */
  speak(text, lang, onStartCallback, onEndCallback) {
    if (!this.synth || !text) return;

    // Stop current speech to avoid overlapping
    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Choose appropriate voice and language code
    if (lang === 'hi') {
      utterance.voice = this.hindiVoice;
      utterance.lang = 'hi-IN';
    } else {
      utterance.voice = this.englishVoice;
      utterance.lang = 'en-US';
    }

    utterance.rate = this.rate;
    utterance.pitch = this.pitch;

    utterance.onstart = () => {
      this.isSpeaking = true;
      if (onStartCallback) onStartCallback();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      if (onEndCallback) onEndCallback();
    };

    utterance.onerror = (e) => {
      console.error("Speech Synthesis Error:", e);
      this.isSpeaking = false;
      if (onEndCallback) onEndCallback();
    };

    this.synth.speak(utterance);
  }

  /**
   * Cancels all current and queued speech.
   */
  stop() {
    if (this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
    }
  }

  /**
   * Updates speech speed rate parameter.
   */
  setRate(value) {
    this.rate = Math.max(0.5, Math.min(2.0, value));
  }

  /**
   * Updates vocal pitch parameter.
   */
  setPitch(value) {
    this.pitch = Math.max(0.5, Math.min(2.0, value));
  }
}
