// Lightweight fetch interceptor for static GitHub Pages build
(function(){
  if (!window.fetch) return;
  const origFetch = window.fetch.bind(window);

  async function loadRecipes() {
    try {
      const res = await origFetch('data/recipes.json');
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      console.warn('Failed to load local recipes.json', e);
      return [];
    }
  }

  window.fetch = async function(input, init) {
    const url = (typeof input === 'string') ? input : (input && input.url) || '';
    // Intercept API reads
    if (url.startsWith('/api/recipes')) {
      const parsed = url.includes('?') ? url.split('?')[1] : '';
      const params = new URLSearchParams(parsed);
      const q = params.get('q') || '';
      const all = await loadRecipes();
      if (!q) {
        return new Response(JSON.stringify(all), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      const normalized = q.trim().toLowerCase();
      const filtered = all.filter(r => {
        if (!r) return false;
        const title = (r.title || '').toLowerCase();
        if (title.includes(normalized)) return true;
        const tags = (r.tags || []).map(t => String(t).toLowerCase());
        if (tags.some(t => t.includes(normalized))) return true;
        const desc = (r.description || '').toLowerCase();
        if (desc.includes(normalized)) return true;
        return false;
      });
      return new Response(JSON.stringify(filtered), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Collections -> return all recipes
    if (url.startsWith('/api/collections')) {
      const all = await loadRecipes();
      return new Response(JSON.stringify(all), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Achievements / auth / state modifying endpoints -> read-only stub
    if (url.startsWith('/api/') && (init && init.method && init.method.toUpperCase() !== 'GET')) {
      return new Response(JSON.stringify({ error: 'Read-only static site' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    // favorite/achievements endpoints - return empty defaults
    if (url.startsWith('/api/achievements') || url.startsWith('/api/favorites') || url.startsWith('/api/world_recipes') || url.startsWith('/api/world_journey')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Fallback to original fetch for assets
    return origFetch(input, init);
  };
})();
