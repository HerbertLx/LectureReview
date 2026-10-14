"""Routing checks use temporary fixtures; no credentials or paid model calls."""
import concurrent.futures
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import unified
import uploads


class UnifiedTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'data').mkdir()
        for number in (2, 3):
            dist = self.root / f'lecture{number}-dist'
            dist.mkdir()
            (dist / 'content.json').write_text(json.dumps({'1': {'translation': f'L{number}'}}), encoding='utf-8')
            (self.root / 'data' / f'lecture{number}_context.json').write_text('{"pages":{"1":"fixture"}}', encoding='utf-8')
        self.location = patch.object(unified, 'ROOT', self.root)
        self.location.start()
        # The source module remains the real code, but fixture data paths use temporary ROOT.
        self.spec = patch.object(unified.importlib.util, 'spec_from_file_location', side_effect=lambda name, path: self.original_spec(name, Path(__file__).parent / 'server.py'))
        self.original_spec = unified.importlib.util.spec_from_file_location
        self.spec.start()
        unified.READERS.clear()
        self.http = ThreadingHTTPServer(('127.0.0.1', 0), unified.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.http.server_port}'

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        unified.READERS.clear()
        self.spec.stop()
        self.location.stop()
        self.temp.cleanup()

    def fetch_notes(self, number):
        with urllib.request.urlopen(self.base + f'/decks/geb3302-l{number}/api/content') as response:
            return json.load(response)['1']['translation']

    def test_parallel_decks_keep_separate_cache(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            numbers = [2, 3] * 8
            self.assertEqual(list(pool.map(self.fetch_notes, numbers)), [f'L{n}' for n in numbers])

    def test_reader_paths_and_locks_are_independent(self):
        left, right = unified.reader('geb3302-l2'), unified.reader('geb3302-l3')
        self.assertNotEqual(left.CHAT_HISTORY, right.CHAT_HISTORY)
        self.assertIsNot(left.GENERATION_LOCK, right.GENERATION_LOCK)
        self.assertIs(left.SETTINGS_LOCK, right.SETTINGS_LOCK)
        self.assertIs(left.LAST_REQUEST, right.LAST_REQUEST)

    def test_unknown_deck_is_404(self):
        with self.assertRaises(urllib.error.HTTPError) as result:
            urllib.request.urlopen(self.base + '/decks/not-a-deck/api/content')
        self.assertEqual(result.exception.code, 404)

    def test_reader_rejects_traversal(self):
        with self.assertRaises(ValueError):
            unified.reader('../../data')


if __name__ == '__main__':
    unittest.main()
