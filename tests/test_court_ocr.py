import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('court_ocr',Path(__file__).resolve().parents[1]/'tools'/'ocr-court-cases.py')
ocr=importlib.util.module_from_spec(spec)
spec.loader.exec_module(ocr)


class CourtOCRTests(unittest.TestCase):
    def test_rejects_untrusted_pdf_sources(self):
        for url in ('http://www.courts.go.jp/file.pdf','https://www.courts.go.jp.example.com/file.pdf','https://user:password@www.courts.go.jp/file.pdf','https://www.courts.go.jp:444/file.pdf'):
            self.assertFalse(ocr.court_url(url),url)
        self.assertTrue(ocr.court_url('https://www.courts.go.jp/assets/hanrei/hanrei-pdf-123.pdf'))

    def test_confidence_is_character_weighted_and_lines_preserved(self):
        tsv='level\tpage_num\tblock_num\tpar_num\tline_num\tconf\ttext\n5\t1\t1\t1\t1\t90\t判決\n5\t1\t1\t1\t1\t60\t理由\n5\t1\t1\t1\t2\t80\t請求を棄却する\n'
        page=ocr.parse_tsv(tsv)
        self.assertEqual(page['text'],'判決理由\n請求を棄却する')
        self.assertAlmostEqual(page['confidence'],78.18,places=2)

    def test_redaction_rectangle_is_not_inferred_as_words(self):
        tsv='level\tpage_num\tblock_num\tpar_num\tline_num\tleft\ttop\theight\tconf\ttext\n5\t1\t1\t1\t1\t10\t10\t20\t90\t原告\n5\t1\t1\t1\t1\t150\t10\t20\t90\tである\n'
        page=ocr.parse_tsv(tsv,[{'left':80,'top':10,'width':60,'height':20}])
        self.assertEqual(page['text'],'原告 [非公開部分] である')

    def test_vertical_words_follow_top_to_bottom_order_and_redactions_follow_column(self):
        tsv='level\tpage_num\tblock_num\tpar_num\tline_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t110\t10\t20\t20\t90\t原告\n5\t1\t1\t1\t1\t105\t150\t20\t20\t90\tである\n'
        page=ocr.parse_tsv(tsv,[{'left':108,'top':80,'width':20,'height':60}],vertical=True)
        self.assertEqual(page['text'],'原告 [非公開部分] である')

    def test_upgrade_reuses_horizontal_pages_and_only_discards_old_vertical_pages(self):
        horizontal={'page':1,'layout':'automatic','text':'有効な本文'}
        vertical={'page':2,'layout':'vertical','text':'要再処理'}
        state={'pipelineVersion':3,'pdfSha256':'hash','models':{'jpn':'model'},'dpi':250,'pages':[horizontal,vertical]}
        self.assertEqual(ocr.reusable_pages(state,'hash',{'jpn':'model'},250),{1:horizontal})
        self.assertEqual(ocr.reusable_pages(state,'different',{'jpn':'model'},250),{})
        self.assertEqual(ocr.reusable_pages({**state,'pipelineVersion':ocr.PIPELINE_VERSION},'hash',{'jpn':'model'},250),{1:horizontal,2:vertical})
        self.assertTrue(ocr.needs_upgrade({'status':'ocr','ocr':{'pipelineVersion':3,'pages':[vertical]}}))
        self.assertFalse(ocr.needs_upgrade({'status':'ocr','ocr':{'pipelineVersion':3,'pages':[horizontal]}}))

    def test_one_unreadable_page_rejects_entire_body(self):
        good={'characters':100,'japaneseCharacters':80,'confidence':90}
        bad={'characters':2,'japaneseCharacters':0,'confidence':10}
        self.assertFalse(ocr.acceptable_document([good,bad]))
        self.assertTrue(ocr.acceptable_document([good,{'blank':True}]))

    def test_partial_body_names_failed_pages_without_publishing_bad_text(self):
        good={'page':1,'text':'請求を棄却する。理由を次に示す。','characters':30,'japaneseCharacters':25,'confidence':90}
        bad={'page':2,'text':'UNRELIABLE OCR','characters':14,'japaneseCharacters':0,'confidence':20}
        result=ocr.assemble_document([good,bad])
        self.assertEqual(result['status'],'ocr-partial')
        self.assertEqual(result['failedPages'],[2])
        self.assertTrue(result['partial'])
        self.assertIn('原文PDF 2ページ',result['text'])
        self.assertIn('本文は未収録',result['text'])
        self.assertNotIn('UNRELIABLE',result['text'])

    def test_no_readable_pages_never_produces_fake_body(self):
        bad={'page':1,'text':'noise','characters':5,'japaneseCharacters':0,'confidence':99}
        result=ocr.assemble_document([bad])
        self.assertEqual(result['status'],'ocr-failed')
        self.assertEqual(result['text'],'')

    def test_high_confidence_ascii_noise_is_not_japanese_body(self):
        self.assertFalse(ocr.acceptable_document([{'characters':300,'japaneseCharacters':0,'confidence':99}]))

    def test_low_confidence_complete_looking_text_is_rejected(self):
        self.assertFalse(ocr.acceptable_document([{'characters':300,'japaneseCharacters':200,'confidence':49}]))


if __name__=='__main__':unittest.main()
