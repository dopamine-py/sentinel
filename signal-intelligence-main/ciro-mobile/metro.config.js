const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Stub react-native-maps on web (it's native-only)
const WEB_STUB = path.resolve(__dirname, 'src/mocks/react-native-maps.web.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { filePath: WEB_STUB, type: 'sourceFile' };
  }
  // Fall through to default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
