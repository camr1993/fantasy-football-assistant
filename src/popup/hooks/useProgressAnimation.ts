import { useRef, useEffect, useCallback } from 'react';
import type { InitializationProgress } from '../types';
import { calculateExponentialProgress } from '../utils/progress';

interface UseProgressAnimationResult {
  startAnimation: (startTime: number, estimatedDuration: number) => void;
  stopAnimation: () => void;
}

export function useProgressAnimation(
  setInitProgress: React.Dispatch<React.SetStateAction<InitializationProgress>>
): UseProgressAnimationResult {
  const animationIntervalRef = useRef<number | null>(null);
  const animationStartTimeRef = useRef<number | null>(null);
  const animationDurationRef = useRef<number | null>(null);

  const stopAnimation = useCallback(() => {
    if (animationIntervalRef.current !== null) {
      window.clearInterval(animationIntervalRef.current);
      animationIntervalRef.current = null;
    }
  }, []);

  const startAnimation = useCallback(
    (startTime: number, estimatedDuration: number) => {
      // Stop any existing animation
      stopAnimation();

      animationStartTimeRef.current = startTime;
      animationDurationRef.current = estimatedDuration;

      // Update every 100ms for smooth progress
      animationIntervalRef.current = window.setInterval(() => {
        if (
          animationStartTimeRef.current === null ||
          animationDurationRef.current === null
        ) {
          return;
        }

        const newPercentage = calculateExponentialProgress(
          animationStartTimeRef.current,
          animationDurationRef.current
        );

        setInitProgress((prev) => ({
          ...prev,
          percentage: newPercentage,
        }));
      }, 100);
    },
    [stopAnimation, setInitProgress]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAnimation();
    };
  }, [stopAnimation]);

  return { startAnimation, stopAnimation };
}

