interface PagesContext {
  request: Request;
  env: {
    GEMINI_API_KEY?: string;
  };
}

const GEMINI_TTS_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const apiKey = context.env?.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY is not configured on server.' }),
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

  const boundedText = rawText.slice(0, 420);
  const voiceName =
    typeof body.voiceName === 'string' && body.voiceName.trim()
      ? body.voiceName.trim()
      : 'Aoede';

  const upstream = await fetch(
    `${GEMINI_TTS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `따뜻하고 친근한 한국어 상담사처럼 자연스러운 억양과 호흡으로 말해주세요:\n${boundedText}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      }),
    }
  );

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    return new Response(
      JSON.stringify({
        error: `Gemini TTS error (${upstream.status})`,
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
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
        }>;
      };
    }>;
  };

  const inline = data.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data
  )?.inlineData;

  if (!inline?.data) {
    return new Response(JSON.stringify({ error: 'No audio generated.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      audioBase64: inline.data,
      mimeType: inline.mimeType ?? 'audio/L16;codec=pcm;rate=24000',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
