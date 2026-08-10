import { MyPageFeature } from '../features/my-page/MyPageFeature';
import { getAuthPath, navigate } from '../app/route';
import { LoginRequiredModal } from '../features/auth/ui/LoginRequiredModal';
import { useIsAuthenticated } from '../shared/auth/session';

export function MyPage({ onLogout }: { onLogout: () => Promise<void> }) {
  const authenticated = useIsAuthenticated();
  if (!authenticated) {
    return <LoginRequiredModal onConfirm={() => navigate(getAuthPath('login'))} />;
  }
  return <MyPageFeature onLogout={onLogout} />;
}
