"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";

type WordRecord = {
  id: string;
  term: string;
  username: string;
  avatar_url: string | null;
  client_token: string;
  created_at: string;
};

type PositionedWord = WordRecord & {
  layerIndex: number;
  slotIndex: number;
  angle: number;
  radius: number;
};

const BASE_LAYER_CAPACITY = 3;
const BASE_LAYER_RADIUS = 120;
const LAYER_RADIUS_STEP = 110;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function calculatePositionedWords(words: WordRecord[]): {
  layerRadii: number[];
  positioned: PositionedWord[];
} {
  const positioned: PositionedWord[] = [];
  const remaining = [...words];
  let layerIndex = 0;
  let currentCapacity = BASE_LAYER_CAPACITY;
  const layerRadii: number[] = [];

  while (remaining.length > 0) {
    const layerWords = remaining.splice(0, currentCapacity);
    if (layerWords.length === 0) {
      break;
    }

    const radius = BASE_LAYER_RADIUS + layerIndex * LAYER_RADIUS_STEP;
    layerRadii.push(radius);

    const count = layerWords.length;
    const spacing = count > 0 ? 360 / count : 0;
    const baseOffset = count > 0 ? -90 : 0;

    layerWords.forEach((word, index) => {
      const angle = count > 0 ? baseOffset + spacing * index : 0;

      positioned.push({
        ...word,
        layerIndex,
        slotIndex: index,
        angle,
        radius
      });
    });
    layerIndex += 1;
    currentCapacity *= 2;
  }

  return {
    layerRadii,
    positioned
  };
}

function ensureClientToken() {
  if (typeof window === "undefined") {
    return "";
  }
  const existing = window.localStorage.getItem("roots-of-sentient-token");
  if (existing) {
    return existing;
  }
  const token = crypto.randomUUID();
  window.localStorage.setItem("roots-of-sentient-token", token);
  return token;
}

export default function HomePage() {
  const [words, setWords] = useState<WordRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ term: "", username: "" });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clientToken, setClientToken] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setClientToken(ensureClientToken());
  }, []);

  useEffect(() => {
    async function loadWords() {
      try {
        setLoading(true);
        const response = await fetch("/api/words");
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Veriler yüklenemedi");
        }
        setWords(data.words || []);
      } catch (err) {
        console.error(err);
        setError("Kelime evrenine erişilemedi. Lütfen tekrar deneyin.");
      } finally {
        setLoading(false);
      }
    }

    loadWords();
  }, []);

  const { layerRadii, positioned } = useMemo(
    () => calculatePositionedWords(words),
    [words]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.term.trim() || !form.username.trim()) {
      setError("Kelime ve kullanıcı adı zorunludur.");
      return;
    }
    if (!clientToken) {
      setError("Tarayıcı anahtarı oluşturulurken lütfen bekleyin.");
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const payload = new FormData();
      payload.append("term", form.term);
      payload.append("username", form.username);
      payload.append("clientToken", clientToken);
      if (avatarFile) {
        payload.append("avatar", avatarFile);
      }

      const response = await fetch("/api/words", {
        method: "POST",
        body: payload
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Kelime eklenemedi");
      }
      setWords((prev) => [...prev, data.word]);
      setForm({ term: "", username: "" });
      setAvatarFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Beklenmedik bir hata oluştu");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!clientToken) {
      setError("Silme işlemi için tarayıcı anahtarına ulaşılamadı.");
      return;
    }
    try {
      const params = new URLSearchParams({ id, clientToken });
      const response = await fetch(`/api/words?${params.toString()}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Kelime silinemedi");
      }
      setWords((prev) => prev.filter((word) => word.id !== id));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Beklenmedik bir hata oluştu");
    }
  }

  return (
    <main>
      <h1>Roots of Sentient</h1>
      <form className="entry-form" onSubmit={handleSubmit}>
        <div className="entry-form__grid">
          <label className="entry-form__field">
            Kelime
            <input
              value={form.term}
              onChange={(event) => setForm((prev) => ({ ...prev, term: event.target.value }))}
              placeholder="Kelimenizi yazın"
              maxLength={30}
              required
            />
          </label>
          <label className="entry-form__field">
            Kullanıcı adı
            <input
              value={form.username}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, username: event.target.value }))
              }
              placeholder="Size nasıl hitap edelim?"
              maxLength={30}
              required
            />
          </label>
          <label className="entry-form__field entry-form__field--file">
            Avatar yükle (opsiyonel)
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && file.size > MAX_FILE_SIZE) {
                  setError("Avatar dosyası 5MB'den küçük olmalıdır.");
                  event.target.value = "";
                  setAvatarFile(null);
                  return;
                }
                setError(null);
                setAvatarFile(file);
              }}
            />
            <span className="entry-form__hint">Maksimum 5MB. JPG, PNG veya GIF önerilir.</span>
            {avatarFile && (
              <span className="entry-form__file">Seçilen dosya: {avatarFile.name}</span>
            )}
          </label>
        </div>
        <div className="entry-form__actions">
          <button type="submit" disabled={submitting || !clientToken}>
            {submitting ? "Ekleniyor..." : "Kelimeyi ekle"}
          </button>
          {loading && <p className="entry-form__status">Kelime evreni yükleniyor...</p>}
          {error && <p className="entry-form__status entry-form__status--error">{error}</p>}
        </div>
      </form>
      <section className="atom-card">
        <div className="atom-scene">
          <div className="central-core">Sentient</div>
          {layerRadii.map((radius, index) => (
            <div
              key={`layer-${index}`}
              className="orbit-layer"
              style={{
                width: `${radius * 2}px`,
                height: `${radius * 2}px`
              }}
            />
          ))}
          {positioned.map((word) => (
            <div
              key={word.id}
              className="word-node"
              style={{
                transform: `rotate(${word.angle}deg) translate(${word.radius}px) rotate(-${word.angle}deg)`
              }}
            >
              <div className="word-node__content">
                <span className="word-node__username">{word.username}</span>
                {word.avatar_url ? (
                  <img
                    className="word-avatar"
                    src={word.avatar_url}
                    alt={`${word.username} avatar`}
                  />
                ) : (
                  <div className="word-avatar word-avatar--placeholder">
                    {word.username.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <strong className="word-node__term">{word.term}</strong>
              </div>
              {word.client_token === clientToken && (
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => handleDelete(word.id)}
                >
                  Sil
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
