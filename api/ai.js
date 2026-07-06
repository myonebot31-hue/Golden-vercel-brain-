import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Model priority list
const TEXT_MODELS = ["llama3-8b-8192", "gemma2-9b-it", "llama3-70b-8192"];
const VISION_MODELS = ["llama-3.2-90b-vision-preview", "llama-3.2-11b-vision-preview"];

async function callGroq(messages, models) {
  let lastError = null;
  for (const model of models) {
    try {
      console.log(`Trying model: ${model}`);
      const completion = await groq.chat.completions.create({
        model: model,
        messages: messages,
        max_tokens: 1500,
        temperature: 0.1,
        timeout: 15000 // 15s timeout
      });
      return {
        answer: completion.choices[0].message.content,
        modelUsed: model,
        usage: completion.usage
      };
    } catch (error) {
      console.error(`Model ${model} failed:`, error.message);
      lastError = error;
      // If rate limited, wait 1s and try next model
      if (error.status === 429) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastError; // All models failed
}

export default async function handler(req, res) {
  if (req.headers.authorization!== ADMIN_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  if (req.method!== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt, image } = req.body;
    let messages = [];
    let modelsToTry = [];

    if (image) {
      // Vision request
      messages = [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: image } }
        ]
      }];
      modelsToTry = VISION_MODELS; // Try 90b first, then 11b
    } else {
      // Text request
      messages = [{ role: "user", content: prompt }];
      modelsToTry = TEXT_MODELS; // Try 8b first, then gemma, then 70b
    }

    const result = await callGroq(messages, modelsToTry);

    return res.status(200).json({
      answer: result.answer,
      cost: 0,
      model: result.modelUsed,
      usage: result.usage
    });

  } catch (error) {
    console.error("All Groq models failed:", error);
    return res.status(500).json({ error: "All AI models failed: " + error.message });
  }
}
