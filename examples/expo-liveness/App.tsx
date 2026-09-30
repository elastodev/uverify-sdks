import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { UVerifyWebView, type UVerifyResult } from '@uverifyng/react-native-liveness';
import { ApiError, createClient, type Client, type KycLink, type LivenessSession, type Verification } from './src/uverify';

// Where the hosted page sends the person when they finish. <UVerifyWebView>
// catches it before it loads, so it never needs to exist.
const RETURN_URL = 'https://uverify.com.ng/app-return';

type Screen =
  | { name: 'home' }
  | { name: 'check'; kind: 'liveness' | 'link'; id: string; url: string }
  | { name: 'liveness'; id: string; note?: string }
  | { name: 'link'; id: string; note?: string };

export default function App() {
  const [apiKey, setApiKey] = useState(process.env.EXPO_PUBLIC_UVERIFY_API_KEY ?? '');
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const client = apiKey.startsWith('uvk_') ? createClient(apiKey.trim()) : null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {screen.name === 'check' ? (
          <CheckScreen screen={screen} onDone={setScreen} />
        ) : (
          <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
              <Text style={styles.title}>UVerify demo</Text>
              <Text style={styles.warn}>
                Demo only: this app calls the API with your key. In a real app, keep the key on your server and send the app only the session url.
              </Text>
              {screen.name === 'home' && <Home client={client} apiKey={apiKey} setApiKey={setApiKey} go={setScreen} />}
              {screen.name === 'liveness' && client && <LivenessResult client={client} screen={screen} go={setScreen} />}
              {screen.name === 'link' && client && <LinkResult client={client} screen={screen} go={setScreen} />}
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// The hosted UVerify page, inside the app.
function CheckScreen({ screen, onDone }: { screen: Extract<Screen, { name: 'check' }>; onDone: (s: Screen) => void }) {
  const next = (note?: string): Screen => ({ name: screen.kind, id: screen.id, note });
  return (
    <View style={styles.fill}>
      <View style={styles.bar}>
        <Pressable onPress={() => onDone(next('You closed the check.'))} hitSlop={12}>
          <Text style={styles.barButton}>Close</Text>
        </Pressable>
        <Text style={styles.barTitle}>{screen.kind === 'liveness' ? 'Face check' : 'Verification link'}</Text>
        <View style={{ width: 44 }} />
      </View>
      <UVerifyWebView
        url={screen.url}
        redirectUrl={RETURN_URL}
        onFinish={(r: UVerifyResult) => onDone(next(r.type === 'redirect' ? undefined : `The page said: ${r.status}`))}
        onCancel={(reason) => onDone(next(reason === 'camera_denied' ? 'Camera access was refused.' : 'You went back.'))}
      />
    </View>
  );
}

function Home({ client, apiKey, setApiKey, go }: { client: Client | null; apiKey: string; setApiKey: (k: string) => void; go: (s: Screen) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'liveness' | 'link' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async (kind: 'liveness' | 'link') => {
    if (!client) return;
    setBusy(kind);
    setError(null);
    try {
      const s = kind === 'liveness' ? await client.createSession(RETURN_URL) : await client.createLink(name, RETURN_URL);
      // A local UVerify gives http://localhost pages: a phone can't reach them, and the camera only works on https.
      if (!s.url.startsWith('https://')) {
        setError(`The check page is ${s.url.split('/').slice(0, 3).join('/')}, which can't open in the app: the camera needs https. Use a sandbox key from uverify.com.ng and remove EXPO_PUBLIC_UVERIFY_BASE_URL.`);
        return;
      }
      go({ name: 'check', kind, id: s.id, url: s.url });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card title="API key">
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="uvk_test_…"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Text style={styles.hint}>
          {client ? `${client.environment === 'live' ? 'Live' : 'Sandbox'} key.` : 'Paste a sandbox key from your dashboard, or set EXPO_PUBLIC_UVERIFY_API_KEY in .env.local.'}
          {client?.environment === 'live' ? ' Live checks are charged.' : ''}
        </Text>
      </Card>

      <Card title="Face check">
        <Text style={styles.body}>Opens UVerify’s liveness check. When it passes, match the face to a NIN or BVN photo.</Text>
        <Button label="Start face check" onPress={() => start('liveness')} disabled={!client} busy={busy === 'liveness'} />
      </Card>

      <Card title="Verification link">
        <Text style={styles.body}>The full no-code flow: the person enters their ID, does the face check, and the match runs.</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Customer name (optional)" />
        <Button label="Open verification link" onPress={() => start('link')} disabled={!client} busy={busy === 'link'} secondary />
      </Card>

      {error && <Text style={styles.error}>{error}</Text>}
    </>
  );
}

function LivenessResult({ client, screen, go }: { client: Client; screen: Extract<Screen, { name: 'liveness' }>; go: (s: Screen) => void }) {
  const [session, setSession] = useState<LivenessSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Sandbox: start with the test person filled in.
  const sandbox = client.environment === 'test';
  const [idType, setIdType] = useState<'nin' | 'bvn'>('nin');
  const [idNumber, setIdNumber] = useState(sandbox ? SANDBOX.nin : '');
  const [firstName, setFirstName] = useState(sandbox ? SANDBOX.firstName : '');
  const [lastName, setLastName] = useState(sandbox ? SANDBOX.lastName : '');
  const chooseType = (t: 'nin' | 'bvn') => {
    setIdType(t);
    // Swap in the other test number, keeping the result (last two digits) you picked.
    if (sandbox && /^\d{11}$/.test(idNumber)) setIdNumber(SANDBOX[t].slice(0, 9) + idNumber.slice(9));
  };
  const [match, setMatch] = useState<Verification | null>(null);

  // What the page told the app is only a hint: read the real result from the API.
  const load = useCallback(async () => {
    setError(null);
    try {
      setSession(await client.getSession(screen.id));
    } catch (e) {
      setError(message(e));
    }
  }, [client, screen.id]);
  useEffect(() => void load(), [load]);

  const simulate = async () => {
    setBusy(true);
    try {
      setSession(await client.simulate(screen.id, 'passed'));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const runMatch = async () => {
    setBusy(true);
    setError(null);
    try {
      setMatch(await client.faceMatch({ idType, idNumber: idNumber.trim(), firstName: firstName.trim(), lastName: lastName.trim(), sessionId: screen.id }));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card title="Face check result">
        {screen.note && <Text style={styles.hint}>{screen.note}</Text>}
        {!session && !error && <ActivityIndicator style={{ marginVertical: 12 }} />}
        {session && (
          <>
            <Status value={session.status} />
            <Row label="Live" value={session.live ? 'Yes' : 'No'} />
            <Row label="Score" value={session.score == null ? '—' : String(session.score)} />
            <Row label="Attempts" value={`${session.attempts} of ${session.max_attempts}`} />
            {session.reasons.length > 0 && <Row label="Reasons" value={session.reasons.join(', ')} />}
            {session.status === 'pending' && client.environment === 'test' && (
              <Button label="Simulate a pass (sandbox)" onPress={simulate} busy={busy} secondary />
            )}
          </>
        )}
        <Button label="Refresh" onPress={load} secondary />
      </Card>

      {session?.usable_for_face_match && !match && (
        <Card title="Match to an ID">
          <View style={styles.segment}>
            {(['nin', 'bvn'] as const).map((t) => (
              <Pressable key={t} onPress={() => chooseType(t)} style={[styles.segmentItem, idType === t && styles.segmentOn]}>
                <Text style={[styles.segmentText, idType === t && styles.segmentTextOn]}>{t.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={styles.input} value={idNumber} onChangeText={setIdNumber} placeholder={`${idType.toUpperCase()} (11 digits)`} keyboardType="number-pad" maxLength={11} />
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder={`First name${idType === 'nin' ? ' (optional)' : ''}`} />
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder={`Last name${idType === 'nin' ? ' (optional)' : ''}`} />
          {sandbox && (
            <>
              <Text style={styles.hint}>Sandbox test person. The last two digits pick the result:</Text>
              <View style={styles.chips}>
                {SANDBOX_OUTCOMES.map((o) => {
                  const number = o.suffix ? SANDBOX[idType].slice(0, 9) + o.suffix : SANDBOX[idType];
                  return (
                    <Pressable key={o.label} onPress={() => setIdNumber(number)} style={[styles.chip, idNumber === number && styles.chipOn]}>
                      <Text style={[styles.chipText, idNumber === number && styles.chipTextOn]}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          <Button label="Run face match" onPress={runMatch} busy={busy} disabled={idNumber.trim().length !== 11} />
        </Card>
      )}

      {match && (
        <Card title="Face match">
          <Status value={match.status} />
          <Row label="Face" value={match.face_match ? `${match.face_match.status}${match.face_match.score != null ? ` (${match.face_match.score})` : ''}` : '—'} />
          {match.data && <Row label="Name" value={[match.data.first_name, match.data.last_name].filter(Boolean).join(' ') || '—'} />}
          {match.field_matches &&
            Object.entries(match.field_matches).map(([k, v]) => <Row key={k} label={k.replace(/_/g, ' ')} value={v ? 'Matched' : 'Different'} />)}
        </Card>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      <Button label="Start again" onPress={() => go({ name: 'home' })} secondary />
    </>
  );
}

function LinkResult({ client, screen, go }: { client: Client; screen: Extract<Screen, { name: 'link' }>; go: (s: Screen) => void }) {
  const [link, setLink] = useState<KycLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLink(await client.getLink(screen.id));
    } catch (e) {
      setError(message(e));
    }
  }, [client, screen.id]);
  useEffect(() => void load(), [load]);

  const fm = link?.verification?.face_match;
  return (
    <>
      <Card title="Verification link result">
        {screen.note && <Text style={styles.hint}>{screen.note}</Text>}
        {!link && !error && <ActivityIndicator style={{ marginVertical: 12 }} />}
        {link && (
          <>
            <Status value={link.outcome ?? link.status} />
            <Row label="Status" value={link.status} />
            <Row label="ID type" value={link.id_type?.toUpperCase() ?? '—'} />
            <Row label="Face" value={fm ? `${fm.status}${fm.score != null ? ` (${fm.score})` : ''}` : '—'} />
          </>
        )}
        <Button label="Refresh" onPress={load} secondary />
      </Card>
      {error && <Text style={styles.error}>{error}</Text>}
      <Button label="Start again" onPress={() => go({ name: 'home' })} secondary />
    </>
  );
}

// The sandbox's test person. Any 11 digits work; only the last two matter.
const SANDBOX = { nin: '12345678901', bvn: '22212345678', firstName: 'Adaeze', lastName: 'Okafor' };
const SANDBOX_OUTCOMES = [
  { suffix: '', label: 'Verified' },
  { suffix: '98', label: 'Face mismatch' },
  { suffix: '00', label: 'Not found' },
  { suffix: '99', label: 'Registry error' },
];

const message = (e: unknown) => (e instanceof ApiError ? `${e.message} (${e.code})` : e instanceof Error ? e.message : 'Something went wrong.');

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const GOOD = ['passed', 'verified', 'matched', 'completed'];
const BAD = ['failed', 'expired', 'not_found', 'not_matched', 'face_mismatch', 'liveness_failed', 'error', 'document_rejected', 'document_mismatch'];
function Status({ value }: { value: string }) {
  const tone = GOOD.includes(value) ? styles.good : BAD.includes(value) ? styles.bad : styles.pending;
  return (
    <View style={[styles.status, tone]}>
      <Text style={styles.statusText}>{value.replace(/_/g, ' ')}</Text>
    </View>
  );
}

function Button({ label, onPress, disabled, busy, secondary }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, (disabled || busy) && styles.buttonDisabled, pressed && { opacity: 0.8 }]}
    >
      {busy ? <ActivityIndicator color={secondary ? INK : '#fff'} /> : <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>}
    </Pressable>
  );
}

const INK = '#0f172a';
const BRAND = '#0f766e';
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  fill: { flex: 1 },
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: INK, marginTop: 8 },
  warn: { fontSize: 13, lineHeight: 18, color: '#92400e', backgroundColor: '#fef3c7', padding: 10, borderRadius: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { fontSize: 17, fontWeight: '600', color: INK },
  body: { fontSize: 14, lineHeight: 20, color: '#475569' },
  hint: { fontSize: 13, lineHeight: 18, color: '#64748b' },
  error: { fontSize: 14, color: '#b91c1c', backgroundColor: '#fee2e2', padding: 10, borderRadius: 8 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: INK, backgroundColor: '#fff' },
  button: { backgroundColor: BRAND, borderRadius: 8, paddingVertical: 13, alignItems: 'center', minHeight: 46, justifyContent: 'center' },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: INK },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 14, color: '#64748b', textTransform: 'capitalize' },
  rowValue: { fontSize: 14, color: INK, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  status: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 13, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },
  good: { backgroundColor: '#15803d' },
  bad: { backgroundColor: '#b91c1c' },
  pending: { backgroundColor: '#a16207' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontSize: 13, fontWeight: '600', color: INK },
  chipTextOn: { color: '#fff' },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, overflow: 'hidden' },
  segmentItem: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentOn: { backgroundColor: BRAND },
  segmentText: { fontWeight: '600', color: INK },
  segmentTextOn: { color: '#fff' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  barButton: { fontSize: 16, color: BRAND, fontWeight: '600' },
  barTitle: { fontSize: 16, fontWeight: '600', color: INK },
});
