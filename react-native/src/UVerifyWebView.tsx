import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, PermissionsAndroid, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { isAllowed, parseMessage, parseRedirect, type UVerifyResult } from './events';

export interface UVerifyWebViewProps {
  /** A liveness session's `url`, or a verification link's `url` (from your server, via the UVerify API). */
  url: string;
  /** The redirect_url you created the session/link with, if any: reaching it also finishes. */
  redirectUrl?: string;
  /** The flow finished. For liveness, pass `result.sessionId` to your server for the face match. */
  onFinish: (result: UVerifyResult) => void;
  /** The person backed out (Android back button) or refused the camera. */
  onCancel?: (reason: 'back' | 'camera_denied') => void;
  /** Extra hosts to allow (default: uverify.com.ng and its subdomains). */
  allowedHosts?: string[];
  style?: StyleProp<ViewStyle>;
}

/**
 * UVerify's hosted face check (or a verification link) inside your app. The
 * check itself runs on UVerify's page, the same one customers get in a
 * browser, so every anti-spoofing layer applies and improvements reach your
 * app without an update.
 *
 * Needs the camera permission: add NSCameraUsageDescription to Info.plist and
 * <uses-permission android:name="android.permission.CAMERA" /> to AndroidManifest.xml.
 */
export function UVerifyWebView({ url, redirectUrl, onFinish, onCancel, allowedHosts = [], style }: UVerifyWebViewProps) {
  const [cameraOk, setCameraOk] = useState(Platform.OS !== 'android');
  const [denied, setDenied] = useState(false);
  const done = useRef(false);
  const hosts = ['uverify.com.ng', ...allowedHosts.map((h) => h.toLowerCase())];

  const finish = useCallback(
    (r: UVerifyResult) => {
      if (done.current) return;
      done.current = true;
      onFinish(r);
    },
    [onFinish],
  );

  // Android: ask for the camera before the page does (the web view can only use it if the app has it).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA).then((r) => {
      if (r === PermissionsAndroid.RESULTS.GRANTED) setCameraOk(true);
      else {
        setDenied(true);
        onCancel?.('camera_denied');
      }
    });
  }, [onCancel]);

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
        <Text style={styles.text}>Camera access is needed for the face check. Allow it in Settings, then try again.</Text>
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
