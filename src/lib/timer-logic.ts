import { useState, useEffect, useRef, useCallback } from 'react';

export type TimerMode = 'none' | 'global' | 'per-question' | 'acceleration';

interface UseTimerProps {
    mode: TimerMode;
    timeLimit: number; // Initial time limit in seconds
    onTimeUp: () => void;
    accelerationStep?: number; // How much to decrease time (default 0.5s)
    minTime?: number; // Minimum time limit (default 1.0s)
}

export const useTimer = ({
    mode,
    timeLimit,
    onTimeUp,
    accelerationStep = 0.5,
    minTime = 1.0
}: UseTimerProps) => {
    const [timeLeft, setTimeLeft] = useState(timeLimit);
    const [currentLimit, setCurrentLimit] = useState(timeLimit); // Tracks the accelerated limit
    const [isRunning, setIsRunning] = useState(false);

    const intervalRef = useRef<number | null>(null);

    // Reset timer for a new question (or restart global)
    const resetTimer = useCallback(() => {
        setTimeLeft(currentLimit);
        setIsRunning(true);
    }, [currentLimit]);

    // Acceleration logic: call this when user answers correctly
    const accelerate = useCallback(() => {
        if (mode === 'acceleration') {
            setCurrentLimit(prev => Math.max(prev - accelerationStep, minTime));
        }
    }, [mode, accelerationStep, minTime]);

    // Stop timer
    const stopTimer = useCallback(() => {
        setIsRunning(false);
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!isRunning || mode === 'none') return;

        intervalRef.current = window.setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 0.1) {
                    stopTimer();
                    onTimeUp();
                    return 0;
                }
                return prev - 0.1;
            });
        }, 100);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isRunning, mode, onTimeUp, stopTimer]);

    useEffect(() => {
        // If limit changes (acceleration), update timeLeft only if it was full
        // But usually we reset after answer, so this is mostly for init
    }, [currentLimit]);

    return {
        timeLeft,
        currentLimit,
        progress: (timeLeft / currentLimit) * 100,
        start: () => setIsRunning(true),
        stop: stopTimer,
        reset: resetTimer,
        accelerate
    };
};
