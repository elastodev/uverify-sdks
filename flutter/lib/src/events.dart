import 'dart:convert';

/// How a UVerify flow ended.
sealed class UVerifyResult {
  const UVerifyResult();
}

/// The face check finished. Send [sessionId] to your server for the face match.
class LivenessResult extends UVerifyResult {
  const LivenessResult(this.sessionId, this.status);
  final String sessionId;

  /// passed, failed or expired.
  final String status;
}

/// A verification link finished.
class KycResult extends UVerifyResult {
  const KycResult(this.id, this.status, this.outcome);
  final String id;
  final String status;
  final String? outcome;
}

/// The page sent the person to your redirect_url.
class RedirectResult extends UVerifyResult {
  const RedirectResult(this.url, this.params);
  final String url;
  final Map<String, String> params;
}

/// The person closed the view, pressed back, or refused the camera.
class UVerifyCancelled extends UVerifyResult {
  const UVerifyCancelled(this.reason);

  /// closed, back or camera_denied.
  final String reason;
}

/// The hosted page's "finished" message, or null if it's something else.
UVerifyResult? parseMessage(String data) {
  Object? m;
  try {
    m = jsonDecode(data);
  } catch (_) {
    return null;
  }
  if (m is! Map || m['source'] != 'uverify') return null;
  if (m['type'] == 'liveness.finished' && m['session_id'] is String) {
    return LivenessResult(m['session_id'] as String, '${m['status']}');
  }
  if (m['type'] == 'kyc.finished' && m['id'] is String) {
    return KycResult(m['id'] as String, '${m['status']}', m['outcome'] as String?);
  }
  return null;
}

/// A navigation to your redirect_url: finish with its query parameters.
UVerifyResult? parseRedirect(String url, String? redirectUrl) {
  if (redirectUrl == null) return null;
  String strip(String u) => u.split('#').first.split('?').first.replaceAll(RegExp(r'/+$'), '');
  if (strip(url) != strip(redirectUrl)) return null;
  final uri = Uri.tryParse(url);
  return RedirectResult(url, uri?.queryParameters ?? const {});
}

/// Only UVerify's pages (and about:blank) may load in the view.
bool isAllowed(String url, List<String> hosts) {
  if (url == 'about:blank') return true;
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https') return false;
  final host = uri.host.toLowerCase();
  return hosts.any((h) => host == h || host.endsWith('.$h'));
}
