import type { components } from "@metrotrip/contracts";
import { Screen } from "@/lib/Screen";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type Review = components["schemas"]["ReviewSummary"];
export default function ReviewsScreen() { const [items, setItems] = useState<Review[]>([]); const [error, setError] = useState(false); useEffect(() => { void apiFetch<components["schemas"]["ReviewPage"]>("/reviews?limit=20").then((data) => setItems(data.items)).catch(() => setError(true)); }, []); return <Screen eyebrow="TRAVEL STORIES" title="여행 후기" description="다른 여행자의 천안·아산 기록을 둘러보세요.">{error ? <Text style={styles.error}>후기를 불러오지 못했습니다.</Text> : null}{items.map((review) => <View style={styles.card} key={review.id}><Text style={styles.route}>{review.originStationName} → {review.destinationStationName}</Text><Text style={styles.title}>{review.title}</Text><Text numberOfLines={2}>{review.excerpt}</Text><View style={styles.stats}><Text>★ {review.rating}</Text><Text>♥ {review.likeCount}</Text></View></View>)}</Screen>; }
const styles = StyleSheet.create({ error: { marginTop: 24, color: "#b42318" }, card: { marginTop: 14, padding: 18, borderRadius: 16, backgroundColor: "white" }, route: { color: "#175cd3", fontSize: 12, fontWeight: "800" }, title: { fontSize: 19, fontWeight: "800", marginVertical: 10 }, stats: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 }, });
