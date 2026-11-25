"""Prenos PDF-jev vseh odigranih tekem EHF Lige prvakinj (ženske) za aktualno sezono.

Za vsako odigrano tekmo prenese:
  - statistiko (Online Statistics, ~13 strani: streli po pozicijah, igralke, golmanke, potek),
  - zapisnik tekme (Match Report, 1 stran).
Že prenesene datoteke preskoči, zato ga lahko poganjaš večkrat (npr. po vsakem krogu).

Uporaba:
  python3 tools/ehf_pdf.py                  # aktualna sezona v mapo ehf-pdf/
  python3 tools/ehf_pdf.py --mapa D:/EHF    # druga mapa
  python3 tools/ehf_pdf.py --samo-statistika

Potrebuje samo Python 3 (brez dodatnih paketov) in dostop do:
ehfcl.eurohandball.com in statistics.eurohandball.com.
"""
import argparse
import json
import os
import re
import time
import unicodedata
import urllib.request

API = 'https://ehfcl.eurohandball.com/umbraco/api/competitionmatchesapi/'
# Rezervni vrednosti za sezono 2026-27; običajno ju skripta sama prebere s strani tekem aktualne sezone.
CONTENT_ID = '138737'
COMPETITION_ID = 'UnyDApFpvo3oNBJc9fnoag'
SEASON_URL = 'https://ehfcl.eurohandball.com/women/'
STAT_URL = 'https://statistics.eurohandball.com/reports/report-rshsa.ashx?typ=hsa2&m={id}'
REPORT_URL = 'https://statistics.eurohandball.com/reports/?m={id}'
HEADERS = {'User-Agent': 'Mozilla/5.0 (rokomet-analitika)'}


def get(url, binary=False, tries=5):
    """Prenos z več poskusi: strežnik EHF občasno prekine povezavo."""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=90) as r:
                data = r.read()
            return data if binary else json.loads(data)
        except (OSError, ValueError) as e:
            if i == tries - 1:
                raise
            wait = 3 * (i + 1)
            print(f'  ... napaka ({e}), ponovno čez {wait} s')
            time.sleep(wait)


def current_season():
    """Poišče aktualno sezono (npr. 2026-27) in ID-ja tekmovanja na strani tekem EHF."""
    try:
        req = urllib.request.Request(SEASON_URL, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=60) as r:
            season_url = r.geturl()
        req = urllib.request.Request(season_url.rstrip('/') + '/matches/', headers=HEADERS)
        with urllib.request.urlopen(req, timeout=60) as r:
            html = r.read().decode('utf-8', 'replace')
        cid = re.search(r'data-currentcontentid="(\d+)"', html).group(1)
        comp = re.search(r'data-competition-id="([^"]+)"', html).group(1)
        season = re.search(r'/women/(\d{4}-\d{2})/', season_url)
        return cid, comp, season.group(1) if season else ''
    except (OSError, AttributeError) as e:
        print(f'  ! sezone ni bilo mogoče prebrati ({e}), uporabim 2026-27')
        return CONTENT_ID, COMPETITION_ID, '2026-27'


def all_matches(content_id, competition_id):
    """Vse tekme sezone: začetni seznam, nato listanje nazaj po odigranih tekmah."""
    q = f'contentId={content_id}&competitionId={competition_id}'
    batch = get(f'{API}GetInitMatches?{q}')['matches']
    seen = {}
    while batch:
        new = [m for m in batch if m['matchID'] not in seen]
        if not new:
            break
        for m in new:
            seen[m['matchID']] = m
        past = [m for m in batch if m['isFinished']]
        if not past:
            break
        batch = get(f"{API}GetMatches?{q}&matchId={past[-1]['matchID']}&futureMatches=false")['matches']
    return sorted(seen.values(), key=lambda m: m['venue']['date']['utc'])


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--mapa', default='ehf-pdf', help='kam shraniti PDF-je (privzeto ehf-pdf)')
    ap.add_argument('--samo-statistika', action='store_true', help='brez zapisnikov tekem')
    a = ap.parse_args()
    os.makedirs(a.mapa, exist_ok=True)

    content_id, competition_id, season = current_season()
    matches = [m for m in all_matches(content_id, competition_id) if m['isFinished']]
    print(f'Sezona {season}, odigranih tekem: {len(matches)}')
    index, new = [], 0
    for m in matches:
        mid = m['matchID']
        date = m['venue']['date']['utc'][:10]
        home, guest = m['homeTeam']['team']['fullName'], m['guestTeam']['team']['fullName']
        base = f'{date}_{slug(home)}_vs_{slug(guest)}_{mid}'
        files = {'statistika': (STAT_URL, f'{base}_statistika.pdf')}
        if not a.samo_statistika:
            files['zapisnik'] = (REPORT_URL, f'{base}_zapisnik.pdf')
        row = dict(sezona=season, matchID=mid, datum=date, domaci=home, gostje=guest, krog=m['comp']['round']['name'])
        for kind, (url, name) in files.items():
            path = os.path.join(a.mapa, name)
            row[kind] = name
            if os.path.exists(path) and os.path.getsize(path) > 1000:
                continue
            data = get(url.format(id=mid), binary=True)
            if not data.startswith(b'%PDF'):
                print(f'  ! {name}: odgovor ni PDF, preskočeno')
                continue
            with open(path, 'wb') as f:
                f.write(data)
            new += 1
            print(f'  + {name}')
            time.sleep(0.5)  # prijazno do strežnika
        index.append(row)
    with open(os.path.join(a.mapa, 'tekme.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    print(f'Novih datotek: {new}. Seznam tekem: {os.path.join(a.mapa, "tekme.json")}')


if __name__ == '__main__':
    main()
