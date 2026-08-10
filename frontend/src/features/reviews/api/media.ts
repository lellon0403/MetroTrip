export type UploadedReviewImage = {
  mediaUrl: string;
  uploadUrl: string;
};

import { apiRequest } from '../../../shared/lib/apiClient';

type MediaUploadResponse = UploadedReviewImage & {
  expiresIn: number;
};

/** 후기 이미지 파일을 로컬 미디어 저장소에 올리고 최종 URL을 반환한다. */
export async function uploadReviewImage(file: File): Promise<UploadedReviewImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 첨부할 수 있습니다.');
  }

  const issued = await apiRequest<MediaUploadResponse>('/review-media', {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, contentType: file.type }),
  });
  const uploadResponse = await fetch(issued.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!uploadResponse.ok) throw new Error('이미지를 업로드하지 못했습니다.');

  return { mediaUrl: issued.mediaUrl, uploadUrl: issued.uploadUrl };
}
