import type { GameConfig, Word, QuestionLog } from '../types';
import { ChoiceGame } from './ChoiceGame';
import { MatchingGame } from './MatchingGame';

interface GameRunnerProps {
    config: GameConfig;
    words: Word[];
    dictionary?: Word[];
    replayData?: QuestionLog[];
    totalThemeWords?: number;
    onExit: () => void;
}

export function GameRunner({ config, words, dictionary, replayData, totalThemeWords, onExit }: GameRunnerProps) {
    if (config.mode === 'matching') {
        return (
            <MatchingGame
                config={config}
                words={words}
                dictionary={dictionary}
                totalThemeWords={totalThemeWords}
                onExit={onExit}
            />
        );
    }

    // Default to One-of-N (Choice)
    return (
        <ChoiceGame
            config={config}
            words={words}
            dictionary={dictionary}
            replayData={replayData}
            onExit={onExit}
        />
    );
}
