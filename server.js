import express from "express";
import cors from "cors";
import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(express.json());
app.use(cors());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post("/api/enhance-task-fields", async (req, res) => {
  const { title, comments, reminder } = req.body;
  const enhanced = {};
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  try {
    if (title) {
      const result = await model.generateContent(
        `Rewrite the following task title to be clear and actionable. Provide only one short improved sentence, no explanations: "${title}"`
      );
      const response = await result.response;
      const text = response.text();
      console.log("[AI] Title enhancement raw:", text);
      enhanced.title = text.trim();
    }
    if (comments) {
      const result = await model.generateContent(
        `Rewrite the following comment to be clear and professional. Provide only one improved sentence, no explanations: "${comments}"`
      );
      const response = await result.response;
      const text = response.text();
      console.log("[AI] Comments enhancement raw:", text);
      enhanced.comments = text.trim();
    }
    if (reminder) {
      const result = await model.generateContent(
        `Rewrite the following reminder to be clear and specific. Provide only one improved sentence, no explanations: "${reminder}"`
      );
      const response = await result.response;
      const text = response.text();
      console.log("[AI] Reminder enhancement raw:", text);
      enhanced.reminder = text.trim();
    }

    res.json({ enhanced });
  } catch (error) {
    console.error("[AI] Error enhancing task:", error);
    res.status(500).json({ error: "Enhancement failed" });
  }
});



app.listen(3000, () => {
  console.log("Gemini Task Enhancer server running on http://localhost:3000");
});
