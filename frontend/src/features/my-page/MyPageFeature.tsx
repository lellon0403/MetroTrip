import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getCommunityPath, getReviewPath, navigate } from '../../app/route';
import { getCurrentUser, type CurrentUser } from '../../shared/auth/api';
import { getStations } from '../../shared/lib/stations';
import { Badge } from '../../shared/ui/Badge';
import { Button } from '../../shared/ui/Button';
import { Card } from '../../shared/ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../shared/ui/Dialog';
import { Icon } from '../../shared/ui/Icon';
import { Input } from '../../shared/ui/Input';
import { PreviewFrame } from '../../shared/ui/PreviewFrame';
import type { Station } from '../../shared/types/station';
import { listMyReviews } from '../reviews/api/reviews';
import type { Review } from '../reviews/types';
import {
  addFavoriteStation,
  changeMyPassword,
  listFavoriteStations,
  reauthenticate,
  removeFavoriteStation,
  updateMyProfile,
  withdrawMyAccount,
  type FavoriteStation,
} from './api/users';
import { listMyCommunityPosts, listMyParticipatingCommunityPosts } from '../community/api/community';
import type { CommunityPost, ParticipatingPost } from '../community/types';

type AccountDialog = 'profile' | 'password' | 'withdraw' | null;

function reviewText(content: string) {
  return content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function ReviewSummary({ review }: { review: Review }) {
  return (
    <button
      type="button"
      className="flex w-full flex-col gap-xs border-b border-outline-variant/70 p-md text-left transition hover:bg-surface-container-low last:border-b-0"
      onClick={() => navigate(getReviewPath({ kind: 'detail', reviewId: review.reviewId }))}
    >
      <div className="flex flex-wrap items-center gap-xs">
        <span className="font-bold text-on-surface">{review.startStationName}</span>
        <Icon name="arrow_forward" className="text-[16px] text-on-surface-variant" />
        <span className="font-bold text-on-surface">{review.endStationName}</span>
        <span className="ml-auto flex items-center gap-xs text-body-md text-tertiary">★ {(review.rating / 2).toFixed(1)}</span>
      </div>
      <p className="text-body-lg font-semibold text-on-surface">{review.title}</p>
      <p className="line-clamp-2 text-body-md text-on-surface-variant">{reviewText(review.content)}</p>
      <div className="flex flex-wrap items-center gap-xs">
        {review.tags.map((tag) => <Badge key={tag}>#{tag}</Badge>)}
        <span className="ml-auto text-label-caps text-on-surface-variant">
          {review.travelCost === null ? '경비 미입력' : `${review.travelCost.toLocaleString()}원`}
        </span>
      </div>
    </button>
  );
}

function CommunitySummary({ post, label }: { post: CommunityPost | ParticipatingPost; label?: string }) {
  return <button type="button" onClick={() => navigate(getCommunityPath({ kind: 'detail', postId: post.postId }))} className="flex w-full flex-col gap-xs border-b border-outline-variant/70 p-md text-left transition hover:bg-surface-container-low last:border-b-0"><div className="flex items-center gap-xs"><span className="font-semibold text-on-surface">{post.title}</span>{label && <Badge className="ml-auto bg-surface-container text-on-surface-variant">{label}</Badge>}</div><p className="text-body-md text-on-surface-variant">{post.author.nickname} · 확정 {post.recruitment.acceptedCount}/{post.recruitment.capacity}명</p></button>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-xs text-body-md font-semibold text-on-surface">{label}{children}</label>;
}

export function MyPageFeature({ onLogout }: { onLogout: () => Promise<void> }) {
  const [profile, setProfile] = useState<CurrentUser | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [favorites, setFavorites] = useState<FavoriteStation[]>([]);
  const [myPosts, setMyPosts] = useState<CommunityPost[]>([]);
  const [participatingPosts, setParticipatingPosts] = useState<ParticipatingPost[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<AccountDialog>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [favoriteStationId, setFavoriteStationId] = useState('');
  const [profileForm, setProfileForm] = useState({ name: '', nickname: '', password: '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [withdrawForm, setWithdrawForm] = useState({ password: '', confirmation: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextProfile, reviewResponse, favoriteResponse, nextStations, myPostResponse, appliedResponse, acceptedResponse] = await Promise.all([
        getCurrentUser(),
        listMyReviews(),
        listFavoriteStations(),
        getStations(),
        listMyCommunityPosts(),
        listMyParticipatingCommunityPosts('APPLIED'),
        listMyParticipatingCommunityPosts('ACCEPTED'),
      ]);
      setProfile(nextProfile);
      setReviews(reviewResponse.items);
      setFavorites(favoriteResponse.items);
      setStations(nextStations);
      setMyPosts(myPostResponse.items);
      setParticipatingPosts([...appliedResponse.items, ...acceptedResponse.items]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '마이페이지 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openProfile = () => {
    if (!profile) return;
    setProfileForm({ name: profile.name, nickname: profile.nickname, password: '' });
    setFormError('');
    setDialog('profile');
  };

  const closeDialog = () => {
    if (submitting) return;
    setDialog(null);
    setFormError('');
  };

  const submitProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;
    const name = profileForm.name.trim();
    const nickname = profileForm.nickname.trim();
    if (!profileForm.password) return setFormError('현재 비밀번호를 입력해 주세요.');
    const changes: { name?: string; nickname?: string } = {};
    if (name !== profile.name) changes.name = name;
    if (nickname !== profile.nickname) changes.nickname = nickname;
    if (Object.keys(changes).length === 0) return setFormError('변경할 이름 또는 닉네임을 입력해 주세요.');

    setSubmitting(true);
    setFormError('');
    try {
      const verified = await reauthenticate(profileForm.password, 'PROFILE_UPDATE');
      const updated = await updateMyProfile(changes, verified.verificationToken);
      setProfile(updated);
      setNotice('회원 정보가 수정되었습니다.');
      setDialog(null);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '회원 정보를 수정하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!passwordForm.current) return setFormError('현재 비밀번호를 입력해 주세요.');
    if (passwordForm.next !== passwordForm.confirm) return setFormError('새 비밀번호가 일치하지 않습니다.');
    setSubmitting(true);
    setFormError('');
    try {
      const verified = await reauthenticate(passwordForm.current, 'PASSWORD_CHANGE');
      await changeMyPassword({ newPassword: passwordForm.next, newPasswordConfirm: passwordForm.confirm }, verified.verificationToken);
      setNotice('비밀번호가 변경되었습니다. 다시 로그인해 주세요.');
      setDialog(null);
      await onLogout();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '비밀번호를 변경하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitWithdrawal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!withdrawForm.password) return setFormError('현재 비밀번호를 입력해 주세요.');
    if (withdrawForm.confirmation !== '탈퇴합니다') return setFormError('확인 문구를 정확히 입력해 주세요.');
    setSubmitting(true);
    setFormError('');
    try {
      const verified = await reauthenticate(withdrawForm.password, 'WITHDRAWAL');
      await withdrawMyAccount(verified.verificationToken);
      setDialog(null);
      await onLogout();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : '회원 탈퇴를 완료하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const addFavorite = async () => {
    const stationId = Number(favoriteStationId);
    if (!stationId) return;
    setSubmitting(true);
    setNotice('');
    try {
      const favorite = await addFavoriteStation(stationId);
      setFavorites((current) => [...current, favorite]);
      setFavoriteStationId('');
      setNotice(`${favorite.stationName}을(를) 즐겨찾기에 추가했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '즐겨찾기를 추가하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeFavorite = async (favorite: FavoriteStation) => {
    setSubmitting(true);
    setNotice('');
    try {
      await removeFavoriteStation(favorite.stationId);
      setFavorites((current) => current.filter((item) => item.stationId !== favorite.stationId));
      setNotice(`${favorite.stationName}을(를) 즐겨찾기에서 삭제했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '즐겨찾기를 삭제하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const availableStations = stations.filter((station) => !favorites.some((favorite) => favorite.stationId === station.id));
  const initial = profile?.nickname.slice(0, 1) ?? '…';

  return (
    <PreviewFrame title="마이페이지" description="즐겨찾기, 후기, 계정 정보를 한곳에서 관리하세요." notice="회원 정보 변경과 탈퇴에는 현재 비밀번호 확인이 필요합니다.">
      {notice && <Card className="border-primary/30 bg-primary-container/30 p-md text-body-md text-on-primary-container">{notice}</Card>}
      {error && <Card className="border-error/30 p-md text-body-md text-error">{error}</Card>}

      <Card className="flex items-center gap-md p-md">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-container text-headline-sm font-bold text-on-primary-container">{initial}</span>
        <div className="min-w-0 flex-1">
          <p className="text-body-lg font-bold text-on-surface">{profile?.nickname ?? (loading ? '불러오는 중…' : '회원 정보 없음')}</p>
          <p className="truncate text-body-md text-on-surface-variant">{profile?.email ?? ''}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={openProfile} disabled={!profile}> <Icon name="edit" className="text-[18px]" />프로필 수정</Button>
      </Card>

      <Card className="grid grid-cols-1 overflow-hidden sm:grid-cols-3">
        <div className="flex flex-row items-center gap-sm border-b border-outline-variant/70 p-md sm:flex-col sm:border-b-0 sm:border-r"><Icon name="star" className="text-[20px] text-primary" /><span className="text-headline-sm font-bold text-on-surface">{favorites.length}</span><span className="text-label-caps uppercase tracking-widest text-on-surface-variant">즐겨찾기</span></div>
        <div className="flex flex-row items-center gap-sm border-b border-outline-variant/70 p-md sm:flex-col sm:border-b-0 sm:border-r"><Icon name="edit_note" className="text-[20px] text-primary" /><span className="text-headline-sm font-bold text-on-surface">{reviews.length}</span><span className="text-label-caps uppercase tracking-widest text-on-surface-variant">작성한 후기</span></div>
        <div className="flex flex-row items-center gap-sm p-md sm:flex-col"><Icon name="route" className="text-[20px] text-primary" /><span className="text-headline-sm font-bold text-on-surface">—</span><span className="text-label-caps uppercase tracking-widest text-on-surface-variant">저장한 경로</span></div>
      </Card>

      <Card className="p-md">
        <div className="flex flex-wrap items-center justify-between gap-sm"><h3 className="text-label-caps uppercase tracking-widest text-on-surface-variant">즐겨찾기 역</h3><div className="flex min-w-[14rem] flex-1 gap-xs sm:max-w-sm"><select aria-label="즐겨찾기할 역" value={favoriteStationId} onChange={(event) => setFavoriteStationId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-outline-variant bg-surface-bright px-sm text-body-md text-on-surface" disabled={loading || submitting}><option value="">역을 선택하세요</option>{availableStations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select><Button size="sm" onClick={() => void addFavorite()} disabled={!favoriteStationId || submitting}>추가</Button></div></div>
        {loading && <p className="mt-sm text-body-md text-on-surface-variant">즐겨찾기를 불러오는 중입니다.</p>}
        {!loading && favorites.length === 0 && <p className="mt-sm text-body-md text-on-surface-variant">즐겨찾기한 역이 없습니다.</p>}
        <div className="mt-sm flex flex-wrap gap-xs">{favorites.map((favorite) => <Badge key={favorite.favoriteId} className="gap-xs bg-surface-container text-on-surface"><Icon name="star" className="text-[16px] text-primary" />{favorite.stationName}<button type="button" aria-label={`${favorite.stationName} 즐겨찾기 삭제`} onClick={() => void removeFavorite(favorite)} disabled={submitting} className="ml-1 rounded-full text-on-surface-variant hover:text-error"><Icon name="close" className="text-[15px]" /></button></Badge>)}</div>
      </Card>

      <Card className="overflow-hidden"><h3 className="border-b border-outline-variant/70 px-md py-md text-label-caps uppercase tracking-widest text-on-surface-variant">작성한 후기</h3>{loading && <p className="p-md text-body-md text-on-surface-variant">후기를 불러오는 중입니다.</p>}{!loading && reviews.length === 0 && <p className="p-md text-body-md text-on-surface-variant">작성한 후기가 없습니다.</p>}{!loading && reviews.map((review) => <ReviewSummary key={review.reviewId} review={review} />)}</Card>

      <div className="grid gap-[var(--review-grid-gap)] lg:grid-cols-2">
        <Card className="overflow-hidden"><h3 className="border-b border-outline-variant/70 px-md py-md text-label-caps uppercase tracking-widest text-on-surface-variant">내가 작성한 모집글</h3>{!loading && myPosts.length === 0 && <p className="p-md text-body-md text-on-surface-variant">작성한 모집글이 없습니다.</p>}{!loading && myPosts.map((post) => <CommunitySummary key={post.postId} post={post} />)}</Card>
        <Card className="overflow-hidden"><h3 className="border-b border-outline-variant/70 px-md py-md text-label-caps uppercase tracking-widest text-on-surface-variant">참여 중인 모집글</h3>{!loading && participatingPosts.length === 0 && <p className="p-md text-body-md text-on-surface-variant">참여 중인 모집글이 없습니다.</p>}{!loading && participatingPosts.map((post) => <CommunitySummary key={post.postId} post={post} label={post.participation.status === 'ACCEPTED' ? '참여 확정' : '신청 대기'} />)}</Card>
      </div>

      <Card className="overflow-hidden"><button type="button" onClick={() => { setPasswordForm({ current: '', next: '', confirm: '' }); setFormError(''); setDialog('password'); }} className="flex w-full items-center gap-sm border-b border-outline-variant/70 px-md py-md text-body-lg text-on-surface transition hover:bg-surface-container-low"><Icon name="lock_reset" className="text-[20px] text-on-surface-variant" />비밀번호 변경<Icon name="chevron_right" className="ml-auto text-[20px] text-on-surface-variant" /></button><button type="button" onClick={() => void onLogout()} className="flex w-full items-center gap-sm px-md py-md text-body-lg text-on-surface transition hover:bg-surface-container-low"><Icon name="logout" className="text-[20px] text-on-surface-variant" />로그아웃<Icon name="chevron_right" className="ml-auto text-[20px] text-on-surface-variant" /></button></Card>
      <button type="button" onClick={() => { setWithdrawForm({ password: '', confirmation: '' }); setFormError(''); setDialog('withdraw'); }} className="pb-md text-center text-body-md text-error/80 underline-offset-4 hover:underline">회원 탈퇴</button>

      <Dialog open={dialog === 'profile'} onOpenChange={(open) => { if (!open) closeDialog(); }}><DialogContent><DialogHeader><DialogTitle>회원 정보 수정</DialogTitle><DialogDescription>수정 전 현재 비밀번호를 확인합니다.</DialogDescription></DialogHeader><form className="mt-lg grid gap-md" onSubmit={(event) => void submitProfile(event)}><Field label="이름"><Input value={profileForm.name} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} required /></Field><Field label="닉네임"><Input value={profileForm.nickname} onChange={(event) => setProfileForm((current) => ({ ...current, nickname: event.target.value }))} minLength={2} maxLength={20} required /></Field><Field label="현재 비밀번호"><Input type="password" value={profileForm.password} onChange={(event) => setProfileForm((current) => ({ ...current, password: event.target.value }))} autoComplete="current-password" required /></Field>{formError && <p className="text-body-md text-error">{formError}</p>}<Button type="submit" disabled={submitting}>{submitting ? '수정 중…' : '수정 완료'}</Button></form></DialogContent></Dialog>

      <Dialog open={dialog === 'password'} onOpenChange={(open) => { if (!open) closeDialog(); }}><DialogContent><DialogHeader><DialogTitle>비밀번호 변경</DialogTitle><DialogDescription>변경 후에는 보안을 위해 다시 로그인합니다.</DialogDescription></DialogHeader><form className="mt-lg grid gap-md" onSubmit={(event) => void submitPassword(event)}><Field label="현재 비밀번호"><Input type="password" value={passwordForm.current} onChange={(event) => setPasswordForm((current) => ({ ...current, current: event.target.value }))} autoComplete="current-password" required /></Field><Field label="새 비밀번호"><Input type="password" value={passwordForm.next} onChange={(event) => setPasswordForm((current) => ({ ...current, next: event.target.value }))} autoComplete="new-password" minLength={8} required /><span className="text-label-caps font-normal text-on-surface-variant">영문, 숫자, 특수문자를 모두 포함해 8자 이상</span></Field><Field label="새 비밀번호 확인"><Input type="password" value={passwordForm.confirm} onChange={(event) => setPasswordForm((current) => ({ ...current, confirm: event.target.value }))} autoComplete="new-password" minLength={8} required /></Field>{formError && <p className="text-body-md text-error">{formError}</p>}<Button type="submit" disabled={submitting}>{submitting ? '변경 중…' : '비밀번호 변경'}</Button></form></DialogContent></Dialog>

      <Dialog open={dialog === 'withdraw'} onOpenChange={(open) => { if (!open) closeDialog(); }}><DialogContent><DialogHeader><DialogTitle>회원 탈퇴</DialogTitle><DialogDescription>탈퇴하면 계정과 연관된 데이터가 삭제되며 되돌릴 수 없습니다.</DialogDescription></DialogHeader><form className="mt-lg grid gap-md" onSubmit={(event) => void submitWithdrawal(event)}><Field label="현재 비밀번호"><Input type="password" value={withdrawForm.password} onChange={(event) => setWithdrawForm((current) => ({ ...current, password: event.target.value }))} autoComplete="current-password" required /></Field><Field label="확인 문구"><Input value={withdrawForm.confirmation} onChange={(event) => setWithdrawForm((current) => ({ ...current, confirmation: event.target.value }))} placeholder="탈퇴합니다" required /></Field>{formError && <p className="text-body-md text-error">{formError}</p>}<Button type="submit" variant="destructive" disabled={submitting}>{submitting ? '처리 중…' : '회원 탈퇴'}</Button></form></DialogContent></Dialog>
    </PreviewFrame>
  );
}
