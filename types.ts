
export interface Chapter {
  id: string;
  title: string;
  text: string;
  audioUrl?: string;
  duration?: number;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  coverImage?: string;
  chapters: Chapter[];
  createdAt: number;
}

export interface VoiceOption {
  id: string;
  name: string;
  description: string;
  modelVoice: string;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  EXTRACTING = 'EXTRACTING',
  SPLITTING = 'SPLITTING',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export type SyncProvider = 'public' | 'github' | 'none';

export interface SyncState {
  provider: SyncProvider;
  roomId: string | null;
  githubToken: string | null;
  gistId: string | null;
  lastSynced: number | null;
  isSyncing: boolean;
}
