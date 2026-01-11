import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { GameConfig, Word, SessionLog } from '../types';
import { useTimer } from '../lib/timer-logic';
import { HistoryManager } from '../lib/history-manager';

interface MatchingGameProps {
    config: GameConfig;
    words: Word[];
    dictionary?: Word[]; // For distractors
    totalThemeWords?: number; // Total words available in selected themes (for stats)
    onExit: () => void;
}

interface MatchItem {
    id: string; // The Word ID
    text: string;
    side: 'left' | 'right';
    state: 'default' | 'selected' | 'matched' | 'error' | 'success-hint';
    matchKey: string; // Unique string based on content (e.g. "val0|val1")
}

export function MatchingGame({ config, words, dictionary, totalThemeWords, onExit }: MatchingGameProps) {
    // Round Management
    const [roundIndex, setRoundIndex] = useState(0);
    const [items, setItems] = useState<MatchItem[]>([]);

    const [selectedLeft, setSelectedLeft] = useState<string | null>(null); // word ID
    const [selectedRight, setSelectedRight] = useState<string | null>(null); // word ID
    const [matchesInRound, setMatchesInRound] = useState(new Set<string>());

    // UI States
    const [showWordList, setShowWordList] = useState(false);

    // Debug Configuration
    const SHOW_DEBUG_LOGS = false; // Toggle to view logs

    const [isFinished, setIsFinished] = useState(false);
    const [score, setScore] = useState(0);
    const [incorrectCount, setIncorrectCount] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);

    // Split words into batches based on Questions on Screen (batchSize)
    const batches = useMemo(() => {
        const result: Word[][] = [];
        const size = Math.max(1, config.batchSize || 1); // Safety fallback
        for (let i = 0; i < words.length; i += size) {
            result.push(words.slice(i, i + size));
        }
        return result;
    }, [words, config.batchSize]);

    const currentBatch = batches[roundIndex];

    const sessionLogRef = useRef<SessionLog>({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        config: config,
        questions: [],
        score: 0,
        totalWords: totalThemeWords || words.length
    });

    // Elapsed Timer Effect
    useEffect(() => {
        if (isFinished) return;
        const interval = setInterval(() => {
            setElapsedTime(t => t + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [isFinished]);

    // Format Time Helper
    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Prevent double saving
    const hasSaved = useRef(false);

    // Timer Params
    let initialTime = config.timeLimit;
    let step = 0;
    let minTime = 1;

    if (config.timerMode === 'acceleration' && config.accelerationStart && config.accelerationEnd) {
        initialTime = config.accelerationStart;
        const totalSteps = words.length - 1;
        step = totalSteps > 0 ? (config.accelerationStart - config.accelerationEnd) / totalSteps : 0;
        minTime = config.accelerationEnd;
    }

    // Logic for Finish must be defined BEFORE useEffect that uses it
    // But it depends on 'timer'. And 'timer' depends on 'onTimeUp' which calls 'finishGame'.
    // Circular dependency?
    // Solution: Define handleTimeUp -> useTimer -> finishGame.
    // But handleTimeUp calls finishGame.
    // We can use a ref for finishGame or put finishGame inside useTimer callback?
    // Or just define finishGame, then handleTimeUp calls it?
    // If finishGame uses timer.stop(), it needs timer.
    // Timer is created by useTimer.
    // useTimer takes onTimeUp.

    // Break cycle:
    // 1. Define finishGame (without calling timer.stop yet? or using ref to timer?)
    // Actually useTimer returns control objects.

    // const timer = useTimer(...)

    // const finishGame = () => { ... timer.stop() ... }

    // const handleTimeUp = () => { finishGame() } --> Error: finishGame uses timer, timer uses handleTimeUp.

    // Fix: handleTimeUp can call a Ref, or we move logic.
    // OR: useTimer exposes 'stop' which we call in effect on unmount/finish.
    // Ideally handleTimeUp sets 'isFinished' to true.
    // And we have a useEffect that watches 'isFinished' and stops timer?

    const [timerControl, setTimerControl] = useState<{ stop: () => void } | null>(null);

    const finishGame = useCallback((finalScore?: number) => {
        if (isFinished || hasSaved.current) return;
        setIsFinished(true);
        if (timerControl) timerControl.stop();

        hasSaved.current = true;

        // Use passed score or current state (fallback)
        const actualScore = finalScore !== undefined ? finalScore : score;

        // Mock questions data for log since we don't track per-question detail in this mode yet
        sessionLogRef.current.questions = words.map(w => ({
            wordId: w.id,
            options: [],
            correctId: w.id,
            selectedId: w.id,
            isCorrect: true,
            timeTaken: 0
        }));

        sessionLogRef.current.score = actualScore;
        sessionLogRef.current.mistakes = incorrectCount; // Save mistakes
        sessionLogRef.current.timeTaken = elapsedTime; // Save time
        sessionLogRef.current.totalWords = totalThemeWords || words.length; // Ensure totalWords is accurate
        sessionLogRef.current.timestamp = Date.now();

        HistoryManager.saveSession(sessionLogRef.current);
    }, [isFinished, score, words, timerControl, incorrectCount, elapsedTime, totalThemeWords]);

    const handleTimeUp = useCallback(() => {
        if (!isFinished) {
            finishGame();
        }
    }, [isFinished, finishGame]);

    const timer = useTimer({
        mode: config.timerMode,
        timeLimit: initialTime,
        onTimeUp: handleTimeUp,
        accelerationStep: step,
        minTime: minTime
    });

    // Interaction Helper (Inlined in useEffect)

    // Fisher-Yates Shuffle
    const shuffleArray = <T,>(array: T[]): T[] => {
        const newArr = [...array];
        for (let i = newArr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
        }
        return newArr;
    };

    // Save timer control to state so finishGame can access it
    useEffect(() => {
        setTimerControl({ stop: timer.stop });
    }, [timer.stop]);

    // Start timer on mount
    useEffect(() => {
        timer.start();
        return () => timer.stop();
    }, []);

    // Check for Game End
    useEffect(() => {
        if (!currentBatch && !isFinished && roundIndex >= batches.length) {
            console.log("Finish triggered by Effect (No Batch + Index >= Batches)");
            finishGame(score);
        }
    }, [currentBatch, isFinished, roundIndex, batches.length, finishGame, score]);

    const isTransitioningRef = useRef(false);

    // Round Initialization & Auto-Select
    useEffect(() => {
        if (!currentBatch) return;

        // Reset Transition Lock
        isTransitioningRef.current = false;

        // Helper to generate content-based key
        // We use bi-directional key to ensure match works regardless of side
        // But actually, we just need to know they belong to same semantic pair.
        // Let's use: val[0] + "|||" + val[1]
        const getMatchKey = (w: Word) => `${w.val[0]}|||${w.val[1]}`;

        // 1. Left Items (The Questions)
        const leftItems: MatchItem[] = currentBatch.map((w, i) => ({
            id: `L_${w.id}_${i}_${roundIndex}`, // Globally Unique ID (includes Round)
            text: w.val[0],
            side: 'left',
            state: 'default',
            matchKey: getMatchKey(w)
        }));

        // 2. Right Items (Targets + Distractors)
        // Target Count is driven by optionsCount (Variants Slider) if available, defaulting to batch size + distractors
        let rightSource = [...currentBatch];

        // Desired total items on right side
        const targetRightCount = Math.max(currentBatch.length, config.optionsCount || currentBatch.length);

        if (dictionary && targetRightCount > currentBatch.length) {
            const currentIds = new Set(currentBatch.map(w => w.id));
            const pool = dictionary.filter(w => !currentIds.has(w.id));

            const needed = targetRightCount - currentBatch.length;
            const available = Math.min(needed, pool.length);

            if (available > 0) {
                // Shuffle distractors before picking
                const distractors = shuffleArray(pool).slice(0, available);
                rightSource = [...rightSource, ...distractors];
            }
        }

        const rightItems: MatchItem[] = rightSource.map((w, i) => ({
            id: `R_${w.id}_${i}_${roundIndex}`, // Globally Unique ID
            text: w.val[1],
            side: 'right',
            state: 'default',
            matchKey: getMatchKey(w)
        }));

        // Shuffle properly
        const shuffledLeft = shuffleArray(leftItems);
        const shuffledRight = shuffleArray(rightItems);

        const newItems = [...shuffledLeft, ...shuffledRight];
        setItems(newItems);
        setMatchesInRound(new Set());
        addLog(`Round ${roundIndex} Init. Items: ${currentBatch.length} pairs.`);

        // Auto-select first left item immediately
        const firstLeft = newItems.find(i => i.side === 'left');
        setSelectedLeft(firstLeft ? firstLeft.id : null);
        setSelectedRight(null);

    }, [roundIndex, batches, dictionary, config.optionsCount]); // Removed finishGame dependency!

    // Auto-select next available if current selection is cleared (e.g. after match)
    // But we need to be careful not to override user click.
    // Logic: If selectedLeft becomes null AND there are unmatched items, select next.
    // But selectedLeft becomes null typically when:
    // 1. Match found (we want auto-select next)
    // 2. User clicked same item to deselect (maybe we don't want auto-select? Or strict mode says yes?)
    // User request: "Auto select first option".
    // Let's hook into the checkMatch success path.

    // Debug Logs
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const addLog = (msg: string) => setDebugLogs(prev => [msg, ...prev].slice(0, 5));

    // Auto-Select Enforcer (Nuclear Option)
    // Ensures that if nothing is selected on the left, and we have valid items, one is picked.
    useEffect(() => {
        if (isFinished || matchesInRound.size === currentBatch?.length) return; // Don't select if round/game done

        // Only enforce if we are STABLE (no errors) and nothing selected
        const hasErrors = items.some(i => i.state === 'error');
        if (!selectedLeft && !hasErrors && items.length > 0) {
            const candidate = items.find(i => i.side === 'left' && i.state !== 'matched');
            if (candidate) {
                setSelectedLeft(candidate.id);
                // Optional: addLog(`Enforced Select: ${candidate.id}`);
            }
        }
    }, [items, selectedLeft, isFinished, matchesInRound.size, currentBatch?.length]);

    // Auto-Reset Error/Hint State
    useEffect(() => {
        const hasActiveFeedback = items.some(i => i.state === 'error' || i.state === 'success-hint');
        if (hasActiveFeedback) {
            const timerId = setTimeout(() => {
                setItems(prev => prev.map(i => (i.state === 'error' || i.state === 'success-hint') ? { ...i, state: 'default' } : i));
            }, 400);
            return () => clearTimeout(timerId);
        }
    }, [items]);

    // Interaction Logic
    const handleItemClick = (item: MatchItem) => {
        if (isFinished || item.state === 'matched') return;

        // Block interaction if showing feedback (red/green)
        const isFeedbackActive = items.some(i => i.state === 'error' || i.state === 'success-hint');
        if (isFeedbackActive) return;



        if (item.side === 'left') {
            if (selectedLeft === item.id) return;
            setSelectedLeft(item.id);
            if (selectedRight) checkMatch(item.id, selectedRight);
        } else {
            if (selectedRight === item.id) {
                setSelectedRight(null);
                addLog("Right deselected");
                return;
            }
            setSelectedRight(item.id);
            if (selectedLeft) checkMatch(selectedLeft, item.id);
        }
    };

    // Round Completion Watcher
    useEffect(() => {
        if (!currentBatch || isFinished) return;

        // Check if round is complete
        if (matchesInRound.size === currentBatch.length) {
            // CRITICAL CHECK: Ensure these matches belong to THIS round
            // Prevents "Ghost Completion" where previous round's matches trigger next round's completion
            // before matchesInRound is reset.
            const sampleId = matchesInRound.values().next().value;
            if (sampleId && !sampleId.endsWith(`_${roundIndex}`)) {
                // Stale matches from previous round. Wait for Round Init to clear them.
                return;
            }

            if (isTransitioningRef.current) return; // Already handling transition

            isTransitioningRef.current = true; // Lock
            addLog(`Batch Complete! (${matchesInRound.size}). Transitioning...`);

            setTimeout(() => {
                if (roundIndex < batches.length - 1) {
                    addLog(`Going to Round ${roundIndex + 1}`);
                    setRoundIndex(r => r + 1);
                } else {
                    addLog("Last round done. Finishing via Effect.");
                    finishGame(score);
                    // Wait, if score updated in same render cycle as matchesInRound? 
                    // checkMatch updates score AND matchesInRound. 
                    // Effect runs after render. Score should be updated.
                }
            }, 300);
        }
    }, [matchesInRound, currentBatch, isFinished, roundIndex, batches.length, finishGame, score]);

    // Interaction Logic
    const checkMatch = (leftId: string, rightId: string) => {
        if (isTransitioningRef.current) return;

        const leftItem = items.find(i => i.id === leftId);
        const rightItem = items.find(i => i.id === rightId);

        if (!leftItem || !rightItem) return;

        const isMatch = leftItem.matchKey === rightItem.matchKey;
        // addLog(`Match? ${isMatch ? 'YES' : 'NO'} (${leftItem.text} vs ${rightItem.text})`);

        if (isMatch) {
            setItems(prevItems => prevItems.map(i => {
                if (i.id === leftId || i.id === rightId) return { ...i, state: 'matched' };
                return i;
            }));

            // Just update state. Effect handles transition.
            setMatchesInRound(prev => new Set(prev).add(leftId));

            setSelectedLeft(null);
            setSelectedRight(null);
            setScore(s => s + 1);

            if (config.timerMode === 'acceleration') {
                timer.accelerate();
                timer.reset();
            } else if (config.timerMode === 'per-question') {
                timer.reset();
            }

            // Auto-select next is handled by "Auto-Select Enforcer" effect OR we can do it here if NOT complete.
            // But we don't know if complete yet (setState is async).
            // Actually, we can check logic:
            // If matchesInRound + 1 < batchLength, we can auto-select.
            // But 'matchesInRound' is old here. 
            // The "Enforcer" effect (lines ~240) handles auto-selection reliably when selectedLeft becomes null.
            // So we don't need explicit code here. 
            // Wait, previous code had explicit auto-select in the else block of completion.
            // The Enforcer (lines 237) runs when selectedLeft is null.
            // In checkMatch we set selectedLeft(null).
            // So Enforcer should kick in. ONLY if Round NOT complete.
            // Enforcer has check: `if (matchesInRound.size === currentBatch?.length) return;`
            // But matchesInRound isn't updated for the Enforcer yet?
            // Enforcer depends on [items, selectedLeft, matchesInRound.size].
            // When we setMatchesInRound, component re-renders. Enforcer sees new size.
            // If new size == batch length, Enforcer does NOTHING.
            // If new size < batch length, Enforcer picks next.
            // PERFECT.

        } else {
            setIncorrectCount(c => c + 1);

            // Find the correct match for the Left item to hint
            const correctRight = items.find(i => i.side === 'right' && i.matchKey === leftItem.matchKey);

            setItems(prevItems => prevItems.map(i => {
                // Highlight clicked pair as Error
                if ((i.side === 'left' && i.id === leftId) || (i.side === 'right' && i.id === rightId)) {
                    return { ...i, state: 'error' };
                }
                // Highlight correct answer as Hint (Green)
                if (correctRight && i.id === correctRight.id) {
                    return { ...i, state: 'success-hint' };
                }
                return i;
            }));
            setSelectedLeft(null);
            setSelectedRight(null);
        }
    };

    // Helper to get item state class
    const getItemClass = (item: MatchItem) => {
        let base = "p-4 rounded-xl border-2 font-medium cursor-pointer transition-all active:scale-95 shadow-sm ";
        if (item.state === 'error') return base + "bg-red-50 border-red-500 text-red-700 animate-shake";
        if (item.state === 'success-hint') return base + "bg-green-100 border-green-500 text-green-700 shadow-md transform -translate-y-0.5";

        const isSelected = (item.side === 'left' && selectedLeft === item.id) ||
            (item.side === 'right' && selectedRight === item.id);

        if (isSelected) return base + "bg-blue-100 border-blue-500 text-blue-800 shadow-md transform -translate-y-0.5";

        return base + "bg-white border-slate-100 text-slate-700 hover:border-blue-200 hover:bg-slate-50";
    };

    if (isFinished) {
        return (
            <div className="bg-white rounded-3xl shadow-2xl p-10 text-center max-w-lg mx-auto animate-slide-up border border-slate-100">
                <div className="mb-6">
                    <div className="w-24 h-24 mx-auto rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-5xl mb-4 shadow-lg animate-pop">
                        🧩
                    </div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Финиш!</h2>
                    <p className="text-slate-500">Вы успешно собрали все пары.</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-6 mb-8 border border-slate-100">
                    <div className="text-sm text-slate-400 font-bold uppercase tracking-wider mb-1">Всего пар</div>
                    <div className="text-6xl font-black text-blue-600 mb-2">{score}</div>
                    <div className="text-slate-400 text-xs">Результат сохранен</div>
                </div>

                {/* Debug Info */}
                {SHOW_DEBUG_LOGS && (
                    <div className="mt-8 p-4 bg-slate-900 text-slate-400 text-xs rounded-lg font-mono w-full opacity-70 hover:opacity-100 transition-opacity text-left">
                        <h3 className="font-bold text-slate-200 mb-2">🔧 Debug Info (IDs)</h3>

                        <div className="mb-4 border-b border-slate-700 pb-2">
                            <strong>Activity Log (Last 5):</strong>
                            <div className="flex flex-col gap-1 mt-1 text-green-300">
                                {debugLogs.length === 0 && <span className="text-slate-600">No events yet</span>}
                                {debugLogs.map((log, i) => (
                                    <div key={i}>&gt; {log}</div>
                                ))}
                            </div>
                        </div>

                        <div className="mb-2">
                            <strong>Game Sequence ({words.length}):</strong>
                            <div className="break-all">
                                {words.map((w, i) => (
                                    <span key={i} className={words.filter(x => x.id === w.id).length > 1 ? 'text-amber-400 font-bold' : ''}>
                                        {w.id}
                                        {i < words.length - 1 ? ', ' : ''}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div>
                            <strong>Batch Structure:</strong> {batches.map(b => b.length).join(' + ')}
                        </div>
                    </div>
                )}

                <div className="flex space-x-4 justify-center">
                    <button onClick={onExit} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg transition-all active:scale-95">
                        В меню
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            {/* HUD */}
            <div className="flex flex-col gap-4 mb-6 px-4 py-3 bg-white rounded-xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                        <div className="relative group">
                            <button
                                onClick={onExit}
                                onMouseEnter={() => setShowWordList(true)}
                                onMouseLeave={() => setShowWordList(false)}
                                className="p-2 -ml-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                                title="Выйти к настройкам"
                            >
                                ←
                            </button>

                            {/* Word List Tooltip */}
                            {showWordList && (
                                <div className="absolute top-10 left-0 bg-white shadow-xl border border-slate-200 rounded-xl p-4 w-64 md:w-80 z-50 animate-fade-in max-h-[80vh] overflow-y-auto">
                                    <h4 className="font-bold text-slate-700 mb-2 border-b pb-1">Список слов ({words.length})</h4>
                                    <div className="space-y-1">
                                        {words.map((w, i) => (
                                            <div key={i} className="text-sm flex justify-between group-hover:bg-slate-50 p-1 rounded">
                                                <span className="text-slate-900 font-medium">{w.val[0]}</span>
                                                <span className="text-slate-500">{w.val[1]}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="text-slate-500 font-bold flex items-center">
                            <span className="mr-2 text-xl">🧩</span>
                            Найди пары
                        </div>
                    </div>

                    {/* Stats & Time */}
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2 text-slate-600 font-mono text-lg font-bold">
                            <span>⏱️</span>
                            {formatTime(elapsedTime)}
                        </div>

                        <div className="flex gap-2 text-sm font-medium">
                            <div className="px-3 py-1 bg-green-100 text-green-700 rounded-lg flex items-center gap-1">
                                ✅ {score}
                            </div>
                            <div className="px-3 py-1 bg-red-100 text-red-700 rounded-lg flex items-center gap-1">
                                ❌ {incorrectCount}
                            </div>
                        </div>

                        <div className="px-4 py-1 bg-slate-100 text-slate-700 rounded-lg font-bold">
                            {score} / {words.length}
                        </div>
                    </div>
                </div>

                {/* Timer Bar */}
                {config.timerMode !== 'none' && (
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-orange-500 transition-all duration-100 ease-linear"
                            style={{ width: `${(timer.timeLeft / timer.currentLimit) * 100}%` }}
                        />
                    </div>
                )}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
                {/* Left Column (Questions) - Takes 4/12 columns */}
                <div className="md:col-span-4 space-y-3">
                    {items.filter(i => i.side === 'left').map(item => (
                        <div
                            key={item.id + '_left'}
                            onClick={() => handleItemClick(item)}
                            className={getItemClass(item)}
                            style={{ display: item.state === 'matched' ? 'none' : 'block' }}
                        >
                            {item.text}
                        </div>
                    ))}
                </div>

                {/* Right Column (Answers + Distractors) - Takes 8/12 columns with Inner Grid */}
                <div className="md:col-span-8">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {items.filter(i => i.side === 'right').map(item => (
                            <div
                                key={item.id + '_right'}
                                onClick={() => handleItemClick(item)}
                                className={getItemClass(item) + " flex items-center justify-center text-center h-full min-h-[60px]"}
                                style={{ display: item.state === 'matched' ? 'none' : 'flex' }} // Use flex to center text in grid items
                            >
                                <span className="text-sm md:text-base leading-tight">{item.text}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {/* Debug Info */}
            {SHOW_DEBUG_LOGS && (
                <div className="mt-8 p-4 bg-slate-900 text-slate-400 text-xs rounded-lg font-mono w-full">
                    <h3 className="font-bold text-slate-200 mb-2">🔧 Debug Info (IDs)</h3>

                    <div className="mb-4 border-b border-slate-700 pb-2">
                        <strong>Activity Log (Last 5):</strong>
                        <div className="flex flex-col gap-1 mt-1 text-green-300">
                            {debugLogs.length === 0 && <span className="text-slate-600">No events yet</span>}
                            {debugLogs.map((log, i) => (
                                <div key={i}>&gt; {log}</div>
                            ))}
                        </div>
                    </div>

                    <div className="mb-2">
                        <strong>Items State:</strong>
                        <div className="max-h-20 overflow-y-auto">
                            {items.filter(i => i.side === 'left').map(i => (
                                <div key={i.id} className={i.state === 'matched' ? 'text-green-500' : 'text-blue-300'}>
                                    {i.id}: {i.state}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="mb-2">
                        <strong>Game Sequence ({words.length}):</strong>
                        <div className="break-all">
                            {words.map((w, i) => (
                                <span key={i} className={words.filter(x => x.id === w.id).length > 1 ? 'text-amber-400 font-bold' : ''}>
                                    {w.id}
                                    {i < words.length - 1 ? ', ' : ''}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div>
                        <strong>Duplicates Found:</strong> {words.length - new Set(words.map(w => w.id)).size > 0 ? 'YES (Expected)' : 'NO'}
                    </div>
                    <div>
                        <strong>Unique Content:</strong> {new Set(words.map(w => `${w.val[0]}|${w.val[1]}`)).size} unique terms.
                    </div>
                </div>
            )}
        </div>
    );
}
