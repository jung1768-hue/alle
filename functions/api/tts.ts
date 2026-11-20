interface PagesContext {
  request: Request;
  env: {
    GEMINI_API_KEY?: string;
    GOOGLE_CLOUD_TTS_API_KEY?: string;
  };
}

const GOOGLE_TTS_ENDPOINT =
  'https://texttospeech.googleapis.com/v1/text:synthesize';

const TTS_MAX_CHARS_PER_REQUEST = 300;

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const apiKey =
    context.env?.GOOGLE_CLOUD_TTS_API_KEY?.trim() ||
    context.env?.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:
          'GOOGLE_CLOUD_TTS_API_KEY (or GEMINI_API_KEY) is not configured on server.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: { text?: string; voiceName?: string };
  try {
    body = (await context.request.json()) as typeof body;
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

  return new Response(
    JSON.stringify({
      audioBase64: data.audioContent,
      mimeType: 'audio/mpeg',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
