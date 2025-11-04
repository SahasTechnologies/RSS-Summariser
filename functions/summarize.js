// Cloudflare Pages Function: /functions/summarize.js
// Adapted from cf-worker.js to use Pages Functions API (onRequest).
// Expects HF_API_KEY to be set in Pages environment (Secrets / Environment variables).

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST with JSON { "text": "..." }' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  let body;
  const ct = request.headers.get('content-type') || '';
  try {
    if (ct.includes('application/json')) {
      body = await request.json();
    } else {
      // try text or raw body
      const t = await request.text();
      try { body = JSON.parse(t); } catch { body = { text: t }; }
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid request body', details: String(err) }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const input = body.text || body.input || body.data;
  if (!input || typeof input !== 'string') {
    return new Response(JSON.stringify({ error: 'Request JSON must include a `text` string field' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const hfKey = env.HF_API_KEY;
  if (!hfKey) {
    return new Response(JSON.stringify({ error: 'Missing HF_API_KEY in environment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // Optional parameters can be passed in request JSON under `parameters`
  const parameters = body.parameters || { max_length: 142, min_length: 56, do_sample: false };

  // Small safety: prevent enormous requests
  const MAX_INPUT_CHARS = 20000;
  if (input.length > MAX_INPUT_CHARS) {
    return new Response(JSON.stringify({ error: `Input too large; limit ${MAX_INPUT_CHARS} characters` }), {
      status: 413,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    // List of models to try in order of preference
    const models = [
      'facebook/bart-large-cnn',
      'sshleifer/distilbart-cnn-12-6',
      'google/pegasus-xsum',
      'facebook/bart-large-xsum',
      'philschmid/bart-large-cnn-samsum'
    ];

    let lastError = null;
    let successfulModel = null;
    let successfulParsed = null;
    
    // Try each model in sequence until one works
    for (const model of models) {
      try {
        console.log(`Trying model: ${model}`);
        
        const hfResponse = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${hfKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ 
            inputs: input,
            parameters: {
              ...parameters,
              wait_for_model: true
            }
          }),
        });

        const text = await hfResponse.text();
        let parsed;
        try { 
          parsed = JSON.parse(text); 
        } catch { 
          parsed = text; 
        }

        // Check if the model is still loading
        // idk if its ur internet or huggingface
        if (typeof parsed === 'object' && parsed.error && parsed.error.includes('Loading')) {
          console.log(`Model ${model} is loading, waiting...`);
          // Wait for 5 seconds before trying the next model
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        if (hfResponse.ok) {
          // If the request was successful, use this model's response
          if (!parsed || (Array.isArray(parsed) && parsed.length === 0)) {
            throw new Error('Empty response from model');
          }
          successfulModel = model;
          successfulParsed = parsed;
          break;
        }

        // Store the error and try the next model
        lastError = { model, error: parsed };
        
        // If the error is not related to the model being unavailable, don't try other models
        if (hfResponse.status !== 410 && hfResponse.status !== 503) {
          throw new Error(JSON.stringify(lastError));
        }
      } catch (modelErr) {
        lastError = { model, error: modelErr.message };
        // Continue to next model unless this is the last one
        if (model === models[models.length - 1]) {
          throw new Error('All summarization models failed: ' + JSON.stringify(lastError));
        }
      }
    }

    // If we get here and lastError is still set, it means all models failed
    if (lastError) {
      return new Response(JSON.stringify({ 
        error: 'Summarization service unavailable', 
        details: 'All models failed to respond',
        lastError 
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    if (!successfulModel || !successfulParsed) {
      return new Response(JSON.stringify({ 
        error: 'All summarization models failed',
        details: lastError
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    let summary = null;
    if (Array.isArray(successfulParsed) && successfulParsed.length && successfulParsed[0].summary_text) {
      summary = successfulParsed[0].summary_text;
    } else if (successfulParsed && successfulParsed.summary_text) {
      summary = successfulParsed.summary_text;
    } else if (typeof successfulParsed === 'string') {
      summary = successfulParsed;
    } else {
      summary = JSON.stringify(successfulParsed);
    }

    return new Response(JSON.stringify({ 
      summary,
      model: successfulModel 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Request failed', details: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}
