import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from '@tiptap/extension-image';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { ArrowDown, ArrowRight, ArrowUp, Bold, Check, ChevronDown, ImagePlus, Italic, List, Star, Trash2, X } from 'lucide-react';
import { STATION_OPTIONS } from '../../../shared/data/stationOptions';
import { Badge } from '../../../shared/ui/Badge';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
import { uploadReviewImage } from '../api/media';
import { hasPendingImageUpload } from '../form/transform';
import type { ReviewFormValues, ReviewImageAsset } from '../form/types';
import type { Review } from '../types';

type ReviewFormProps = {
  initialValues: ReviewFormValues;
  review?: Review;
  onSaved: (saved: Review) => void;
  onSubmitRequest: (reviewId: number | undefined, values: ReviewFormValues) => Promise<Review>;
};

type InlineImageEditorProps = {
  value: string;
  images: ReviewImageAsset[];
  thumbnailId: string | null;
  onChange: (content: string, images: ReviewImageAsset[]) => void;
  onThumbnailChange: (id: string) => void;
};

type ReviewSelectOption = { value: string; label: string };

function RatingStars({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="flex items-center gap-xs" role="radiogroup" aria-label="평점 선택">{Array.from({ length: 5 }, (_, index) => {
    const starValue = index * 2;
    const fillPercent = Math.max(0, Math.min(100, (value - starValue) * 50));
    return <div key={index} className="relative h-9 w-9 text-amber-400 transition-transform duration-200 hover:scale-110">
      <Star size={32} strokeWidth={1.5} className="absolute inset-0" />
      <span className="pointer-events-none absolute inset-0 overflow-hidden" style={{ width: `${fillPercent}%` }}><Star size={32} strokeWidth={1.5} fill="currentColor" /></span>
      <button type="button" aria-label={`${starValue + 1}점`} className="absolute inset-y-0 left-0 w-1/2 cursor-pointer" onClick={() => onChange(starValue + 1)} />
      <button type="button" aria-label={`${starValue + 2}점`} className="absolute inset-y-0 right-0 w-1/2 cursor-pointer" onClick={() => onChange(starValue + 2)} />
    </div>;
  })}</div>;
}

function ReviewSelect({ label, value, placeholder, options, onChange }: { label: string; value: string; placeholder: string; options: ReviewSelectOption[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!containerRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={containerRef} className="relative grid gap-xs">
      <span className="text-label-caps text-on-surface-variant">{label}</span>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} className={`flex h-12 w-full items-center justify-between gap-sm rounded-[var(--radius-md)] border bg-surface-bright px-[var(--spacing-md)] py-[var(--spacing-sm)] text-left text-body-md transition-[border-color,box-shadow,background-color] duration-200 ${open ? 'border-primary bg-primary-container/20 shadow-[0_0_0_3px_rgb(23_93_204_/_12%)]' : 'border-outline-variant hover:border-primary/55'}`} onClick={() => setOpen((current) => !current)}>
        <span className={selected ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={18} className={`shrink-0 text-on-surface-variant transition-transform duration-200 ${open ? 'rotate-180 text-primary' : ''}`} />
      </button>
      {open && <div role="listbox" className="absolute inset-x-0 top-full z-30 mt-xs max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-outline-variant bg-surface-bright p-[var(--spacing-xs)] shadow-[var(--shadow-card)] animate-dropdown-in">
        {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={option.value === value} className="flex min-h-11 w-full items-center justify-between rounded-[var(--radius-sm)] px-[var(--spacing-md)] py-[var(--spacing-sm)] text-left text-body-md text-on-surface transition-colors duration-150 hover:bg-primary-container/55 aria-selected:bg-primary-container aria-selected:font-bold" onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}{option.value === value && <Check size={17} className="text-primary" />}</button>)}
      </div>}
    </div>
  );
}

function imagePositions(editor: NonNullable<ReturnType<typeof useEditor>>) {
  const result: Array<{ pos: number; nodeSize: number; src: string }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image') result.push({ pos, nodeSize: node.nodeSize, src: String(node.attrs.src) });
  });
  return result;
}

function InlineImageEditor({ value, images, thumbnailId, onChange, onThumbnailChange }: InlineImageEditorProps) {
  const assetsRef = useRef(images);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(value.replace(/<[^>]+>/g, '').trim() === '');
  const editor = useEditor({
    extensions: [StarterKit, Image.configure({ inline: false, allowBase64: false })],
    content: value,
    immediatelyRender: false,
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const node = currentEditor.state.selection instanceof NodeSelection ? currentEditor.state.selection.node : null;
      setSelectedImage(node?.type.name === 'image' ? String(node.attrs.src) : null);
    },
    onUpdate: ({ editor: currentEditor }) => {
      setIsEmpty(currentEditor.isEmpty);
      const currentImages = imagePositions(currentEditor).map(({ src }) => assetsRef.current.find((asset) => asset.src === src) ?? { id: src, src });
      assetsRef.current = currentImages;
      onChange(currentEditor.getHTML(), currentImages);
    },
  });

  useEffect(() => {
    assetsRef.current = images;
  }, [images]);

  function moveSelectedImage(direction: 'up' | 'down') {
    if (!editor) return;
    const selection = editor.state.selection;
    const selected = selection instanceof NodeSelection ? selection.node : null;
    if (!selected || selected.type.name !== 'image') return;
    const positions = imagePositions(editor);
    const index = positions.findIndex(({ pos }) => pos === selection.from);
    const target = positions[index + (direction === 'up' ? -1 : 1)];
    if (!target) return;
    editor.commands.command(({ tr }) => {
      const current = editor.state.doc.nodeAt(selection.from);
      if (!current) return false;
      tr.delete(selection.from, selection.from + current.nodeSize);
      const targetPosition = direction === 'up' ? target.pos : target.pos + target.nodeSize;
      const insertPosition = targetPosition > selection.from ? targetPosition - current.nodeSize : targetPosition;
      tr.insert(insertPosition, current);
      tr.setSelection(NodeSelection.create(tr.doc, insertPosition));
      return true;
    });
  }

  function selectImage(src: string) {
    if (!editor) return;
    const target = imagePositions(editor).find((image) => image.src === src);
    if (target) editor.commands.setNodeSelection(target.pos);
  }

  function removeSelectedImage() {
    if (!editor || !selectedImage) return;
    editor.chain().focus().deleteSelection().run();
    setSelectedImage(null);
  }

  function addImages(files: FileList | null) {
    if (!editor || !files?.length) return;
<<<<<<< HEAD
    Array.from(files).forEach((file) => {
=======
      Array.from(files).forEach((file) => {
>>>>>>> 608c15b (feat: 후기 목록과 상세 화면 개선)
      if (!file.type.startsWith('image/')) return;
      const src = URL.createObjectURL(file);
      const asset = { id: `local-${crypto.randomUUID()}`, src, file };
      assetsRef.current = [...assetsRef.current, asset];
      if (assetsRef.current.length === 1) onThumbnailChange(asset.id);
      editor.chain().focus().setImage({ src, alt: file.name }).run();
    });
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-outline-variant bg-surface-bright shadow-sm transition-colors focus-within:border-primary">
      <div className="flex flex-wrap items-center gap-xs border-b border-outline-variant bg-surface-container-low p-sm">
        <Button type="button" size="sm" variant="ghost" aria-label="굵게" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={17} /></Button>
        <Button type="button" size="sm" variant="ghost" aria-label="기울임" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={17} /></Button>
        <Button type="button" size="sm" variant="ghost" aria-label="목록" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={18} /></Button>
        <span className="mx-xs h-6 w-px bg-outline-variant" />
        <Button type="button" size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}><ImagePlus size={17} /> 이미지</Button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { addImages(event.target.files); event.target.value = ''; }} />
        {selectedImage && <>
          <span className="mx-xs h-6 w-px bg-outline-variant" />
          <Button type="button" size="sm" variant="ghost" aria-label="이미지 위로 이동" onClick={() => moveSelectedImage('up')}><ArrowUp size={17} /></Button>
          <Button type="button" size="sm" variant="ghost" aria-label="이미지 아래로 이동" onClick={() => moveSelectedImage('down')}><ArrowDown size={17} /></Button>
          <Button type="button" size="sm" variant="ghost" aria-label="이미지 삭제" onClick={removeSelectedImage}><Trash2 size={17} /></Button>
        </>}
      </div>
      <div className="relative"><EditorContent editor={editor} className="min-h-[var(--review-editor-min-height)] px-[var(--spacing-md)] py-[var(--spacing-md)] text-body-lg text-on-surface sm:px-[var(--spacing-lg)] [&_.ProseMirror]:min-h-[var(--review-editor-content-min-height)] [&_.ProseMirror]:outline-none [&_.ProseMirror_img]:my-[var(--spacing-md)] [&_.ProseMirror_img]:max-h-[var(--review-editor-min-height)] [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:cursor-pointer [&_.ProseMirror_img.ProseMirror-selectednode]:ring-4 [&_.ProseMirror_img.ProseMirror-selectednode]:ring-primary/25 [&_.ProseMirror_p]:my-[var(--spacing-sm)]" />{isEmpty && <p className="pointer-events-none absolute left-[var(--spacing-md)] top-[var(--spacing-md)] max-w-[38rem] text-body-md leading-6 text-on-surface-variant sm:left-[var(--spacing-lg)]">여행 코스, 기억에 남았던 장소, 다른 사람에게 추천하고 싶은 점을 자유롭게 적어보세요.</p>}</div>
      {images.length > 0 && <div className="border-t border-outline-variant bg-surface-container-low p-sm"><div className="mb-xs flex items-center justify-between"><p className="text-label-caps text-on-surface-variant">본문에 삽입된 이미지</p><p className="text-label-caps text-primary">대표 이미지를 선택하세요</p></div><div className="flex flex-wrap gap-sm">{images.map((image, index) => <div key={image.id} className="relative"><button type="button" className={`relative overflow-hidden rounded-lg border-2 transition ${selectedImage === image.src ? 'border-primary shadow-[0_0_0_3px_rgb(23_93_204_/_14%)]' : 'border-transparent'}`} onClick={() => selectImage(image.src)}><img src={image.src} alt={`본문 이미지 ${index + 1}`} className="h-16 w-16 object-cover" /><span className="absolute bottom-0 right-0 rounded-tl bg-black/65 px-1 text-[10px] text-white">{index + 1}</span></button><button type="button" className={`absolute -bottom-xs left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-xs py-[2px] text-[10px] font-bold transition ${thumbnailId === image.id ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant hover:bg-primary-container'}`} onClick={() => onThumbnailChange(image.id)}>{thumbnailId === image.id ? '대표' : '대표로 지정'}</button></div>)}</div></div>}
    </div>
  );
}

export function ReviewForm({ initialValues, review, onSaved, onSubmitRequest }: ReviewFormProps) {
  const [values, setValues] = useState(initialValues);
  const [tagDraft, setTagDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function change<K extends keyof ReviewFormValues>(key: K, value: ReviewFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      let valuesToSave = values;
      if (hasPendingImageUpload(values)) {
        const uploadedImages = await Promise.all(values.images.filter((image) => image.file && !image.mediaUrl).map(async (image) => {
          const uploaded = await uploadReviewImage(image.file!);
          return { id: image.id, mediaUrl: uploaded.mediaUrl };
        }));
        const urlsById = new Map(uploadedImages.map((image) => [image.id, image.mediaUrl]));
        valuesToSave = {
          ...values,
          images: values.images.map((image) => {
            const mediaUrl = urlsById.get(image.id);
            return mediaUrl ? { ...image, mediaUrl, src: mediaUrl } : image;
          }),
        };
        setValues(valuesToSave);
      }
      const saved = await onSubmitRequest(review?.reviewId, valuesToSave);
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '후기를 저장하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-lg" onSubmit={submit}>
      <div className="grid gap-lg sm:gap-xl">
        <label className="grid gap-xs text-body-md font-semibold">제목<Input required maxLength={100} value={values.title} onChange={(event) => change('title', event.target.value)} placeholder="여행 후기를 한 줄로 표현해보세요" /></label>

        <div className="grid gap-[var(--spacing-md)] rounded-[var(--radius-lg)] bg-surface-container-low p-[var(--spacing-md)] sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-end sm:p-[var(--spacing-lg)]">
          <div className="grid gap-sm"><span className="text-body-md font-semibold">어디로 다녀오셨나요?</span><div className="grid gap-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end"><ReviewSelect label="출발역" value={values.startStationId ? String(values.startStationId) : ''} placeholder="출발역을 선택하세요" options={STATION_OPTIONS.map((station) => ({ value: String(station.id), label: station.name }))} onChange={(value) => change('startStationId', Number(value))} /><ArrowRight aria-hidden="true" size={18} className="mb-[0.85rem] hidden text-on-surface-variant sm:block" /><ReviewSelect label="도착역" value={values.endStationId ? String(values.endStationId) : ''} placeholder="도착역을 선택하세요" options={STATION_OPTIONS.map((station) => ({ value: String(station.id), label: station.name }))} onChange={(value) => change('endStationId', Number(value))} /></div></div>
          <ReviewSelect label="여행 경비" value={values.travelCost ? String(values.travelCost) : ''} placeholder="경비 선택" options={[{ value: '100000', label: '10만원 이하' }, { value: '500000', label: '50만원 이하' }, { value: '1000000', label: '100만원 이상' }]} onChange={(value) => change('travelCost', Number(value))} />
        </div>

        <div className="grid gap-[var(--spacing-md)] rounded-[var(--radius-lg)] border border-outline-variant/70 bg-surface-container-lowest p-[var(--spacing-md)] sm:flex sm:items-center sm:justify-between sm:gap-lg"><div><p className="text-body-md font-semibold">여행은 어떠셨나요?</p><p className="mt-xs text-label-caps text-on-surface-variant">별의 왼쪽·오른쪽을 눌러 0.5점 단위로 선택하세요.</p></div><div className="flex flex-wrap items-center gap-sm sm:shrink-0"><RatingStars value={values.rating} onChange={(rating) => change('rating', rating)} /><span className="min-w-12 text-right text-body-md font-bold text-amber-500">{(values.rating / 2).toFixed(1)}점</span></div></div>
      </div>

      <div className="grid gap-xs"><span className="text-body-md font-semibold">여행 이야기</span><InlineImageEditor value={values.content} images={values.images} thumbnailId={values.thumbnailId} onThumbnailChange={(thumbnailId) => change('thumbnailId', thumbnailId)} onChange={(content, images) => setValues((current) => ({ ...current, content, images, thumbnailId: current.thumbnailId && images.some((image) => image.id === current.thumbnailId) ? current.thumbnailId : images[0]?.id ?? null }))} /><p className="text-label-caps text-on-surface-variant">글을 쓰다가 이미지 버튼을 눌러 원하는 위치에 사진을 넣어보세요.</p></div>

      <div className="grid gap-xs"><div className="flex items-center justify-between"><span className="text-body-md font-semibold">태그</span><span className="text-label-caps text-on-surface-variant">{values.tags.length}/5</span></div><Input value={tagDraft} disabled={values.tags.length >= 5} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key !== 'Enter') return; event.preventDefault(); const tag = tagDraft.trim().replace(/^#/, ''); if (tag && !values.tags.includes(tag) && values.tags.length < 5) change('tags', [...values.tags, tag]); setTagDraft(''); }} placeholder={values.tags.length >= 5 ? '태그는 최대 5개까지 입력할 수 있습니다' : '맛집, 카페처럼 입력 후 Enter'} /><div className="flex min-h-8 flex-wrap gap-xs">{values.tags.map((tag) => <Badge key={tag} className="gap-xs">#{tag}<button type="button" aria-label={`${tag} 태그 삭제`} onClick={() => change('tags', values.tags.filter((item) => item !== tag))}><X size={14} /></button></Badge>)}</div></div>

      {error && <p className="rounded-lg bg-error-container p-sm text-body-md text-on-error-container">{error}</p>}
      <div className="flex justify-end gap-sm border-t border-outline-variant/70 pt-[var(--spacing-lg)]"><Button type="button" variant="outline" onClick={() => window.history.back()}>취소</Button><Button type="submit" size="lg" disabled={loading}>{loading ? '저장 중...' : review ? '수정 저장' : '후기 등록'}</Button></div>
    </form>
  );
}
