import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: "#175cd3" }}>
      <Tabs.Screen name="index" options={{ title: "홈" }} />
      <Tabs.Screen name="explore" options={{ title: "탐색" }} />
      <Tabs.Screen name="plans" options={{ title: "일정" }} />
      <Tabs.Screen name="community" options={{ title: "커뮤니티" }} />
      <Tabs.Screen name="profile" options={{ title: "내 정보" }} />
      <Tabs.Screen name="today" options={{ href: null }} />
      <Tabs.Screen name="reviews" options={{ href: null }} />
      <Tabs.Screen name="together" options={{ href: null }} />
    </Tabs>
  );
}
