/* Głosowanie w grupie: match, znaczniki głosów i inicjały członków wypadu. Czyste funkcje, bez DOM. */
(() => {
  const label = m => String((m && (m.name || m.login)) || "?").trim() || "?";

  // match: wszyscy obecni członkowie na tak; raz zapisany w cfg.matched zostaje, gdy dojdzie nowa osoba
  function isMatch(dest, members, cfg) {
    if (!dest) return false;
    if (cfg && Array.isArray(cfg.matched) && cfg.matched.includes(dest.id)) return true;
    const v = dest.votes || {};
    return Array.isArray(members) && members.length > 0 && members.every(m => v[m.id] === 1);
  }

  // unikalne inicjały w kolejności członków: pierwsza osoba na K dostaje „K”, następna „Ka”
  function initials(members) {
    const used = new Set();
    return (members || []).map(m => {
      const s = label(m);
      const pre = n => s.charAt(0).toUpperCase() + s.slice(1, n).toLowerCase();
      let n = 1;
      while (n < s.length && used.has(pre(n))) n++;
      let out = pre(n);
      for (let k = 2; used.has(out); k++) out = pre(n) + k;
      used.add(out);
      return out;
    });
  }

  // znaczniki: ja pierwszy, potem reszta w kolejności z wypadu; przy 5+ osobach trzy i „+N”
  function voteTags(dest, members, meId) {
    const v = (dest && dest.votes) || {};
    const ini = initials(members);
    const all = (members || []).map((m, i) => ({ id: m.id, initial: ini[i], v: v[m.id] === 1 ? 1 : v[m.id] === -1 ? -1 : 0, name: label(m) }));
    const me = all.findIndex(x => x.id === meId);
    if (me > 0) all.unshift(all.splice(me, 1)[0]);
    const shown = all.length >= 5 ? all.slice(0, 3) : all;
    return { shown, more: all.length - shown.length };
  }

  // newlyYes: osoby, których głos właśnie domknął match
  const matchLine = newlyYes => (newlyYes || []).length === 1 ? `${label(newlyYes[0])} też chce!` : (newlyYes || []).length > 1 ? "Wszyscy chcą!" : "Wszyscy na tak";

  window.WypadGroup = { isMatch, voteTags, matchLine, initials };
})();
