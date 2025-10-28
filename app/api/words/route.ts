import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseClient";

const TABLE = "words";
const AVATAR_BUCKET = "avatars";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const BASE_LAYER_CAPACITY = 3;

type PositionEntry = {
  id?: string;
  created_at?: string;
  layer_index: number | null;
  slot_index: number | null;
};

function getLayerCapacity(layerIndex: number) {
  return BASE_LAYER_CAPACITY * 2 ** layerIndex;
}

function buildOccupiedMap(entries: PositionEntry[]) {
  const occupied = new Map<number, Set<number>>();

  for (const entry of entries) {
    if (
      typeof entry.layer_index === "number" &&
      typeof entry.slot_index === "number"
    ) {
      if (!occupied.has(entry.layer_index)) {
        occupied.set(entry.layer_index, new Set());
      }
      occupied.get(entry.layer_index)!.add(entry.slot_index);
    }
  }

  return occupied;
}

function claimNextSlot(occupied: Map<number, Set<number>>) {
  let layerIndex = 0;

  while (true) {
    const capacity = getLayerCapacity(layerIndex);

    if (!occupied.has(layerIndex)) {
      occupied.set(layerIndex, new Set());
    }

    const used = occupied.get(layerIndex)!;

    for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
      if (!used.has(slotIndex)) {
        used.add(slotIndex);
        return { layerIndex, slotIndex };
      }
    }

    layerIndex += 1;
  }
}

export async function GET() {
  const { data, error } = await supabaseServerClient
    .from(TABLE)
    .select(
      "id, term, username, avatar_url, client_token, created_at, layer_index, slot_index"
    )
    .order("layer_index", { ascending: true, nullsFirst: true })
    .order("slot_index", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase fetch hatası", error);
    return NextResponse.json({ error: "Veriler alınamadı" }, { status: 500 });
  }

  const rows = (data ?? []).map((word) => ({ ...word }));
  const occupied = buildOccupiedMap(rows);
  const updates: Array<{ id: string; layer_index: number; slot_index: number }> = [];

  const unassigned = rows.filter(
    (word) =>
      typeof word.layer_index !== "number" || typeof word.slot_index !== "number"
  );

  unassigned
    .sort((a, b) =>
      (a.created_at ?? "").localeCompare(b.created_at ?? "")
    )
    .forEach((word) => {
      const { layerIndex, slotIndex } = claimNextSlot(occupied);
      word.layer_index = layerIndex;
      word.slot_index = slotIndex;
      if (word.id) {
        updates.push({ id: word.id, layer_index: layerIndex, slot_index: slotIndex });
      }
    });

  if (updates.length > 0) {
    const { error: updateError } = await supabaseServerClient
      .from(TABLE)
      .upsert(updates, { onConflict: "id" });

    if (updateError) {
      console.error("Supabase pozisyon güncelleme hatası", updateError);
    }
  }

  const words = rows.map((word) => {
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

  const { data: existingPositions, error: existingError } = await supabaseServerClient
    .from(TABLE)
    .select("layer_index, slot_index");

  if (existingError) {
    console.error("Supabase mevcut pozisyonları çekerken hata", existingError);
    return NextResponse.json(
      { error: "Pozisyon bilgileri alınamadı" },
      { status: 500 }
    );
  }

  const occupied = buildOccupiedMap(existingPositions ?? []);
  const { layerIndex, slotIndex } = claimNextSlot(occupied);

  const { data, error } = await supabaseServerClient
    .from(TABLE)
    .insert([
      {
        term,
        username,
        avatar_url: avatarPath,
        client_token: clientToken,
        layer_index: layerIndex,
        slot_index: slotIndex
      }
    ])
    .select(
      "id, term, username, avatar_url, client_token, created_at, layer_index, slot_index"
    )
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
