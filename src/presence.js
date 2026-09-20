// src/presence.js — live roster of connected clients per team.
//
// The claim store answers "who holds what"; presence answers "who is HERE".
// The web console renders the roster so joining agents appear instantly, and
// every roster change is broadcast to the whole team as a `roster` message.
export function createPresence({ logger = console } = {}) {
  const teams = new Map(); // teamId → Map<userId, entry>
  const subscribers = new Set(); // fn({ teamId, agents })

  const notify = (teamId) => {
    const agents = roster(teamId);
    for (const fn of subscribers) {
      try {
        fn({ teamId, agents });
      } catch (err) {
        logger.warn?.(`[presence] subscriber failed: ${err?.message ?? err}`);
      }
    }
  };

  function join(entry) {
    if (!entry?.team_id || !entry?.user_id) return;
    let members = teams.get(entry.team_id);
    if (!members) {
      members = new Map();
      teams.set(entry.team_id, members);
    }
    const existing = members.get(entry.user_id);
    const next = { ...entry };
    if (existing && existing.sockets > 0) {
      // Multi-device friendly: bump the socket count instead of resetting the clock.
      next.sockets = existing.sockets + 1;
      next.connected_at = existing.connected_at;
    } else {
      next.sockets = (existing?.sockets ?? 0) + 1;
    }
    members.set(entry.user_id, next);
    notify(entry.team_id);
  }

  function leave(teamId, userId) {
    const members = teams.get(teamId);
    const existing = members?.get(userId);
    if (!members || !existing) return false;
    if (existing.sockets > 1) {
      existing.sockets -= 1; // another device is still here
    } else {
      members.delete(userId);
      if (members.size === 0) teams.delete(teamId);
    }
    notify(teamId);
    return true;
  }

  function roster(teamId) {
    return [...(teams.get(teamId)?.values() ?? [])].map(({ sockets, ...entry }) => entry);
  }

  function count() {
    let n = 0;
    for (const members of teams.values()) n += members.size;
    return n;
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  return { join, leave, roster, count, subscribe };
}
