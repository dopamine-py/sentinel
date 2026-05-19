// Platform-safe surface for the bundled cinematic demo HTML.
//
//   web    → plain <iframe srcDoc> (react-native-webview is native-only and
//            throws "does not support this platform" on web)
//   native → react-native-webview, required lazily so the web bundle never
//            even loads the native-only module.
//
// Single file + Platform guard — does NOT rely on Metro `.web.js` extension
// resolution (which is unreliable alongside a custom resolveRequest).

import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';

const isWeb = Platform.OS === 'web';

// Lazy native require — never evaluated on web.
let WebViewNative = null;
if (!isWeb) {
  try {
    WebViewNative = require('react-native-webview').WebView;
  } catch (e) {
    WebViewNative = null;
  }
}

export default function DemoSurface({ html, hidden, onReady, onFail, style, onMessage }) {
  if (isWeb) {
    return <WebIframe html={html} hidden={hidden} onReady={onReady} onFail={onFail} style={style} onMessage={onMessage} />;
  }

  if (!WebViewNative) {
    // Extremely unlikely on native, but never crash — let caller fall back.
    return <FailSoon onFail={onFail} />;
  }

  return (
    <WebViewNative
      source={{ html, baseUrl: 'https://localhost' }}
      originWhitelist={['*']}
      style={[{ flex: 1, backgroundColor: 'transparent' }, hidden ? { opacity: 0 } : { opacity: 1 }, style]}
      scrollEnabled={false}
      javaScriptEnabled
      domStorageEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      startInLoadingState={false}
      onLoadEnd={onReady}
      onError={onFail}
      onHttpError={onFail}
      renderError={() => <View />}
      androidLayerType="hardware"
      setSupportMultipleWindows={false}
      onMessage={onMessage}
    />
  );
}

function WebIframe({ html, hidden, onReady, onFail, style, onMessage }) {
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data === 'skip' && onMessage) {
        onMessage({ nativeEvent: { data: 'skip' } });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMessage]);

  useEffect(() => {
    const id = setTimeout(() => onReady && onReady(), 400);
    return () => clearTimeout(id);
  }, [onReady]);

  return React.createElement('iframe', {
    srcDoc: html,
    title: 'Sentinel demo',
    onLoad: () => onReady && onReady(),
    onError: () => onFail && onFail(),
    style: {
      flex: 1,
      width: '100%',
      height: '100%',
      border: 'none',
      background: 'transparent',
      opacity: hidden ? 0 : 1,
      ...(style || {}),
    },
  });
}

function FailSoon({ onFail }) {
  useEffect(() => {
    onFail && onFail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <View style={{ flex: 1 }} />;
}
