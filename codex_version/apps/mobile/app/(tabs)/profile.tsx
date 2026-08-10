import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Screen } from "@/lib/Screen";
import { apiFetch } from "@/lib/api";
import { useMobileSession } from "@/lib/session";

export default function ProfileScreen() {
  const session = useMobileSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pushState, setPushState] = useState("푸시 알림 미등록");

  async function login() {
    try {
      await session.login(email, password);
      setError(null);
    } catch {
      setError("로그인 정보를 확인해 주세요.");
    }
  }

  async function registerPush() {
    if (Platform.OS === "web") {
      setPushState("푸시 토큰은 iOS/Android 실제 기기에서 등록합니다.");
      return;
    }
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      setPushState("알림 권한이 거부되었습니다. 앱은 알림 없이 계속 동작합니다.");
      return;
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) {
      setPushState("EAS projectId가 없어 개발 빌드 토큰 등록은 아직 검증할 수 없습니다.");
      return;
    }
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiFetch("/devices", {
      method: "POST",
      body: JSON.stringify({
        platform: Platform.OS,
        pushToken: token.data,
        locale: "ko-KR",
        appVersion: Constants.expoConfig?.version ?? "0.1.0",
      }),
    });
    setPushState("이 기기의 푸시 토큰을 암호화해 등록했습니다.");
  }

  return (
    <Screen eyebrow="ACCOUNT" title="내 정보" description="보안 저장소에 refresh credential을 보관하고 자동 갱신합니다.">
      {session.status === "authenticated" ? (
        <View style={styles.card}>
          <Text style={styles.name}>{session.user?.displayName}</Text>
          <Text>{session.user?.email}</Text>
          <Text style={styles.secure}>SecureStore 세션 · access token 메모리 전용</Text>
          <Pressable style={styles.secondaryButton} onPress={() => void registerPush()}>
            <Text style={styles.secondaryText}>현장 알림 등록</Text>
          </Pressable>
          <Text style={styles.hint}>{pushState}</Text>
          <Pressable style={styles.button} onPress={() => void session.logout()}>
            <Text style={styles.buttonText}>로그아웃</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="이메일" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="비밀번호" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.button} onPress={() => void login()}>
            <Text style={styles.buttonText}>로그인</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 30, padding: 20, borderRadius: 18, backgroundColor: "white", gap: 12 },
  name: { fontSize: 22, fontWeight: "800" },
  secure: { color: "#067647", fontSize: 12 },
  hint: { color: "#667085", fontSize: 12 },
  input: { minHeight: 48, borderWidth: 1, borderColor: "#d0d5dd", borderRadius: 12, paddingHorizontal: 14 },
  button: { minHeight: 48, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: "#175cd3" },
  buttonText: { color: "white", fontWeight: "800" },
  secondaryButton: { minHeight: 48, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: "#eff4ff" },
  secondaryText: { color: "#175cd3", fontWeight: "800" },
  error: { color: "#b42318" },
});
