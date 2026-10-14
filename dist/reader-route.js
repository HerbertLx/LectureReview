// Scope existing reader APIs to the selected deck; assets already use relative URLs.
(() => {
  const match = location.pathname.match(/^\/decks\/(geb3302-l[1-4]|pdf-[a-f0-9]{32})\//);
  if (!match) return;
  const base = '/decks/' + match[1];
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && (input.startsWith('/api/') || input === '/catalog.json')) {
      input = base + input;
    }
    return nativeFetch(input, init);
  };
})();
