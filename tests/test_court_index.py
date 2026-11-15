import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('court_index', Path(__file__).resolve().parents[1] / 'tools/crawl-court-index.py')
court_index = importlib.util.module_from_spec(spec)
spec.loader.exec_module(court_index)

FIXTURE = '''<p>1件中 1～1件を表示</p>
<table class="module-sub-page-fixed-table search-result-table"><tbody><tr>
<th><a href="./../97268/detail2/index.html">最高裁判例</a><a href="./../97268/detail5/index.html">行政事件裁判例</a></th>
<td><p>令和8(行ツ)36\n選挙無効請求事件</p><p>令和8年11月11日\n最高裁判所\n大法廷\n判決\n棄却\n東京高等裁判所 令和7(行ケ)9</p>
<p>判断 &amp; 理由</p><p>参照条文</p></td>
<td class="file-col"><p><a href="./../../assets/hanrei/hanrei-pdf-97268.pdf">全文</a></p></td>
</tr></tbody></table>'''

class CourtIndexTests(unittest.TestCase):
    def test_extracts_multiple_classifications_and_division(self):
        data = court_index.parse(FIXTURE, 0)
        self.assertEqual(data['total'], 1)
        row = data['records'][0]
        self.assertEqual(row['id'], '97268')
        self.assertEqual(row['date'], '2026-11-11')
        self.assertEqual(row['court'], '最高裁判所 大法廷')
        self.assertEqual(row['caseNumber'], '令和8(行ツ)36')
        self.assertEqual(row['title'], '選挙無効請求事件')
        self.assertEqual(row['classifications'], ['最高裁判例', '行政事件裁判例'])
        self.assertEqual(row['summary'], '判断 & 理由 参照条文')
        self.assertEqual(row['judgmentType'], '判決')
        self.assertEqual(row['result'], '棄却')
        self.assertEqual(row['originalCourt'], '東京高等裁判所 令和7(行ケ)9')
        self.assertEqual(row['pdfUrl'], 'https://www.courts.go.jp/assets/hanrei/hanrei-pdf-97268.pdf')

    def test_rejects_wrong_pagination_and_empty_results(self):
        with self.assertRaises(ValueError):
            court_index.parse(FIXTURE, 30)
        with self.assertRaises(ValueError):
            court_index.parse('<html>503 Service Unavailable</html>', 0)
        with self.assertRaises(ValueError):
            court_index.parse(FIXTURE.replace('1～1', '1～2'), 0)

    def test_preserves_case_number_when_official_title_or_display_date_is_blank(self):
        source = FIXTURE.replace('令和8(行ツ)36\n選挙無効請求事件', '令和8(行ツ)36').replace('令和8年11月11日\n', '')
        row = court_index.parse(source, 0)['records'][0]
        self.assertEqual(row['caseNumber'], '令和8(行ツ)36')
        self.assertEqual(row['title'], row['caseNumber'])
        self.assertEqual(row['date'], '')
        self.assertEqual(row['court'], '最高裁判所 大法廷')

    def test_japanese_era_conversion(self):
        self.assertEqual(court_index.date_iso('昭和22年9月15日'), '1947-09-15')
        self.assertEqual(court_index.date_iso('平成元年1月8日'), '1989-01-08')
        self.assertEqual(court_index.date_iso('令和元年5月1日'), '2019-05-01')
        self.assertEqual(court_index.date_iso(''), '')

if __name__ == '__main__':
    unittest.main()
