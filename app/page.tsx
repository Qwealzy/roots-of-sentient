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
  layer_index: number | null;
  slot_index: number | null;
};

type PositionedWord = WordRecord & {
  layerIndex: number;
  slotIndex: number;
  angle: number;
  radius: number;
};

const BASE_LAYER_CAPACITY = 4;
const BASE_LAYER_RADIUS = 140;
const LAYER_RADIUS_STEP = 130;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const FIRST_LAYER_ANGLES = [45, 135, 225, 315];

function getLayerCapacity(layerIndex: number) {
  return BASE_LAYER_CAPACITY * 2 ** layerIndex;
}

function findOpenSlot(occupied: Map<number, Set<number>>) {
  let layerIndex = 0;

  while (true) {
    const capacity = getLayerCapacity(layerIndex);
    const used = occupied.get(layerIndex) ?? new Set<number>();

    for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
      if (!used.has(slotIndex)) {
        return { layerIndex, slotIndex };
      }
    }

    layerIndex += 1;
  }
}

function calculatePositionedWords(words: WordRecord[]): {
  layerRadii: number[];
  positioned: PositionedWord[];
} {
  const occupied = new Map<number, Set<number>>();
  const positioned: PositionedWord[] = [];
  const fallback: WordRecord[] = [];

  for (const word of words) {
    if (
      typeof word.layer_index === "number" &&
      typeof word.slot_index === "number"
    ) {
      if (!occupied.has(word.layer_index)) {
        occupied.set(word.layer_index, new Set());
      }
      occupied.get(word.layer_index)!.add(word.slot_index);

      const capacity = getLayerCapacity(word.layer_index);
      const angle =
        word.layer_index === 0
          ? FIRST_LAYER_ANGLES[word.slot_index % FIRST_LAYER_ANGLES.length]
          : (360 / capacity) * word.slot_index;
      const radius = BASE_LAYER_RADIUS + word.layer_index * LAYER_RADIUS_STEP;

      positioned.push({
        ...word,
        layerIndex: word.layer_index,
        slotIndex: word.slot_index,
        angle,
        radius
      });
    } else {
      fallback.push(word);
    }
  }

  if (fallback.length > 0) {
    const sortedFallback = [...fallback].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );

    for (const word of sortedFallback) {
      const { layerIndex, slotIndex } = findOpenSlot(occupied);
      if (!occupied.has(layerIndex)) {
        occupied.set(layerIndex, new Set());
      }
      occupied.get(layerIndex)!.add(slotIndex);

      const capacity = getLayerCapacity(layerIndex);
      const angle =
        layerIndex === 0
          ? FIRST_LAYER_ANGLES[slotIndex % FIRST_LAYER_ANGLES.length]
          : (360 / capacity) * slotIndex;
      const radius = BASE_LAYER_RADIUS + layerIndex * LAYER_RADIUS_STEP;

      positioned.push({
        ...word,
        layerIndex,
        slotIndex,
        angle,
        radius
      });
    }
  }

  positioned.sort((a, b) => {
    if (a.layerIndex !== b.layerIndex) {
      return a.layerIndex - b.layerIndex;
    }
    return a.slotIndex - b.slotIndex;
  });

  const layerRadii = Array.from(
    new Set(positioned.map((word) => word.layerIndex))
  )
    .sort((a, b) => a - b)
    .map((layerIndex) => BASE_LAYER_RADIUS + layerIndex * LAYER_RADIUS_STEP);

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
          throw new Error(data?.error || "Unable to load entries");
        }
        setWords(data.words || []);
      } catch (err) {
        console.error(err);
        setError("The word universe is unreachable. Please try again.");
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
      setError("Word and username are required.");
      return;
    }
    if (!clientToken) {
      setError("Please wait while a browser token is prepared.");
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
        throw new Error(data?.error || "Word could not be added");
      }
      setWords((prev) => [...prev, data.word]);
      setForm({ term: "", username: "" });
      setAvatarFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!clientToken) {
      setError("No browser token found for deletion.");
      return;
    }
    try {
      const params = new URLSearchParams({ id, clientToken });
      const response = await fetch(`/api/words?${params.toString()}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Word could not be deleted");
      }
      setWords((prev) => prev.filter((word) => word.id !== id));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    }
  }

  return (
    <main>
      <h1>Roots of Sentient</h1>
      <form className="entry-form" onSubmit={handleSubmit}>
        <div className="entry-form__grid">
          <label className="entry-form__field">
            Word
            <input
              value={form.term}
              onChange={(event) => setForm((prev) => ({ ...prev, term: event.target.value }))}
              placeholder="Enter your word"
              maxLength={30}
              required
            />
          </label>
          <label className="entry-form__field">
            Twitter Username
            <input
              value={form.username}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, username: event.target.value }))
              }
              placeholder="@Username"
              maxLength={30}
              required
            />
          </label>
          <div className="entry-form__file-row">
            <label className="entry-form__field entry-form__field--file">
              Profile Picture (Optional)
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file && file.size > MAX_FILE_SIZE) {
                    setError("Profile pictures must be under 5MB.");
                    event.target.value = "";
                    setAvatarFile(null);
                    return;
                  }
                  setError(null);
                  setAvatarFile(file);
                }}
              />
              <span className="entry-form__hint">Max 5MB. JPG, PNG, or GIF recommended.</span>
              {avatarFile && (
                <span className="entry-form__file">Selected file: {avatarFile.name}</span>
              )}
            </label>
            <button
              className="entry-form__submit"
              type="submit"
              disabled={submitting || !clientToken}
            >
              {submitting ? "Adding..." : "Add Word"}
            </button>
          </div>
        </div>
        {(loading || error) && (
          <div className="entry-form__status-row">
            {loading && <p className="entry-form__status">Loading the word universe...</p>}
            {error && (
              <p className="entry-form__status entry-form__status--error">{error}</p>
            )}
          </div>
        )}
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
                transform: `translate(-50%, -50%) rotate(${word.angle}deg) translate(${word.radius}px) rotate(-${word.angle}deg)`
              }}
            >
              <div className="word-node__content">
                <span className="word-node__username">{word.username}</span>
                <div className="word-node__avatar-wrapper">
                  {word.client_token === clientToken && (
                    <button
                      type="button"
                      className="delete-button"
                      aria-label="Delete word"
                      onClick={() => handleDelete(word.id)}
                    >
                      ×
                    </button>
                  )}
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
                </div>
                <strong className="word-node__term">{word.term}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
