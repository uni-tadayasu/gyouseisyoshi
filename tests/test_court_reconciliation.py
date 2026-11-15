import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('reconciliation', Path(__file__).resolve().parents[1] / 'tools/reconcile-court-inventory.py')
reconciliation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reconciliation)


def fixture():
    recent = [{'id': str(i), 'date': '2026-02-01', 'title': 'case ' + str(i), 'court': 'Court'} for i in range(1, 30)]
    recent[-1]['date'] = '2025-12-01'
    snapshot = copy.deepcopy(recent)
    snapshot += [{'id': '80', 'date': '2026-03-01'}, {'id': '90', 'date': '2024-01-01'}, {'id': '91', 'date': '2024-02-01'}]
    recent[0]['title'] = ''
    recent.append({'id': '50', 'date': '', 'title': 'new case'})
    corrections = [{'id': '50', 'date': '2026-04-01'}]
    counts = [{'year': 2024, 'total': 2}, {'year': 2025, 'total': 1}, {'year': 2026, 'total': 28}]
    return snapshot, [{'offset': 0, 'total': 32, 'records': recent}], corrections, counts


class ReconciliationTests(unittest.TestCase):
    def test_addition_removal_blank_date_and_nonempty_merge(self):
        checked = []
        def removed(row):
            checked.append(row['id'])
            return {'id': row['id'], 'status': 404}
        records, manifest = reconciliation.reconcile(*fixture(), verify=removed)
        indexed = {r['id']: r for r in records}
        self.assertEqual(checked, ['80'])
        self.assertEqual(len(records), 32)
        self.assertNotIn('80', indexed)
        self.assertEqual(indexed['1']['title'], 'case 1')
        self.assertEqual(indexed['50']['date'], '2026-04-01')
        self.assertEqual(manifest['dateCorrections'], ['50'])
        self.assertEqual(manifest['newIds'], ['50'])
        self.assertTrue(manifest['complete'])
        self.assertFalse(manifest['allIdsIndividuallyRecrawled'])

    def test_rejects_unverified_removal_or_unmatched_year_count(self):
        def cannot_verify(row):
            raise ValueError('Still public')
        with self.assertRaises(ValueError):
            reconciliation.reconcile(*fixture(), verify=cannot_verify)
        values = list(fixture())
        values[3][-1]['total'] -= 1
        with self.assertRaises(ValueError):
            reconciliation.reconcile(*values, verify=lambda r: {'id': r['id'], 'status': 404})

    def test_rejects_partial_page_or_missing_year(self):
        values = list(fixture())
        values[1][0]['records'].pop()
        with self.assertRaises(ValueError):
            reconciliation.reconcile(*values)
        values = list(fixture())
        values[3].pop()
        with self.assertRaises(ValueError):
            reconciliation.reconcile(*values, verify=lambda r: {'id': r['id'], 'status': 404})


if __name__ == '__main__':
    unittest.main()
