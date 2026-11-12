#!/usr/bin/env python3
"""Set the deployed HTTPS URL and write a sitemap for this static site."""
from html import escape
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from xml.sax.saxutils import escape as xml_escape
import argparse
import re

parser = argparse.ArgumentParser(description='朱引文庫の正規URLとサイトマップを設定')
parser.add_argument('public_url', help='朱引文庫の公開先ディレクトリのHTTPS URL')
args = parser.parse_args()
public_url = args.public_url.strip()
parsed = urlsplit(public_url)
if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or any(c.isspace() for c in public_url) or chr(92) in public_url:
    parser.error('https:// で始まる朱引文庫の公開URLを指定してください。')
path = parsed.path.removesuffix('/index.html').rstrip('/') + '/'
base = urlunsplit((parsed.scheme, parsed.netloc, path, '', ''))
root = Path(__file__).resolve().parent
pages = ('index.html', 'learn.html', 'laws.html', 'dictionary.html')
files = {}
urls = []
for name in pages:
    page = root / name
    canonical = base + ('' if name == 'index.html' else name)
    urls.append(canonical)
    source = page.read_text(encoding='utf-8')
    source, count = re.subn(r'<link rel="canonical" href="[^"]*">', f'<link rel="canonical" href="{escape(canonical, quote=True)}">', source, count=1)
    if count != 1:
        raise SystemExit(f'{name} の正規URL欄が見つかりません。')
    source = re.sub(r'^ *<meta property="og:url" content="[^"]*">\n', '', source, flags=re.M)
    source = source.replace('<meta property="og:type" content="website">', f'<meta property="og:type" content="website">\n  <meta property="og:url" content="{escape(canonical, quote=True)}">', 1)
    source = re.sub(r'<meta property="og:image" content="[^"]*">', f'<meta property="og:image" content="{escape(base + "assets/icon-512.png", quote=True)}">', source, count=1)
    files[page] = source
for page, source in files.items():
    page.write_text(source, encoding='utf-8')
body = '\n'.join(f'  <url><loc>{xml_escape(url)}</loc></url>' for url in urls)
(root / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n', encoding='utf-8')
robots = 'User-agent: *\nAllow: /\n'
if path == '/':
    robots += 'Sitemap: ' + base + 'sitemap.xml\n'
(root / 'robots.txt').write_text(robots, encoding='utf-8')
print(base + 'sitemap.xml')
