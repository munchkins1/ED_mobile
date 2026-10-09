const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite imports its wa-sqlite runtime as a WebAssembly asset.
config.resolver.assetExts.push('wasm');

module.exports = config;
