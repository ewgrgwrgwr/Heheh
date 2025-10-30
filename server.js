import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();
// use express.json for modern apps but keep body-parser for compatibility with your package.json
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
// Default to gmini-2 so you can use Gemini 2.0; override with GEMINI_MODEL env if needed.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gmini-2";
// keep the same API shape (generateContent) which is compatible with many Gemini model variants
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY environment variable. Set GEMINI_API_KEY and restart.");
  process.exit(1);
}

app.post("/v1/chat/completions", async (req, res) => {
  try {
    const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const last = messages[messages.length - 1] || {};
    // Support a couple of possible shapes for content
    let userMessage = "";
    if (typeof last.content === "string") {
      userMessage = last.content;
    } else if (last.content?.parts && Array.isArray(last.content.parts)) {
      userMessage = last.content.parts.map(p => p.text || "").join("\n");
    } else if (last.content?.text) {
      userMessage = last.content.text;
    } else {
      // fallback: if messages are objects with role & content string
      userMessage = last?.message || last?.text || "";
    }

    userMessage = String(userMessage || "").trim();
    if (!userMessage) {
      return res.status(400).json({ error: "No user message provided" });
    }

    // Limit prompt length to avoid huge requests
    if (userMessage.length > 20000) {
      userMessage = userMessage.slice(0, 20000);
    }

    const payload = {
      // this matches the generateContent / contents.parts form your original code
      contents: [{ parts: [{ text: userMessage }] }]
    };

    // upstream timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`${GEMINI_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const txt = await response.text().catch(() => "<no body>");
      console.error("Upstream Gemini error", response.status, txt);
      return res.status(502).json({ error: "Upstream model error", status: response.status, body: txt });
    }

    const data = await response.json().catch((e) => {
      console.error("Failed to parse JSON from Gemini:", e);
      return null;
    });

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "No reply.";

    res.json({
      id: "gemini-chat",
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: reply } }],
      model: GEMINI_MODEL
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      console.error("Upstream request timed out");
      return res.status(504).json({ error: "Upstream request timed out" });
    }
    console.error("Internal error", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(PORT, () => console.log(`✅ Gemini proxy running on port ${PORT} (model=${process.env.GEMINI_MODEL || "gmini-2"})`));
