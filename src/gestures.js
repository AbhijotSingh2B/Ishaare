/**
 * Custom Gesture Definitions for Fingerpose
 *
 * Each gesture is declared using:
 *   - addCurl(finger, curl, weight)      — how curled the finger must be
 *   - addDirection(finger, dir, weight)  — which direction the finger must point
 *
 * FingerCurl values:  NoCurl(0), HalfCurl(1), FullCurl(2)
 * FingerDirection:    VerticalUp(0), VerticalDown(1), HorizontalLeft(2),
 *                     HorizontalRight(3), DiagonalUpRight(4), DiagonalUpLeft(5)
 *
 * Weight 1.0 = required, lower = optional / soft constraint
 */

import {
  GestureDescription,
  Finger,
  FingerCurl,
  FingerDirection,
  Gestures as BuiltInGestures
} from "fingerpose";

// ─── HELLO (Open / Wave hand) ────────────────────────────────────────────────
// All four fingers extended upward, thumb open to the side
const helloGesture = new GestureDescription("HELLO");
for (const finger of [Finger.Index, Finger.Middle, Finger.Ring, Finger.Pinky]) {
  helloGesture.addCurl(finger, FingerCurl.NoCurl, 1.0);
  helloGesture.addDirection(finger, FingerDirection.VerticalUp, 0.9);
  helloGesture.addDirection(finger, FingerDirection.DiagonalUpLeft, 0.6);
  helloGesture.addDirection(finger, FingerDirection.DiagonalUpRight, 0.6);
}
helloGesture.addCurl(Finger.Thumb, FingerCurl.NoCurl, 0.5);

// ─── YES (Fist) ───────────────────────────────────────────────────────────────
// All fingers fully curled into a fist
const yesGesture = new GestureDescription("YES");
for (const finger of [Finger.Index, Finger.Middle, Finger.Ring, Finger.Pinky]) {
  yesGesture.addCurl(finger, FingerCurl.FullCurl, 1.0);
}
yesGesture.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.5);

// ─── GOOD (Thumbs Up) ─────────────────────────────────────────────────────────
// Thumb extended vertically upward; all other fingers fully curled
// Use the built-in Fingerpose ThumbsUpGesture with a renamed label
const goodGesture = new GestureDescription("GOOD");
goodGesture.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
goodGesture.addDirection(Finger.Thumb, FingerDirection.VerticalUp, 1.0);
goodGesture.addDirection(Finger.Thumb, FingerDirection.DiagonalUpLeft, 0.6);
goodGesture.addDirection(Finger.Thumb, FingerDirection.DiagonalUpRight, 0.6);
for (const finger of [Finger.Index, Finger.Middle, Finger.Ring, Finger.Pinky]) {
  goodGesture.addCurl(finger, FingerCurl.FullCurl, 1.0);
}

// ─── I LOVE YOU ──────────────────────────────────────────────────────────────
// Thumb + Index + Pinky extended; Middle + Ring fully curled
const iLoveYouGesture = new GestureDescription("I_LOVE_YOU");
iLoveYouGesture.addCurl(Finger.Thumb, FingerCurl.NoCurl, 1.0);
iLoveYouGesture.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
iLoveYouGesture.addDirection(Finger.Index, FingerDirection.VerticalUp, 0.9);
iLoveYouGesture.addDirection(Finger.Index, FingerDirection.DiagonalUpLeft, 0.6);
iLoveYouGesture.addDirection(Finger.Index, FingerDirection.DiagonalUpRight, 0.6);
iLoveYouGesture.addCurl(Finger.Middle, FingerCurl.FullCurl, 1.0);
iLoveYouGesture.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
iLoveYouGesture.addCurl(Finger.Pinky, FingerCurl.NoCurl, 1.0);
iLoveYouGesture.addDirection(Finger.Pinky, FingerDirection.VerticalUp, 0.9);
iLoveYouGesture.addDirection(Finger.Pinky, FingerDirection.DiagonalUpLeft, 0.6);
iLoveYouGesture.addDirection(Finger.Pinky, FingerDirection.DiagonalUpRight, 0.6);

// ─── NO (Pointing Index Finger) ───────────────────────────────────────────────
// Index finger extended, all others fully curled
const noGesture = new GestureDescription("NO");
noGesture.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
noGesture.addDirection(Finger.Index, FingerDirection.VerticalUp, 1.0);
noGesture.addDirection(Finger.Index, FingerDirection.DiagonalUpLeft, 0.6);
noGesture.addDirection(Finger.Index, FingerDirection.DiagonalUpRight, 0.6);
for (const finger of [Finger.Middle, Finger.Ring, Finger.Pinky]) {
  noGesture.addCurl(finger, FingerCurl.FullCurl, 1.0);
}
noGesture.addCurl(Finger.Thumb, FingerCurl.HalfCurl, 0.5);

// ─── VICTORY (Peace Sign / V) ─────────────────────────────────────────────────
// Index + Middle extended upward; Ring + Pinky fully curled
// Uses Fingerpose's built-in VictoryGesture but redefined for label consistency
const victoryGesture = new GestureDescription("VICTORY");
victoryGesture.addCurl(Finger.Index, FingerCurl.NoCurl, 1.0);
victoryGesture.addDirection(Finger.Index, FingerDirection.VerticalUp, 1.0);
victoryGesture.addDirection(Finger.Index, FingerDirection.DiagonalUpLeft, 0.7);
victoryGesture.addDirection(Finger.Index, FingerDirection.DiagonalUpRight, 0.7);
victoryGesture.addCurl(Finger.Middle, FingerCurl.NoCurl, 1.0);
victoryGesture.addDirection(Finger.Middle, FingerDirection.VerticalUp, 1.0);
victoryGesture.addDirection(Finger.Middle, FingerDirection.DiagonalUpLeft, 0.7);
victoryGesture.addDirection(Finger.Middle, FingerDirection.DiagonalUpRight, 0.7);
victoryGesture.addCurl(Finger.Ring, FingerCurl.FullCurl, 1.0);
victoryGesture.addCurl(Finger.Pinky, FingerCurl.FullCurl, 1.0);

// ─── Export all gesture definitions ──────────────────────────────────────────
export const ALL_GESTURES = [
  iLoveYouGesture,  // Most specific first (prevents subset matches)
  goodGesture,
  yesGesture,
  victoryGesture,
  noGesture,
  helloGesture,
];
