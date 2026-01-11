import type { SessionLog } from '../types';

const STORAGE_KEY = 'vocab_trainer_history';

export const HistoryManager = {
    saveSession(session: SessionLog) {
        const history = this.getAllSessions();
        history.push(session);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

        // Auto-save to file attempt (will prompt if not supported/permitted context)
        // For now we just focus on local storage reliability
    },

    getAllSessions(): SessionLog[] {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        try {
            return JSON.parse(raw);
        } catch {
            return [];
        }
    },

    getSession(id: string): SessionLog | undefined {
        return this.getAllSessions().find(s => s.id === id);
    },

    async exportHistory() {
        const data = localStorage.getItem(STORAGE_KEY) || '[]';
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `vocab_history_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    deleteSession(id: string) {
        let history = this.getAllSessions();
        history = history.filter(s => s.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    },

    // Future: File System Access API can be added here
};
