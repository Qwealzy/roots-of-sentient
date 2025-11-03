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
const CUSTOM_LAYER_CAPACITIES: Record<number, number> = {
  3: 24
};
const MAX_LAYER_INDEX = 4;
const BASE_LAYER_RADIUS = 140;
const LAYER_RADIUS_STEP = 130;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const FIRST_LAYER_ANGLES = [45, 135, 225, 315];

function getLayerCapacity(layerIndex: number) {
  if (layerIndex in CUSTOM_LAYER_CAPACITIES) {
    if (layerIndex > MAX_LAYER_INDEX) {
      return 0;
    }
    return CUSTOM_LAYER_CAPACITIES[layerIndex];
  }
  return BASE_LAYER_CAPACITY * 2 ** layerIndex;
}

function findOpenSlot(occupied: Map<number, Set<number>>) {
  for (let layerIndex = 0; layerIndex <= MAX_LAYER_INDEX; layerIndex += 1) {
    const capacity = getLayerCapacity(layerIndex);
    if (capacity === 0) {
      continue;
    }

    const used = occupied.get(layerIndex) ?? new Set<number>();

    for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
      if (!used.has(slotIndex)) {
        return { layerIndex, slotIndex };
      }
    }
  }

  return null;
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
      if (word.layer_index > MAX_LAYER_INDEX) {
        fallback.push({
          ...word,
          layer_index: null,
          slot_index: null
        });
        continue;
      }

      const capacity = getLayerCapacity(word.layer_index);

      if (capacity === 0 || word.slot_index >= capacity) {
        fallback.push({
          ...word,
          layer_index: null,
          slot_index: null
        });
        continue;
      }

      if (!occupied.has(word.layer_index)) {
        occupied.set(word.layer_index, new Set());
      }
      occupied.get(word.layer_index)!.add(word.slot_index);

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
      const nextSlot = findOpenSlot(occupied);
      if (!nextSlot) {
        break;
      }
      const { layerIndex, slotIndex } = nextSlot;
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
  const [logoSrc, setLogoSrc] = useState("/logo.svg");
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

  const hasUserWord = useMemo(() => {
    if (!clientToken) {
      return false;
    }
    return words.some((word) => word.client_token === clientToken);
  }, [clientToken, words]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.term.trim() || !form.username.trim()) {
      setError("Word and username are required.");
      return;
    }
    if (hasUserWord) {
      setError("You have already added a word. Remove it to add another.");
      return;
    }
    const normalizedTerm = form.term.trim().toLocaleLowerCase("tr");
    if (
      words.some(
        (word) => word.term.trim().toLocaleLowerCase("tr") === normalizedTerm
      )
    ) {
      setError("This word has already been added to the atom.");
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
      <header className="page-header">
        <div className="page-header__brand">
          <img
            className="page-header__logo"
            src={logoSrc}
            alt="Roots of Sentient logo"
            onError={() => {
              if (logoSrc === "/logo.svg") {
                setLogoSrc("/logo.png");
              }
            }}
          />
          <h1>Roots of Sentient</h1>
        </div>
        <div className="page-header__author">
          <span className="page-header__author-title">Made By Godsonits</span>
          <div className="page-header__socials">
            <a
              className="page-header__icon-link"
              href="https://x.com/GGodsonits"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Godsonits on X"
            >
              <img src="/twitter.svg" alt="X logo" />
            </a>
            <div className="page-header__discord">
              <img src="/discord.svg" alt="Discord logo" />
              <span>@godsonits</span>
            </div>
          </div>
        </div>
      </header>

      <form className="entry-form" onSubmit={handleSubmit}>
        <div className="entry-form__grid">
          <label className="entry-form__field">
            Word
            <input
              value={form.term}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, term: event.target.value }));
                setError(null);
              }}
              placeholder="Enter your word"
              maxLength={30}
              required
            />
          </label>

          <label className="entry-form__field">
            Twitter Username
            <input
              value={form.username}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, username: event.target.value }));
                setError(null);
              }}
              placeholder="@Username"
              maxLength={30}
              required
            />
          </label>

          <div className="entry-form__file-row">
            <label className="entry-form__field entry-form__field--file">
              <span className="entry-form__field-label">Profile Picture (Optional)</span>
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
              {avatarFile && (
                <span className="entry-form__file">Selected file: {avatarFile.name}</span>
              )}
            </label>

            <button
              className="entry-form__submit"
              type="submit"
              disabled={submitting || !clientToken || hasUserWord}
            >
              {submitting ? "Adding..." : "Add Word"}
            </button>
          </div>
        </div>

        {/* Status row (form'un içinde, grid'in dışında) */}
        <div className="entry-form__status-row">
          {loading && <p className="entry-form__status">Loading the word universe...</p>}
          {error && (
            <p className="entry-form__status entry-form__status--error">{error}</p>
          )}
          {hasUserWord && !error && (
            <p className="entry-form__status">
              You have already contributed a word. Delete it to add a new one.
            </p>
          )}
        </div>
      </form>

      <section className="atom-card">
        <div className="atom-scene">
          <div className="central-core">
            <img
              src={logoSrc}
              alt="Roots of Sentient logo"
              onError={() => {
                if (logoSrc === "/logo.svg") {
                  setLogoSrc("/logo.png");
                }
              }}
            />
          </div>
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
