/**
 * Sign Language Gesture Classifier
 *
 * Primary engine  : Fingerpose GestureEstimator
 *   — Uses curl-angle + finger-direction analysis for high-accuracy recognition
 *   — Returns a confidence score (0–10) per gesture; we only accept ≥ 7.5
 *
 * Fallback engine : K-Nearest Neighbors (KNN) on user-recorded coordinates
 *   — Used ONLY for custom signs that are not in the Fingerpose gesture set
 */

import { GestureEstimator } from "fingerpose";
import { ALL_GESTURES } from "./gestures.js";

export class GestureClassifier {
  constructor() {
    // Minimum fingerpose score to accept a gesture (0–10 scale)
    this.MIN_SCORE = 7.5;

    // Initialize Fingerpose estimator with all gesture definitions
    this.gestureEstimator = new GestureEstimator(ALL_GESTURES);

    // KNN custom training data
    this.customSigns = [];
    this.loadCustomSigns();

    // Automatically load the default training bundle from /training/default-training.json
    this.loadDefaultTraining();
  }

  // ─── Coordinate Converter ─────────────────────────────────────────────────
  /**
   * Converts MediaPipe normalized landmarks [{x,y,z}] (0–1 range) into the
   * pixel-coordinate format [[x,y,z]] that Fingerpose expects.
   *
   * Fingerpose was designed for TensorFlow.js HandPose which returns pixel
   * coordinates. We multiply by 1000 to give it a reasonable pixel-scale
   * number while keeping the relative proportions identical.
   *
   * @param {Array} landmarks  - 21 MediaPipe hand keypoints {x,y,z}
   * @returns {Array}          - 21 keypoints as [[x,y,z]]
   */
  toPixelLandmarks(landmarks) {
    return landmarks.map(pt => [
      pt.x * 1000,
      pt.y * 1000,
      (pt.z || 0) * 1000
    ]);
  }

  // ─── Primary: Fingerpose Classification ──────────────────────────────────
  /**
   * Runs the Fingerpose GestureEstimator on one hand's landmarks.
   * Returns the best-matching gesture name if confidence ≥ MIN_SCORE,
   * or null if no gesture is confident enough.
   *
   * @param {Array} landmarks - 21 MediaPipe hand keypoints {x,y,z}
   * @returns {{ label: string, score: number }|null}
   */
  classifyWithFingerpose(landmarks) {
    if (!landmarks || landmarks.length < 21) return null;

    const pixelLandmarks = this.toPixelLandmarks(landmarks);

    // estimate() returns { gestures: [{name, score}, ...] } sorted by score desc
    const result = this.gestureEstimator.estimate(pixelLandmarks, this.MIN_SCORE);

    if (!result.gestures || result.gestures.length === 0) return null;

    // The estimator already filters by MIN_SCORE and returns sorted results
    const best = result.gestures[0];
    return { label: best.name, score: best.score };
  }

  // ─── Multi-hand: HELP Sign ────────────────────────────────────────────────
  /**
   * Detects the HELP sign which requires two hands simultaneously:
   * one open flat hand (HELLO pose) + one thumbs-up (GOOD pose).
   *
   * @param {Array} hand1  - First hand landmarks
   * @param {Array} hand2  - Second hand landmarks
   * @returns {string|null}
   */
  classifyMultiHand(hand1, hand2) {
    if (!hand1 || !hand2) return null;

    const r1 = this.classifyWithFingerpose(hand1);
    const r2 = this.classifyWithFingerpose(hand2);

    if (!r1 || !r2) return null;

    const labels = new Set([r1.label, r2.label]);
    if (labels.has("HELLO") && labels.has("GOOD")) return "HELP";

    return null;
  }

  // ─── KNN Feature Extraction ───────────────────────────────────────────────
  /**
   * Extracts a scale & translation invariant 60-dim feature vector
   * from hand landmarks for KNN custom sign matching, corrected for aspect ratio.
   *
   * @param {Array} landmarks - 21 MediaPipe hand keypoints
   * @param {number} width - Video width
   * @param {number} height - Video height
   * @returns {number[]|null}
   */
  extractFeatures(landmarks, width = 640, height = 480) {
    if (!landmarks || landmarks.length < 21) return null;
    
    // Scale normalized coordinates by video dimensions to correct aspect-ratio distortion
    const pts = landmarks.map(p => ({
      x: p.x * width,
      y: p.y * height,
      z: (p.z || 0) * width // scale Z same as X
    }));

    const wrist = pts[0];
    const palmSize = Math.hypot(
      pts[9].x - wrist.x,
      pts[9].y - wrist.y,
      pts[9].z - wrist.z
    ) || 1.0;

    const features = [];
    for (let i = 1; i < 21; i++) {
      features.push((pts[i].x - wrist.x) / palmSize);
      features.push((pts[i].y - wrist.y) / palmSize);
      features.push((pts[i].z - wrist.z) / palmSize);
    }
    return features;
  }

  /**
   * Returns a mirrored copy of a feature vector by negating the x-component
   * of every landmark triplet [x, y, z].
   *
   * This is used to make KNN classification device-agnostic: PC webcams and
   * phone front cameras can deliver opposite x-axis orientations depending on
   * whether mirroring is applied in hardware or CSS.
   *
   * @param {number[]} features - 60-dim feature vector from extractFeatures()
   * @returns {number[]}
   */
  mirrorFeatures(features) {
    return features.map((v, i) => (i % 3 === 0 ? -v : v));
  }

  // ─── KNN Classifier (custom signs fallback) ───────────────────────────────
  /**
   * K-Nearest Neighbours classifier for user-recorded custom gestures.
   * Returns the best label if confidence is high enough, else null.
   *
   * @param {number[]} activeFeatures - 60-dim normalised feature vector
   * @param {number}   minConfidence  - 0-100 threshold from UI slider
   * @returns {{ label: string, confidence: number }|null}
   */
  classifyKNN(activeFeatures, minConfidence = 50, lettersOnlyMode = false) {
    if (!activeFeatures || this.customSigns.length === 0) return null;

    // Filter dataset based on mode
    let dataset = this.customSigns;
    if (lettersOnlyMode) {
      dataset = dataset.filter(s => s.label.length === 1 || s.label === "SPACE");
    }

    if (dataset.length === 0) return null;

    // Run KNN against both the original features and their x-mirrored counterpart.
    // This makes recognition device-agnostic: training data recorded on a PC webcam
    // (where the stream is CSS-mirrored) will still match on a phone whose front
    // camera delivers an opposite x-axis orientation, and vice-versa.
    const mirroredFeatures = this.mirrorFeatures(activeFeatures);

    const runKNN = (features) => {
      const K = Math.min(5, dataset.length);
      const distances = dataset.map(sample => {
        let sumSq = 0;
        for (let i = 0; i < features.length; i++) {
          const d = features[i] - sample.features[i];
          sumSq += d * d;
        }
        return { label: sample.label, dist: Math.sqrt(sumSq) };
      });

      distances.sort((a, b) => a.dist - b.dist);
      const nearest = distances.slice(0, K);

      // Vote tally
      const votes = {};
      nearest.forEach(n => { votes[n.label] = (votes[n.label] || 0) + 1; });

      let bestLabel = null, maxVotes = 0;
      for (const [label, count] of Object.entries(votes)) {
        if (count > maxVotes) { maxVotes = count; bestLabel = label; }
      }

      const nearestDist = nearest[0].dist;
      const voteRatio   = maxVotes / K;
      const distConf    = nearestDist < 0.35 ? 1.0 : Math.max(0, 1 - (nearestDist - 0.35) * 1.5);
      const confidence  = Math.round(voteRatio * distConf * 100);

      return { label: bestLabel, confidence };
    };

    const normal   = runKNN(activeFeatures);
    const mirrored = runKNN(mirroredFeatures);

    // Pick whichever orientation produced a better match
    const best = mirrored.confidence > normal.confidence ? mirrored : normal;

    return best.confidence >= minConfidence ? best : null;
  }

  // ─── Custom Sign Training ─────────────────────────────────────────────────
  /** Records a single pose sample for a custom sign label. */
  trainCustomSign(label, landmarks, width = 640, height = 480) {
    const features = this.extractFeatures(landmarks, width, height);
    if (!features) return false;
    const cleanLabel = label.trim().toUpperCase().replace(/\s+/g, "_");
    if (!cleanLabel) return false;
    this.customSigns.push({ label: cleanLabel, features });
    this.saveCustomSigns();
    return true;
  }

  clearCustomSigns() {
    this.customSigns = [];
    localStorage.removeItem("signtalk_custom_signs");
  }

  /**
   * Exports all custom signs as a downloadable .json file.
   * The file is named ishaare-training-YYYY-MM-DD.json.
   *
   * Strategy (tried in order):
   *  1. DOM-attached <a download> — works in desktop browsers & most WebViews
   *  2. navigator.share() with a File — works on Android / iOS Capacitor (share sheet → Save to Files)
   *  3. Copy-to-clipboard modal — absolute fallback so data is NEVER lost
   */
  async exportCustomSigns() {
    if (this.customSigns.length === 0) {
      alert("No custom signs to export. Record some signs first!");
      return;
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: this.customSigns.length,
      signs: this.customSigns
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    const date     = new Date().toISOString().slice(0, 10);
    const fileName = `ishaare-training-${date}.json`;
    const blob     = new Blob([jsonStr], { type: "application/json" });

    // ── Strategy 1: standard DOM-attached anchor download ─────────────────
    try {
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href     = url;
      link.download = fileName;
      // Must be in the DOM for Firefox, Capacitor WebView, etc.
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Give the browser a moment to start the download before revoking
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      return; // success — done
    } catch (_) {
      // fall through to next strategy
    }

    // ── Strategy 2: Web Share API (native Android / iOS share sheet) ──────
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], fileName, { type: "application/json" })] })) {
      try {
        await navigator.share({
          files: [new File([blob], fileName, { type: "application/json" })],
          title: "Ishaare Training Data",
          text: `Training data (${this.customSigns.length} signs) — ${date}`
        });
        return; // user handled it via native share sheet
      } catch (err) {
        if (err.name !== "AbortError") {
          // AbortError = user cancelled, not a real failure — fall through
          console.warn("[Ishaare] navigator.share failed:", err);
        } else {
          return; // user deliberately cancelled — don't show the modal
        }
      }
    }

    // ── Strategy 3: copy-to-clipboard modal (absolute last resort) ────────
    this._showExportFallbackModal(jsonStr, fileName);
  }

  /**
   * Shows a modal with the full JSON so the user can copy it manually.
   * This fires only when both download and share have failed.
   */
  _showExportFallbackModal(jsonStr, fileName) {
    // Remove any previous instance
    const old = document.getElementById("exportFallbackModal");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "exportFallbackModal";
    overlay.style.cssText = [
      "position:fixed", "inset:0", "z-index:99999",
      "background:rgba(0,0,0,0.80)", "backdrop-filter:blur(8px)",
      "display:flex", "align-items:center", "justify-content:center",
      "padding:20px", "box-sizing:border-box"
    ].join(";");

    overlay.innerHTML = `
      <div style="
        background:var(--surface-2,#1e1b2e);
        border:1px solid rgba(168,85,247,0.35);
        border-radius:16px;
        padding:24px;
        max-width:560px;
        width:100%;
        font-family:var(--font-ui,'Inter',sans-serif);
        box-sizing:border-box;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <h3 style="margin:0;font-size:1.1rem;color:var(--text-primary,#fff);display:flex;align-items:center;gap:8px;">
            <i class="fa-solid fa-file-code" style="color:#a855f7;"></i>
            Export Training Data
          </h3>
          <button id="exportModalClose" style="
            background:none;border:none;color:var(--text-muted,#aaa);
            font-size:1.2rem;cursor:pointer;padding:4px 8px;border-radius:6px;
          "><i class="fa-solid fa-xmark"></i></button>
        </div>

        <p style="margin:0 0 10px;font-size:0.85rem;color:var(--text-muted,#aaa);line-height:1.5;">
          Automatic download isn't available in this environment.<br>
          <strong style="color:var(--text-primary,#fff);">Copy the JSON below</strong> and save it as
          <code style="background:rgba(168,85,247,0.15);padding:1px 5px;border-radius:4px;font-size:0.8rem;">${fileName}</code>
        </p>

        <textarea id="exportModalText" readonly style="
          width:100%;height:180px;background:rgba(0,0,0,0.35);
          color:#e0e0e0;border:1px solid rgba(255,255,255,0.1);
          border-radius:8px;padding:10px;font-size:0.72rem;
          font-family:monospace;resize:vertical;box-sizing:border-box;
          line-height:1.4;
        ">${jsonStr.replace(/</g, "&lt;")}</textarea>

        <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
          <button id="exportModalCopy" style="
            flex:1;padding:10px 16px;border:none;border-radius:8px;cursor:pointer;
            background:linear-gradient(135deg,#7c3aed,#a855f7);
            color:#fff;font-weight:600;font-size:0.9rem;
            display:flex;align-items:center;justify-content:center;gap:6px;
          ">
            <i class="fa-solid fa-copy"></i> Copy to Clipboard
          </button>
          <button id="exportModalClose2" style="
            flex:1;padding:10px 16px;border:1px solid rgba(255,255,255,0.15);
            border-radius:8px;cursor:pointer;background:transparent;
            color:var(--text-muted,#aaa);font-size:0.9rem;
          ">Close</button>
        </div>
        <p id="exportModalCopied" style="
          display:none;margin:8px 0 0;text-align:center;
          color:#4ade80;font-size:0.82rem;font-weight:600;
        "><i class="fa-solid fa-circle-check"></i> Copied! Paste into a .json file.</p>
      </div>
    `;

    document.body.appendChild(overlay);

    // Auto-select text in textarea
    const ta = overlay.querySelector("#exportModalText");
    setTimeout(() => { ta.focus(); ta.select(); }, 100);

    // Copy button
    overlay.querySelector("#exportModalCopy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(jsonStr);
      } catch (_) {
        // fallback for older WebViews
        ta.select();
        document.execCommand("copy");
      }
      const msg = overlay.querySelector("#exportModalCopied");
      msg.style.display = "block";
      setTimeout(() => { msg.style.display = "none"; }, 3000);
    });

    // Close buttons
    const closeModal = () => overlay.remove();
    overlay.querySelector("#exportModalClose").addEventListener("click", closeModal);
    overlay.querySelector("#exportModalClose2").addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  }

  /**
   * Imports custom signs from a JSON file produced by exportCustomSigns().
   * @param {File}     file          - The File object from the file input.
   * @param {boolean}  merge         - If true, merges with existing signs. If false, replaces.
   * @returns {Promise<number>}      - Resolves with the count of imported signs.
   */
  importCustomSigns(file, merge = true) {
    return new Promise((resolve, reject) => {
      if (!file || file.type !== "application/json") {
        return reject(new Error("Please select a valid .json file."));
      }

      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);

          // Validate expected structure
          if (!data.signs || !Array.isArray(data.signs)) {
            return reject(new Error("Invalid training file: missing 'signs' array."));
          }

          const validSigns = data.signs.filter(s =>
            s && typeof s.label === "string" && Array.isArray(s.features)
          );

          if (validSigns.length === 0) {
            return reject(new Error("No valid sign entries found in the file."));
          }

          if (merge) {
            // Merge: add new signs, skip duplicates with same label+features
            this.customSigns = [...this.customSigns, ...validSigns];
          } else {
            // Replace: clear existing and load from file
            this.customSigns = validSigns;
          }

          this.saveCustomSigns();
          resolve(validSigns.length);
        } catch (err) {
          reject(new Error("Failed to parse JSON file: " + err.message));
        }
      };

      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsText(file);
    });
  }

  saveCustomSigns() {
    localStorage.setItem("signtalk_custom_signs", JSON.stringify(this.customSigns));
  }

  loadCustomSigns() {
    try {
      const data = localStorage.getItem("signtalk_custom_signs");
      if (data) this.customSigns = JSON.parse(data);
    } catch (e) {
      console.error("Failed to load custom signs:", e);
      this.customSigns = [];
    }
  }

  /**
   * Fetches /training/default-training.json and merges any signs it contains
   * into customSigns. Runs silently — errors and empty files are ignored.
   *
   * To use: put your exported training file at:
   *   training/default-training.json
   * (same format as files produced by exportCustomSigns)
   */
  async loadDefaultTraining() {
    try {
      const res = await fetch("/training/default-training.json");
      if (!res.ok) return; // file not found or server error — skip silently

      const data = await res.json();
      if (!data.signs || !Array.isArray(data.signs) || data.signs.length === 0) return;

      const validSigns = data.signs.filter(
        s => s && typeof s.label === "string" && Array.isArray(s.features)
      );
      if (validSigns.length === 0) return;

      // Merge: only add signs whose label+features combo isn't already present
      // (prevents duplicates when the page is refreshed)
      const existingSet = new Set(
        this.customSigns.map(s => `${s.label}|${s.features.join(",")}`)
      );

      let added = 0;
      validSigns.forEach(s => {
        const key = `${s.label}|${s.features.join(",")}`;
        if (!existingSet.has(key)) {
          this.customSigns.push(s);
          existingSet.add(key);
          added++;
        }
      });

      if (added > 0) {
        this.saveCustomSigns();
        console.log(`[SignTalk] Auto-loaded ${added} sign(s) from training/default-training.json`);
      }
    } catch (e) {
      // Network error, bad JSON, etc. — fail silently so the app still starts
      console.warn("[SignTalk] Could not load default training file:", e.message);
    }
  }
}
