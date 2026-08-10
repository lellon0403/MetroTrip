export type ReviewMedia = {
  mediaId: number;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
};

export type Review = {
  reviewId: number;
  userId: number;
  authorNickname: string;
  title: string;
  content: string;
  startStationId: number;
  startStationName: string;
  endStationId: number;
  endStationName: string;
  rating: number;
  travelCost: number | null;
  planId: number | null;
  viewCount: number;
  likeCount?: number;
  tags: string[];
  media: ReviewMedia[];
  createdAt: string;
  updatedAt: string;
};

export type ReviewListResponse = {
  items: Review[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type ReviewInput = {
  title: string;
  content: string;
  startStationId: number;
  endStationId: number;
  rating: number;
  travelCost: number | null;
  planId: number | null;
  tags: string[];
  media?: Array<{ mediaUrl: string; mediaType: 'IMAGE' | 'VIDEO' }>;
};
