"""Offline regressions: tests do not read keys or call any external API."""
import json
from pathlib import Path
import tempfile
import unittest
import time
import threading
from unittest.mock import patch
import server

class CacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='lecture-cache-test-')
        self.cache = Path(self.temp.name)/'content.json'
        self.outline = Path(self.temp.name)/'outline.json'
        self.deck = {'pages':{'1':'Original source'},'full_text':'PAGE 1\nOriginal source'}
        self.patches=[patch.object(server,'CONTENT',self.cache),patch.object(server,'OUTLINE',self.outline),patch.object(server,'LAYOUT',Path(self.temp.name)/'layout.json'),patch.object(server,'slide_image_part',return_value={'type':'image_url','image_url':{'url':'data:image/png;base64,TEST','detail':'original'}})]
        self.patches.append(patch.object(server,'CHAT_HISTORY',Path(self.temp.name)/'history.json'))
        self.patches.append(patch.object(server,'SETTINGS_FILE',Path(self.temp.name)/'settings.json'))
        for item in self.patches: item.start()
    def tearDown(self):
        for item in self.patches: item.stop()
        self.temp.cleanup()
    def test_translation_generated_independently(self):
        with patch.object(server,'call_model',return_value=({'title':'Title','translation':'Translation'}, {'total_tokens':1})) as model:
            result=server.generate_page(self.deck,1,'translation')
            self.assertFalse(result['cached'])
            self.assertNotIn('explanation',result['content'])
            self.assertEqual(model.call_count,1)
        with patch.object(server,'call_model',side_effect=AssertionError('Must not call model')):
            self.assertTrue(server.generate_page(self.deck,1,'translation')['cached'])
    def test_explanation_sends_full_deck_and_image(self):
        with patch.object(server,'call_model',return_value=({'title':'Title','explanation':'Explanation'},{})) as model:
            result=server.generate_page(self.deck,1,'explanation')
        messages=model.call_args.args[0]
        self.assertIn(self.deck['full_text'],messages[0]['content'])
        self.assertEqual(messages[1]['content'][1]['type'],'image_url')
        self.assertEqual(result['content']['explanation_meta']['input_mode'],'full_deck_text_plus_slide_image')
    def test_cost_estimate_uses_separate_cache_rates(self):
        value=server.cost_estimate_cny({'prompt_tokens':1000000,'prompt_cache_hit_tokens':200000,'prompt_cache_miss_tokens':800000,'completion_tokens':100000})
        self.assertAlmostEqual(value['off_peak'],1.204)
        self.assertAlmostEqual(value['peak'],2.408)
    def test_question_includes_image_deck_and_saved_notes(self):
        server.save_json(self.cache,{'1':{'translation':'Saved translation','explanation':'Saved explanation'}})
        messages=server.question_messages(self.deck,1,'Question')
        self.assertIn(self.deck['full_text'],messages[0]['content'])
        text=messages[1]['content'][0]['text']
        for expected in ('Saved translation','Saved explanation','Question','Original source'):
            self.assertIn(expected,text)
        self.assertEqual(messages[1]['content'][1]['type'],'image_url')
    def test_question_without_notes_does_not_generate_them(self):
        with patch.object(server,'call_model',side_effect=AssertionError('No API')):
            messages=server.question_messages(self.deck,1,'Question')
        self.assertIn('尚未生成',messages[1]['content'][0]['text'])
    def test_chat_saved_and_followup_uses_history(self):
        with patch.object(server,'call_model',return_value=('First answer',{})):
            server.ask_question(self.deck,1,'First question')
        with patch.object(server,'call_model',return_value=('Second answer',{})) as model:
            result=server.ask_question(self.deck,1,'Followup')
        self.assertEqual(len(result['history']),2)
        self.assertEqual(model.call_args.args[0][1]['content'],'First question')
        self.assertEqual(model.call_args.args[0][2]['content'],'First answer')
        self.assertEqual(server.chat_history()['1'][1]['answer'],'Second answer')
        self.assertNotIn('2',server.chat_history())
    def test_failed_chat_preserves_history(self):
        with patch.object(server,'call_model',side_effect=ValueError('Failure')):
            with self.assertRaises(ValueError):server.ask_question(self.deck,1,'Question')
        self.assertEqual(server.chat_history(),{})
    def test_chat_context_bounded_but_archive_not_trimmed(self):
        history=[{'question':str(i),'answer':'Answer'} for i in range(10)]
        messages=server.question_messages(self.deck,1,'New',history)
        self.assertEqual(len(messages),14)
        self.assertEqual(messages[1]['content'],'4')
    def test_settings_roundtrip_and_generation(self):
        self.assertEqual(server.generation_settings(),server.DEFAULT_PROMPTS)
        prompts={kind:'Custom '+kind for kind in server.DEFAULT_PROMPTS}
        server.update_settings(prompts)
        self.assertEqual(server.generation_settings(),prompts)
        with patch.object(server,'call_model',return_value=({'title':'Title','explanation':'Explanation'},{})) as model:
            server.generate_page(self.deck,1,'explanation')
        self.assertIn('Custom explanation',model.call_args.args[0][0]['content'])
    def test_invalid_settings_preserve_previous(self):
        server.update_settings(server.DEFAULT_PROMPTS)
        with self.assertRaises(ValueError):server.update_settings({'translation':''})
        self.assertEqual(server.generation_settings(),server.DEFAULT_PROMPTS)
    def test_key_replacement_only_temp_target(self):
        target=Path(self.temp.name)/'key.txt'
        with patch.object(server,'KEY_FILE',target):
            server.replace_key('sk-'+'x'*32)
            self.assertEqual(server.key(),'sk-'+'x'*32)
            with self.assertRaises(ValueError):server.replace_key('bad')
            self.assertEqual(server.key(),'sk-'+'x'*32)
    def test_regeneration_keeps_other_field(self):
        server.save_json(self.cache,{'1':{'title':'Old','translation':'Old translation','explanation':'Keep explanation'}})
        with patch.object(server,'call_model',return_value=({'title':'New','translation':'New translation'}, {})):
            result=server.generate_page(self.deck,1,'translation',True)
            self.assertEqual(result['content']['translation'],'New translation')
            self.assertEqual(result['content']['explanation'],'Keep explanation')
    def test_failed_regeneration_preserves_cache(self):
        server.save_json(self.cache,{'1':{'title':'Old','translation':'Old'}})
        original=self.cache.read_bytes()
        with patch.object(server,'call_model',side_effect=ValueError('Invalid response')):
            with self.assertRaises(ValueError): server.generate_page(self.deck,1,'translation',True)
        self.assertEqual(self.cache.read_bytes(),original)
    def test_both_only_fills_missing_content(self):
        server.save_json(self.cache,{'1':{'title':'Old','translation':'Keep translation'}})
        with patch.object(server,'call_model',return_value=({'title':'New','explanation':'New explanation'}, {})):
            result=server.generate_page(self.deck,1,'both',False)
            self.assertEqual(result['content']['translation'],'Keep translation')
            self.assertEqual(result['content']['explanation'],'New explanation')
    def test_outline_saved_then_reused_without_call(self):
        value={'title':'Outline','overview':'Summary','sections':[{'id':'s1','title':'Topic','summary':'Summary','start_page':1,'end_page':1,'points':['Point']}]}
        with patch.object(server,'call_model',return_value=(value,{})):
            self.assertFalse(server.generate_outline(self.deck)['cached'])
        with patch.object(server,'call_model',side_effect=AssertionError('Must not call model')):
            self.assertTrue(server.generate_outline(self.deck)['cached'])
    def test_real_outline_covers_64_pages(self):
        actual={'title':'Outline','overview':'Summary','sections':[{'id':'s1','title':'First','summary':'Intro','start_page':1,'end_page':32,'points':['One']},{'id':'s2','title':'Second','summary':'Rest','start_page':33,'end_page':64,'points':['Two']}]}
        server.validate_outline(actual,64)
    def test_layout_saved_with_translation(self):
        server.save_json(server.LAYOUT,{'1':{'mode':'columns','regions':{'header':'Title','left':'Left text','right':'Right text','full':''}}})
        translated={'mode':'columns','header':'Title translation','left':'Left translation','right':'Right translation','full':''}
        response={'title':'Title','translation':'Flat translation','translation_layout':translated}
        with patch.object(server,'call_model',return_value=(response,{})):
            self.assertEqual(server.generate_page(self.deck,1,'translation')['content']['translation_layout'],translated)
    def test_missing_layout_region_preserves_old_content(self):
        server.save_json(server.LAYOUT,{'1':{'mode':'columns','regions':{'header':'Title','left':'Left text','right':'Right text','full':''}}})
        server.save_json(self.cache,{'1':{'title':'Old','translation':'Keep'}})
        original=self.cache.read_bytes()
        response={'title':'Title','translation':'Flat','translation_layout':{'mode':'columns','header':'T','left':'L','right':'','full':''}}
        with patch.object(server,'call_model',return_value=(response,{})):
            with self.assertRaises(ValueError): server.generate_page(self.deck,1,'translation',True)
        self.assertEqual(self.cache.read_bytes(),original)
    def wait_for_job(self,job):
        deadline=time.monotonic()+3
        while time.monotonic()<deadline:
            value=server.part_status(job['id'])
            if value['status']!='running' and not server.GENERATION_LOCK.locked(): return value
            time.sleep(.01)
        self.fail('Job did not finish')
    def test_part_skips_existing_and_saves_missing(self):
        server.save_json(self.outline,{'sections':[{'id':'s1','title':'Part','start_page':1,'end_page':2}]})
        server.save_json(self.cache,{'1':{'title':'Old','explanation':'Keep'}})
        context=Path(self.temp.name)/'context.json'
        server.save_json(context,{'pages':{'1':'Page 1','2':'Page 2'},'full_text':'Pages 1 and 2'})
        with patch.object(server,'CONTEXT',context),patch.object(server,'call_model',return_value=({'title':'New','explanation':'Generated'},{})) as model:
            job=self.wait_for_job(server.start_part('s1','explanation'))
            self.assertEqual((job['status'],job['done'],job['skipped']),('complete',1,1))
            self.assertEqual(model.call_count,1)
        notes=server.read_json(self.cache)
        self.assertEqual(notes['1']['explanation'],'Keep')
        self.assertEqual(notes['2']['explanation'],'Generated')
    def test_part_with_complete_cache_makes_no_model_calls(self):
        server.save_json(self.outline,{'sections':[{'id':'s1','title':'Part','start_page':1,'end_page':1}]})
        server.save_json(self.cache,{'1':{'translation':'Keep'}})
        with patch.object(server,'call_model',side_effect=AssertionError('Must not call model')):
            job=server.start_part('s1','translation')
        self.assertEqual((job['status'],job['total'],job['skipped']),('complete',0,1))
    def test_full_deck_uses_all_pages_and_skips_cache(self):
        context=Path(self.temp.name)/'context.json'
        server.save_json(context,{'pages':{'1':'P1','2':'P2'},'full_text':'P1 P2'})
        server.save_json(self.cache,{'1':{'translation':'Saved 1'},'2':{'translation':'Saved 2'}})
        with patch.object(server,'CONTEXT',context),patch.object(server,'call_model',side_effect=AssertionError('Must not call model')):
            job=server.start_part('__all__','translation')
        self.assertEqual((job['status'],job['title'],job['skipped']),('complete','全文',2))
    def test_part_stop_preserves_completed_page(self):
        server.save_json(self.outline,{'sections':[{'id':'s1','title':'Part','start_page':1,'end_page':2}]})
        context=Path(self.temp.name)/'context.json'
        server.save_json(context,{'pages':{'1':'P1','2':'P2'},'full_text':'P1 P2'})
        entered,release=threading.Event(),threading.Event()
        def response(*args):
            entered.set();release.wait(2)
            return {'title':'New','explanation':'Saved'},{}
        with patch.object(server,'CONTEXT',context),patch.object(server,'call_model',side_effect=response) as model:
            job=server.start_part('s1','explanation')
            self.assertTrue(entered.wait(1))
            with server.PART_LOCK: server.PART_JOBS[job['id']]['stop_requested']=True
            release.set();finished=self.wait_for_job(job)
            self.assertEqual((finished['status'],finished['done']),('stopped',1))
            self.assertEqual(model.call_count,1)
        notes=server.read_json(self.cache)
        self.assertEqual(notes['1']['explanation'],'Saved')
        self.assertNotIn('2',notes)

if __name__=='__main__': unittest.main(verbosity=2)
