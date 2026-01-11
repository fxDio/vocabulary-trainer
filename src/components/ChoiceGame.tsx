import { useState, useEffect, useCallback, useRef } from 'react';
import type { GameConfig, Word, SessionLog, QuestionLog } from '../types';
import { useTimer } from '../lib/timer-logic';
import { HistoryManager } from '../lib/history-manager';

interface ChoiceGameProps {
    config: GameConfig;
    words: Word[]; // The sequence of questions
    dictionary?: Word[]; // Full pool for lookup
    replayData?: QuestionLog[];
    onExit: () => void;
}

export function ChoiceGame({ config, words, dictionary, onExit }: ChoiceGameProps) {
    const fullDictionary = dictionary || words;

    // --- State ---
    const [batchIndex, setBatchIndex] = useState(0); // Which batch we are on
    const [score, setScore] = useState(0);
    const [mistakes, setMistakes] = useState(0); // Track total errors
    const [elapsedTime, setElapsedTime] = useState(0); // Track time manually if needed

    const [currentBatch, setCurrentBatch] = useState<Word[]>([]);
    const [options, setOptions] = useState<Word[]>([]);

    // Selection State
    const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
    const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
    const [wrongIds, setWrongIds] = useState<Set<string>>(new Set()); // Options clicked wrongly (temp highlight)
    const [correctMatchIds, setCorrectMatchIds] = useState<Set<string>>(new Set());

    // Track which questions have been "tainted" by a wrong guess (for scoring)
    const [taintedQuestionIds, setTaintedQuestionIds] = useState<Set<string>>(new Set());

    const [isFinished, setIsFinished] = useState(false);

    // Logging
    const sessionLogRef = useRef<SessionLog>({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        config: config,
        questions: [],
        score: 0,
        totalWords: words.length
    });

    const timerRef = useRef<number | null>(null);
    const startTimeRef = useRef<number>(Date.now());

    // --- Timer Logic ---
    const handleTimeUp = useCallback(() => {
        if (!isFinished) {
            finishGame();
        }
    }, [isFinished]);

    useEffect(() => {
        // Global Elapsed Timer (for display if 'none')
        const interval = setInterval(() => {
            setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }, 1000);
        return () => {
            clearInterval(interval);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    const timer = useTimer({
        mode: config.timerMode,
        timeLimit: config.timeLimit,
        onTimeUp: handleTimeUp,
        accelerationStep: 0.5,
        minTime: 2.0
    });

    // --- Batch Initialization ---
    useEffect(() => {
        if (isFinished) return;

        // Calculate slice
        const batchSize = config.batchSize || 1;
        const start = batchIndex * batchSize;
        if (start >= words.length) {
            finishGame();
            return;
        }

        const end = Math.min(start + batchSize, words.length);
        const batchOfWords = words.slice(start, end);
        setCurrentBatch(batchOfWords);

        // Generate Options
        const correctOptions = batchOfWords;

        // 2. Fill rest with distractors
        const needed = (config.optionsCount || 5) - correctOptions.length;

        // Exclude current batch from distractors pool
        const pool = fullDictionary.filter(w => !batchOfWords.find(b => b.id === w.id));
        const distractors = pool.sort(() => Math.random() - 0.5).slice(0, Math.max(0, needed));

        // Combine and Shuffle
        const finalOptions = [...correctOptions, ...distractors].sort(() => Math.random() - 0.5);
        setOptions(finalOptions);

        // Reset Batch State
        setResolvedIds(new Set());
        setCorrectMatchIds(new Set());
        setWrongIds(new Set());
        // Do NOT reset taintedIds here, they are per-session? No, per question.
        // But since questions are unique in sequence (mostly), we can keep them or reset. 
        // Actually, taintedIds refers to questions. If a question ID repeats in later batch, it's a new instance?
        // Probably not. Tracking per batch ID is better. But keeping it simple: Tainted set resets on batch?
        // Yes, reset tainted for new batch questions.
        setTaintedQuestionIds(new Set());

        // Auto-select logic
        // 1. If batch has only 1 item, select it immediately
        if (batchOfWords.length === 1) {
            setSelectedQuestionId(batchOfWords[0].id);
        } else {
            setSelectedQuestionId(null);
        }

        timer.reset();

    }, [batchIndex, words, isFinished, config, fullDictionary, timer.reset]);


    // --- Interaction ---
    const handleQuestionClick = (id: string) => {
        if (resolvedIds.has(id)) return;
        setSelectedQuestionId(id);
        setWrongIds(new Set()); // Clear error flash
    };

    const handleOptionClick = (optionId: string) => {
        if (!selectedQuestionId) return; // Must pick question first
        if (correctMatchIds.has(optionId)) return; // Already matched

        const question = currentBatch.find(q => q.id === selectedQuestionId);
        if (!question) return;

        const isCorrect = question.id === optionId;

        if (isCorrect) {
            // Correct!
            const newResolved = new Set(resolvedIds).add(selectedQuestionId);
            setResolvedIds(newResolved);
            setCorrectMatchIds(prev => new Set(prev).add(optionId));

            // Scoring: Only if NOT tainted
            if (!taintedQuestionIds.has(selectedQuestionId)) {
                // Partial Score? 
                // User said: "I click wrong then right and get point -> Bad".
                // So if tainted, 0 points.
                // If clean, 1 point? Or 1/BatchSize?
                // Let's give 1 point per QUESTION. 
                // Or if we want strict matching logic:
                setScore(s => s + 1);
            }

            // Auto-advance Logic
            if (newResolved.size === currentBatch.length) {
                // Next Batch
                timerRef.current = setTimeout(() => {
                    setBatchIndex(prev => prev + 1);
                }, 400) as any;
                setSelectedQuestionId(null);
            } else {
                // Not finished yet.
                // Check if only 1 remains?
                const remaining = currentBatch.filter(q => !newResolved.has(q.id));
                if (remaining.length === 1) {
                    // Auto-select the last one
                    setSelectedQuestionId(remaining[0].id);
                } else {
                    setSelectedQuestionId(null);
                }
            }

        } else {
            // Wrong!
            setWrongIds(prev => new Set(prev).add(optionId));
            setMistakes(m => m + 1);
            setTaintedQuestionIds(prev => new Set(prev).add(selectedQuestionId));

            // Instant Correct Feedback?
            // "Show correct answer immediately on red"
            // We can highlight the correct option for this question in Green temporarily?
            // implemented via render class logic below
        }
    };

    const handleManualExit = () => {
        // User clicked X. Save progress and exit.
        setIsFinished(true);
        sessionLogRef.current.score = score;
        sessionLogRef.current.mistakes = mistakes;
        sessionLogRef.current.timeTaken = elapsedTime;
        sessionLogRef.current.totalWords = words.length;
        HistoryManager.saveSession(sessionLogRef.current);
        onExit();
    };

    const finishGame = () => {
        setIsFinished(true);
        // Save
        sessionLogRef.current.score = score;
        sessionLogRef.current.mistakes = mistakes;
        sessionLogRef.current.timeTaken = elapsedTime;
        sessionLogRef.current.questions = []; // Populate if we tracked details
        HistoryManager.saveSession(sessionLogRef.current);
    };

    if (isFinished) {
        // (Keep existing finish screen logig but update score display to handle floats)
        const percentage = Math.round((score / words.length) * 100);
        const isSuccess = percentage >= 80;
        return (
            <div className="bg-white rounded-3xl shadow-2xl p-10 text-center max-w-lg mx-auto animate-slide-up border border-slate-100">
                <h2 className="text-3xl font-extrabold text-slate-800 mb-2">{isSuccess ? 'Отлично!' : 'Завершено'}</h2>
                <div className="text-6xl font-black mb-2 text-blue-600">{percentage}%</div>
                <div className="text-slate-600 font-medium mb-1">Очки: {score} / {words.length}</div>
                <div className="text-red-500 font-medium mb-4">Ошибки: {mistakes}</div>
                <button onClick={onExit} className="mt-4 py-3 px-8 bg-blue-600 text-white rounded-xl font-bold">В меню</button>
            </div>
        );
    }

    // Timer Display Value
    const timerDisplay = config.timerMode === 'none'
        ? `${Math.floor(elapsedTime / 60)}:${(elapsedTime % 60).toString().padStart(2, '0')}`
        : `${Math.ceil(timer.timeLeft)}s`;

    return (
        <div className="max-w-5xl mx-auto h-[calc(100vh-100px)] flex flex-col">
            {/* HUD */}
            <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 mb-4 flex justify-between items-center z-10">

                <div className="flex items-center gap-4">
                    {/* Exit Button */}
                    <button onClick={handleManualExit} className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 font-bold hover:text-red-500 transition-colors">
                        ✕
                    </button>

                    {/* Debug Info */}
                    <div className="relative group">
                        <span className="cursor-help text-slate-300 hover:text-blue-500 font-bold text-lg transition-colors">ⓘ</span>
                        <div className="absolute top-8 left-0 w-64 bg-white shadow-xl rounded-xl border border-slate-200 p-4 hidden group-hover:block z-50 text-xs text-left">
                            <h4 className="font-bold mb-2">Слова ({new Set(words.map(w => w.id)).size}):</h4>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                                {Array.from(new Set(words.map(w => w.id))).map(id => {
                                    const w = words.find(x => x.id === id);
                                    return (
                                        <div key={id} className="text-slate-600 border-b border-slate-50 pb-1">
                                            {w?.val[0]} - {w?.val[1]}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="font-bold text-slate-700">
                    {Math.min((batchIndex * (config.batchSize || 1)) + 1, words.length)}..{Math.min((batchIndex + 1) * (config.batchSize || 1), words.length)} / {words.length}
                </div>

                <div className="flex gap-4 text-sm font-bold">
                    <div className={`px-3 py-1 rounded-lg ${config.timerMode === 'none' ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-600'}`}>
                        ⏱ {timerDisplay}
                    </div>
                    <div className="text-red-500 bg-red-50 px-3 py-1 rounded-lg">FAILED: {mistakes}</div>
                    <div className="text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">SCORE: {score}</div>
                </div>
            </div>

            {/* Game Area - Two Columns */}
            <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">

                {/* Left: Questions (1-5) */}
                <div className="col-span-4 flex flex-col gap-3 justify-center">
                    {currentBatch.map((q, idx) => {
                        // Use a composite ID for the current batch instance to avoid collisions if same word appears twice in one batch (rare but possible)
                        // Actually, typical logic suggests unique questions per batch.
                        // But if random, it could happen.
                        // Let's use `q.id` for logic but `idx` for keys.
                        const isResolved = resolvedIds.has(q.id); // If word is resolved, all instances in batch are resolved? 
                        // If we have 2 same words in batch, answering one answers both?
                        // Yes, logical.
                        const isSelected = selectedQuestionId === q.id;
                        return (
                            <button
                                key={`${q.id}-${idx}`} // Unique key
                                onClick={() => handleQuestionClick(q.id)}
                                disabled={isResolved}
                                className={`
                                    p-6 rounded-2xl font-bold text-lg text-left transition-all shadow-sm border-2
                                    ${isResolved
                                        ? 'bg-green-50 border-green-200 text-green-800 opacity-50'
                                        : isSelected
                                            ? 'bg-blue-600 border-blue-600 text-white scale-105 shadow-md'
                                            : 'bg-white border-slate-100 hover:border-blue-300 text-slate-800'
                                    }
                                `}
                            >
                                {q.val[0]}
                            </button>
                        );
                    })}
                </div>

                {/* Right: Options (5-20) - Grid */}
                <div className="col-span-8 bg-slate-50 rounded-3xl p-6 border border-slate-200 overflow-y-auto">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {options.map(opt => {
                            const isMatched = correctMatchIds.has(opt.id);
                            const isWrong = wrongIds.has(opt.id);
                            // "Show Correct Answer" hint: if user selected X and clicked Y (Wrong), highlight X's real answer in Green?
                            // Logic: If wrongIds has ANY, finding the option that matches selectedQuestionId
                            const isHint = selectedQuestionId && opt.id === currentBatch.find(q => q.id === selectedQuestionId)?.id && wrongIds.size > 0;

                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => handleOptionClick(opt.id)}
                                    disabled={isMatched}
                                    className={`
                                        p-3 rounded-xl font-medium text-sm transition-all border-2
                                        ${isMatched
                                            ? 'bg-white border-transparent text-slate-300 scale-95' // Hide or dim matched
                                            : isWrong
                                                ? 'bg-red-500 border-red-500 text-white animate-shake'
                                                : isHint
                                                    ? 'bg-green-500 border-green-500 text-white shadow-lg scale-110 z-10' // Instant Hint
                                                    : 'bg-white border-slate-200 hover:border-blue-400 text-slate-700 hover:shadow-md'
                                        }
                                    `}
                                >
                                    {opt.val[1]}
                                </button>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
}
