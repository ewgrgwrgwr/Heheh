import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

const GEMINI_MODEL = "gemini-1.5-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const API_KEY = process.env.GEMINI_API_KEY;

app.post("/v1/chat/completions", async (req, res) => {
  try {
    const messages = req.body.messages || [];
    const userMessage = messages[messages.length - 1]?.content || "";

    const response = await fetch(`${GEMINI_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMessage }] }]
      })
    });

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No reply.";

    res.json({
      id: "gemini-chat",
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: reply } }],
      model: GEMINI_MODEL
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(3000, () => console.log("✅ Gemini proxy running on port 3000"));
