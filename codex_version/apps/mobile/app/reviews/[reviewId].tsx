import type { components } from "@metrotrip/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Screen } from "@/lib/Screen";
import { apiFetch } from "@/lib/api";
import { useMobileSession } from "@/lib/session";

type Review = components["schemas"]["ReviewDetail"];

export default function ReviewDetailScreen() {
  const router = useRouter();
  const { reviewId } = useLocalSearchParams<{ reviewId: string }>();
  const { status } = useMobileSession();
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setReview(await apiFetch<Review>(`/reviews/${reviewId}`)); setError(null); } catch { setError("후기 상세를 불러오지 못했습니다."); }
  }, [reviewId]);
  useEffect(() => { void load(); }, [load]);

  async function toggleLike() {
    if (!review) return;
    if (status !== "authenticated") { setError("좋아요는 로그인 후 사용할 수 있습니다."); return; }
    try {
      const result = await apiFetch<components["schemas"]["ReviewLikeResponse"]>(`/reviews/${review.id}/like`, { method: review.likedByMe ? "DELETE" : "PUT" });
      setReview({ ...review, likedByMe: result.liked, likeCount: result.likeCount });
    } catch { setError("좋아요 상태를 변경하지 못했습니다."); }
  }

  return <Screen eyebrow="TRAVEL STORY" title={review?.title ?? "후기 상세"} description={review ? `${review.originStationName} → ${review.destinationStationName} · ${review.travelDate}` : "여행 기록을 불러오는 중입니다."}>
    <Pressable style={styles.back} onPress={() => router.back()}><Text style={styles.backText}>← 커뮤니티</Text></Pressable>
    {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>다시 시도</Text></Pressable></View> : null}
    {review ? <View style={styles.document}><View style={styles.byline}><Text style={styles.author}>{review.authorName}</Text><Text>★ {review.rating} · 조회 {review.viewCount}</Text></View>{review.blocks.map((block, index) => block.kind === "IMAGE" ? (() => { const media = review.media.find((item) => item.id === block.mediaId); return media ? <Image accessibilityLabel={block.altText ?? "후기 이미지"} style={styles.image} resizeMode="cover" source={{ uri: media.url }} key={`${block.kind}-${index}`} /> : null; })() : <Text style={styles.paragraph} key={`${block.kind}-${index}`}>{block.text}</Text>)}<View style={styles.tags}>{review.tags.map((tag) => <Text style={styles.tag} key={tag}>#{tag}</Text>)}</View><View style={styles.actions}><Pressable accessibilityRole="button" accessibilityState={{ selected: review.likedByMe }} style={[styles.action, review.likedByMe && styles.actionActive]} onPress={() => void toggleLike()}><Text style={review.likedByMe ? styles.actionActiveText : styles.actionText}>♥ {review.likeCount}</Text></Pressable><Pressable style={styles.action} onPress={() => void Share.share({ message: `MetroTrip 후기: ${review.title}\nmetrotrip://reviews/${review.id}` })}><Text style={styles.actionText}>공유</Text></Pressable></View></View> : null}
  </Screen>;
}

const styles = StyleSheet.create({ back: { minHeight: 44, justifyContent: "center", marginTop: 18 }, backText: { color: "#175cd3", fontWeight: "900" }, error: { marginTop: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", borderRadius: 12, backgroundColor: "#fef3f2" }, errorText: { color: "#b42318" }, retry: { color: "#175cd3", fontWeight: "900" }, document: { marginTop: 16, padding: 20, borderRadius: 18, backgroundColor: "white" }, byline: { flexDirection: "row", justifyContent: "space-between", gap: 12 }, author: { fontWeight: "900" }, paragraph: { marginTop: 20, fontSize: 17, lineHeight: 28 }, image: { width: "100%", minHeight: 240, marginTop: 18, borderRadius: 14, backgroundColor: "#e4e7ec" }, tags: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 20 }, tag: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, color: "#1849a9", backgroundColor: "#eff4ff" }, actions: { flexDirection: "row", gap: 9, marginTop: 22 }, action: { flex: 1, minHeight: 48, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#b2ccff", borderRadius: 13 }, actionActive: { backgroundColor: "#175cd3" }, actionText: { color: "#175cd3", fontWeight: "900" }, actionActiveText: { color: "white", fontWeight: "900" } });
