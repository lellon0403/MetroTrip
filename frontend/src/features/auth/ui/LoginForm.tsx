import { useState } from 'react';
import { getPath, navigate } from '../../../app/route';
import { loginAccount } from '../api/auth';
import { useAuthForm } from '../hooks/useAuthForm';
import { AuthField } from './AuthField';
import { AuthMessage } from './AuthMessage';
import { Button } from '../../../shared/ui/Button';
import { saveAuthTokens } from '../../../shared/auth/session';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { loading, error, run } = useAuthForm();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tokens = await run(() => loginAccount(email, password));
    if (tokens) {
      saveAuthTokens(tokens);
      navigate(getPath('map'));
    }
  }

  return (
    <form className="space-y-md" onSubmit={submit}>
      <AuthField label="이메일" type="email" value={email} onChange={setEmail} placeholder="user@example.com" />
      <AuthField label="비밀번호" type="password" value={password} onChange={setPassword} />
      <AuthMessage message={error} error />
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? '로그인 중...' : '로그인'}
      </Button>
    </form>
  );
}
