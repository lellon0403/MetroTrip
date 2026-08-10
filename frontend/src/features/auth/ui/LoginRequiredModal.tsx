import { getPath, navigate } from '../../../app/route';
import { Button } from '../../../shared/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../shared/ui/Dialog';

export function LoginRequiredModal({ onConfirm, description = '마이페이지를 이용하려면 먼저 로그인해주세요.' }: { onConfirm: () => void; description?: string }) {
  return (
    <Dialog open onOpenChange={(open) => !open && navigate(getPath('map'))}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[var(--auth-dialog-width)] text-center">
        <DialogHeader className="items-center pr-0">
          <DialogTitle>로그인이 필요합니다</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="mt-lg flex justify-center gap-sm">
          <Button type="button" variant="outline" onClick={() => navigate(getPath('map'))}>닫기</Button>
          <Button type="button" onClick={onConfirm}>로그인하기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
