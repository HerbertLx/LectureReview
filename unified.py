"""One HTTP listener; independent reader state per deck, no reader subprocesses."""
import argparse
import importlib.util
from pathlib import Path
import re
import threading
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
import server
import uploads

ROOT = Path(__file__).resolve().parent
READERS = {}
READERS_LOCK = threading.Lock()


def reader(deck_id):
    if not re.fullmatch(r'geb3302-l[1-4]|pdf-[a-f0-9]{32}', deck_id):
        raise ValueError('Invalid deck id')
    with READERS_LOCK:
        if deck_id in READERS:
            return READERS[deck_id]
        spec = importlib.util.spec_from_file_location('reader_' + deck_id.replace('-', '_'), ROOT / 'server.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        if deck_id.startswith('geb3302-l'):
            module.LECTURE = int(deck_id[-1])
            module.DIST = ROOT / ('dist' if module.LECTURE == 1 else f'lecture{module.LECTURE}-dist')
            module.CONTEXT = ROOT / 'data' / f'lecture{module.LECTURE}_context.json'
            module.LAYOUT = ROOT / 'data' / f'lecture{module.LECTURE}_layout.json'
            module.CONTENT = module.DIST / 'content.json'
            module.OUTLINE = module.DIST / 'outline.json'
            module.CHAT_HISTORY = ROOT / 'data' / f'lecture{module.LECTURE}_chat_history.json'
        else:
            folder = uploads.directory(deck_id)
            manifest = module.read_json(folder / 'manifest.json')
            if not manifest or (uploads.status(deck_id) or {}).get('state') != 'ready':
                raise FileNotFoundError('Deck not ready')
            module.DECK_ID = deck_id
            module.COURSE = manifest['course']
            module.DIST = folder / 'dist'
            module.CONTEXT = folder / 'context.json'
            module.LAYOUT = folder / 'layout.json'
            module.CONTENT = folder / 'content.json'
            module.OUTLINE = folder / 'outline.json'
            module.CHAT_HISTORY = folder / 'chat_history.json'
        if not module.CONTEXT.exists():
            raise FileNotFoundError('Deck not found')
        module.ASSET_DIST = module.DIST
        # Settings and rate limiting are shared; generation/cache/history locks stay per deck.
        module.SETTINGS_LOCK = server.SETTINGS_LOCK
        module.REQUEST_LOCK = server.REQUEST_LOCK
        module.LAST_REQUEST = server.LAST_REQUEST
        READERS[deck_id] = module
        return module


class Handler(server.Handler):
    def dispatch(self, method):
        parsed = urlsplit(self.path)
        module = server
        if parsed.path.startswith('/decks/'):
            parts = parsed.path.split('/', 3)
            if len(parts) < 4:
                self.send_response(302)
                self.send_header('Location', parsed.path + '/')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            try:
                module = reader(parts[2])
            except (ValueError, FileNotFoundError):
                return self.reply(404, {'error': '课件不存在或尚未导入完成'})
            self.path = '/' + parts[3] + (('?' + parsed.query) if parsed.query else '')
        elif (ROOT / 'data' / 'lecture1_context.json').exists():
            module = reader('geb3302-l1')
        old_class, old_directory = self.__class__, self.directory
        try:
            self.__class__ = module.Handler
            self.directory = str(module.DIST)
            getattr(module.Handler, method)(self)
        finally:
            self.__class__, self.directory = old_class, old_directory

    def do_GET(self):
        return self.dispatch('do_GET')

    def do_POST(self):
        return self.dispatch('do_POST')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8767)
    args = parser.parse_args()
    print(f'LectureReview: http://0.0.0.0:{args.port}/ (all decks)', flush=True)
    ThreadingHTTPServer(('0.0.0.0', args.port), Handler).serve_forever()
