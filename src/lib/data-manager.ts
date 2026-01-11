import type { ThemeMeta, ThemeContent, Word } from '../types';

const BASE_URL = import.meta.env.BASE_URL + 'data';
const CUSTOM_THEMES_KEY = 'vocab_custom_themes_meta';
const CUSTOM_DATA_PREFIX = 'vocab_custom_data_';

export const DataManager = {
    async getThemes(): Promise<ThemeMeta[]> {
        let builtInFiles: ThemeMeta[] = [];
        try {
            const response = await fetch(`${BASE_URL}/themes.json?t=${Date.now()}`);
            if (response.ok) {
                builtInFiles = await response.json();
            }
        } catch (e) {
            console.error("Failed to load built-in themes:", e);
        }

        // Transform Built-in Files into Folder + File structure
        const builtInGroups: ThemeMeta[] = [];
        const transformedBuiltIns = builtInFiles.map(t => {
            const groupId = `group_builtin_${t.id}`;
            // Create the virtual Folder
            builtInGroups.push({
                id: groupId,
                name: t.name,
                pair: t.pair,
                path: '',
                isGroup: true,
                wordCount: 0 // Will need to sum up children if we want logic, or 0
            });

            // Return the FILE inside that folder
            return {
                ...t,
                name: `${t.name} (Базовый)`,
                parentId: groupId,
                wordCount: t.wordCount,
                path: `${BASE_URL}/${t.path}`
            };
        });

        const rawCustom = localStorage.getItem(CUSTOM_THEMES_KEY);
        const custom: ThemeMeta[] = rawCustom ? JSON.parse(rawCustom) : [];

        // Deduplicate: If an ID exists in both, prefer custom? 
        return [...builtInGroups, ...transformedBuiltIns, ...custom];
    },

    async loadTheme(path: string): Promise<ThemeContent> {
        // Check if it's a local path
        if (path.startsWith('local://')) {
            const id = path.replace('local://', '');
            const raw = localStorage.getItem(CUSTOM_DATA_PREFIX + id);
            if (!raw) throw new Error(`Local theme ${id} not found`);
            return JSON.parse(raw);
        }

        // Standard remote fetch
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Failed to load theme at ${path}`);
        return response.json();
    },

    async loadMultipleThemes(themes: ThemeMeta[]): Promise<Word[]> {
        const promises = themes.map(t => this.loadTheme(t.path));
        // Use allSetted or just Promise.all. 
        // If one fails, we probably want to know.
        const contents = await Promise.all(promises);
        return contents.flatMap(c => c.words);
    },

    // Editor Methods
    createGroup(name: string, parentId?: string): ThemeMeta {
        const id = 'group_' + Date.now();
        const meta: ThemeMeta = {
            id,
            pair: 'ru-en', // Groups can be neutral or inherit? Let's say neutral for now.
            name,
            path: '', // No content path for groups
            isGroup: true,
            parentId,
            wordCount: 0
        };

        // Save to index
        const rawCustom = localStorage.getItem(CUSTOM_THEMES_KEY);
        const custom: ThemeMeta[] = rawCustom ? JSON.parse(rawCustom) : [];
        custom.push(meta);
        localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(custom));

        return meta;
    },

    saveTheme(meta: ThemeMeta, content: ThemeContent) {
        // 1. Save Content (only if not a group)
        if (!meta.isGroup) {
            localStorage.setItem(CUSTOM_DATA_PREFIX + meta.id, JSON.stringify(content));
            // Update word count in meta
            meta.wordCount = content.words.length;
        }

        // 2. Update Meta Index
        const rawCustom = localStorage.getItem(CUSTOM_THEMES_KEY);
        let custom: ThemeMeta[] = rawCustom ? JSON.parse(rawCustom) : [];

        // Check if we already have this ID
        const existingIdx = custom.findIndex(t => t.id === meta.id);
        if (existingIdx >= 0) {
            custom[existingIdx] = meta;
        } else {
            custom.push(meta);
        }
        localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(custom));
    },

    deleteTheme(id: string) {
        // Remove from MetaIndex
        const rawCustom = localStorage.getItem(CUSTOM_THEMES_KEY);
        if (rawCustom) {
            const custom: ThemeMeta[] = JSON.parse(rawCustom);
            const filtered = custom.filter(t => t.id !== id);
            localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(filtered));
        }
        // Remove Data
        localStorage.removeItem(CUSTOM_DATA_PREFIX + id);
    }
};
