export type Language = 'ru' | 'en' | 'cn';

export interface ThemeMeta {
    id: string;
    pair: string; // e.g., "ru-en"
    name: string;
    path: string; // Empty for groups/folders

    // V2.0 Tree Support
    isGroup?: boolean;
    parentId?: string; // ID of parent group (undefined = root)
    wordCount?: number; // Cached count
}

export interface Word {
    id: string;
    val: string[]; // [0] = source (e.g. Ru), [1] = target (e.g. En)
}

export interface ThemeContent {
    id: string;
    pair: Language[];
    words: Word[];
}

export interface GameConfig {
    themeIds: string[];
    wordCount: number; // 0 = all
    mode: 'one-of-n' | 'matching';
    timerMode: 'none' | 'global' | 'per-question' | 'acceleration';
    timeLimit: number; // seconds
    direction: 'ru-en' | 'en-ru';
    // V2.0 New Configs
    batchSize: number; // 1-5 questions per screen
    optionsCount: number; // 5-20 options per screen
    totalQuestions?: number; // Total number of questions in the specific test run
    isReplay?: boolean; // New flag for replay mode
    replaySessionId?: string; // ID of the session being replayed

    // Hardcore Config
    accelerationStart?: number; // Initial time (sec)
    accelerationEnd?: number;   // Final time (sec)
}

export interface QuestionLog {
    wordId: string;
    options: string[]; // IDs of options presented
    correctId: string;
    selectedId: string | null;
    isCorrect: boolean;
    timeTaken: number;
}

export interface SessionLog {
    id: string;
    timestamp: number;
    config: GameConfig;
    questions: QuestionLog[];
    score: number;
    mistakes?: number; // Total errors made
    totalWords: number;
    timeTaken?: number; // Total duration in seconds
}
