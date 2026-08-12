"use client";

import Link from "next/link";
import { useSession } from "@/lib/session";

export function AccountAction() {
  const { status, user, logout } = useSession();
  if (status === "loading") return <span className="accountSkeleton" aria-label="세션 확인 중" />;
  if (status === "anonymous") return <Link className="quietButton" href="/login">로그인</Link>;
  return (
    <div className="accountMenu">
      {user?.role === "ADMIN" ? <Link href="/admin">운영</Link> : null}
      <Link href="/my">{user?.displayName}</Link>
      <button type="button" onClick={() => void logout()}>로그아웃</button>
    </div>
  );
}
