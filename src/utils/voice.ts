interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function startKoreanVoiceInput(callbacks: {
  onTranscript: (text: string) => void;
  onInterim?: (text: string) => void;
  onErrorCode?: (error: string) => void;
  onUnavailableOrError: () => void;
  onEnd: () => void;
}): () => void {
  const Ctor = getSpeechRecognitionConstructor();
  if (!Ctor) {
    callbacks.onErrorCode?.('not-supported');
    callbacks.onUnavailableOrError();
    callbacks.onEnd();
    return () => {};
  }

  let stopped = false;
  let deliveredFinal = false;

  try {
    const recognition = new Ctor();
    recognition.lang = 'ko-KR';
    recognition.interimResults = Boolean(callbacks.onInterim);
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (stopped || deliveredFinal) return;

      if (!callbacks.onInterim) {
        const first = event.results[0]?.[0]?.transcript?.trim();
        if (first) {
          deliveredFinal = true;
          callbacks.onTranscript(first);
        } else {
          callbacks.onUnavailableOrError();
        }
        return;
      }

      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const res = event.results[i];
        const part = res?.[0]?.transcript ?? '';
        if (!part) continue;
        if (res.isFinal) {
          finalText += `${part} `;
        } else {
          interimText += `${part} `;
        }
      }

      const trimmedFinal = finalText.trim();
      if (trimmedFinal) {
        deliveredFinal = true;
        callbacks.onTranscript(trimmedFinal);
        return;
      }

      const trimmedInterim = interimText.trim();
      if (trimmedInterim) {
        callbacks.onInterim(trimmedInterim);
      }
    };

    recognition.onerror = (event) => {
      if (stopped) return;
      callbacks.onErrorCode?.(event?.error || 'unknown');
      callbacks.onUnavailableOrError();
    };

    recognition.onend = () => {
      if (!stopped) {
        callbacks.onEnd();
      }
    };

    recognition.start();

    return () => {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        // ignore stop errors
      }
      callbacks.onEnd();
    };
  } catch {
    callbacks.onErrorCode?.('start-failed');
    callbacks.onUnavailableOrError();
    callbacks.onEnd();
    return () => {};
  }
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

let speechGeneration = 0;

export function stopSpeaking(): void {
  speechGeneration += 1;
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore speech synthesis cancellation errors
  }
}

export function speakKoreanText(
  rawText: string,
  options?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  }
): void {
  speechGeneration += 1;
  const myGen = speechGeneration;

  if (!isSpeechSynthesisSupported()) {
    options?.onError?.();
    return;
  }

  const cleaned = rawText
    .replace(/[✨🔥🧺🎁⚡→·💬☕☔]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) {
    options?.onEnd?.();
    return;
  }

  let settled = false;
  let safetyTimer: number | null = null;

  const finish = (kind: 'end' | 'error') => {
    if (settled) return;
    settled = true;
    if (safetyTimer !== null) {
      window.clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    if (myGen !== speechGeneration) return;
    if (kind === 'end') {
      options?.onEnd?.();
    } else {
      options?.onError?.();
    }
  };

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleaned);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.03;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const koreanVoice = voices.find((v) =>
      v.lang.toLowerCase().startsWith('ko')
    );
    if (koreanVoice) {
      utterance.voice = koreanVoice;
    }

    const maxWaitMs = Math.max(5000, cleaned.length * 165 + 2500);
    safetyTimer = window.setTimeout(() => finish('end'), maxWaitMs);

    utterance.onstart = () => {
      if (myGen === speechGeneration) {
        options?.onStart?.();
      }
    };
    utterance.onend = () => finish('end');
    utterance.onerror = () => finish('error');

    window.speechSynthesis.speak(utterance);
  } catch {
    finish('error');
  }
}
