import { useCallback, useEffect, useRef, useState } from 'react';

interface UseFramePlayerOptions {
  durationInFrames: number;
  fps: number;
  autoPlay?: boolean;
  loop?: boolean;
  playbackRate?: number;
}

interface FramePlayer {
  currentFrame: number;
  playing: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekTo: (frame: number) => void;
}

export function useFramePlayer(options: UseFramePlayerOptions): FramePlayer {
  const { durationInFrames, fps, autoPlay = false, loop = false } = options;
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);

  const playingRef = useRef(playing);
  const frameRef = useRef(currentFrame);
  const rateRef = useRef(options.playbackRate ?? 1);
  const durationRef = useRef(durationInFrames);
  const fpsRef = useRef(fps);
  const loopRef = useRef(loop);

  playingRef.current = playing;
  frameRef.current = currentFrame;
  rateRef.current = options.playbackRate ?? 1;
  durationRef.current = durationInFrames;
  fpsRef.current = fps;
  loopRef.current = loop;

  useEffect(() => {
    if (!playing) return;

    let rafId: number;
    let lastTime: number | null = null;
    let accumulated = 0;

    const tick = (now: number) => {
      if (lastTime !== null) {
        const delta = (now - lastTime) * rateRef.current;
        accumulated += delta;
        const frameDuration = 1000 / fpsRef.current;

        while (accumulated >= frameDuration) {
          accumulated -= frameDuration;
          const next = frameRef.current + 1;
          if (next >= durationRef.current) {
            if (loopRef.current) {
              frameRef.current = 0;
              setCurrentFrame(0);
            } else {
              frameRef.current = durationRef.current - 1;
              setCurrentFrame(durationRef.current - 1);
              setPlaying(false);
              return;
            }
          } else {
            frameRef.current = next;
            setCurrentFrame(next);
          }
        }
      }
      lastTime = now;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing]);

  const play = useCallback(() => {
    if (frameRef.current >= durationRef.current - 1) {
      frameRef.current = 0;
      setCurrentFrame(0);
    }
    setPlaying(true);
  }, []);

  const pause = useCallback(() => setPlaying(false), []);

  const toggle = useCallback(() => {
    if (playingRef.current) {
      setPlaying(false);
    } else {
      if (frameRef.current >= durationRef.current - 1) {
        frameRef.current = 0;
        setCurrentFrame(0);
      }
      setPlaying(true);
    }
  }, []);

  const seekTo = useCallback((frame: number) => {
    const clamped = Math.max(0, Math.min(frame, durationRef.current - 1));
    frameRef.current = clamped;
    setCurrentFrame(clamped);
  }, []);

  return { currentFrame, playing, play, pause, toggle, seekTo };
}
