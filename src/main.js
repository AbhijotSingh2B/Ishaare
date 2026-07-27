/**
 * Application Coordinator (Main Entry Point)
 * Initializes all submodules, hooks up the DOM event listeners, orchestrates
 * the real-time requestAnimationFrame loop, and controls application state.
 */

import { CameraManager } from "./camera.js";
import { LandmarkEstimator } from "./landmarks.js";
import { GestureClassifier } from "./classifier.js";
import { SignTranslator } from "./translator.js";
import { SpeechSynthesisManager } from "./speech.js";

// DOM Elements
const webcam = document.getElementById("webcam");
const canvas = document.getElementById("output_canvas");
const ctx = canvas.getContext("2d");

const statusIndicator = document.getElementById("statusIndicator");
const loadingScreen = document.getElementById("loadingScreen");
const loadingText = document.getElementById("loadingText");
const fpsCounter = document.getElementById("fpsCounter");
const deviceStatus = document.getElementById("deviceStatus");

const toggleCameraBtn = document.getElementById("toggleCameraBtn");
const speakEnglishBtn = document.getElementById("speakEnglishBtn");
const speakHindiBtn = document.getElementById("speakHindiBtn");

const hudGestureValue = document.getElementById("hudGestureValue");
const hudConfidenceValue = document.getElementById("hudConfidenceValue");

const englishTextElement = document.getElementById("englishText");
const hindiTextElement = document.getElementById("hindiText");

const autoSpeakToggle = document.getElementById("autoSpeakToggle");
const voiceSelect = document.getElementById("voiceSelect");
const minConfidenceRange = document.getElementById("minConfidenceRange");
const confValLabel = document.getElementById("confVal");

// Trainer DOM Elements
const trainingModeBtn = document.getElementById("trainingModeBtn");
const trainingDrawer = document.getElementById("trainingDrawer");
const customSignLabelInput = document.getElementById("customSignLabel");
const recordSampleBtn = document.getElementById("recordSampleBtn");
const multiShotBtn = document.getElementById("multiShotBtn");
const clearTrainedBtn = document.getElementById("clearTrainedBtn");
const trainedLettersCount = document.getElementById("trainedLettersCount");
const trainedPhrasesCount = document.getElementById("trainedPhrasesCount");
const trainedLettersContainer = document.getElementById("trainedLettersContainer");
const trainedPhrasesContainer = document.getElementById("trainedPhrasesContainer");
const exportTrainingBtn = document.getElementById("exportTrainingBtn");
const importTrainingBtn = document.getElementById("importTrainingBtn");
const importFileInput = document.getElementById("importFileInput");

// Letters Mode
const lettersModeBtn    = document.getElementById("lettersModeBtn");

// Sentence Mode DOM Elements
const sentenceModeBtn   = document.getElementById("sentenceModeBtn");
const sentencePanel     = document.getElementById("sentencePanel");
const sentenceArcFill   = document.getElementById("sentenceArcFill");
const sentenceCurrentSignEl = document.getElementById("sentenceCurrentSign");
const sentenceWordsEl   = document.getElementById("sentenceWords");
const sentenceSpeakBtn  = document.getElementById("sentenceSpeakBtn");
const sentenceUndoBtn   = document.getElementById("sentenceUndoBtn");
const sentenceClearBtn  = document.getElementById("sentenceClearBtn");

// Countdown & Choice Elements
const countdownOverlay = document.getElementById("countdownOverlay");
const countdownCircleContainer = document.getElementById("countdownCircleContainer");
const countdownNumber = document.getElementById("countdownNumber");
const countdownStatus = document.getElementById("countdownStatus");
const cameraFlash = document.getElementById("cameraFlash");
const multiShotChoices = document.getElementById("multiShotChoices");
const multiShotLabelName = document.getElementById("multiShotLabelName");
const keepShotsBtn = document.getElementById("keepShotsBtn");
const discardShotsBtn = document.getElementById("discardShotsBtn");

// Submodule Instances
const cameraManager = new CameraManager();
const landmarkEstimator = new LandmarkEstimator();
const classifier = new GestureClassifier();
const translator = new SignTranslator();
const speechManager = new SpeechSynthesisManager();

// App State Variables
let minConfidence = 0.50; // default 50%
let activeHandLandmarks = null;
let currentGesture = null;
let currentConfidence = null;
let lastDetectedGesture = "";
let lastSpokeTime = 0;
const AUTO_SPEAK_COOLDOWN = 3000; // 3 seconds cooldown between duplicate speaks

// Letters Only Mode State
let lettersOnlyMode = false;

// Sentence Mode State
const SENTENCE_WINDOW_MS  = 3000;       // 3-second voting window
const SENTENCE_ARC_C      = 213.6;      // SVG arc circumference (2π × r=34)
const NO_HAND_SPACE_MS    = 3000;       // 3 s of no hand → insert a space
let sentenceModeActive    = false;
let sentenceWords         = [];         // committed word tokens
let sentenceWindowStart   = null;       // performance.now() of window start
let sentenceGestureVotes  = {};         // label -> accumulated ms in current window
let sentenceLastFrameTime = null;       // used to compute per-frame delta
let noHandSinceTime       = null;       // performance.now() when hand last left frame
let noHandSpaceInserted   = false;      // prevent duplicate spaces per absence event

// Multi-Shot state variables
let isMultiShotRunning = false;
let tempMultiShotFeatures = [];
let multiShotLabel = "";
let multiShotTimeout = null;

// FPS calculation helpers
let lastTime = 0;
let frameCount = 0;

/**
 * Bootstraps the application, loading models and starting camera feeds.
 */
async function initializeApp() {
  try {
    statusIndicator.className = "pulse-indicator status-loading";
    
    // STEP 1: Start camera FIRST — so user sees the live feed immediately
    loadingText.textContent = "Requesting camera access...";
    await cameraManager.start(webcam);

    // Configure canvas size
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Hide loading screen once camera is live — model will load in background
    loadingScreen.style.opacity = "0";
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 500);

    deviceStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Loading AI model...`;

    const modelToast = document.getElementById("modelDownloadToast");
    const modelToastMsg = document.getElementById("modelDownloadMessage");
    if (modelToast) {
      modelToast.style.display = "flex";
      modelToast.style.opacity = "1";
    }

    // STEP 2: Load MediaPipe model in background — render loop starts immediately
    // but will skip inference until landmarker is ready
    registerServiceWorker();
    requestAnimationFrame(renderLoop);

    // STEP 3: Load model asynchronously (does NOT block camera view)
    await landmarkEstimator.initialize((message) => {
      deviceStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${message}`;
      if (modelToastMsg) modelToastMsg.textContent = message;
    });

    if (modelToast) {
      modelToast.style.opacity = "0";
      setTimeout(() => modelToast.style.display = "none", 300);
    }

    // Model fully loaded — app is now fully operational
    statusIndicator.className = "pulse-indicator status-running";
    deviceStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> System running`;
    recordSampleBtn.removeAttribute("disabled");
    multiShotBtn.removeAttribute("disabled");

  } catch (error) {
    console.error("Initialization error:", error);
    loadingScreen.style.display = "flex";
    loadingScreen.style.opacity = "1";
    loadingText.innerHTML = `<span style="color:var(--danger)">Error: ${error.message || "Camera permission denied or model failed to load."}</span>`;
    statusIndicator.className = "pulse-indicator status-idle";
    deviceStatus.innerHTML = `<i class="fa-solid fa-circle-xmark" style="color:var(--danger)"></i> Init failed`;
  }
}


/**
 * Keeps canvas size synchronized with camera dimensions.
 */
function resizeCanvas() {
  canvas.width = webcam.videoWidth || 640;
  canvas.height = webcam.videoHeight || 480;
}

/**
 * Core RequestAnimationFrame render-and-inference loop.
 */
function renderLoop(timestamp) {
  // Update FPS count
  calculateFPS(timestamp);

  // Clear previous canvas overlays
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (cameraManager.isActive()) {
    // 1. Run detection
    const detections = landmarkEstimator.detectFrame(webcam, timestamp);
    
    if (detections && detections.landmarks) {
      activeHandLandmarks = detections.landmarks;
      
      // Draw tracking overlays
      landmarkEstimator.draw(ctx, activeHandLandmarks);

      // Perform gesture recognition
      processInference(activeHandLandmarks);
    } else {
      activeHandLandmarks = null;
      resetHudWithDelay();
      // Track start of no-hand period for the space-insertion timer
      if (sentenceModeActive && noHandSinceTime === null) {
        noHandSinceTime = performance.now();
      }
    }
  }

  // Sentence mode timer ticks every frame regardless of detection
  tickSentenceMode();

  requestAnimationFrame(renderLoop);
}

/**
 * Handles FPS counter calculations.
 */
function calculateFPS(now) {
  frameCount++;
  if (now - lastTime >= 1000) {
    const fps = Math.round((frameCount * 1000) / (now - lastTime));
    fpsCounter.innerHTML = `<i class="fa-solid fa-gauge-high"></i> FPS: ${fps}`;
    frameCount = 0;
    lastTime = now;
  }
}

/**
 * Runs classification algorithms on extracted landmarks.
 */
function processInference(multiHandLandmarks) {
  let detectedLabel = null;
  let confidence = 0;

  if (multiHandLandmarks.length === 2) {
    // Attempt two-handed signs first (e.g. HELP)
    detectedLabel = classifier.classifyMultiHand(multiHandLandmarks[0], multiHandLandmarks[1]);
    if (detectedLabel) confidence = 100;
  }

  // If no 2-handed gesture, classify the primary hand
  if (!detectedLabel && multiHandLandmarks.length > 0) {
    const primaryHand = multiHandLandmarks[0];

    // 1. Fingerpose — primary engine (high-accuracy curl + direction analysis)
    // Only run if not in Letters Only mode (built-in fingerpose gestures are all phrases)
    let fpResult = null;
    if (!lettersOnlyMode) {
      fpResult = classifier.classifyWithFingerpose(primaryHand);
      if (fpResult) {
        detectedLabel = fpResult.label;
        confidence = Math.round((fpResult.score / 10) * 100);
      }
    }

    // 2. KNN fallback — only for user-trained custom signs
    if (!detectedLabel && classifier.customSigns.length > 0) {
      const features = classifier.extractFeatures(primaryHand, webcam.videoWidth, webcam.videoHeight);
      
      // Pass lettersOnlyMode down to filter choices
      const prediction = classifier.classifyKNN(features, minConfidence * 100, lettersOnlyMode);
      if (prediction) {
        detectedLabel = prediction.label;
        confidence = prediction.confidence;
      }
    }
  }


  // If a valid sign was classified
  if (detectedLabel) {
    currentGesture = detectedLabel;
    currentConfidence = confidence;

    // Update HUD
    hudGestureValue.textContent = currentGesture.replace(/_/g, " ");
    hudConfidenceValue.textContent = `${currentConfidence}%`;
    hudGestureValue.style.color = "var(--success)";

    // Run translations
    const translation = translator.translate(currentGesture);
    englishTextElement.textContent = translation.en;
    hindiTextElement.textContent = translation.hi;

    // Enable manual speak buttons
    speakEnglishBtn.removeAttribute("disabled");
    speakHindiBtn.removeAttribute("disabled");

    // Trigger auto-speak
    triggerAutoSpeak(currentGesture, translation.en, translation.hi);
  } else {
    resetHudWithDelay();
  }

  // Accumulate detected label into the sentence mode vote tally
  // Pass null when nothing was detected so the no-hand timer can tick
  accumulateSentenceVote(detectedLabel || null);
}

/**
 * Triggers voice synthesis for translations based on settings.
 */
function triggerAutoSpeak(gesture, enText, hiText) {
  const isAutoSpeakEnabled = autoSpeakToggle.checked;
  if (!isAutoSpeakEnabled) return;

  const now = Date.now();
  const isNewGesture = gesture !== lastDetectedGesture;
  const isCooldownOver = (now - lastSpokeTime) > AUTO_SPEAK_COOLDOWN;

  if (isNewGesture || isCooldownOver) {
    lastDetectedGesture = gesture;
    lastSpokeTime = now;

    const preference = voiceSelect.value;
    
    if (preference === "both") {
      // Speak English, then speak Hindi after English finishes
      speechManager.speak(enText, "en", null, () => {
        setTimeout(() => {
          // Only speak if gesture didn't clear out in between
          if (currentGesture === gesture) {
            speechManager.speak(hiText, "hi");
          }
        }, 400); // 400ms delay between languages
      });
    } else if (preference === "en") {
      speechManager.speak(enText, "en");
    } else if (preference === "hi") {
      speechManager.speak(hiText, "hi");
    }
  }
}

// Timeout helper to avoid flickering "WAITING..." during fast movements
let resetTimeout = null;
function resetHudWithDelay() {
  if (resetTimeout) return;
  
  resetTimeout = setTimeout(() => {
    currentGesture = null;
    currentConfidence = null;
    
    hudGestureValue.textContent = "WAITING...";
    hudConfidenceValue.textContent = "--";
    hudGestureValue.style.color = "var(--text-secondary)";
    
    speakEnglishBtn.setAttribute("disabled", "true");
    speakHindiBtn.setAttribute("disabled", "true");
    
    resetTimeout = null;
  }, 1000); // Wait 1 second of no detections before resetting translation HUD
}

// ─── Sentence Mode ────────────────────────────────────────────────────────────

/**
 * Accumulates how long (ms) each gesture appears within the current 3-second
 * voting window. Called every processInference frame.
 */
function accumulateSentenceVote(label) {
  if (!sentenceModeActive) return;

  const now = performance.now();
  const delta = sentenceLastFrameTime ? (now - sentenceLastFrameTime) : 0;
  sentenceLastFrameTime = now;

  if (label) {
    // Hand is visible — reset the no-hand space timer
    noHandSinceTime = null;
    noHandSpaceInserted = false;
    sentenceGestureVotes[label] = (sentenceGestureVotes[label] || 0) + delta;
  } else {
    // No hand (or no confident sign) — tick the space-insertion timer
    if (noHandSinceTime !== null && !noHandSpaceInserted) {
      const absentMs = now - noHandSinceTime;
      if (absentMs >= NO_HAND_SPACE_MS) {
        sentenceWords.push("SPACE");
        renderSentenceWords(true);
        noHandSpaceInserted = true;
      }
    }
  }
}

/**
 * Runs every animation frame. Updates the arc progress UI and commits the
 * winning gesture when the 3-second window expires.
 */
function tickSentenceMode() {
  if (!sentenceModeActive || sentenceWindowStart === null) return;

  const now       = performance.now();
  const elapsed   = now - sentenceWindowStart;
  const progress  = Math.min(elapsed / SENTENCE_WINDOW_MS, 1);

  // Update SVG arc (offset goes from full → 0 as window fills)
  const offset = SENTENCE_ARC_C * (1 - progress);
  sentenceArcFill.style.strokeDashoffset = offset;

  // Arc colour: green → orange in final 25%
  sentenceArcFill.classList.toggle("arc-warning", progress > 0.75 && progress < 0.98);
  sentenceArcFill.classList.toggle("arc-commit",  progress >= 0.98);

  // Show current leading gesture in arc centre
  const leader = getLeadingVote();
  sentenceCurrentSignEl.textContent = leader
    ? leader.replace(/_/g, " ")
    : "—";

  // Window complete — commit the winner
  if (elapsed >= SENTENCE_WINDOW_MS) {
    commitSentenceWord();
  }
}

/** Returns the gesture label with the most accumulated time this window. */
function getLeadingVote() {
  let best = null, bestMs = 0;
  for (const [label, ms] of Object.entries(sentenceGestureVotes)) {
    if (ms > bestMs) { bestMs = ms; best = label; }
  }
  return best;
}

/** Commits the winning gesture and starts the next window. */
function commitSentenceWord() {
  const winner = getLeadingVote();
  if (winner) {
    sentenceWords.push(winner);
    renderSentenceWords(true);
  }
  resetSentenceWindow();
}

/** Resets the voting window. */
function resetSentenceWindow() {
  sentenceWindowStart   = performance.now();
  sentenceGestureVotes  = {};
  sentenceLastFrameTime = performance.now();
  sentenceArcFill.style.strokeDashoffset = SENTENCE_ARC_C;
  sentenceArcFill.classList.remove("arc-warning", "arc-commit");
  sentenceCurrentSignEl.textContent = "—";
}

/**
 * Converts a sentence token to its display string.
 * SPACE → real space, multi-word labels (e.g. I_LOVE_YOU) get underscores → spaces.
 */
function tokenToDisplay(token) {
  if (token === "SPACE" || token === "SPACE_GESTURE") return " ";
  return token.replace(/_/g, " ");
}

/**
 * Converts a sentence token to speakable text.
 * Single letters are returned as-is (joined into a word later).
 * Multi-word phrases are translated via the translator for natural speech.
 */
function tokenToSpeech(token) {
  if (token === "SPACE" || token === "SPACE_GESTURE") return " ";
  if (token.includes("_")) {
    const t = translator.translate(token);
    return t.en || token.replace(/_/g, " ");
  }
  return token;
}

/** Renders the growing sentence string with a blinking cursor. */
function renderSentenceWords(markLast = false) {
  if (sentenceWords.length === 0) {
    sentenceWordsEl.innerHTML = `<span class="sentence-placeholder">Your sentence will appear here...</span>`;
    sentenceSpeakBtn.setAttribute("disabled", "true");
    sentenceUndoBtn.setAttribute("disabled",  "true");
    sentenceClearBtn.setAttribute("disabled", "true");
    return;
  }

  // Build a character list, tracking which token each char belongs to
  const charList = []; // { ch, tokenIndex }
  sentenceWords.forEach((token, tokenIndex) => {
    const display = tokenToDisplay(token);
    for (const ch of display) {
      charList.push({ ch, tokenIndex });
    }
  });

  const lastTokenIndex = sentenceWords.length - 1;
  const charsHtml = charList.map(({ ch, tokenIndex }, i) => {
    const isFirstOfToken = i === 0 || charList[i - 1].tokenIndex !== tokenIndex;
    const isNew = markLast && tokenIndex === lastTokenIndex && isFirstOfToken;
    const cls = ch === " " ? "sentence-char sentence-space" : "sentence-char";
    return `<span class="${cls}${isNew ? " char-pop" : ""}">${ch === " " ? "&nbsp;" : escapeHtml(ch)}</span>`;
  }).join("");

  sentenceWordsEl.innerHTML = `${charsHtml}<span class="sentence-cursor"></span>`;

  sentenceSpeakBtn.removeAttribute("disabled");
  sentenceUndoBtn.removeAttribute("disabled");
  sentenceClearBtn.removeAttribute("disabled");
}

/** Safely escapes a string for innerHTML. */
function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/** Activates or deactivates sentence mode. */
function setSentenceMode(enabled) {
  sentenceModeActive = enabled;
  sentenceModeBtn.classList.toggle("active", enabled);
  sentencePanel.classList.toggle("open", enabled);

  if (enabled) {
    resetSentenceWindow();
    renderSentenceWords();
  } else {
    // Reset arc to empty when closing
    sentenceArcFill.style.strokeDashoffset = SENTENCE_ARC_C;
    sentenceArcFill.classList.remove("arc-warning", "arc-commit");
    sentenceCurrentSignEl.textContent = "—";
  }
}

/**
 * Renders lists of custom trained gesture labels in UI.
 */
/**
 * Renders lists of custom trained gesture labels in UI.
 * Separates labels into "Letters" (length == 1 or "SPACE") and "Phrases".
 */
function renderTrainedSigns() {
  const allSigns = classifier.customSigns;
  
  // Frequencies
  const freqs = {};
  allSigns.forEach(s => { freqs[s.label] = (freqs[s.label] || 0) + 1; });

  const letters = [];
  const phrases = [];

  Object.entries(freqs).forEach(([label, freq]) => {
    if (label.length === 1 || label === "SPACE") {
      letters.push({ label, freq });
    } else {
      phrases.push({ label, freq });
    }
  });

  trainedLettersCount.textContent = letters.length;
  trainedPhrasesCount.textContent = phrases.length;

  const renderGroup = (arr, container, emptyMsg) => {
    if (arr.length === 0) {
      container.innerHTML = `<span class="no-tags-msg">${emptyMsg}</span>`;
      return;
    }
    container.innerHTML = "";
    arr.forEach(item => {
      const badge = document.createElement("span");
      badge.className = "tag-badge";
      badge.innerHTML = `
        ${item.label.replace(/_/g, " ")} <span>(${item.freq})</span>
        <button data-label="${item.label}" class="delete-tag-btn" title="Delete Sign">
          <i class="fa-solid fa-circle-xmark"></i>
        </button>
      `;
      container.appendChild(badge);
    });
  };

  renderGroup(letters, trainedLettersContainer, "No custom letters recorded yet.");
  renderGroup(phrases, trainedPhrasesContainer, "No custom phrases recorded yet.");

  // Hook delete events
  document.querySelectorAll(".delete-tag-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const targetLabel = e.currentTarget.getAttribute("data-label");
      classifier.customSigns = classifier.customSigns.filter(s => s.label !== targetLabel);
      classifier.saveCustomSigns();
      renderTrainedSigns();
    });
  });
}

/**
 * Triggers a camera shutter screen flash visual effect.
 */
function triggerCameraFlash() {
  cameraFlash.classList.remove("flash-fade");
  cameraFlash.classList.add("flash-active");
  
  // Force reflow
  void cameraFlash.offsetWidth;
  
  cameraFlash.classList.remove("flash-active");
  cameraFlash.classList.add("flash-fade");
}

/**
 * Starts the sequential multi-shot capture flow.
 */
async function startMultiShot(label) {
  isMultiShotRunning = true;
  tempMultiShotFeatures = [];
  multiShotLabel = label.trim().toUpperCase().replace(/\s+/g, "_");

  // Update Multi-Shot button to show Cancel
  multiShotBtn.innerHTML = `<i class="fa-solid fa-xmark"></i> Cancel`;
  multiShotBtn.className = "btn btn-danger";

  // Disable other trainer actions
  recordSampleBtn.setAttribute("disabled", "true");
  clearTrainedBtn.setAttribute("disabled", "true");
  exportTrainingBtn.setAttribute("disabled", "true");
  importTrainingBtn.setAttribute("disabled", "true");
  customSignLabelInput.setAttribute("disabled", "true");

  // Display overlay & reset visual state
  countdownOverlay.style.display = "flex";
  countdownCircleContainer.style.display = "flex";
  countdownStatus.style.display = "block";
  multiShotChoices.style.display = "none";

  for (let shot = 1; shot <= 5; shot++) {
    if (!isMultiShotRunning) break;
    const success = await runShotCountdown(shot);
    if (!success) break;
  }

  // If completed successfully and we have all 5 shots, show Keep/Discard dialog
  if (isMultiShotRunning && tempMultiShotFeatures.length === 5) {
    countdownCircleContainer.style.display = "none";
    countdownStatus.style.display = "none";
    multiShotLabelName.textContent = multiShotLabel.replace(/_/g, " ");
    multiShotChoices.style.display = "flex";
  } else {
    cleanupMultiShot(false);
  }
}

/**
 * Counts down 3 seconds for a specific shot. Pauses if hand is missing.
 */
function runShotCountdown(shot) {
  return new Promise((resolve) => {
    let countdown = 3;

    const tick = () => {
      if (!isMultiShotRunning) {
        resolve(false);
        return;
      }

      countdownNumber.textContent = countdown;
      const handInFrame = activeHandLandmarks && activeHandLandmarks.length > 0;

      let statusHtml = `Get ready for Shot ${shot} of 5`;
      if (!handInFrame) {
        statusHtml += `<br><span class="countdown-warning"><i class="fa-solid fa-hand"></i> Place hand in frame!</span>`;
      }
      countdownStatus.innerHTML = statusHtml;

      if (countdown > 0) {
        if (handInFrame) {
          countdown--;
        }
        multiShotTimeout = setTimeout(tick, 1000);
      } else {
        if (!handInFrame) {
          statusHtml = `Get ready for Shot ${shot} of 5<br><span class="countdown-warning"><i class="fa-solid fa-circle-exclamation"></i> Hold hand steady...</span>`;
          countdownStatus.innerHTML = statusHtml;
          multiShotTimeout = setTimeout(tick, 500);
        } else {
          // Extract features and save to temporary memory
          const landmarks = activeHandLandmarks[0];
          const features = classifier.extractFeatures(landmarks, webcam.videoWidth, webcam.videoHeight);
          if (features) {
            tempMultiShotFeatures.push(features);
            triggerCameraFlash();
            countdownNumber.textContent = "✓";
            countdownStatus.innerHTML = `<span class="countdown-captured">Shot ${shot} Captured!</span>`;
            
            multiShotTimeout = setTimeout(() => {
              resolve(true);
            }, 1000);
          } else {
            // Hand coordinates disappeared at frame boundary
            countdown = 1;
            multiShotTimeout = setTimeout(tick, 500);
          }
        }
      }
    };

    tick();
  });
}

/**
 * Resets all multi-shot state and re-enables UI buttons.
 */
function cleanupMultiShot(clearInput = false) {
  isMultiShotRunning = false;
  if (multiShotTimeout) {
    clearTimeout(multiShotTimeout);
    multiShotTimeout = null;
  }
  tempMultiShotFeatures = [];
  multiShotLabel = "";

  countdownOverlay.style.display = "none";

  multiShotBtn.innerHTML = `<i class="fa-solid fa-hourglass-start"></i> Multi-Shot (5x)`;
  multiShotBtn.className = "btn btn-secondary";

  recordSampleBtn.removeAttribute("disabled");
  multiShotBtn.removeAttribute("disabled");
  clearTrainedBtn.removeAttribute("disabled");
  exportTrainingBtn.removeAttribute("disabled");
  importTrainingBtn.removeAttribute("disabled");
  customSignLabelInput.removeAttribute("disabled");

  if (clearInput) {
    customSignLabelInput.value = "";
  }
}

// Configure Event Listeners
function setupEvents() {
  // Flip camera view button
  toggleCameraBtn.addEventListener("click", async () => {
    deviceStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Switching...`;
    await cameraManager.toggleFacingMode();
    resizeCanvas();
    deviceStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> Camera active`;
  });

  // Threshold controls
  minConfidenceRange.addEventListener("input", (e) => {
    minConfidence = e.target.value / 100;
    confValLabel.textContent = `${e.target.value}%`;
  });

  // Manual speech synthesis triggers
  speakEnglishBtn.addEventListener("click", () => {
    if (currentGesture) {
      const translation = translator.translate(currentGesture);
      speechManager.speak(translation.en, "en");
    }
  });

  speakHindiBtn.addEventListener("click", () => {
    if (currentGesture) {
      const translation = translator.translate(currentGesture);
      speechManager.speak(translation.hi, "hi");
    }
  });

  // Custom Sign Training events
  recordSampleBtn.addEventListener("click", () => {
    const rawLabel = customSignLabelInput.value;
    if (!rawLabel) {
      alert("Please enter a sign label name first!");
      return;
    }

    if (!activeHandLandmarks || activeHandLandmarks.length === 0) {
      alert("No hands detected in the frame! Place your hand in front of the camera.");
      return;
    }

    // Train on the dominant hand visible (hand 0)
    const success = classifier.trainCustomSign(rawLabel, activeHandLandmarks[0], webcam.videoWidth, webcam.videoHeight);
    if (success) {
      customSignLabelInput.value = "";
      renderTrainedSigns();
      
      // Visual flash animation on success
      recordSampleBtn.style.background = "var(--success)";
      setTimeout(() => {
        recordSampleBtn.style.background = "";
      }, 500);
    }
  });

  // Multi-Shot Custom Pose events
  multiShotBtn.addEventListener("click", () => {
    if (isMultiShotRunning) {
      cleanupMultiShot(false);
      return;
    }

    const rawLabel = customSignLabelInput.value;
    if (!rawLabel) {
      alert("Please enter a sign label name first!");
      customSignLabelInput.focus();
      return;
    }

    startMultiShot(rawLabel);
  });

  keepShotsBtn.addEventListener("click", () => {
    if (tempMultiShotFeatures.length === 5 && multiShotLabel) {
      tempMultiShotFeatures.forEach(features => {
        classifier.customSigns.push({ label: multiShotLabel, features });
      });
      classifier.saveCustomSigns();
      renderTrainedSigns();
    }
    cleanupMultiShot(true);
  });

  discardShotsBtn.addEventListener("click", () => {
    cleanupMultiShot(false);
  });

  clearTrainedBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete all trained custom signs?")) {
      classifier.clearCustomSigns();
      renderTrainedSigns();
    }
  });

  // Training mode drawer toggle
  trainingModeBtn.addEventListener("click", () => {
    const isOpen = trainingDrawer.classList.toggle("open");
    trainingModeBtn.classList.toggle("active", isOpen);
  });

  // Letters Mode Toggle
  lettersModeBtn.addEventListener("click", () => {
    lettersOnlyMode = !lettersOnlyMode;
    if (lettersOnlyMode) {
      lettersModeBtn.classList.add("btn-primary");
      lettersModeBtn.classList.remove("btn-secondary");
      lettersModeBtn.innerHTML = `<i class="fa-solid fa-filter"></i><span>Letters Only: ON</span>`;
    } else {
      lettersModeBtn.classList.add("btn-secondary");
      lettersModeBtn.classList.remove("btn-primary");
      lettersModeBtn.innerHTML = `<i class="fa-solid fa-filter"></i><span>Letters Only</span>`;
    }
  });

  // ── Sentence mode toggle ────────────────────────────────────────────────
  sentenceModeBtn.addEventListener("click", () => {
    setSentenceMode(!sentenceModeActive);
  });

  // ── Sentence Speak ──────────────────────────────────────────────────────
  sentenceSpeakBtn.addEventListener("click", () => {
    if (sentenceWords.length === 0) return;
    // Build speakable text: single letters join directly (e.g. H+I → "HI"),
    // phrases use their natural English translation, SPACE tokens become spaces.
    const text = sentenceWords.map(tokenToSpeech).join("");
    speechManager.speak(text.trim(), "en");
  });

  // ── Sentence Undo (remove last word) ───────────────────────────────────
  sentenceUndoBtn.addEventListener("click", () => {
    if (sentenceWords.length === 0) return;
    sentenceWords.pop();
    renderSentenceWords();
  });

  // ── Sentence Clear ──────────────────────────────────────────────────────
  sentenceClearBtn.addEventListener("click", () => {
    sentenceWords = [];
    renderSentenceWords();
    resetSentenceWindow();
  });

  // ── Export training data ────────────────────────────────────────────────
  exportTrainingBtn.addEventListener("click", () => {
    classifier.exportCustomSigns();
  });

  // ── Import training data ────────────────────────────────────────────────
  importTrainingBtn.addEventListener("click", () => {
    // Ask merge or replace before opening file picker
    const shouldReplace = classifier.customSigns.length > 0
      ? !confirm(`You already have ${classifier.customSigns.length} trained sign(s).\n\nClick OK to MERGE (add imported signs to existing ones).\nClick Cancel to REPLACE (delete existing signs and load from file).`)
      : false;

    // Store choice for use in onchange, then open picker
    importFileInput._replace = shouldReplace;
    importFileInput.value = ""; // Reset so same file can be re-imported
    importFileInput.click();
  });

  importFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const merge = !importFileInput._replace;
      const count = await classifier.importCustomSigns(file, merge);
      renderTrainedSigns();

      // Flash the import button green as confirmation
      importTrainingBtn.classList.add("btn-success-flash");
      importTrainingBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${count} signs imported`;
      setTimeout(() => {
        importTrainingBtn.classList.remove("btn-success-flash");
        importTrainingBtn.innerHTML = `<i class="fa-solid fa-file-arrow-up"></i> Import Training`;
      }, 2500);
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  });
}

/**
 * Registers PWA service worker for offline loading capabilities.
 */
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js")
        .then(reg => console.log("Service Worker registered successfully:", reg.scope))
        .catch(err => console.warn("Service Worker registration failed:", err));
    });
  }
}

/**
 * Test Mode: Runs a full system diagnostic without initializing the camera.
 * Checks browser APIs, TTS voices, settings, gesture library, and PWA status.
 */
function runTestMode() {
  const modal = document.getElementById("testModeModal");
  const container = document.getElementById("testModeResults");
  modal.style.display = "block";
  container.innerHTML = "";

  const checks = [];

  // ── Helper to create a result row ──────────────────────────────
  function row(icon, label, status, detail = "") {
    const ok = status === "ok";
    const warn = status === "warn";
    const color = ok ? "var(--success)" : warn ? "var(--warning)" : "var(--danger)";
    const iconClass = ok ? "fa-circle-check" : warn ? "fa-triangle-exclamation" : "fa-circle-xmark";
    return `
      <div style="display:flex;align-items:flex-start;gap:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px 14px;">
        <i class="fa-solid ${iconClass}" style="color:${color};margin-top:2px;flex-shrink:0;"></i>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;color:var(--text-primary);font-size:0.88rem;">${label}</div>
          ${detail ? `<div style="color:var(--text-muted);font-size:0.8rem;margin-top:3px;word-break:break-word;">${detail}</div>` : ""}
        </div>
        <i class="fa-solid ${icon}" style="color:var(--text-muted);flex-shrink:0;margin-top:2px;"></i>
      </div>`;
  }

  // ── 1. Browser & Platform ──────────────────────────────────────
  const ua = navigator.userAgent;
  const platform = navigator.platform || "unknown";
  const isSecure = window.isSecureContext;
  checks.push(row("fa-globe", "Browser / Platform",
    isSecure ? "ok" : "fail",
    `${ua.substring(0, 80)}… | Secure context: ${isSecure ? "✓ Yes (HTTPS/localhost)" : "✗ No — camera will be blocked!"}`
  ));

  // ── 2. Camera API availability (not started, just checking) ────
  const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  checks.push(row("fa-camera", "Camera API (getUserMedia)",
    hasGetUserMedia ? "ok" : "fail",
    hasGetUserMedia
      ? "navigator.mediaDevices.getUserMedia is available"
      : "Not available — camera cannot be started in this browser"
  ));

  // ── 3. Web Speech API ──────────────────────────────────────────
  const hasSpeech = !!window.speechSynthesis;
  let voiceDetail = "speechSynthesis not available in this browser";
  if (hasSpeech) {
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith("en"));
    const hiVoice = voices.find(v => v.lang.startsWith("hi"));
    const voiceCount = voices.length;
    voiceDetail = `${voiceCount} voice(s) loaded. English: ${enVoice ? enVoice.name : "⚠ none found"} | Hindi: ${hiVoice ? hiVoice.name : "⚠ none found"}`;
    checks.push(row("fa-microphone", "Web Speech API (TTS)",
      enVoice ? "ok" : "warn",
      voiceDetail
    ));
  } else {
    checks.push(row("fa-microphone", "Web Speech API (TTS)", "fail", voiceDetail));
  }

  // ── 4. Current Settings ────────────────────────────────────────
  const autoSpeak = autoSpeakToggle.checked;
  const voicePref = voiceSelect.value;
  const confPct = Math.round(minConfidence * 100);
  checks.push(row("fa-sliders", "Settings Snapshot", "ok",
    `Auto-Speak: ${autoSpeak ? "ON" : "OFF"} | Language: ${voicePref} | Min Confidence: ${confPct}%`
  ));

  // ── 5. Gesture Library ─────────────────────────────────────────
  const builtInGestures = classifier.listGestures ? classifier.listGestures() : [];
  const customCount = classifier.customSigns ? classifier.customSigns.length : 0;
  const gestureStatus = builtInGestures.length > 0 || customCount > 0 ? "ok" : "warn";
  checks.push(row("fa-hand", "Gesture Library",
    gestureStatus,
    `Built-in (Fingerpose): ${builtInGestures.length > 0 ? builtInGestures.join(", ") : "loaded (definitions internal)"} | Custom (KNN): ${customCount} sign(s) trained`
  ));

  // ── 6. Translator ──────────────────────────────────────────────
  let translatorOk = false;
  let translatorDetail = "";
  try {
    const testResult = translator.translate("HELLO");
    translatorOk = !!(testResult && testResult.en && testResult.hi);
    translatorDetail = translatorOk
      ? `Test: "HELLO" → EN: "${testResult.en}" | HI: "${testResult.hi}"`
      : `translate("HELLO") returned unexpected result`;
  } catch (e) {
    translatorDetail = `Error: ${e.message}`;
  }
  checks.push(row("fa-language", "Sign Translator", translatorOk ? "ok" : "fail", translatorDetail));

  // ── 7. Service Worker / PWA ────────────────────────────────────
  const hasSW = "serviceWorker" in navigator;
  navigator.serviceWorker?.getRegistration().then(reg => {
    const swActive = !!(reg && reg.active);
    container.insertAdjacentHTML("beforeend", row("fa-mobile-screen", "Service Worker / PWA Offline",
      swActive ? "ok" : "warn",
      swActive ? `Registered & active (scope: ${reg.scope})` : hasSW ? "Service worker not yet registered or still installing" : "Service workers not supported"
    ));
  });

  // ── 8. IndexedDB / Storage (for training data persistence) ─────
  const hasIDB = !!window.indexedDB;
  checks.push(row("fa-database", "Storage (IndexedDB)",
    hasIDB ? "ok" : "warn",
    hasIDB ? "IndexedDB available — training data can be persisted" : "IndexedDB not available — training data will be lost on refresh"
  ));

  // ── 9. WebGL (needed for MediaPipe GPU inference) ──────────────
  let webglStatus = "fail";
  let webglDetail = "WebGL not available — MediaPipe will fall back to CPU";
  try {
    const testCanvas = document.createElement("canvas");
    const gl = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
    if (gl) {
      const renderer = gl.getParameter(gl.RENDERER);
      webglStatus = "ok";
      webglDetail = `WebGL available — Renderer: ${renderer}`;
    }
  } catch (e) { /* ignore */ }
  checks.push(row("fa-microchip", "WebGL (GPU Inference)", webglStatus, webglDetail));

  // ── Render all checks ──────────────────────────────────────────
  container.innerHTML = checks.join("");
}

// Initial Bootstrapping
setupEvents();
renderTrainedSigns();
initializeApp();

// ── Test Mode wiring ─────────────────────────────────────────────
document.getElementById("testModeBtn").addEventListener("click", runTestMode);
document.getElementById("testModeClose").addEventListener("click", () => {
  document.getElementById("testModeModal").style.display = "none";
});
document.getElementById("testModeModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
});

