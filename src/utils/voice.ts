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
  onUnavailableOrError: () => void;
  onEnd: () => void;
}): () => void {
  const Ctor = getSpeechRecognitionConstructor();
  if (!Ctor) {
    callbacks.onUnavailableOrError();
    callbacks.onEnd();
    return () => {};
  }

  let stopped = false;
  try {
    const recognition = new Ctor();
    recognition.lang = 'ko-KR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (stopped) return;
      const first = event.results[0]?.[0]?.transcript?.trim();
      if (first) {
        callbacks.onTranscript(first);
      } else {
        callbacks.onUnavailableOrError();
      }
    };

    recognition.onerror = () => {
      if (stopped) return;
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
    callbacks.onUnavailableOrError();
    callbacks.onEnd();
    return () => {};
  }
}
