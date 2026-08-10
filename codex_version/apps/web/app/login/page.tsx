"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { SessionRequestError, useSession } from "@/lib/session";

type Mode = "login" | "register" | "reset";

function apiMessage(error: unknown) {
  if (error && typeof error === "object" && "error" in error) {
    return (error as { error?: { message?: string } }).error?.message;
  }
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useSession();
  const [mode, setMode] = useState<Mode>("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");

  function changeMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "login") {
        await login({ email: String(form.get("email")), password: String(form.get("password")) });
      } else {
        await register({
          email: String(form.get("email")),
          password: String(form.get("password")),
          displayName: String(form.get("displayName")),
        });
      }
      router.push("/discover");
    } catch (caught) {
      setError(caught instanceof SessionRequestError ? caught.message : "인증 서버에 연결할 수 없습니다.");
    } finally {
      setPending(false);
    }
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const { data, error: apiError } = await api.POST("/api/v1/auth/password-reset/request", { body: { email } });
    if (data) {
      setResetEmail(email);
      setResetCode(data.debugCode ?? "");
      setNotice(data.debugCode ? `개발 환경 인증 코드: ${data.debugCode}` : data.message);
    } else setError(apiMessage(apiError) ?? "재설정 요청을 처리하지 못했습니다.");
    setPending(false);
  }

  async function confirmReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const { data, error: apiError } = await api.POST("/api/v1/auth/password-reset/confirm", {
      body: {
        email: resetEmail,
        code: String(form.get("code")),
        newPassword: String(form.get("newPassword")),
      },
    });
    if (data) {
      setNotice("비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.");
      setMode("login");
      setResetEmail("");
      setResetCode("");
    } else setError(apiMessage(apiError) ?? "인증 코드와 새 비밀번호를 확인해 주세요.");
    setPending(false);
  }

  return (
    <main className="authPage contentShell">
      <section className="authIntro">
        <p className="eyebrow">YOUR NEXT STOP</p>
        <h1>여행을 저장하고,<br /><em>다시 이어가세요.</em></h1>
        <p>즐겨찾기와 일정, 여행 기록은 로그인한 계정에 안전하게 연결됩니다.</p>
        <Link href="/discover">먼저 둘러보기 →</Link>
      </section>
      <section className="authPanel" aria-labelledby="auth-title">
        <div className="segmented authModes" role="tablist" aria-label="계정 작업">
          <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => changeMode("login")}>로그인</button>
          <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => changeMode("register")}>회원가입</button>
          <button type="button" role="tab" aria-selected={mode === "reset"} onClick={() => changeMode("reset")}>재설정</button>
        </div>
        <h2 id="auth-title">{mode === "login" ? "다시 오셨네요" : mode === "register" ? "여행을 시작해 볼까요?" : "비밀번호 재설정"}</h2>
        {mode === "reset" ? (
          resetEmail ? (
            <form onSubmit={confirmReset}>
              <p className="fieldHint"><strong>{resetEmail}</strong>로 받은 6자리 코드를 입력하세요.</p>
              <label>인증 코드<input name="code" required inputMode="numeric" pattern="[0-9]{6}" value={resetCode} onChange={(event) => setResetCode(event.target.value)} /></label>
              <label>새 비밀번호<input name="newPassword" required type="password" minLength={10} autoComplete="new-password" /></label>
              <button className="primaryButton formSubmit" disabled={pending} type="submit">{pending ? "변경 중…" : "비밀번호 변경"}</button>
              <button className="textButton" type="button" onClick={() => setResetEmail("")}>이메일 다시 입력</button>
            </form>
          ) : (
            <form onSubmit={requestReset}>
              <p className="fieldHint">가입한 이메일로 10분간 유효한 인증 코드를 보냅니다.</p>
              <label>이메일<input name="email" required type="email" autoComplete="email" /></label>
              <button className="primaryButton formSubmit" disabled={pending} type="submit">{pending ? "요청 중…" : "인증 코드 요청"}</button>
            </form>
          )
        ) : (
          <form onSubmit={submitAuth}>
            {mode === "register" && <label>표시 이름<input name="displayName" required minLength={2} maxLength={40} autoComplete="nickname" /></label>}
            <label>이메일<input name="email" required type="email" autoComplete="email" /></label>
            <label>비밀번호<input name="password" required type="password" minLength={10} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
            {mode === "register" && <p className="fieldHint">10자 이상, 영문과 숫자를 포함해 주세요.</p>}
            <button className="primaryButton formSubmit" disabled={pending} type="submit">{pending ? "처리 중…" : mode === "login" ? "로그인" : "계정 만들기"}</button>
          </form>
        )}
        {notice && <p className="formNotice" role="status">{notice}</p>}
        {error && <p className="formError" role="alert">{error}</p>}
      </section>
    </main>
  );
}
