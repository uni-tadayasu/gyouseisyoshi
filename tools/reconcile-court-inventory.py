#!/usr/bin/env python3
"""Reconcile a public KGraphNavi snapshot with checkpointed official court search.

Requires graph-index.json, official-pages/*.json, year-counts/*.json and optional
manual metadata corrections in official-detail-fixes.json in --work-dir.
The corrections must be copied from official detail-page metadata. Never infer a
judgment date from a case number. Apparent recent removals are verified by HTTP.
"""
import argparse
from collections import Counter
import datetime
import hashlib
import json
from pathlib import Path
import urllib.error
import urllib.request

GRAPH_SOURCE = 'https://github.com/JurisInformaticsCenter/KGraphNavi/releases/tag/caselaw-data-2026.10'
SEARCH_SOURCE = 'https://www.courts.go.jp/hanrei/search1/index.html?filter%5BjudgeDateMode%5D=2&filter%5BjudgeGengoFrom%5D=%E6%98%AD%E5%92%8C&filter%5BjudgeYearFrom%5D=1&filter%5BjudgeMonthFrom%5D=12&filter%5BjudgeDayFrom%5D=25'


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def read(path):
    return json.loads(path.read_text())


def merge_nonempty(target, source):
    """An empty search-result field must never erase existing official metadata."""
    target.update({key: value for key, value in source.items() if value not in ('', None, [])})


def verify_removed(row):
    url = 'https://www.courts.go.jp/hanrei/' + row['id'] + '/detail2/index.html'
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            status = response.status
    except urllib.error.HTTPError as error:
        status = error.code
    if status not in (404, 410):
        raise ValueError(f"ID {row['id']} is absent from recent search but returns HTTP {status}; do not remove automatically")
    return {'id': row['id'], 'sourceUrl': url, 'status': status,
            'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}


def reconcile(snapshot, pages, corrections, year_counts, verify=verify_removed):
    if not pages:
        raise ValueError('Official search checkpoints are required')
    pages = sorted(pages, key=lambda p: p['offset'])
    totals = {p['total'] for p in pages}
    if len(totals) != 1 or [p['offset'] for p in pages] != list(range(0, len(pages) * 30, 30)):
        raise ValueError('Official checkpoints must be contiguous from offset zero with a stable total')
    total = totals.pop()
    if any(len(p['records']) != min(30, total-p['offset']) for p in pages):
        raise ValueError('An official checkpoint has an incomplete page')
    recent = {r['id']: r for p in pages for r in p['records']}
    if len(recent) != sum(len(p['records']) for p in pages):
        raise ValueError('Official checkpoints contain duplicate IDs; refresh pagination')
    rows = {r['id']: dict(r) for r in snapshot}
    if len(rows) != len(snapshot):
        raise ValueError('Snapshot contains duplicate IDs')
    new_ids = sorted(set(recent) - set(rows), key=int)
    for ident, row in recent.items():
        merge_nonempty(rows.setdefault(ident, {'metadataSource': 'courts.go.jp'}), row)
    date_corrections = []
    for row in corrections:
        ident = row['id']
        if ident not in recent:
            raise ValueError('A correction must refer to an official search result: ' + ident)
        if not recent[ident].get('date') and row.get('date'):
            date_corrections.append(ident)
            rows[ident]['dateSource'] = 'official judge_date_num metadata; display date is blank'
        merge_nonempty(rows[ident], row)
    if any(not r.get('date') for r in rows.values()):
        raise ValueError('Unresolved judgment dates remain')
    oldest_covered_year = min(r['date'][:4] for r in recent.values() if r.get('date'))
    candidates = [r for r in snapshot if r.get('date', '')[:4] > oldest_covered_year and r['id'] not in recent]
    removals = [verify(r) for r in candidates]
    for removal in removals:
        del rows[removal['id']]
    counts = Counter(r['date'][:4] for r in rows.values())
    corrected_counts = Counter(rows[i]['date'][:4] for i in date_corrections)
    expected_years = set(range(int(min(counts)), int(max(counts)) + 1))
    if {c['year'] for c in year_counts} != expected_years or len(year_counts) != len(expected_years):
        raise ValueError('Official counts are required for every year in the snapshot')
    year_results = []
    for item in sorted(year_counts, key=lambda y: y['year']):
        year = str(item['year'])
        expected = item['total'] + corrected_counts[year]
        actual = counts[year]
        year_results.append({**item, 'blankDisplayDatesRecovered': corrected_counts[year], 'inventoryCount': actual})
        if expected != actual:
            raise ValueError(f'Year {year}: official {item["total"]} + blank-date records {corrected_counts[year]} != inventory {actual}')
    if len(rows) != total:
        raise ValueError(f'Official total {total} differs from inventory {len(rows)}')
    if sum(y['total'] + y['blankDisplayDatesRecovered'] for y in year_results) != total:
        raise ValueError('Annual official counts do not reconcile to the integrated-search total')
    records = sorted(rows.values(), key=lambda r: (r['date'], int(r['id'])), reverse=True)
    manifest = {
        'total': total, 'expectedTotal': total, 'uniqueIds': len(records), 'complete': True,
        'sourceUrl': SEARCH_SOURCE,
        'inventoryMethod': 'Public snapshot plus current official additions, verified removals and annual-count reconciliation',
        'allIdsIndividuallyRecrawled': len(recent) == total,
        'officialPagesChecked': len(pages), 'officialIdsChecked': len(recent),
        'snapshotCount': len(snapshot), 'newIds': new_ids, 'removed': removals,
        'dateCorrections': date_corrections,
        'dateCorrectionSource': 'Official detail-page judge_date_num; these records have blank display dates and are excluded from date-range searches',
        'annualVerification': year_results,
    }
    return records, manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    root = args.work_dir.resolve(); output = (args.output or root).resolve()
    snapshot_path = root / 'graph-index.json'
    corrections_path = root / 'official-detail-fixes.json'
    records, manifest = reconcile(read(snapshot_path), [read(p) for p in (root/'official-pages').glob('*.json')],
                                  read(corrections_path) if corrections_path.exists() else [],
                                  [read(p) for p in (root/'year-counts').glob('*.json')])
    archive = root / 'hanrei_public.ttl.gz'
    manifest['snapshotSource'] = {'url': GRAPH_SOURCE, 'license': 'CC BY 4.0', 'version': '2026.10',
                                  'parsedIndexSha256': sha256(snapshot_path)}
    if archive.exists():
        manifest['snapshotSource']['archiveSha256'] = sha256(archive)
        checksum_file = root / 'graph-SHA256SUMS.txt'
        if checksum_file.exists():
            published = {line.split()[1]: line.split()[0] for line in checksum_file.read_text().splitlines() if len(line.split()) == 2}
            if published.get(archive.name) != manifest['snapshotSource']['archiveSha256']:
                raise ValueError('Public snapshot does not match the publisher SHA256SUMS.txt')
            manifest['snapshotSource']['publisherChecksumVerified'] = True
            manifest['snapshotSource']['checksumSource'] = 'https://github.com/JurisInformaticsCenter/KGraphNavi/releases/download/caselaw-data-2026.10/SHA256SUMS.txt'
    manifest['retrievedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    manifest['officialObservationFrom'] = min(p['fetchedAt'] for p in [read(p) for p in (root/'official-pages').glob('*.json')])
    output.mkdir(parents=True, exist_ok=True)
    data = json.dumps(records, ensure_ascii=False, separators=(',', ':'))
    manifest['indexSha256'] = hashlib.sha256(data.encode()).hexdigest()
    (output/'official-index.json').write_text(data)
    (output/'official-index-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps({k:manifest[k] for k in ['total','complete','snapshotCount','officialIdsChecked','dateCorrections']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
