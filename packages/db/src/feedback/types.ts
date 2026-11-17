import type {
  ActionRating,
  EligibleTrainingItem,
  FeedbackLevel,
  TaskEvaluationReport,
  TaskRatings,
  TrainingDataFilter,
} from '@evolve/core';

export type {
  ActionRating,
  EligibleTrainingItem,
  FeedbackLevel,
  TaskEvaluationReport,
  TaskRatings,
  TrainingDataFilter,
};

export type FeedbackTargetType = 'action' | 'response' | 'task';
export type FeedbackRating = 'positive' | 'negative' | 'partial' | number;

export interface RecordFeedbackInput {
  sessionId: string;
  targetType: FeedbackTargetType;
  rating: FeedbackRating;
  toolCallId?: string | undefined;
  targetId?: string | undefined;
  feedbackLevel?: FeedbackLevel | undefined;
  ratingLabel?: string | undefined;
  actionRating?: ActionRating | undefined;
  taskRatings?: TaskRatings | undefined;
  evaluationId?: string | undefined;
  confidence?: number | undefined;
  source?: 'user' | 'automated_evaluation' | 'hybrid' | undefined;
  type?: string | undefined; // default 'human'
  notes?: string | undefined;
  correction?: string | undefined;
  isTechnicallyCorrect?: boolean | undefined;
  evidence?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RecordResponseFeedbackInput {
  sessionId: string;
  rating: 'correct' | 'partially_correct' | 'incorrect' | number;
  targetId?: string | undefined;
  notes?: string | undefined;
  correction?: string | undefined;
  isTechnicallyCorrect?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RecordActionFeedbackInput {
  sessionId: string;
  toolCallId: string;
  actionRating: ActionRating;
  rating?: number | undefined;
  notes?: string | undefined;
  correction?: string | undefined;
  isTechnicallyCorrect?: boolean | undefined;
  evidence?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface RecordTaskFeedbackInput {
  sessionId: string;
  taskId: string;
  planId?: string | undefined;
  evaluationId?: string | undefined;
  ratings: TaskRatings;
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
