"""Offline PDF upload checks; no model and no production library writes."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import uploads
from extract_layout import pymupdf

class UploadTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='pdf-upload-tests-')
        self.root=Path(self.temp.name)
        self.location=patch.object(uploads,'LIBRARY',self.root/'library');self.location.start()
    def tearDown(self):self.location.stop();self.temp.cleanup()
    def test_reject_non_pdf_and_forged_pdf(self):
        for name,content in [('a.pptx',b'%PDF-test'),('a.pdf',b'not a PDF'),('a.pdf',b'')]:
            with self.assertRaises(ValueError):uploads.begin_upload(name,'Title','Course',content)
        self.assertFalse(uploads.LIBRARY.exists())
    def test_path_traversal_rejected(self):
        with self.assertRaises(ValueError):uploads.directory('../../data')
    def test_two_same_names_use_independent_folders(self):
        with patch.object(uploads.subprocess,'Popen'):
            first=uploads.begin_upload('../same.pdf','Title','Course',b'%PDF-test')
            second=uploads.begin_upload('same.pdf','Title','Course',b'%PDF-test')
        self.assertNotEqual(first['id'],second['id'])
        self.assertEqual(len(list(uploads.LIBRARY.glob('pdf-*/original.pdf'))),2)
    def test_real_pdf_render_and_text_are_independent(self):
        deck_id='pdf-'+'a'*32;folder=uploads.directory(deck_id);folder.mkdir(parents=True)
        doc=pymupdf.open()
        page=doc.new_page();page.insert_text((72,72),'Upload fixture')
        doc.save(folder/'original.pdf');doc.close()
        uploads.write_json(folder/'request.json',{'title':'Test','course':'Test Course','filename':'test.pdf'})
        with patch.object(uploads,'launch') as start:uploads.import_pdf(deck_id)
        self.assertEqual(uploads.status(deck_id)['state'],'ready')
        self.assertEqual(uploads.status(deck_id)['total'],1)
        self.assertEqual(len(list((folder/'dist'/'pages').glob('*.png'))),1)
        self.assertIn('pages',json.loads((folder/'context.json').read_text(encoding='utf-8')))
        self.assertFalse((folder/'content.json').exists())
        start.assert_called_once()

if __name__=='__main__':unittest.main()
