// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// .gguf = on-device LLM weight files, used when the model is bundled into
// the APK (see "OPTION A" notes at the bottom of src/pipeline/llm.ts).
config.resolver.assetExts.push('gguf');

module.exports = config;
