import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { supabase } from "../../config/supabase";
import { isRateLimited } from "../../lib/rateLimit";

export async function POST(req: Request) {
  try {
    const deviceId = req.headers.get("x-device-id");
    if (!deviceId) {
      return NextResponse.json({ error: "Missing device ID" }, { status: 400 });
    }
    if (isRateLimited(deviceId, 10, 60_000)) {
  return NextResponse.json(
    { error: "Too many requests. Please wait a moment before trying again." },
    { status: 429 }
  );
}

    const { documentId, summary, forceNew } = await req.json();

    if (!summary) {
      return NextResponse.json({ error: "No summary provided" }, { status: 400 });
    }

    // 1. If forceNew is false, check Supabase cache first — scoped to this device's document
    if (documentId && !forceNew) {
      const { data: existingDoc } = await supabase
        .from("documents")
        .select("quiz")
        .eq("id", documentId)
        .eq("owner_id", deviceId)
        .single();

      if (existingDoc?.quiz && Array.isArray(existingDoc.quiz) && existingDoc.quiz.length > 0) {
        return NextResponse.json({ quiz: existingDoc.quiz, cached: true });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey });

    // Dynamic variation seed to guarantee different questions on every regeneration
    const randomSeed = Math.random().toString(36).substring(7);

    const promptText = `
You are an academic examiner.
Generate 5 novel, distinct multiple-choice questions (MCQs) strictly from the Document Summary below.

CRITICAL VARIATION INSTRUCTIONS:
- Generate a FRESH set of questions covering different details, nuances, or sections of the text.
- Do not repeat standard introductory questions if possible; test different specific concepts.
- Random variation key: ${randomSeed}

Document Summary:
"""
${summary}
"""
`;

    const executeWithRetry = async (retries = 3, delay = 2500): Promise<any> => {
      try {
        return await ai.models.generateContent({
          model: "gemini-3.5-flash-lite",
          contents: [
            {
              role: "user",
              parts: [{ text: promptText }],
            },
          ],
          config: {
            temperature: 0.8, // Increases randomness for varied questions
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correctAnswerIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ["question", "options", "correctAnswerIndex", "explanation"],
              },
            },
          },
        });
      } catch (err: any) {
        if (retries > 0 && (err?.message?.includes("429") || err?.status === 429)) {
          await new Promise((r) => setTimeout(r, delay));
          return executeWithRetry(retries - 1, delay * 2);
        }
        throw err;
      }
    };

    const response = await executeWithRetry();
    const quizData = JSON.parse(response.text || "[]");

    // Validate the AI's output before trusting it — a malformed correctAnswerIndex
    // would silently break the "correct answer" highlight in the UI
    const validQuizData = quizData.filter(
      (q: any) =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correctAnswerIndex === "number" &&
        q.correctAnswerIndex >= 0 &&
        q.correctAnswerIndex < 4
    );

    if (validQuizData.length === 0) {
      throw new Error("Generated quiz was malformed. Please try again.");
    }

    // Overwrite cache in Supabase — only if this device actually owns the document
    if (documentId) {
      const { error: updateError, count } = await supabase
        .from("documents")
        .update({ quiz: validQuizData }, { count: "exact" })
        .eq("id", documentId)
        .eq("owner_id", deviceId);

      if (updateError) {
        console.error("Supabase update error:", updateError);
      } else if (count === 0) {
        console.warn("Quiz generated but no matching owned document found to cache it to.");
      }
    }

    return NextResponse.json({ quiz: validQuizData });
  } catch (error: any) {
    console.error("Quiz error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate quiz." },
      { status: 500 }
    );
  }
}