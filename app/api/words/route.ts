import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseClient";

const TABLE = "words";
const AVATAR_BUCKET = "avatars";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function GET() {
  const { data, error } = await supabaseServerClient
    .from(TABLE)
    .select("id, term, username, avatar_url, client_token, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase fetch hatası", error);
    return NextResponse.json({ error: "Veriler alınamadı" }, { status: 500 });
  }

  const words = (data ?? []).map((word) => {
    if (!word.avatar_url || word.avatar_url.startsWith("http")) {
      return word;
    }

    const { data: publicUrlData } = supabaseServerClient.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(word.avatar_url);

    return {
      ...word,
      avatar_url: publicUrlData?.publicUrl ?? null
    };
  });

  return NextResponse.json({ words });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const term = (formData.get("term") as string | null)?.trim();
  const username = (formData.get("username") as string | null)?.trim();
  const clientToken = (formData.get("clientToken") as string | null)?.trim();
  const avatar = formData.get("avatar");

  if (!term || !username || !clientToken) {
    return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
  }

  let avatarPath: string | null = null;

  if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Avatar boyutu 5MB sınırını aşamaz." },
        { status: 413 }
      );
    }

    const fileName = avatar.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const path = `${clientToken}/${timestamp}-${fileName}`;

    const arrayBuffer = await avatar.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabaseServerClient.storage
      .from(AVATAR_BUCKET)
      .upload(path, buffer, {
        cacheControl: "3600",
        contentType: avatar.type || "application/octet-stream",
        upsert: false
      });

    if (uploadError) {
      console.error("Supabase avatar yükleme hatası", uploadError);
      return NextResponse.json(
        { error: "Avatar yüklenirken bir hata oluştu" },
        { status: 500 }
      );
    }

    avatarPath = path;
  }

  const { data, error } = await supabaseServerClient
    .from(TABLE)
    .insert([
      {
        term,
        username,
        avatar_url: avatarPath,
        client_token: clientToken
      }
    ])
    .select("id, term, username, avatar_url, client_token, created_at")
    .single();

  if (error) {
    console.error("Supabase insert hatası", error);
    return NextResponse.json({ error: "Kelime kaydedilemedi" }, { status: 500 });
  }

  let publicUrl: string | null = null;

  if (data.avatar_url) {
    const { data: publicUrlData } = supabaseServerClient.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(data.avatar_url);
    publicUrl = publicUrlData?.publicUrl ?? null;
  }

  const word = {
    ...data,
    avatar_url: publicUrl
  };

  return NextResponse.json({ word }, { status: 201 });
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
    .select("id, client_token, avatar_url")
    .eq("id", id)
    .single();

  if (fetchError) {
    console.error("Supabase kontrol hatası", fetchError);
    return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
  }

  if (!existing || existing.client_token !== clientToken) {
    return NextResponse.json({ error: "Silme yetkiniz yok" }, { status: 403 });
  }

  if (existing.avatar_url && !existing.avatar_url.startsWith("http")) {
    const { error: removeError } = await supabaseServerClient.storage
      .from(AVATAR_BUCKET)
      .remove([existing.avatar_url]);

    if (removeError) {
      console.error("Supabase avatar silme hatası", removeError);
    }
  }

  const { error } = await supabaseServerClient.from(TABLE).delete().eq("id", id);

  if (error) {
    console.error("Supabase silme hatası", error);
    return NextResponse.json({ error: "Kelime silinemedi" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
