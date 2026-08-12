"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ClearableInput } from "@/components/ClearableInput";
import { api, legacyPublicPost } from "@/lib/api";
import { SessionRequestError, useSession, type RegisterInput } from "@/lib/session";

type Mode = "login" | "register" | "reset";
type RegisterWizardDraft = Partial<Omit<RegisterInput, "emailVerificationToken">>;

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
  const [registerWizardDraft, setRegisterWizardDraft] = useState<RegisterWizardDraft>({});
  const [registerStep, setRegisterStep] = useState(0);
  const [registerCode, setRegisterCode] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");

  function changeMode(next: Mode) {
    setMode(next);
    setRegisterWizardDraft({});
    setRegisterStep(0);
    setRegisterCode("");
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
        router.push("/discover");
      }
    } catch (caught) {
      setError(caught instanceof SessionRequestError || caught instanceof Error ? caught.message : "인증 서버에 연결할 수 없습니다.");
    } finally {
      setPending(false);
    }
  }

  async function submitRegisterStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      if (registerStep === 0) {
        const termsAgreed = form.get("termsAgreed") === "on";
        const privacyAgreed = form.get("privacyAgreed") === "on";
        if (!termsAgreed || !privacyAgreed) throw new Error("필수 약관에 동의해 주세요.");
        setRegisterWizardDraft((current) => ({ ...current, termsAgreed, privacyAgreed }));
      } else if (registerStep === 1) {
        setRegisterWizardDraft((current) => ({ ...current, name: String(form.get("name") ?? "").trim(), nickname: String(form.get("nickname") ?? "").trim() }));
      } else if (registerStep === 2) {
        const password = String(form.get("password") ?? "");
        const passwordConfirm = String(form.get("passwordConfirm") ?? "");
        if (password !== passwordConfirm) throw new Error("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
        if (!/[A-Za-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
          throw new Error("비밀번호는 영문, 숫자, 특수문자를 모두 포함해야 합니다.");
        }
        setRegisterWizardDraft((current) => ({ ...current, password, passwordConfirm }));
      } else if (registerStep === 3) {
        const email = String(form.get("email") ?? "").trim().toLowerCase();
        await legacyPublicPost("/api/v1/auth/email-verifications", { email, purpose: "SIGNUP" });
        setRegisterWizardDraft((current) => ({ ...current, email }));
        setRegisterCode("");
        setNotice("입력한 이메일로 인증번호를 보냈습니다.");
      }
      if (registerStep < 3) setRegisterStep((step) => step + 1);
      else setRegisterStep(4);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "회원가입 단계를 처리하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function confirmRegisterWizard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const email = String(registerWizardDraft.email ?? "").trim().toLowerCase();
      const code = registerCode.replace(/\D/g, "").slice(0, 6);
      if (!/^\d{6}$/.test(code)) throw new Error("인증번호 6자리를 모두 입력해 주세요.");
      const verified = await legacyPublicPost("/api/v1/auth/email-verifications/confirm", {
        email,
        code,
        purpose: "SIGNUP",
      });
      const verificationToken = String(verified.verificationToken ?? verified.verification_token ?? "");
      if (!verificationToken) throw new Error("이메일 인증 토큰을 받지 못했습니다. 인증번호를 다시 요청해 주세요.");
      await register({
        email,
        password: String(registerWizardDraft.password ?? ""),
        passwordConfirm: String(registerWizardDraft.passwordConfirm ?? ""),
        displayName: String(registerWizardDraft.nickname ?? ""),
        name: String(registerWizardDraft.name ?? ""),
        nickname: String(registerWizardDraft.nickname ?? ""),
        termsAgreed: Boolean(registerWizardDraft.termsAgreed),
        privacyAgreed: Boolean(registerWizardDraft.privacyAgreed),
        emailVerificationToken: verificationToken,
      });
      router.push("/discover");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "인증번호를 확인하지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const { data, error: apiError } = await api.POST("/api/v1/auth/password-reset/request", { body: { email } });
    if (data) { setResetEmail(email); setResetCode(data.debugCode ?? ""); setNotice(data.debugCode ? `개발 환경 인증 코드: ${data.debugCode}` : data.message); }
    else setError(apiMessage(apiError) ?? "재설정 요청을 처리하지 못했습니다.");
    setPending(false);
  }

  async function confirmReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("newPassword"));
    const confirmation = String(form.get("newPasswordConfirm"));
    if (password !== confirmation) { setError("새 비밀번호 확인이 일치하지 않습니다."); setPending(false); return; }
    const { data, error: apiError } = await api.POST("/api/v1/auth/password-reset/confirm", { body: { email: resetEmail, code: String(form.get("code")), newPassword: password, newPasswordConfirm: confirmation } });
    if (data) { setNotice("비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요."); setMode("login"); setResetEmail(""); setResetCode(""); }
    else setError(apiMessage(apiError) ?? "인증 코드와 새 비밀번호를 확인해 주세요.");
    setPending(false);
  }

  return (
    <main className="authPage contentShell">
      <section className="authIntro">
        <p className="eyebrow">YOUR NEXT STOP</p>
        <h1>여행을 저장하고,<br /><em>다시 이어가세요.</em></h1>
        <p>즐겨찾기와 일정, 여행 기록은 로그인한 계정에 안전하게 연결됩니다.</p>
        <Link href="/discover">먼저 둘러보기 <ArrowRight size={15} aria-hidden /></Link>
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
            <form key="reset-confirm" onSubmit={confirmReset}>
              <p className="fieldHint"><strong>{resetEmail}</strong>로 받은 6자리 코드를 입력하세요.</p>
              <label>인증 코드<ClearableInput name="code" required inputMode="numeric" pattern="[0-9]{6}" value={resetCode} onChange={(event) => setResetCode(event.target.value)} /></label>
              <label>새 비밀번호<ClearableInput name="newPassword" required type="password" minLength={8} autoComplete="new-password" /></label>
              <label>새 비밀번호 확인<ClearableInput name="newPasswordConfirm" required type="password" minLength={8} autoComplete="new-password" /></label>
              <p className="fieldHint">8자 이상, 영문·숫자·특수문자를 모두 포함해 주세요.</p>
              <button className="primaryButton formSubmit" disabled={pending} type="submit">{pending ? "변경 중…" : "비밀번호 변경"}</button>
              <button className="textButton" type="button" onClick={() => setResetEmail("")}>이메일 다시 입력</button>
            </form>
          ) : (
            <form key="reset-request" onSubmit={requestReset}>
              <p className="fieldHint">가입한 이메일로 10분간 유효한 인증 코드를 보냅니다.</p>
              <label>이메일<ClearableInput name="email" required type="email" autoComplete="email" /></label>
              <button className="primaryButton formSubmit" disabled={pending} type="submit">{pending ? "요청 중…" : "인증 코드 요청"}</button>
            </form>
          )
        ) : mode === "register" ? (
          registerStep === 0 ? (
            <form key="register-consent" onSubmit={submitRegisterStep}>
              <p className="fieldHint">서비스 이용을 위해 필수 약관에 동의해 주세요.</p>
              <label className="checkField"><input name="termsAgreed" type="checkbox" required /> 이용약관 동의 (필수)</label>
              <label className="checkField"><input name="privacyAgreed" type="checkbox" required /> 개인정보 처리방침 동의 (필수)</label>
              <button className="primaryButton formSubmit" disabled={pending} type="submit">다음</button>
            </form>
          ) : registerStep === 1 ? (
            <form key="register-profile" onSubmit={submitRegisterStep}>
              <label>이름<ClearableInput name="name" required minLength={1} maxLength={50} defaultValue={registerWizardDraft.name ?? ""} autoComplete="name" /></label>
              <label>닉네임<ClearableInput name="nickname" required minLength={2} maxLength={20} defaultValue={registerWizardDraft.nickname ?? ""} autoComplete="nickname" /></label>
              <div className="wizardActions"><button className="textButton" type="button" onClick={() => setRegisterStep(0)}>이전</button><button className="primaryButton" disabled={pending} type="submit">다음</button></div>
            </form>
          ) : registerStep === 2 ? (
            <form key="register-password" onSubmit={submitRegisterStep}>
              <label>비밀번호<ClearableInput name="password" required type="password" minLength={8} defaultValue={registerWizardDraft.password ?? ""} autoComplete="new-password" /></label>
              <label>비밀번호 확인<ClearableInput name="passwordConfirm" required type="password" minLength={8} defaultValue={registerWizardDraft.passwordConfirm ?? ""} autoComplete="new-password" /></label>
              <p className="fieldHint">8자 이상, 영문·숫자·특수문자를 모두 포함해 주세요.</p>
              <div className="wizardActions"><button className="textButton" type="button" onClick={() => setRegisterStep(1)}>이전</button><button className="primaryButton" disabled={pending} type="submit">다음</button></div>
            </form>
          ) : registerStep === 3 ? (
            <form key="register-email" onSubmit={submitRegisterStep}>
              <label>이메일<ClearableInput name="email" required type="email" defaultValue={registerWizardDraft.email ?? ""} autoComplete="email" /></label>
              <p className="fieldHint">입력한 이메일로 6자리 인증번호를 보냅니다.</p>
              <div className="wizardActions"><button className="textButton" type="button" onClick={() => setRegisterStep(2)}>이전</button><button className="primaryButton" disabled={pending} type="submit">인증번호 받기</button></div>
            </form>
          ) : (
            <form key="register-verify" onSubmit={confirmRegisterWizard}>
              <p className="fieldHint"><strong>{registerWizardDraft.email}</strong>로 받은 인증번호를 입력하세요.</p>
              <label>인증번호<ClearableInput name="code" required inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" value={registerCode} onChange={(event) => setRegisterCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
              <div className="wizardActions"><button className="textButton" type="button" onClick={() => setRegisterStep(3)}>이전</button><button className="primaryButton" disabled={pending} type="submit">최종 등록</button></div>
            </form>
          )
        ) : (
          <form key={`auth-${mode}`} onSubmit={submitAuth}>
            <label>이메일<ClearableInput name="email" required type="email" autoComplete="email" /></label>
            <label>비밀번호<ClearableInput name="password" required type="password" minLength={1} autoComplete="current-password" /></label>
            <button className="primaryButton formSubmit" disabled={pending} type="submit">{pending ? "처리 중…" : "로그인"}</button>
          </form>
        )}
        {notice && <p className="formNotice" role="status">{notice}</p>}
        {error && <p className="formError" role="alert">{error}</p>}
      </section>
    </main>
  );
}
