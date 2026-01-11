import { useState, useEffect } from 'react';
import type { GameConfig, ThemeMeta } from '../types';
import { DataManager } from '../lib/data-manager';
import { SettingsManager } from '../lib/settings-manager';
import { ThemeSelectorTree } from './ThemeSelectorTree';

interface DashboardProps {
    onNavigate: (view: 'history' | 'editor') => void;
    onStartGame: (config: GameConfig) => void;
    initialMode?: 'main' | 'config';
}

export function Dashboard({ onNavigate, onStartGame, initialMode = 'main' }: DashboardProps) {
    const [view, setView] = useState<'main' | 'config'>(initialMode);
    const [themes, setThemes] = useState<ThemeMeta[]>([]);

    // Init from Storage
    const saved = SettingsManager.load();

    // Config State
    const [selectedThemeIds, setSelectedThemeIds] = useState<Set<string>>(new Set(saved.selectedThemeIds));
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(saved.expandedThemeIds));

    // Timer State (Visual representations)
    const [timerMode, setTimerMode] = useState<GameConfig['timerMode']>(saved.timerMode);

    const [globalMinutes, setGlobalMinutes] = useState(saved.globalMinutes);
    const [perQuestionSeconds, setPerQuestionSeconds] = useState(saved.perQuestionSeconds);

    const [accelStart, setAccelStart] = useState(saved.accelStart);
    const [accelEnd, setAccelEnd] = useState(saved.accelEnd);

    const [subsetCount, setSubsetCount] = useState(saved.subsetCount);
    const [batchSize, setBatchSize] = useState(saved.batchSize);
    const [optionsCount, setOptionsCount] = useState(saved.optionsCount);
    const [totalQuestions, setTotalQuestions] = useState(saved.totalQuestions);

    useEffect(() => {
        DataManager.getThemes().then(setThemes);
    }, []);

    // Auto-Save Effect
    useEffect(() => {
        SettingsManager.save({
            subsetCount,
            totalQuestions,
            timerMode,
            globalMinutes,
            perQuestionSeconds,
            accelStart,
            accelEnd,
            batchSize,
            optionsCount,
            selectedThemeIds: Array.from(selectedThemeIds),
            expandedThemeIds: Array.from(expandedIds)
        });
    }, [
        subsetCount, totalQuestions, timerMode, globalMinutes, perQuestionSeconds,
        accelStart, accelEnd, batchSize, optionsCount, selectedThemeIds, expandedIds
    ]);

    // Auto-Expand Logic (First Run / Default)
    // If only 'root' is expanded (default) and themes loaded, expand all groups
    useEffect(() => {
        if (themes.length > 0 && expandedIds.size === 1 && expandedIds.has('root')) {
            const allGroups = new Set(expandedIds);
            themes.forEach(t => {
                if (t.isGroup) allGroups.add(t.id);
            });
            // Only update if we actually found groups
            if (allGroups.size > 1) setExpandedIds(allGroups);
        }
    }, [themes]);

    const handleExpandToggle = (id: string) => {
        const next = new Set(expandedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedIds(next);
    };

    const handleThemeToggle = (id: string, isGroup: boolean) => {
        const newSet = new Set(selectedThemeIds);

        if (isGroup) {
            // Recursive Select/Deselect Logic
            const collectChildren = (parentId: string): string[] => {
                return themes.filter(t => t.parentId === parentId).map(t => t.id);
            };

            // Helper to recursively find all descendants
            const getAllDescendants = (rootId: string): string[] => {
                const direct = collectChildren(rootId);
                let all = [...direct];
                direct.forEach(childId => {
                    const child = themes.find(t => t.id === childId);
                    if (child?.isGroup) {
                        all = [...all, ...getAllDescendants(childId)]; // Recursion
                    }
                });
                return all;
            };

            const descendants = getAllDescendants(id);
            // Also include self if it's select-able (though usually group itself isn't a theme to play)
            // But let's assume we toggle visibility for "all inside". 
            // In our logic, only LEAVES (themes with words) matter for the game.

            // Check if currently "all" descendants are selected -> then Deselect All
            // If some or none -> Select All
            const meaningfulDescendants = descendants.filter(did => !themes.find(t => t.id === did)?.isGroup);
            const allSelected = meaningfulDescendants.every(did => newSet.has(did));

            if (allSelected) {
                meaningfulDescendants.forEach(did => newSet.delete(did));
            } else {
                meaningfulDescendants.forEach(did => newSet.add(did));
            }
        } else {
            // Simple toggle for leaf
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
        }

        setSelectedThemeIds(newSet);
    };

    const totalAvailableWords = themes
        .filter(t => selectedThemeIds.has(t.id))
        .reduce((acc, t) => (t.wordCount || 0) + acc, 0);

    const handleStart = () => {
        if (selectedThemeIds.size === 0) {
            alert("Выберите хотя бы одну тему!");
            return;
        }

        // Calculate total questions 
        // Logic: Use user input directly.
        // If subset > 0, we take subset. If subset=0, we take totalAvailableWords.

        let wordsForGameCount = subsetCount;
        if (wordsForGameCount === 0) {
            wordsForGameCount = totalAvailableWords;
        }

        // Create Config
        const config: GameConfig = {
            themeIds: Array.from(selectedThemeIds),
            wordCount: subsetCount,
            mode: 'matching', // Forced V2 mode
            timerMode: timerMode,
            timeLimit: timerMode === 'global' ? globalMinutes * 60 : perQuestionSeconds,
            direction: 'ru-en', // Default
            batchSize,
            optionsCount,
            totalQuestions: totalQuestions,

            // Hardcore Params
            accelerationStart: accelStart,
            accelerationEnd: accelEnd
        };

        onStartGame(config);
    };

    if (view === 'main') {
        return (
            <div className="max-w-4xl mx-auto animate-fade-in">
                {/* Hero Section */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl mb-8 transform transition hover:scale-[1.01]">
                    <h2 className="text-3xl font-extrabold mb-2">Добро пожаловать!</h2>
                    <p className="text-blue-100 text-base mb-6 max-w-xl">
                        Тренируйте словарный запас с новой версией тренажера.
                    </p>
                    <button
                        onClick={() => setView('config')}
                        className="bg-white text-blue-700 px-6 py-3 rounded-xl font-bold text-lg shadow-lg hover:bg-blue-50 transition-all active:scale-95"
                    >
                        ► Начать тренировку
                    </button>
                </div>

                {/* Grid Menu */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* History Card */}
                    <div
                        onClick={() => onNavigate('history')}
                        className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 cursor-pointer hover:border-blue-300 hover:shadow-2xl transition-all group"
                    >
                        <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <span className="text-2xl">📜</span>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">История</h3>
                        <p className="text-slate-500">
                            Результаты и повторы.
                        </p>
                    </div>

                    {/* Editor Card */}
                    <div
                        onClick={() => onNavigate('editor')}
                        className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 cursor-pointer hover:border-green-300 hover:shadow-2xl transition-all group"
                    >
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <span className="text-2xl">✏️</span>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Редактор</h3>
                        <p className="text-slate-500">
                            Темы, папки и слова.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Config View
    return (
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8 animate-fade-in">
            <div className="flex items-center mb-6">
                <button
                    onClick={() => setView('main')}
                    className="mr-4 w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
                >
                    ←
                </button>
                <h2 className="text-2xl font-bold text-slate-800">Настройка Тренировки</h2>
            </div>

            <div className="space-y-8">
                {/* 1. Theme Selection (Tree) */}
                <section>
                    <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mr-3 text-sm">1</span>
                        Выберите темы
                        <span className="ml-auto text-sm font-normal text-slate-500">
                            {selectedThemeIds.size} тем, {totalAvailableWords} слов
                        </span>
                    </h3>
                    <ThemeSelectorTree
                        themes={themes}
                        mode="checklist"
                        selectedIds={selectedThemeIds}
                        onToggle={handleThemeToggle}
                        expandedIds={expandedIds}
                        onToggleExpand={handleExpandToggle}
                    />
                </section>

                {/* 2. Subset & Duration */}
                <section>
                    <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mr-3 text-sm">2</span>
                        Сколько учим?
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-slate-600 mb-1">Слов в игре (из {totalAvailableWords})</label>
                            <input
                                type="number"
                                value={subsetCount}
                                onChange={e => setSubsetCount(Number(e.target.value))}
                                className="w-full border rounded-lg p-2"
                            />
                            <p className="text-xs text-slate-400 mt-1">0 = учить все {totalAvailableWords} слов</p>
                        </div>
                        <div>
                            <label className="block text-sm text-slate-600 mb-1">Количество вопросов</label>
                            <input
                                type="number"
                                value={totalQuestions}
                                onChange={e => setTotalQuestions(Number(e.target.value))}
                                className="w-full border rounded-lg p-2 font-bold"
                            />
                        </div>
                    </div>
                </section>

                {/* 3. Timer Settings */}
                <section>
                    <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <span className="w-8 h-8 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center mr-3 text-sm">3</span>
                        Таймер
                    </h3>

                    <div className="flex gap-2 mb-4">
                        {(['global', 'per-question', 'acceleration', 'none'] as const).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setTimerMode(mode)}
                                className={`flex-1 py-2 rounded-lg text-sm border font-medium transition-all ${timerMode === mode
                                    ? 'bg-orange-600 text-white border-orange-600 shadow-md transform scale-105'
                                    : 'bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                {mode === 'global' && 'Общий'}
                                {mode === 'per-question' && 'На вопрос'}
                                {mode === 'acceleration' && 'Хардкор'}
                                {mode === 'none' && 'Без'}
                            </button>
                        ))}
                    </div>

                    {timerMode === 'global' && (
                        <div>
                            <label className="block text-sm text-slate-600 mb-1">Минут на игру:</label>
                            <input
                                type="number"
                                value={globalMinutes}
                                onChange={e => setGlobalMinutes(Number(e.target.value))}
                                className="w-full border rounded-lg p-2 text-xl font-bold"
                            />
                        </div>
                    )}

                    {timerMode === 'per-question' && (
                        <div>
                            <label className="block text-sm text-slate-600 mb-1">Секунд на вопрос:</label>
                            <input
                                type="number"
                                value={perQuestionSeconds}
                                onChange={e => setPerQuestionSeconds(Number(e.target.value))}
                                className="w-full border rounded-lg p-2 text-xl font-bold"
                            />
                        </div>
                    )}

                    {timerMode === 'acceleration' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">От (сек):</label>
                                <input
                                    type="number"
                                    value={accelStart}
                                    onChange={e => setAccelStart(Number(e.target.value))}
                                    className="w-full border rounded-lg p-2 text-xl font-bold"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">До (сек):</label>
                                <input
                                    type="number"
                                    value={accelEnd}
                                    onChange={e => setAccelEnd(Number(e.target.value))}
                                    className="w-full border rounded-lg p-2 text-xl font-bold"
                                />
                            </div>
                            <div className="col-span-2 text-xs text-orange-500">
                                Время будет плавно уменьшаться с каждым вопросом.
                            </div>
                        </div>
                    )}
                </section>

                {/* 4. Layout Settings */}
                <section>
                    <h3 className="text-lg font-semibold mb-3 flex items-center">
                        <span className="w-8 h-8 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mr-3 text-sm">4</span>
                        Сложность Интерфейса
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-slate-600 mb-1">Вопросов на экране ({batchSize})</label>
                            <input
                                type="range"
                                min="1" max="5"
                                value={batchSize}
                                onChange={e => setBatchSize(Number(e.target.value))}
                                className="w-full"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-slate-600 mb-1">Вариантов ответа ({optionsCount})</label>
                            <input
                                type="range"
                                min="4" max="20"
                                value={optionsCount}
                                onChange={e => setOptionsCount(Number(e.target.value))}
                                className="w-full"
                            />
                        </div>
                    </div>
                </section>

                <button
                    onClick={handleStart}
                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
                >
                    Поехали! 🚀
                </button>
            </div>
        </div>
    );
}
