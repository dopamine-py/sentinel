// Web stub for react-native-maps — not supported in browser
// Returns no-op components so the app bundles cleanly for web testing
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const Stub = () => (
  <View style={styles.stub}>
    <Text style={styles.icon}>🗺</Text>
    <Text style={styles.text}>Map view is available on the Android app only.</Text>
    <Text style={styles.sub}>Install the APK to see the live crisis map with rerouting.</Text>
  </View>
);

const styles = StyleSheet.create({
  stub:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0d1a', padding: 30 },
  icon:  { fontSize: 48, marginBottom: 16 },
  text:  { color: '#e2e4ef', fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  sub:   { color: '#8b90a7', fontSize: 13, textAlign: 'center' },
});

export default Stub;
export const Marker   = () => null;
export const Polyline = () => null;
export const PROVIDER_GOOGLE = null;
