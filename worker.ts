interface WorkerEnv {
  GEMINI_API_KEY?: string;
  GOOGLE_CLOUD_TTS_API_KEY?: string;
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

const GOOGLE_TTS_ENDPOINT =
  'https://texttospeech.googleapis.com/v1/text:synthesize';

const TTS_MAX_CHARS_PER_REQUEST = 300;
const TTS_DAILY_SAFE_CAP = 40_000;
const TTS_MONTHLY_SAFE_CAP = 800_000;

async function handleGeminiApi(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === 'GET') {
    const available = Boolean(env.GEMINI_API_KEY?.trim());
    return new Response(
      JSON.stringify({ available, model: 'gemini-3.8-flash' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY is not configured on server.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: {
    prompt?: string;
    inlineData?: { data: string; mimeType: string };
    temperature?: number;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.prompt || typeof body.prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'prompt is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parts: Array<Record<string, unknown>> = [];
  if (body.inlineData?.data && body.inlineData?.mimeType) {
    parts.push({
      inlineData: {
        data: body.inlineData.data,
        mimeType: body.inlineData.mimeType,
      },
    });
  }
  parts.push({ text: body.prompt });

  const upstream = await fetch(
    `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 1536,
          temperature:
            typeof body.temperature === 'number' ? body.temperature : 0.2,
        },
      }),
    }
  );

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    return new Response(
      JSON.stringify({
        error: `Gemini API error (${upstream.status})`,
        detail: errText.slice(0, 300),
      }),
      {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const data = (await upstream.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function getEdgeCounter(key: string): Promise<number> {
  try {
    const cache = (caches as unknown as { default?: Cache }).default;
    if (!cache) return 0;
    const res = await cache.match(`https://tts-quota.alle.internal/${key}`);
    if (!res) return 0;
    const n = Number(await res.text());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

async function putEdgeCounter(
  key: string,
  value: number,
  maxAgeSeconds: number
): Promise<void> {
  try {
    const cache = (caches as unknown as { default?: Cache }).default;
    if (!cache) return;
    await cache.put(
      `https://tts-quota.alle.internal/${key}`,
      new Response(String(value), {
        headers: { 'Cache-Control': `public, max-age=${maxAgeSeconds}` },
      })
    );
  } catch {
    // ignore cache write errors
  }
}

async function hashText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function handleTtsApi(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey =
    env.GOOGLE_CLOUD_TTS_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: 'GOOGLE_CLOUD_TTS_API_KEY (or GEMINI_API_KEY) is not configured on server.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: { text?: string; voiceName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawText = typeof body.text === 'string' ? body.text.trim() : '';
  if (!rawText) {
    return new Response(JSON.stringify({ error: 'text is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const boundedText = rawText.slice(0, TTS_MAX_CHARS_PER_REQUEST);
  const voiceName =
    typeof body.voiceName === 'string' && /^ko-KR-/i.test(body.voiceName.trim())
      ? body.voiceName.trim()
      : 'ko-KR-Neural2-A';

  // 1. Serve from Cloudflare Edge Cache first (0 Google Cloud TTS quota used)
  const cache = (caches as unknown as { default?: Cache }).default;
  const cacheKeyUrl = `https://tts-cache.alle.internal/v1/${encodeURIComponent(voiceName)}/${await hashText(boundedText)}`;
  if (cache) {
    const cached = await cache.match(cacheKeyUrl);
    if (cached) {
      return cached;
    }
  }

  // 2. Enforce strict free-tier safety caps (800k/month, 40k/day < 1M Neural2 free tier)
  const now = new Date();
  const dayKey = `day-${now.toISOString().slice(0, 10)}`;
  const monthKey = `month-${now.toISOString().slice(0, 7)}`;
  const [dailyUsed, monthlyUsed] = await Promise.all([
    getEdgeCounter(dayKey),
    getEdgeCounter(monthKey),
  ]);

  if (
    dailyUsed + boundedText.length > TTS_DAILY_SAFE_CAP ||
    monthlyUsed + boundedText.length > TTS_MONTHLY_SAFE_CAP
  ) {
    return new Response(
      JSON.stringify({
        error: 'TTS free-tier safety cap reached. Falling back to device voice.',
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const upstream = await fetch(
    `${GOOGLE_TTS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: boundedText },
        voice: {
          languageCode: 'ko-KR',
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.0,
          pitch: 0.5,
        },
      }),
    }
  );

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    return new Response(
      JSON.stringify({
        error: `Google Cloud TTS error (${upstream.status})`,
        detail: errText.slice(0, 300),
      }),
      {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const data = (await upstream.json()) as { audioContent?: string };
  if (!data.audioContent) {
    return new Response(JSON.stringify({ error: 'No audio generated.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await Promise.all([
    putEdgeCounter(dayKey, dailyUsed + boundedText.length, 86_400),
    putEdgeCounter(monthKey, monthlyUsed + boundedText.length, 2_764_800),
  ]);

  const jsonBody = JSON.stringify({
    audioBase64: data.audioContent,
    mimeType: 'audio/mpeg',
  });

  if (cache) {
    await cache.put(
      cacheKeyUrl,
      new Response(jsonBody, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=604800',
        },
      })
    );
  }

  return new Response(jsonBody, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/gemini') {
      return handleGeminiApi(request, env);
    }
    if (url.pathname === '/api/tts') {
      return handleTtsApi(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
