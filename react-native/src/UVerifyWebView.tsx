import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, PermissionsAndroid, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { isAllowed, needsLocation, parseMessage, parseRedirect, type UVerifyResult } from './events';

export interface UVerifyWebViewProps {
  /** A liveness session's, verification link's or address link's `url` (from your server, via the UVerify API). */
  url: string;
  /** The redirect_url you created the session/link with, if any: reaching it also finishes. */
  redirectUrl?: string;
  /** The flow finished. For liveness, pass `result.sessionId` to your server for the face match. */
  onFinish: (result: UVerifyResult) => void;
  /** The person backed out (Android back button), or refused the camera (location, for an address link). */
  onCancel?: (reason: 'back' | 'camera_denied' | 'location_denied') => void;
  /** Extra hosts to allow (always allowed: byteid.ng, uverify.com.ng and their subdomains). */
  allowedHosts?: string[];
  style?: StyleProp<ViewStyle>;
}

/**
 * UVerify's hosted face check, verification link or address link inside your
 * app. The check itself runs on UVerify's page, the same one customers get in
 * a browser, so every anti-spoofing layer applies and improvements reach your
 * app without an update.
 *
 * Face checks need the camera: NSCameraUsageDescription in Info.plist and
 * <uses-permission android:name="android.permission.CAMERA" /> in AndroidManifest.xml.
 * Address links need the location: NSLocationWhenInUseUsageDescription and
 * <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />.
 */
export function UVerifyWebView({ url, redirectUrl, onFinish, onCancel, allowedHosts = [], style }: UVerifyWebViewProps) {
  const location = needsLocation(url);
  const [cameraOk, setCameraOk] = useState(Platform.OS !== 'android');
  const [denied, setDenied] = useState(false);
  const done = useRef(false);
  const hosts = ['byteid.ng', 'uverify.com.ng', ...allowedHosts.map((h) => h.toLowerCase())];

  const finish = useCallback(
    (r: UVerifyResult) => {
      if (done.current) return;
      done.current = true;
      onFinish(r);
    },
    [onFinish],
  );

  // Android: ask for the camera (or location) before the page does: the web view can only use it if the app has it.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    PermissionsAndroid.request(location ? PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION : PermissionsAndroid.PERMISSIONS.CAMERA).then((r) => {
      if (r === PermissionsAndroid.RESULTS.GRANTED) setCameraOk(true);
      else {
        setDenied(true);
        onCancel?.(location ? 'location_denied' : 'camera_denied');
      }
    });
  }, [onCancel, location]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (done.current) return false;
      done.current = true;
      onCancel?.('back');
      return true;
    });
    return () => sub.remove();
  }, [onCancel]);

  const onMessage = (e: WebViewMessageEvent) => {
    const r = parseMessage(e.nativeEvent.data);
    if (r) finish(r);
  };

  const onShouldStart = (req: WebViewNavigation) => {
    const r = parseRedirect(req.url, redirectUrl);
    if (r) {
      finish(r);
      return false;
    }
    return isAllowed(req.url, hosts);
  };

  if (denied) {
    return (
      <View style={[styles.center, style]}>
        <Text style={styles.text}>
          {location ? 'Location access is needed to confirm your address. Allow it in Settings, then try again.' : 'Camera access is needed for the face check. Allow it in Settings, then try again.'}
        </Text>
      </View>
    );
  }
  if (!cameraOk) {
    return (
      <View style={[styles.center, style]}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <WebView
      style={[styles.fill, style]}
      source={{ uri: url }}
      originWhitelist={['https://*']}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={onShouldStart}
      javaScriptEnabled
      domStorageEnabled
      // iOS: camera inside the page, inline (not full-screen), no second prompt from WebKit.
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      // Android: react-native-webview passes the page's camera request through once the app holds CAMERA (asked above).
      // Location (address links): Android web views only share it when enabled; iOS asks with the app's own permission.
      geolocationEnabled={location}
      setSupportMultipleWindows={false}
      startInLoadingState
      renderLoading={() => (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { textAlign: 'center', fontSize: 15, color: '#444' },
});
