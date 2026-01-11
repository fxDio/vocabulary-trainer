import { useEffect, useState } from 'react';
import { DataManager } from './lib/data-manager';
import type { ThemeMeta, GameConfig, Word, SessionLog } from './types';
import { GameRunner } from './components/GameRunner';
import { HistoryBrowser } from './components/HistoryBrowser';
import { DatabaseEditor } from './components/DatabaseEditor';
import { Dashboard } from './components/Dashboard';

function App() {
  const [themes, setThemes] = useState<ThemeMeta[]>([]);
  const [loading, setLoading] = useState(true);

  // App State
  // 'config' view is now separate from 'dashboard'
  const [view, setView] = useState<'dashboard' | 'game' | 'history' | 'editor'>('dashboard');
  const [activeConfig, setActiveConfig] = useState<GameConfig | null>(null);
  const [activeWords, setActiveWords] = useState<Word[]>([]);
  const [totalThemeWords, setTotalThemeWords] = useState(0); // Total available in selected themes
  // const [isGameLoading, setIsGameLoading] = useState(false); // Removed

  // Replay State
  const [replayData, setReplayData] = useState<any[] | undefined>(undefined);
  // Full dictionary for lookup during replay (or standard mode distractors)
  const [dictionary, setDictionary] = useState<Word[]>([]);

  useEffect(() => {
    // Initial Load
    setLoading(true);
    DataManager.getThemes()
      .then(setThemes)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // When returning to dashboard/editor, we might want to refresh themes IF we suspect changes.
  // But for raw speed, let's update them only when needed (e.g. DatabaseEditor should update state).
  // For now, let's keep it snappy by NOT reloading on every view switch.
  // We can add a manual "refreshThemes" function passed to Editor if needed.

  const refreshThemes = () => {
    DataManager.getThemes().then(setThemes);
  };

  const handleStartGame = async (config: GameConfig) => {
    setReplayData(undefined); // Reset replay
    try {
      // 1. Resolve selected themes to actual words
      const selectedThemes = themes.filter(t => config.themeIds.includes(t.id));
      // Load ALL words from selected themes
      let allThemeWordsRaw = await DataManager.loadMultipleThemes(selectedThemes);
      setTotalThemeWords(allThemeWordsRaw.length);

      if (allThemeWordsRaw.length === 0) {
        alert("Выбранные темы не содержат слов.");
        return;
      }

      // Deduplicate Words by Content (Val[0] + Val[1]) to prevent "Double Zurich" from different themes
      // We keep the first occurrence.
      const seenContent = new Set<string>();
      const allThemeWords = allThemeWordsRaw.filter(w => {
        const key = `${w.val[0].trim().toLowerCase()}|||${w.val[1].trim().toLowerCase()}`;
        if (seenContent.has(key)) return false;
        seenContent.add(key);
        return true;
      });

      // 2. Apply "Subset Size" (Words To Learn)
      let shuffled = [...allThemeWords].sort(() => Math.random() - 0.5);
      // Subset of words we are focusing on
      const subset = config.wordCount > 0 ? shuffled.slice(0, config.wordCount) : shuffled;

      // 3. Apply "Test Length" (Total Questions)
      // We need to generate a sequence of Question Items that is length = totalQuestions.
      // If totalQuestions > subset.length, we must REPEAT words from subset.
      const questionCount = config.totalQuestions || 20;
      let sequence: Word[] = [];

      if (subset.length === 0) {
        // Should not happen if UI is correct
        sequence = [];
      } else {
        // Fill sequence
        while (sequence.length < questionCount) {
          // Shuffle subset and append
          const chunk = [...subset].sort(() => Math.random() - 0.5);
          sequence.push(...chunk);
        }
        // Trim to exact length
        sequence = sequence.slice(0, questionCount);
      }

      // 4. Apply Direction (Swap 0 and 1 if EN->RU)
      if (config.direction === 'en-ru') {
        sequence = sequence.map(w => ({
          ...w,
          id: w.id + '_dir', // Ensure unique IDs if we have duplicates in sequence? No, ID must be preserved for matching. 
          // Wait, if we possess multiple instances of same word in sequence, they must have unique keys in React List?
          // The Game uses batch/index, so keys can be index-based.
          // BUT ChoiceGame uses ID for matching.
          // If we have same word twice in one batch, it would be weird.
          // Batch generator should probably dedupe within a batch?
          // ChoiceGame.tsx currently processes batch.
          val: [w.val[1], w.val[0]]
        }));

        // Dictionary for distractors must also be swapped
        // NOTE: Dictionary must include ALL words (from allThemeWords), not just subset.
        setDictionary(allThemeWords.map(w => ({ ...w, val: [w.val[1], w.val[0]] })));
      } else {
        setDictionary(allThemeWords);
      }

      // We pass the full SEQUENCE as 'words'. 
      // ChoiceGame iterates it.
      // Note: sequence can contain duplicates. ChoiceGame needs to handle keys carefully (likely using index).
      setActiveWords(sequence);
      setActiveConfig(config);
      setView('game');
    } catch (e) {
      console.error("Failed to start game", e);
      alert("Ошибка при загрузке данных");
    }
  };

  const handleReplay = async (session: SessionLog) => {
    try {
      const sessionThemes = themes.filter(t => session.config.themeIds.includes(t.id));

      if (!session.questions || session.questions.length === 0) {
        alert("Невозможно повторить эту игру (старый формат данных)");
        return;
      }

      // Load ALL words from the themes used in the session to ensure lookup availability
      const allThemeWords = await DataManager.loadMultipleThemes(sessionThemes);

      // Reconstruct the Game Sequence from the log
      const sequenceWords = session.questions.map(q => {
        // Find the word object by ID
        const w = allThemeWords.find(w => w.id === q.wordId);
        // Fallback if not found
        return w || { id: q.wordId, val: ['?', 'Error: Word Removed'] };
      });

      setActiveWords(sequenceWords);
      setTotalThemeWords(allThemeWords.length);
      setDictionary(allThemeWords); // Pass full dictionary for option lookups
      setActiveConfig({
        ...session.config,
        isReplay: true,
        replaySessionId: session.id
      });
      setReplayData(session.questions);

      setView('game');
    } catch (e) {
      console.error(e);
      alert("Failed to load replay");
    }
  };

  // Dashboard sub-view state
  const [dashboardMode, setDashboardMode] = useState<'main' | 'config'>('main');

  const handleExitGame = () => {
    // If it was a replay, go back to history
    if (activeConfig?.isReplay) {
      setView('history');
    } else {
      // Go back to Dashboard in CONFIG mode
      setDashboardMode('config');
      setView('dashboard');
    }

    setActiveConfig(null);
    setActiveWords([]);
    setReplayData(undefined);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 font-sans">
      <header className="max-w-4xl mx-auto mb-8 pt-6 flex justify-between items-center">
        <div className="cursor-pointer hover:opacity-80 transition" onClick={() => {
          setDashboardMode('main');
          setView('dashboard');
        }}>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Vocab Trainer
          </h1>
          <p className="text-xs text-slate-400">Ru-En / Ru-Cn</p>
        </div>

        {/* Navigation Buttons */}
        {view !== 'dashboard' && (
          <button onClick={() => {
            setDashboardMode('main');
            setView('dashboard');
          }} className="text-slate-400 hover:text-slate-600 font-medium">
            В меню
          </button>
        )}
      </header>

      <main className="container mx-auto">
        {loading ? (
          <div className="text-center py-20 text-slate-400">Загрузка...</div>
        ) : view === 'dashboard' ? (
          <Dashboard
            onNavigate={setView}
            onStartGame={handleStartGame}
            initialMode={dashboardMode}
          />
        ) : view === 'game' && activeConfig ? (
          <GameRunner
            config={activeConfig}
            words={activeWords}
            dictionary={dictionary}
            replayData={replayData}
            totalThemeWords={totalThemeWords}
            onExit={handleExitGame}
          />
        ) : view === 'history' ? (
          <HistoryBrowser
            themes={themes}
            onBack={() => setView('dashboard')}
            onReplay={handleReplay}
          />
        ) : view === 'editor' ? (
          <DatabaseEditor
            onBack={() => {
              refreshThemes(); // Refresh when leaving editor
              setView('dashboard');
            }}
          />
        ) : null}
      </main>
    </div>
  );
}

export default App;
