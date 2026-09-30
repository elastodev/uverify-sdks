import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import 'events.dart';

/// UVerify's hosted face check (or a verification link) inside your app.
///
/// The check runs on UVerify's page, the same one customers get in a browser,
/// so every anti-spoofing layer applies and improvements reach your app
/// without an update. Needs NSCameraUsageDescription (iOS) and the CAMERA
/// permission (Android).
class UVerifyLivenessView extends StatefulWidget {
  const UVerifyLivenessView({
    super.key,
    required this.url,
    required this.onResult,
    this.redirectUrl,
    this.allowedHosts = const [],
  });

  /// A liveness session's `url`, or a verification link's `url`, from your server.
  final String url;

  /// The redirect_url you created it with, if any: reaching it also finishes.
  final String? redirectUrl;

  /// Called once, when the flow finishes or is cancelled.
  final ValueChanged<UVerifyResult> onResult;

  /// Extra hosts to allow (UVerify's are always allowed; everything else is blocked).
  final List<String> allowedHosts;

  @override
  State<UVerifyLivenessView> createState() => _UVerifyLivenessViewState();
}

class _UVerifyLivenessViewState extends State<UVerifyLivenessView> {
  WebViewController? _controller;
  bool _denied = false;
  bool _done = false;

  List<String> get _hosts => ['uverify.com.ng', ...widget.allowedHosts.map((h) => h.toLowerCase())];

  @override
  void initState() {
    super.initState();
    _start();
  }

  void _finish(UVerifyResult r) {
    if (_done) return;
    _done = true;
    widget.onResult(r);
  }

  Future<void> _start() async {
    // Android: the web view can only use the camera if the app holds the permission.
    if (Platform.isAndroid) {
      final status = await Permission.camera.request();
      if (!status.isGranted) {
        if (mounted) setState(() => _denied = true);
        _finish(const UVerifyCancelled('camera_denied'));
        return;
      }
    }
    final PlatformWebViewControllerCreationParams params = WebViewPlatform.instance is WebKitWebViewPlatform
        // iOS: the camera inside the page, inline, without a second WebKit prompt.
        ? WebKitWebViewControllerCreationParams(allowsInlineMediaPlayback: true, mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{})
        : const PlatformWebViewControllerCreationParams();
    final controller = WebViewController.fromPlatformCreationParams(
      params,
      // The page asks for the camera; the app already has it (or iOS asks the person once).
      onPermissionRequest: (request) => request.grant(),
    )
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel('UVerifyNative', onMessageReceived: (m) {
        final r = parseMessage(m.message);
        if (r != null) _finish(r);
      })
      ..setNavigationDelegate(NavigationDelegate(onNavigationRequest: (req) {
        final r = parseRedirect(req.url, widget.redirectUrl);
        if (r != null) {
          _finish(r);
          return NavigationDecision.prevent;
        }
        return isAllowed(req.url, _hosts) ? NavigationDecision.navigate : NavigationDecision.prevent;
      }))
      ..loadRequest(Uri.parse(widget.url));
    if (mounted) setState(() => _controller = controller);
  }

  @override
  Widget build(BuildContext context) {
    if (_denied) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Camera access is needed for the face check. Allow it in Settings, then try again.', textAlign: TextAlign.center),
        ),
      );
    }
    final c = _controller;
    return PopScope(
      canPop: _done,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _finish(const UVerifyCancelled('back'));
      },
      child: c == null ? const Center(child: CircularProgressIndicator()) : WebViewWidget(controller: c),
    );
  }
}

/// Open the face check (or a verification link) full screen and wait for the result.
class UVerifyLiveness {
  UVerifyLiveness._();

  /// Returns a [LivenessResult] (send its sessionId to your server), a
  /// [KycResult], a [RedirectResult], or [UVerifyCancelled].
  static Future<UVerifyResult> start(BuildContext context, {required String url, String? redirectUrl, List<String> allowedHosts = const [], String title = 'Verify your identity'}) async {
    final result = await Navigator.of(context).push<UVerifyResult>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (ctx) => Scaffold(
          appBar: AppBar(
            title: Text(title),
            leading: IconButton(icon: const Icon(Icons.close), tooltip: 'Close', onPressed: () => Navigator.of(ctx).pop(const UVerifyCancelled('closed'))),
          ),
          body: SafeArea(
            child: UVerifyLivenessView(url: url, redirectUrl: redirectUrl, allowedHosts: allowedHosts, onResult: (r) => Navigator.of(ctx).pop(r)),
          ),
        ),
      ),
    );
    return result ?? const UVerifyCancelled('closed');
  }
}
