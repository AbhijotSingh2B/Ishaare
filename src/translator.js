/**
 * Sign Language Grammar and Text Translator
 * Maps predicted sign tokens (glosses) to fully formed, natural
 * grammatical sentences in English and Hindi (हिंदी).
 */

const DICTIONARY = {
  HELLO: {
    en: "Hello! How are you doing?",
    hi: "नमस्ते! आप कैसे हैं?"
  },
  THANK_YOU: {
    en: "Thank you very much.",
    hi: "आपका बहुत-बहुत धन्यवाद।"
  },
  I_LOVE_YOU: {
    en: "I love you.",
    hi: "मैं आपसे प्यार करता हूँ।"
  },
  YES: {
    en: "Yes, that is correct.",
    hi: "हाँ, यह सही है।"
  },
  NO: {
    en: "No, thank you.",
    hi: "जी नहीं, धन्यवाद।"
  },
  GOOD: {
    en: "That is great!",
    hi: "यह बहुत बढ़िया है!"
  },
  VICTORY: {
    en: "We achieved victory!",
    hi: "हमने जीत हासिल की!"
  },
  HELP: {
    en: "Please help me.",
    hi: "कृपया मेरी मदद करें।"
  },
  
  // Common custom trained sign words translations
  WATER: {
    en: "Water",
    hi: "पानी"
  },
  FOOD: {
    en: "Food",
    hi: "भोजन"
  },
  HOME: {
    en: "Home",
    hi: "घर"
  },
  PLEASE: {
    en: "Please",
    hi: "कृपया"
  },
  STOP: {
    en: "Stop",
    hi: "रुकिए"
  },
  FRIEND: {
    en: "Friend",
    hi: "दोस्त"
  },
  FAMILY: {
    en: "Family",
    hi: "परिवार"
  }
};

export class SignTranslator {
  constructor() {}

  /**
   * Translates a sign code/label into English and Hindi sentences.
   * @param {string} rawLabel - The detected gesture label (e.g. 'HELLO', 'I_LOVE_YOU', or custom).
   * @returns {Object} Translated text outputs `{ en: string, hi: string }`.
   */
  translate(rawLabel) {
    if (!rawLabel) {
      return { en: "", hi: "" };
    }

    const cleanLabel = rawLabel.toUpperCase().trim();

    // Check if the label exists in our curated dictionary
    if (DICTIONARY[cleanLabel]) {
      return DICTIONARY[cleanLabel];
    }

    // Fallback: If it's a custom trained sign not in the dictionary,
    // format the label name nicely and output it.
    const enText = cleanLabel
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase()); // Capitalize words
      
    return {
      en: enText,
      hi: `${enText} (अनुवाद उपलब्ध नहीं है)` // Fallback indicator for Hindi custom label
    };
  }
}
