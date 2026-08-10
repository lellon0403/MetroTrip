export type RecruitStatus = 'RECRUITING' | 'CLOSED';
export type ParticipantStatus = 'APPLIED' | 'ACCEPTED' | 'REJECTED' | 'CANCELED';
export type ParticipatingPostStatus = 'APPLIED' | 'ACCEPTED';

export type PostAuthor = { userId: number | null; nickname: string };

export type Recruitment = {
  capacity: number;
  acceptedCount: number;
  deadline: string;
  status: RecruitStatus;
  meetingDate: string | null;
};

export type CommunityPost = {
  postId: number;
  title: string;
  author: PostAuthor;
  viewCount: number;
  recruitment: Recruitment;
  createdAt: string;
};

export type CommunityPostDetail = CommunityPost & {
  content: string;
  planId: number | null;
  updatedAt: string;
};

export type CommunityPostListResponse = {
  items: CommunityPost[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type Participant = {
  participantId: number;
  postId: number;
  user: PostAuthor | null;
  status: ParticipantStatus;
  appliedAt: string;
  respondedAt: string | null;
};

export type ParticipatingPost = CommunityPost & {
  participation: {
    participantId: number;
    status: ParticipatingPostStatus;
    appliedAt: string;
    respondedAt: string | null;
  };
};

export type ParticipatingPostListResponse = Omit<CommunityPostListResponse, 'items'> & {
  items: ParticipatingPost[];
};

export type CommunityPostInput = {
  title: string;
  content: string;
  recruitCapacity: number;
  recruitDeadline: string;
  meetingDate: string | null;
};
