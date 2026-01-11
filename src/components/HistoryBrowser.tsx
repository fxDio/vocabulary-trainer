import { useEffect, useState } from 'react';
import type { SessionLog, ThemeMeta } from '../types';
import { HistoryManager } from '../lib/history-manager';
import { ConfirmDialog } from './ConfirmDialog';

interface HistoryBrowserProps {
    themes: ThemeMeta[];
    onBack: () => void;
    onReplay: (session: SessionLog) => void;
}

export function HistoryBrowser({ themes, onBack, onReplay }: HistoryBrowserProps) {
    const [sessions, setSessions] = useState<SessionLog[]>([]);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const handleDelete = () => {
        if (!confirmDeleteId) return;
        HistoryManager.deleteSession(confirmDeleteId);
        const updated = HistoryManager.getAllSessions();
        updated.sort((a, b) => b.timestamp - a.timestamp);
        setSessions(updated);
        setConfirmDeleteId(null);
    };

    useEffect(() => {
        const history = HistoryManager.getAllSessions();
        // Sort by timestamp desc
        history.sort((a, b) => b.timestamp - a.timestamp);
        setSessions(history);
    }, []);

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center mb-6">
                <button onClick={onBack} className="mr-4 text-slate-400 hover:text-slate-600">
                    ← Назад
                </button>
                <h2 className="text-2xl font-bold text-slate-800">История Игр</h2>
            </div>

            {sessions.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm text-slate-400">
                    Пока нет сохраненных игр.
                </div>
            ) : (
                <div className="space-y-4">
                    {sessions.map(s => {


                        const themeNames = s.config.themeIds.map(id => themes.find(t => t.id === id)?.name || '???').join(', ');

                        let timertext = 'Без таймера';
                        if (s.config.timerMode === 'global') timertext = `${Math.floor(s.config.timeLimit / 60)} мин (Общий)`;
                        if (s.config.timerMode === 'per-question') timertext = `${s.config.timeLimit} сек/вопрос`;
                        if (s.config.timerMode === 'acceleration') timertext = `Хардкор (${s.config.accelerationStart}с -> ${s.config.accelerationEnd}с)`;

                        const difficulty = `Экран: ${s.config.batchSize || 1}, Вариантов: ${s.config.optionsCount || 6}`;

                        return (
                            <div key={s.id} className="relative group bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all flex justify-between items-center cursor-help">
                                {/* Tooltip */}
                                <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity bottom-full left-1/2 -translate-x-1/2 mb-3 w-80 bg-slate-800 text-slate-200 text-xs rounded-xl p-4 shadow-2xl z-50 pointer-events-none">
                                    <div className="font-bold text-slate-100 mb-1 border-b border-slate-600 pb-1">Параметры Игры</div>
                                    <div className="space-y-1.5">
                                        <div>
                                            <span className="text-slate-400">Темы:</span> <span className="text-white">{themeNames}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Таймер:</span> <span className="text-white">{timertext}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Сложность:</span> <span className="text-white">{difficulty}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Слов:</span> <span className="text-white">{s.config.wordCount > 0 ? s.config.wordCount : 'Все'} (из {s.totalWords})</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Вопросов:</span> <span className="text-white">{s.config.totalQuestions || '-'}</span>
                                        </div>
                                    </div>
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800"></div>
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-800 text-lg">
                                                {new Date(s.timestamp).toLocaleString('ru-RU')}
                                            </span>
                                            {/* Mode tag removed as requested */}
                                            {/* Show Subset vs Total Questions if available, else just totalWords */}
                                            <span className="text-xs border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
                                                {s.config.totalQuestions ? `${s.config.totalQuestions} вопр.` : `${s.totalWords} слов`}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-2xl font-black ${(s.score / (s.config.totalQuestions || s.totalWords || 1)) >= 0.8 ? 'text-green-500' : 'text-amber-500'
                                                }`}>
                                                {Math.round((s.score / (s.config.totalQuestions || s.totalWords || 1)) * 100)}%
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-sm text-slate-600 bg-slate-50 p-2 rounded-lg">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-slate-400 uppercase font-bold">Очки</span>
                                            <span className="font-medium">{s.score.toFixed(1)}</span>
                                        </div>
                                        <div className="flex flex-col border-l border-slate-200 pl-2">
                                            <span className="text-xs text-slate-400 uppercase font-bold">Ошибки</span>
                                            <span className="font-medium text-red-500">{s.mistakes || 0}</span>
                                        </div>
                                        <div className="flex flex-col border-l border-slate-200 pl-2">
                                            <span className="text-xs text-slate-400 uppercase font-bold">Время</span>
                                            <span className="font-medium">
                                                {s.timeTaken
                                                    ? `${Math.floor(s.timeTaken / 60)}:${(s.timeTaken % 60).toString().padStart(2, '0')}`
                                                    : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center ml-4">
                                    <button
                                        onClick={() => setConfirmDeleteId(s.id)}
                                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-10"
                                        title="Удалить"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>

                                    <button
                                        onClick={() => onReplay(s)}
                                        className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                                        title="Повторить"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <ConfirmDialog
                isOpen={!!confirmDeleteId}
                title="Удаление игры"
                message="Вы уверены, что хотите удалить эту запись из истории? Это действие нельзя отменить."
                onConfirm={handleDelete}
                onCancel={() => setConfirmDeleteId(null)}
            />
        </div>
    );
}
