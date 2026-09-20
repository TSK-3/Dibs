// src/components/views/RepoSelect.tsx — a searchable combobox over the signed-in
// account's REAL GitHub repositories (served by /api/github/repos). Loading,
// empty, and error states are explicit; keyboard navigation works.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../lib/apiClient';
import { RepoSummary, fetchRepos } from '../../lib/githubClient';

interface RepoSelectProps {
  value: RepoSummary | null;
  onChange: (repo: RepoSummary | null) => void;
}

const formatUpdated = (iso: string | null) => {
  if (!iso) return null;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (Number.isNaN(days)) return null;
  if (days <= 0) return 'updated today';
  if (days === 1) return 'updated yesterday';
  if (days < 30) return `updated ${days}d ago`;
  return `updated ${Math.floor(days / 30)}mo ago`;
};

export const RepoSelect: React.FC<RepoSelectProps> = ({ value, onChange }) => {
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRepos()
      .then((list) => {
        if (!cancelled) setRepos(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.code === 'github_token_missing'
              ? 'GitHub needs one more sign-in to list your repositories — sign out and back in.'
              : 'Could not load repositories. Check the connection and retry.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) => r.fullName.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q),
    );
  }, [repos, query]);

  const choose = (repo: RepoSummary) => {
    onChange(repo);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter' && open && filtered[highlight]) {
      event.preventDefault();
      choose(filtered[highlight]);
    }
  };

  return (
    <div className="flex flex-col gap-2 relative" ref={containerRef} onKeyDown={onKeyDown}>
      <label className="text-xs font-mono text-[#c4c7c8] uppercase">GitHub Repository</label>

      <div
        role="combobox"
        aria-expanded={open}
        aria-controls="repo-select-listbox"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between bg-[#0d0e0f] border border-[#444748]/30 rounded-xl px-4 py-3 cursor-pointer hover:border-[#8e9192] focus:border-white transition-colors outline-none"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="material-symbols-outlined text-[#8e9192] text-[20px]">account_tree</span>
          {value ? (
            <span className="text-sm text-white font-mono truncate">
              {value.fullName}
              <span className="ml-2 text-[10px] text-[#8e9192]">· {formatUpdated(value.updatedAt) ?? 'public'}</span>
            </span>
          ) : (
            <span className="text-sm text-[#8e9192] font-mono truncate">
              {loading ? 'Loading your repositories…' : 'Select a repository…'}
            </span>
          )}
        </div>
        <span className={`material-symbols-outlined text-[#8e9192] text-[20px] transition-transform ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </div>

      {open && (
        <div
          id="repo-select-listbox"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 bg-[#1f2021] border border-[#444748] rounded-xl shadow-2xl z-30 overflow-hidden flex flex-col"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#444748]/30">
            <span className="material-symbols-outlined text-[16px] text-[#8e9192]">search</span>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              placeholder="Filter repositories…"
              className="w-full bg-transparent text-sm text-white outline-none font-mono"
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center font-mono text-xs text-[#8e9192]">Loading repositories…</div>
            ) : error ? (
              <div className="px-4 py-6 text-center font-mono text-xs text-[#ffdad6]">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-center font-mono text-xs text-[#8e9192]">
                {repos.length === 0
                  ? 'No public repositories found on this account.'
                  : `No repositories match "${query}".`}
              </div>
            ) : (
              filtered.map((repo, index) => {
                const selected = value?.id === repo.id;
                return (
                  <div
                    key={repo.id}
                    role="option"
                    aria-selected={selected}
                    onClick={() => choose(repo)}
                    onMouseEnter={() => setHighlight(index)}
                    className={`px-4 py-3 cursor-pointer flex items-center justify-between gap-3 border-l-2 ${
                      index === highlight ? 'bg-[#292a2b]' : ''
                    } ${selected ? 'border-white' : 'border-transparent'}`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-white font-mono truncate">{repo.fullName}</span>
                      {repo.description ? (
                        <span className="text-[11px] text-[#8e9192] truncate">{repo.description}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#0d0e0f] text-[#8e9192] border border-[#444748]/40">
                        {repo.private ? 'PRIVATE' : 'PUBLIC'}
                      </span>
                      <span className="text-[10px] text-[#8e9192] font-mono hidden sm:inline">
                        {formatUpdated(repo.updatedAt) ?? ''}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
