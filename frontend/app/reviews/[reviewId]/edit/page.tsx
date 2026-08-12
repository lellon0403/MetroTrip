import { redirect } from "next/navigation";

export default async function EditReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  redirect(`/reviews/new?edit=${encodeURIComponent(reviewId)}`);
}
