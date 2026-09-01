import { NextResponse } from "next/server";
import { supabase } from "../../config/supabase";

export async function GET(req: Request) {
  const deviceId = req.headers.get("x-device-id");
  if (!deviceId) {
    return NextResponse.json({ error: "Missing device ID" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("documents")
      .select("id, file_name, summary, flashcards, quiz, created_at")
      .eq("owner_id", deviceId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ documents: data || [] });
  } catch (error: any) {
    console.error("Fetch documents error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const deviceId = req.headers.get("x-device-id");
  if (!deviceId) {
    return NextResponse.json({ error: "Missing device ID" }, { status: 400 });
  }

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Document ID is required" }, { status: 400 });
    }

    const { error, count } = await supabase
      .from("documents")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("owner_id", deviceId);

    if (error) throw error;
    if (count === 0) {
      return NextResponse.json({ error: "Not found or not yours to delete" }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete document error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete document" },
      { status: 500 }
    );
  }
}