"use client";

import { useEffect, useMemo, useState } from "react";

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

function calculatePositionedWords(words: WordRecord[]): {
  layers: number;
  positioned: PositionedWord[];
} {
  const positioned: PositionedWord[] = [];
  const remaining = [...words];
  let layerIndex = 0;
  let currentCapacity = BASE_LAYER_CAPACITY;

  while (remaining.length > 0) {
    const layerWords = remaining.splice(0, currentCapacity);
    const capacity = currentCapacity;
    const spacing = 360 / capacity;
    const baseOffset = layerIndex === 0 ? 0 : spacing / 2;

    layerWords.forEach((word, index) => {
      const angle = baseOffset + spacing * index;
      const radius = 90 + layerIndex * 70;
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
    layers: layerIndex,
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
  const [form, setForm] = useState({ term: "", username: "", avatarUrl: "" });
  const [submitting, setSubmitting] = useState(false);
  const [clientToken, setClientToken] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

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

  const { layers, positioned } = useMemo(() => calculatePositionedWords(words), [words]);

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
      const response = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term: form.term,
          username: form.username,
          avatarUrl: form.avatarUrl,
          clientToken
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Kelime eklenemedi");
      }
      setWords((prev) => [...prev, data.word]);
      setForm({ term: "", username: "", avatarUrl: "" });
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
      <section className="atom-card">
        <div className="atom-scene">
          <div className="central-core">Sentient</div>
          {Array.from({ length: layers }).map((_, index) => (
            <div
              key={`layer-${index}`}
              className="orbit-layer"
              style={{
                width: `${180 + index * 140}px`,
                height: `${180 + index * 140}px`
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
              {word.avatar_url ? (
                <img src={word.avatar_url} alt={`${word.username} avatar`} />
              ) : (
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: "rgba(59, 130, 246, 0.35)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    border: "1px solid rgba(59, 130, 246, 0.5)"
                  }}
                >
                  {word.username.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <strong>{word.term}</strong>
                <div>
                  <span>{word.username}</span>
                </div>
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
        <form className="form-section" onSubmit={handleSubmit}>
          <h2>Kelime Evrenine Katıl</h2>
          <p>
            Yeni bir kelime ekleyin ve kimin eklediğini gösteren profil avatarı ile atomun
            katmanlarında yerini alsın.
          </p>
          <label>
            Kelime
            <input
              value={form.term}
              onChange={(event) => setForm((prev) => ({ ...prev, term: event.target.value }))}
              placeholder="Kelimenizi yazın"
              maxLength={30}
              required
            />
          </label>
          <label>
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
          <label>
            Avatar bağlantısı (opsiyonel)
            <input
              value={form.avatarUrl}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, avatarUrl: event.target.value }))
              }
              placeholder="https://..."
            />
          </label>
          <button type="submit" disabled={submitting || !clientToken}>
            {submitting ? "Ekleniyor..." : "Kelimeyi ekle"}
          </button>
          {loading && <p>Kelime evreni yükleniyor...</p>}
          {error && <p style={{ color: "#f87171" }}>{error}</p>}
        </form>
      </section>
    </main>
  );
}
