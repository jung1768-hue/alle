interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous?: boolean;
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
  continuous?: boolean;
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
  let processedFinalCount = 0;

  try {
    const recognition = new Ctor();
    recognition.lang = 'ko-KR';
    recognition.continuous = Boolean(callbacks.continuous);
    recognition.interimResults = Boolean(callbacks.onInterim || callbacks.continuous);
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      if (stopped) return;

      if (callbacks.continuous) {
        let startIdx =
          typeof event.resultIndex === 'number'
            ? event.resultIndex
            : processedFinalCount;
        if (startIdx < processedFinalCount) {
          startIdx = processedFinalCount;
        }

        let interimText = '';
        for (let i = startIdx; i < event.results.length; i += 1) {
          const res = event.results[i];
          const part = res?.[0]?.transcript?.trim() ?? '';
          if (!part) continue;
          if (res.isFinal) {
            processedFinalCount = i + 1;
            callbacks.onTranscript(part);
          } else {
            interimText += `${part} `;
          }
        }

        if (callbacks.onInterim) {
          callbacks.onInterim(interimText.trim());
        }
        return;
      }

      if (deliveredFinal) return;

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
  if (typeof window === 'undefined') return false;
  return (
    ('speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined') ||
    typeof Audio !== 'undefined'
  );
}

let speechGeneration = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeFetchController: AbortController | null = null;
let serverTtsDisabled = false;
const ttsBlobUrlCache = new Map<string, string>();

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', () => {
      window.speechSynthesis.getVoices();
    });
  } catch {
    // ignore voice preload errors
  }
}

export function stopSpeaking(): void {
  speechGeneration += 1;

  if (activeFetchController) {
    try {
      activeFetchController.abort();
    } catch {
      // ignore abort errors
    }
    activeFetchController = null;
  }

  if (activeAudio) {
    try {
      activeAudio.onplay = null;
      activeAudio.onended = null;
      activeAudio.onerror = null;
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // ignore audio pause errors
    }
    activeAudio = null;
  }

  if (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window
  ) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore speech synthesis cancellation errors
    }
  }
}

function formatKoreanForSpeech(rawText: string): string {
  return rawText
    .replace(/[✨🔥🧺🎁⚡→·💬☕☔✓🎙️🔊]/g, ', ')
    .replace(/(\d+),(\d{3})/g, '$1$2')
    .replace(/1순위/g, '첫 번째 추천')
    .replace(/2순위/g, '두 번째 추천')
    .replace(/3순위/g, '세 번째 추천')
    .replace(/%/g, '퍼센트')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoNaturalSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

function scoreKoreanVoice(v: SpeechSynthesisVoice): number {
  const lang = v.lang.toLowerCase();
  if (!lang.startsWith('ko')) return -999;

  const name = v.name.toLowerCase();
  let score = 10;

  if (name.includes('natural') || name.includes('neural')) score += 120;
  if (name.includes('online')) score += 60;
  if (name.includes('sunhi') || name.includes('hyunsu') || name.includes('injoon')) {
    score += 50;
  }
  if (name.includes('google') && (name.includes('한국') || name.includes('korean'))) {
    score += 95;
  }
  if (name.includes('yuna') || name.includes('sora') || name.includes('minsu')) {
    score += 90;
  }
  if (name.includes('samsung')) score += 55;
  if (!v.localService) score += 25;
  if (name.includes('heami')) score -= 80;

  return score;
}

function pickBestKoreanVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = scoreKoreanVoice(v);
    if (s > bestScore) {
      bestScore = s;
      best = v;
    }
  }
  return bestScore > 0 ? best : null;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function buildAudioObjectUrl(audioBase64: string, mimeType: string): string {
  const rawBytes = base64ToUint8Array(audioBase64);
  const lowerMime = mimeType.toLowerCase();

  if (lowerMime.includes('l16') || lowerMime.includes('pcm')) {
    const rateMatch = lowerMime.match(/rate=(\d+)/);
    const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;

    const wavBuffer = new ArrayBuffer(44 + rawBytes.length);
    const view = new DataView(wavBuffer);

    const writeAscii = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i += 1) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + rawBytes.length, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeAscii(36, 'data');
    view.setUint32(40, rawBytes.length, true);

    new Uint8Array(wavBuffer, 44).set(rawBytes);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  const blobBytes = new Uint8Array(rawBytes.length);
  blobBytes.set(rawBytes);
  const blob = new Blob([blobBytes], { type: mimeType || 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

function speakWithBrowserSynthesis(
  cleaned: string,
  myGen: number,
  options?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  }
): void {
  if (
    typeof window === 'undefined' ||
    !('speechSynthesis' in window) ||
    typeof SpeechSynthesisUtterance === 'undefined'
  ) {
    if (myGen === speechGeneration) options?.onError?.();
    return;
  }

  const sentences = splitIntoNaturalSentences(cleaned);
  let settled = false;
  let safetyTimer: number | null = null;
  let startedNotified = false;

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
    const bestVoice = pickBestKoreanVoice();
    const maxWaitMs = Math.max(6000, cleaned.length * 185 + 3000);
    safetyTimer = window.setTimeout(() => finish('end'), maxWaitMs);

    const speakChunk = (idx: number) => {
      if (settled || myGen !== speechGeneration) return;
      if (idx >= sentences.length) {
        finish('end');
        return;
      }

      const utterance = new SpeechSynthesisUtterance(sentences[idx]);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.96;
      utterance.pitch = 1.05;
      if (bestVoice) {
        utterance.voice = bestVoice;
      }

      utterance.onstart = () => {
        if (myGen === speechGeneration && !startedNotified) {
          startedNotified = true;
          options?.onStart?.();
        }
      };

      utterance.onend = () => {
        if (settled || myGen !== speechGeneration) return;
        if (idx + 1 < sentences.length) {
          window.setTimeout(() => speakChunk(idx + 1), 95);
        } else {
          finish('end');
        }
      };

      utterance.onerror = () => finish('error');
      window.speechSynthesis.speak(utterance);
    };

    speakChunk(0);
  } catch {
    finish('error');
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
  stopSpeaking();
  const myGen = speechGeneration;

  if (!isSpeechSynthesisSupported()) {
    options?.onError?.();
    return;
  }

  const cleaned = formatKoreanForSpeech(rawText);
  if (!cleaned) {
    options?.onEnd?.();
    return;
  }

  const playAudioUrl = (objectUrl: string): Promise<boolean> =>
    new Promise((resolve) => {
      if (myGen !== speechGeneration || typeof Audio === 'undefined') {
        resolve(false);
        return;
      }
      const audio = new Audio(objectUrl);
      activeAudio = audio;
      let started = false;

      audio.onplay = () => {
        if (myGen === speechGeneration && !started) {
          started = true;
          options?.onStart?.();
        }
      };
      audio.onended = () => {
        if (activeAudio === audio) activeAudio = null;
        if (myGen === speechGeneration) {
          options?.onEnd?.();
        }
        resolve(true);
      };
      audio.onerror = () => {
        if (activeAudio === audio) activeAudio = null;
        resolve(false);
      };

      audio.play().catch((err: unknown) => {
        if (activeAudio === audio) activeAudio = null;
        const name =
          err && typeof err === 'object' && 'name' in err
            ? String((err as { name: string }).name)
            : '';
        if (name === 'NotAllowedError') {
          if (myGen === speechGeneration) options?.onError?.();
          resolve(true);
          return;
        }
        resolve(false);
      });
    });

  void (async () => {
    const cachedUrl = ttsBlobUrlCache.get(cleaned);
    if (cachedUrl) {
      const ok = await playAudioUrl(cachedUrl);
      if (ok || myGen !== speechGeneration) return;
    }

    if (
      !serverTtsDisabled &&
      typeof fetch !== 'undefined' &&
      typeof AbortController !== 'undefined'
    ) {
      const controller = new AbortController();
      activeFetchController = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), 3800);

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: cleaned,
            voiceName: 'ko-KR-Neural2-A',
          }),
          signal: controller.signal,
        });
        window.clearTimeout(timeoutId);
        if (activeFetchController === controller) {
          activeFetchController = null;
        }
        if (myGen !== speechGeneration) return;

        if (res.ok) {
          const payload = (await res.json()) as {
            audioBase64?: string;
            mimeType?: string;
          };
          if (payload.audioBase64 && myGen === speechGeneration) {
            const url = buildAudioObjectUrl(
              payload.audioBase64,
              payload.mimeType ?? 'audio/mpeg'
            );
            if (ttsBlobUrlCache.size < 40) {
              ttsBlobUrlCache.set(cleaned, url);
            }
            const ok = await playAudioUrl(url);
            if (ok || myGen !== speechGeneration) return;
          }
        } else if (
          res.status === 400 ||
          res.status === 403 ||
          res.status === 404 ||
          res.status === 429 ||
          res.status === 503
        ) {
          // Disable server TTS for this session when key/quota/cap is reached
          serverTtsDisabled = true;
        }
      } catch {
        window.clearTimeout(timeoutId);
        if (activeFetchController === controller) {
          activeFetchController = null;
        }
        if (myGen !== speechGeneration) return;
      }
    }

    if (myGen === speechGeneration) {
      speakWithBrowserSynthesis(cleaned, myGen, options);
    }
  })();
}
