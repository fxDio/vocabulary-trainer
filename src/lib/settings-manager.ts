import type { GameConfig } from "../types";

const STORAGE_KEY = 'vocab-trainer-settings-v1';

export interface UserSettings {
    // Game Config
    subsetCount: number;
    totalQuestions: number;

    timerMode: GameConfig['timerMode'];
    globalMinutes: number;
    perQuestionSeconds: number;

    accelStart: number;
    accelEnd: number;

    batchSize: number;
    optionsCount: number;

    // Selection State
    selectedThemeIds: string[];
    expandedThemeIds: string[]; // For tree state
}

const DEFAULT_SETTINGS: UserSettings = {
    subsetCount: 15,
    totalQuestions: 20,
    timerMode: 'global',
    globalMinutes: 2,
    perQuestionSeconds: 10,
    accelStart: 10,
    accelEnd: 2,
    batchSize: 1,
    optionsCount: 6,
    selectedThemeIds: [],
    expandedThemeIds: ['root']
};

export class SettingsManager {
    static load(): UserSettings {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return DEFAULT_SETTINGS;
            const parsed = JSON.parse(raw);
            return { ...DEFAULT_SETTINGS, ...parsed }; // Merge to ensure new fields exist
        } catch (e) {
            console.error("Failed to load settings", e);
            return DEFAULT_SETTINGS;
        }
    }

    static save(settings: Partial<UserSettings>) {
        try {
            const current = this.load();
            const updated = { ...current, ...settings };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
            console.error("Failed to save settings", e);
        }
    }
}
