import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:uverify_liveness/uverify_liveness.dart';

void main() {
  group('messages from the hosted page', () {
    test('liveness and verification-link results', () {
      final l = parseMessage(jsonEncode({'source': 'uverify', 'type': 'liveness.finished', 'session_id': 's1', 'status': 'passed'}));
      expect(l, isA<LivenessResult>());
      expect((l as LivenessResult).sessionId, 's1');
      expect(l.status, 'passed');
      final k = parseMessage(jsonEncode({'source': 'uverify', 'type': 'kyc.finished', 'id': 'k1', 'status': 'completed', 'outcome': 'verified'}));
      expect((k as KycResult).outcome, 'verified');
    });
    test('ignores anything else', () {
      expect(parseMessage('not json'), isNull);
      expect(parseMessage(jsonEncode({'type': 'liveness.finished', 'session_id': 's1'})), isNull);
      expect(parseMessage(jsonEncode({'source': 'uverify', 'type': 'other'})), isNull);
    });
  });

  group('redirects', () {
    test('your redirect_url finishes, with its parameters', () {
      final r = parseRedirect('https://yourapp.com/kyc/done?liveness_session_id=s1&status=passed&reference=a%20b', 'https://yourapp.com/kyc/done');
      expect((r as RedirectResult).params, {'liveness_session_id': 's1', 'status': 'passed', 'reference': 'a b'});
      expect(parseRedirect('https://yourapp.com/kyc/done/?x=1', 'https://yourapp.com/kyc/done'), isNotNull);
    });
    test('other pages do not', () {
      expect(parseRedirect('https://uverify.com.ng/liveness/s1', 'https://yourapp.com/kyc/done'), isNull);
      expect(parseRedirect('https://yourapp.com/kyc/done', null), isNull);
    });
  });

  test('only UVerify over https', () {
    const hosts = ['uverify.com.ng'];
    expect(isAllowed('https://uverify.com.ng/liveness/s1#tok', hosts), isTrue);
    expect(isAllowed('https://api.uverify.com.ng/v1/x', hosts), isTrue);
    expect(isAllowed('about:blank', hosts), isTrue);
    expect(isAllowed('http://uverify.com.ng/', hosts), isFalse);
    expect(isAllowed('https://evil-uverify.com.ng.attacker.io/', hosts), isFalse);
    expect(isAllowed('https://notuverify.com.ng/', hosts), isFalse);
  });
}
