import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { supabase } from "../../config/supabase";
import { isRateLimited } from "../../lib/rateLimit";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing from .env.local" },
        { status: 500 }
      );
    }

    const data = await req.formData();
    const file: File | null = data.get("file") as unknown as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // --- File validation ---
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload a JPG, PNG, WEBP, or PDF." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }
    // --- End validation ---

    const bytes = await file.arrayBuffer();
    const base64Data = Buffer.from(bytes).toString("base64");

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          role: "user",
          parts: [
            { text: "Extract the text from this document and output a structured summary with crisp bullet points." },
            {
              inlineData: {
                mimeType: file.type || "image/jpeg",
                data: base64Data,
              },
            },
          ],
        },
      ],
    });

    const summaryText = response.text || "";

    // Save record to Supabase, tagged with the owning device
    const { data: dbData, error: dbError } = await supabase
      .from("documents")
      .insert([
        {
          file_name: file.name,
          summary: summaryText,
          owner_id: deviceId,
        },
      ])
      .select()
      .single();

    if (dbError) {
      console.error("Supabase insert error:", dbError);
    }

    return NextResponse.json({ 
      summary: summaryText,
      documentId: dbData?.id || null 
    });
  } catch (error: any) {
    console.error("Scan error details:", error);
    return NextResponse.json(
      { error: error?.message || "Unknown error occurred" },
      { status: 500 }
    );
  }
}