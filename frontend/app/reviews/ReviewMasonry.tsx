"use client";

import type { components } from "@metrotrip/contracts";
import Masonry from "react-masonry-css";
import Link from "next/link";
import type { CSSProperties } from "react";
import { MapPin, Star, ThumbsUp } from "lucide-react";

type ReviewItem = components["schemas"]["ReviewPage"]["items"][number];

function coverStyle(review: ReviewItem): CSSProperties {
  return review.coverUrl ? { backgroundImage: `url(${review.coverUrl})` } : {};
}

export function ReviewMasonry({ items }: { items: ReviewItem[] }) {
  return <Masonry breakpointCols={{ default: 3, 1180: 2, 780: 1 }} className="reviewMasonryGrid" columnClassName="reviewMasonryColumn">
    {items.map((review) => {
      const hasDifferentDestination = review.destinationStationId && review.destinationStationName !== review.originStationName;
      const route = hasDifferentDestination ? `${review.originStationName} → ${review.destinationStationName}` : review.originStationName;
      const cover = coverStyle(review);
      return <Link className="reviewCard" href={`/reviews/${review.id}`} key={review.id} prefetch={false}>
        <div className="reviewCover" style={cover}>{review.coverUrl ? <img className="reviewCoverImage" src={review.coverUrl} alt="" aria-hidden /> : <span className="reviewCoverFallback">METROTRIP</span>}<strong className="reviewRouteOverlay"><MapPin size={13} aria-hidden /> {route}</strong></div>
        <div className="reviewCardBody"><div className="reviewCardMeta"><span>{review.authorName}</span><time>{review.travelDate}</time></div><h2 className={review.title.length > 28 ? "isTruncated" : undefined} title={review.title}>{review.title}</h2><div className="tagRow">{review.tags.slice(0, 3).map((item) => <span key={item}>#{item}</span>)}{review.tags.length > 3 ? <span>+{review.tags.length - 3}</span> : null}</div><div className="reviewStats"><span><Star size={14} fill="currentColor" aria-hidden /> {review.rating}</span><span className="reviewEngagement">조회 {review.viewCount}<i /> <ThumbsUp size={13} aria-hidden /> 도움 {review.likeCount}</span></div></div>
      </Link>;
    })}
  </Masonry>;
}
