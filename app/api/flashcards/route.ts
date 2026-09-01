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
        .select("flashcards")
        .eq("id", documentId)
        .eq("owner_id", deviceId)
        .single();

      if (
        existingDoc?.flashcards &&
        Array.isArray(existingDoc.flashcards) &&
        existingDoc.flashcards.length > 0
      ) {
        return NextResponse.json({
          flashcards: existingDoc.flashcards,
          cached: true,
        });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey });

    const randomSeed = Math.random().toString(36).substring(7);

    const promptText = `
You are a study card creator.
Create 5 FRESH study flashcards based STRICTLY on the Document Summary below.

CRITICAL VARIATION INSTRUCTIONS:
- Cover alternate facts, terms, definitions, and applications from the text that were not previously emphasized.
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
            temperature: 0.8, // Encourages diverse phrasing and topic selection
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING },
                },
                required: ["question", "answer"],
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
    const flashcardsData = JSON.parse(response.text || "[]");

    // Overwrite cache in Supabase — only if this device actually owns the document
    if (documentId) {
      const { error: updateError, count } = await supabase
        .from("documents")
        .update({ flashcards: flashcardsData }, { count: "exact" })
        .eq("id", documentId)
        .eq("owner_id", deviceId);

      if (updateError) {
        console.error("Supabase update error:", updateError);
      } else if (count === 0) {
        console.warn("Flashcards generated but no matching owned document found to cache them to.");
      }
    }

    return NextResponse.json({ flashcards: flashcardsData });
  } catch (error: any) {
    console.error("Flashcards error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate flashcards." },
      { status: 500 }
    );
  }
}