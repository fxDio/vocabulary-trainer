import { useState, useEffect } from 'react';
import type { ThemeMeta, GameConfig } from '../types';
import { DataManager } from '../lib/data-manager';

interface ConfiguratorProps {
    themes: ThemeMeta[];
    onStart: (config: GameConfig) => void;
    onBack: () => void;
}

export function Configurator({ themes, onStart, onBack }: ConfiguratorProps) {
    const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
    const [mode] = useState<GameConfig['mode']>('one-of-n');
    const [timerMode, setTimerMode] = useState<GameConfig['timerMode']>('none');
    const [timeLimit, setTimeLimit] = useState(30);
    const [wordCount, setWordCount] = useState(20);
    const [direction, setDirection] = useState<GameConfig['direction']>('ru-en');

    // V2.0 Configs
    const [batchSize, setBatchSize] = useState(1);
    const [optionsCount, setOptionsCount] = useState(5);
    const [questionCount, setQuestionCount] = useState(20); // Default test length

    // Total available words in selected themes
    const [totalWords, setTotalWords] = useState(0);
    const [isCounting, setIsCounting] = useState(false);

    // Calculate total words whenever selected themes change
    useEffect(() => {
        if (selectedThemes.size === 0) {
            setTotalWords(0);
            return;
        }

        setIsCounting(true);
        const selected = themes.filter(t => selectedThemes.has(t.id));

        DataManager.loadMultipleThemes(selected)
            .then(words => {
                setTotalWords(words.length);
                // Adjust wordCount if it exceeds new total (but generally keep user pref or existing default)
                // If user wants ALL, wordCount usually is 0 or Max. 
                // Let's cap current wordCount if it's explicitly set higher than total (unless it was 'all').
                // Actually, let's not auto-change it too aggressively to annoy user, creates jumps.
                // But we should ensure slider Max is correct.
            })
            .catch(console.error)
            .finally(() => setIsCounting(false));

    }, [selectedThemes, themes]);


    const toggleTheme = (id: string) => {
        const newSet = new Set(selectedThemes);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedThemes(newSet);
    };

    const handleStartGame = () => {
        if (selectedThemes.size === 0) return;

        // Ensure we don't request more words than exist
        const safeWordCount = wordCount === 0 ? 0 : Math.min(wordCount, totalWords);

        onStart({
            themeIds: Array.from(selectedThemes),
            mode,
            timerMode,
            timeLimit,
            wordCount: safeWordCount,
            totalQuestions: questionCount,
            direction,
            batchSize,
            optionsCount
        });
    };

    return (
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-slate-100 max-w-2xl mx-auto">
            <div className="flex items-center mb-6">
                <button
                    onClick={onBack}
                    className="mr-4 text-slate-400 hover:text-slate-600 font-medium transition-colors"
                >
                    ← Назад
                </button>
                <h2 className="text-2xl font-bold text-slate-800">Настройка Теста</h2>
            </div>

            {/* Direction Selection */}
            <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex justify-center space-x-4">
                    <button
                        onClick={() => setDirection('ru-en')}
                        className={`px-4 py-2 rounded-lg font-bold transition-all ${direction === 'ru-en' ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-500 border border-slate-200'}`}
                    >
                        RU → EN
                    </button>
                    <button
                        onClick={() => setDirection('en-ru')}
                        className={`px-4 py-2 rounded-lg font-bold transition-all ${direction === 'en-ru' ? 'bg-blue-600 text-white shadow' : 'bg-white text-slate-500 border border-slate-200'}`}
                    >
                        EN → RU
                    </button>
                </div>
            </div>

            {/* Theme Selection */}
            <div className="mb-8">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold text-slate-700">1. Выберите темы</h3>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full font-bold">
                        {isCounting ? 'Считаем...' : `Всего слов: ${totalWords}`}
                    </span>
                </div>

                {themes.length === 0 ? (
                    <p className="text-slate-400 italic">Нет доступных тем</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {themes.map(theme => (
                            <div
                                key={theme.id}
                                onClick={() => toggleTheme(theme.id)}
                                className={`flex items-center p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedThemes.has(theme.id)
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-slate-100 hover:border-slate-300'
                                    }`}
                            >
                                <div className={`w-5 h-5 rounded border flex items-center justify-center mr-3 ${selectedThemes.has(theme.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                                    }`}>
                                    {selectedThemes.has(theme.id) && <span className="text-white text-xs">✓</span>}
                                </div>
                                <div>
                                    <div className="font-medium text-slate-900">{theme.name}</div>
                                    <div className="text-xs text-slate-500">{theme.pair.toUpperCase()}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Game Settings */}
            <div className="mb-8">
                <h3 className="text-lg font-semibold mb-3 text-slate-700">2. Настройки (Subset & Length)</h3>

                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-6">

                    {/* 1. Subset Size */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-bold text-slate-700">Сколько слов учим? (Из {totalWords})</label>
                            <span className="text-sm font-bold text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
                                {wordCount === 0 ? `Все (${totalWords})` : wordCount}
                            </span>
                        </div>
                        <input
                            type="range"
                            value={wordCount}
                            onChange={(e) => setWordCount(Number(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                            min="0"
                            max={totalWords > 0 ? totalWords : 100}
                            step="5"
                            disabled={totalWords === 0}
                        />
                        <div className="flex justify-between mt-1 text-xs text-slate-400">
                            <span className="cursor-pointer" onClick={() => setWordCount(0)}>Все</span>
                            <span className="cursor-pointer" onClick={() => setWordCount(totalWords)}>Макс</span>
                        </div>
                    </div>

                    {/* 2. Test Length */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-bold text-slate-700">Длительность теста (Вопросов)</label>
                            <span className="text-sm font-bold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full">
                                {questionCount}
                            </span>
                        </div>
                        <input
                            type="range"
                            value={questionCount}
                            onChange={(e) => setQuestionCount(Number(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            min="5"
                            max="100"
                            step="5"
                        />
                        <div className="flex justify-between mt-1 text-xs text-slate-400">
                            <span>5</span>
                            <span>20 (Стандарт)</span>
                            <span>50</span>
                            <span>100</span>
                        </div>
                    </div>

                    {/* V2.0 New Settings: Batch & Options */}
                    <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-200">
                        <div>
                            <label className="text-sm font-bold text-slate-700 block mb-2">Слов на экране (Слева)</label>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setBatchSize(Math.max(1, batchSize - 1))}
                                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-50"
                                >-</button>
                                <span className="flex-1 text-center font-bold text-slate-800">{batchSize}</span>
                                <button
                                    onClick={() => setBatchSize(Math.min(5, batchSize + 1))}
                                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-50"
                                >+</button>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">От 1 до 5</p>
                        </div>
                        <div>
                            <label className="text-sm font-bold text-slate-700 block mb-2">Вариантов (Справа)</label>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={() => setOptionsCount(Math.max(5, optionsCount - 5))}
                                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-50"
                                >-</button>
                                <span className="flex-1 text-center font-bold text-slate-800">{optionsCount}</span>
                                <button
                                    onClick={() => setOptionsCount(Math.min(20, optionsCount + 5))}
                                    className="w-8 h-8 rounded-lg bg-white border border-slate-300 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-50"
                                >+</button>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">От 5 до 20</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Timer Settings */}
            <div className="mb-8">
                <h3 className="text-lg font-semibold mb-3 text-slate-700">3. Таймер</h3>
                <select
                    value={timerMode}
                    onChange={(e) => setTimerMode(e.target.value as any)}
                    className="w-full p-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                    <option value="none">Без таймера</option>
                    <option value="per-question">На каждый вопрос</option>
                    <option value="global">Общее время</option>
                    <option value="acceleration">Ускорение (Хардкор)</option>
                </select>

                {timerMode !== 'none' && (
                    <div className="mt-3">
                        <label className="text-sm text-slate-500 block mb-1">
                            {timerMode === 'acceleration' ? 'Стартовое время (сек)' : 'Время (сек)'}
                        </label>
                        <input
                            type="number"
                            value={timeLimit}
                            onChange={(e) => setTimeLimit(Number(e.target.value))}
                            className="w-full p-2 rounded-lg border border-slate-200"
                            min="1"
                        />
                    </div>
                )}
            </div>

            <button
                onClick={handleStartGame}
                disabled={selectedThemes.size === 0}
                className="w-full py-4 text-lg font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-xl hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
                Начать Тест
            </button>
        </div >
    );
}
