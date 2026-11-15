# 裁判例データの作成

対象は裁判所の「裁判例検索」に公開された裁判例です。国内のすべての判決ではありません。取得件数と本文の機械抽出件数は別に数え、`cases/manifest.json` に保存します。本文がない裁判例について、要旨を全文と表示しません。

## 出典

- [裁判所・裁判例検索](https://www.courts.go.jp/hanrei/search1/index.html)：現行の検索結果、事件番号、裁判年月日、裁判所、判示事項、公開PDF。
- [japanese-law-analysis/data_set](https://github.com/japanese-law-analysis/data_set)：裁判所PDFのテキスト化データ。CC0 1.0。利用したコミットはmanifestの `seed.commit` に記録します。
- [JurisInformaticsCenter / KGraphNavi・2026年10月版](https://github.com/JurisInformaticsCenter/KGraphNavi/releases/tag/caselaw-data-2026.10)：裁判所由来のメタデータ。CC BY 4.0。`hanrei_public.ttl.gz` のメタデータのみを抽出してJSON化しました。機械推定の争点・結論、Wikipedia/DBpedia由来の内容、申請制の判例HTMLデータは利用していません。

全文は公開PDFからの機械抽出です。原文の改行や認識誤りを含むことがあるため、出典PDFへのリンクを保持します。裁判所側の掲載終了や件数の変動があった場合は、その差を解消するまで `coverageComplete` を真にしません。

## 再作成

Python 3、Popplerの `pdftotext` が必要です。`httpx` が利用可能な場合は接続を再利用し、ない場合は標準ライブラリで取得します。作業用データをリポジトリ外へ置いてください。

```sh
python tools/crawl-court-index.py --output /absolute/scratch/court-index --workers 3
python tools/import-court-cases.py fetch \
  --seed /absolute/scratch/data_set \
  --official /absolute/scratch/court-index/official-index.json \
  --cache /absolute/scratch/pdf-text --workers 3
python tools/import-court-cases.py build \
  --seed /absolute/scratch/data_set \
  --official /absolute/scratch/court-index/official-index.json \
  --official-manifest /absolute/scratch/court-index/official-index-manifest.json \
  --cache /absolute/scratch/pdf-text
node --test tests/corpus.test.cjs
```

検索ページとPDFの取得はチェックポイントを利用して再開できます。大量の再取得を避けるため、成功済みのテキストキャッシュを再利用してください。ネットワーク失敗は `fetch-failed`、テキストを抽出できない画像PDFは `image-pdf` として記録します。取得失敗を空の本文で置き換えることはしません。

グラフの一括メタデータを利用する場合は、公式の差分・件数との突合が別途必要です。

```sh
python tools/extract-court-graph.py /absolute/scratch/hanrei_public.ttl.gz /absolute/scratch/graph-index.json
```

画像PDFの文字認識には、Tesseract、`pdfinfo`・`pdftoppm`、Pillow、NumPy、SciPyを使用します。公式の `tesseract-ocr/tessdata_fast` から取得した `jpn`・`jpn_vert`・`eng` モデルを作業用ディレクトリに置きます。モデルのSHA-256、認識信頼度、ページ数、処理方法はキャッシュに記録します。

```sh
python tools/ocr-court-cases.py \
  --cache /absolute/scratch/pdf-text \
  --tessdata-dir /absolute/scratch/tessdata \
  --work-dir /absolute/scratch/ocr-work --workers 2
```

OCRが全ページで基準を満たした場合は `ocr`、一部のみ認識できた場合は `ocr-partial`、本文を採用できない場合は `ocr-failed` とします。未認識ページを本文中に明示し、黒塗りは復元せず「非公開部分」として扱います。OCR結果は原文との人手による校正済みテキストではなく、アプリにもその旨を表示します。`fullBodyCount` は一部ページ未認識の本文を含みません。

`--allow-incomplete` はローカルQA用です。未照合の件数を隠さずmanifestに出力します。公開用の完全収録を検証する `corpus.test.cjs` は、この状態では失敗します。

## 配信形式

- `manifest.json`：取得範囲、件数、本文の可否、出典とライセンス、圧縮ファイルのSHA-256。
- `index.json.gz`：全件のメタデータ。必要時に読み込みます。
- `text/NNNN.json.gz`：IDを128ずつの固定範囲で分割した `{ "判例ID": "本文" }`。開いた判例に必要な分だけ読み込みます。
- `missing-text.json`：本文未抽出のIDと理由。判例自体を検索対象から除外する用途ではありません。

gzipはHTTPのContent-Encodingに依存せず、アプリ側の既存pakoで展開します。大容量の本文全件をService Workerの初回プリキャッシュへ追加しないでください。
