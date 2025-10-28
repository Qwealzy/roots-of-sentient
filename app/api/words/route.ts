import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseClient";

const TABLE = "words";

export async function GET() {
  const { data, error } = await supabaseServerClient
    .from(TABLE)
    .select("id, term, username, avatar_url, client_token, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase fetch hatası", error);
    return NextResponse.json({ error: "Veriler alınamadı" }, { status: 500 });
  }

  return NextResponse.json({ words: data ?? [] });
}

export async function POST(request: Request) {
  const body = await request.json();
  const term: string = body?.term?.trim();
  const username: string = body?.username?.trim();
  const avatarUrl: string | null = body?.avatarUrl?.trim() || null;
  const clientToken: string = body?.clientToken;

  if (!term || !username || !clientToken) {
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  }

  const { data, error } = await supabaseServerClient
    .from(TABLE)
    .insert([
      {
        term,
        username,
        avatar_url: avatarUrl,
        client_token: clientToken
      }
    ])
    .select("id, term, username, avatar_url, client_token, created_at")
    .single();

  if (error) {
    console.error("Supabase insert hatası", error);
    return NextResponse.json({ error: "Kelime kaydedilemedi" }, { status: 500 });
  }

  return NextResponse.json({ word: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const clientToken = searchParams.get("clientToken");

  if (!id || !clientToken) {
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabaseServerClient
    .from(TABLE)
    .select("id, client_token")
    .eq("id", id)
    .single();

  if (fetchError) {
    console.error("Supabase kontrol hatası", fetchError);
    return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
  }

  if (!existing || existing.client_token !== clientToken) {
    return NextResponse.json({ error: "Silme yetkiniz yok" }, { status: 403 });
  }

  const { error } = await supabaseServerClient.from(TABLE).delete().eq("id", id);

  if (error) {
    console.error("Supabase silme hatası", error);
    return NextResponse.json({ error: "Kelime silinemedi" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
