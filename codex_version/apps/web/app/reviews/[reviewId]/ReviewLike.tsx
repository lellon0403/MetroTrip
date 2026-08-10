"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

export function ReviewLike({ reviewId, initialLiked, initialCount }: { reviewId: string; initialLiked: boolean; initialCount: number }) {
  const { status } = useSession();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    if (status !== "authenticated") { setMessage("로그인 후 도움 표시를 남길 수 있어요."); return; }
    const request = liked ? api.DELETE("/api/v1/reviews/{review_id}/like", { params: { path: { review_id: reviewId } } }) : api.PUT("/api/v1/reviews/{review_id}/like", { params: { path: { review_id: reviewId } } });
    const { data } = await request;
    if (data) { setLiked(data.liked); setCount(data.likeCount); setMessage(null); }
  }

  return <div className="reviewLike"><button type="button" aria-pressed={liked} onClick={() => void toggle()}>{liked ? "♥" : "♡"} 도움돼요 {count}</button>{message ? <p>{message}</p> : null}</div>;
}
