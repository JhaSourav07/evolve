export type FeedbackTargetType = 'action' | 'response';
export type FeedbackRating = 'positive' | 'negative' | 'partial' | number;

export interface RecordFeedbackInput {
  sessionId: string;
  targetType: FeedbackTargetType;
  rating: FeedbackRating;
  toolCallId?: string | undefined;
  type?: string | undefined; // default 'human'
  notes?: string | undefined;
  correction?: string | undefined;
  isTechnicallyCorrect?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface ConvertToTrainingExampleOptions {
  prompt?: string | undefined;
  response?: string | undefined;
  critique?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}
