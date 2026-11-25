"""Branje statistik EHF (PDF "Online Statistics") in izračun benchmarka Lige prvakinj.

Iz vsakega PDF-ja statistike prebere za obe ekipi:
  - pregled tekme (stran 1): goli, streli, izgubljene žoge, tehnične napake, uspešnost napada,
    streli v okvir, obrambe, 7 m, goli iz protinapadov, goli v premoči/podštevilnosti,
    rumeni kartoni, 2 min, rdeči kartoni, time-outi,
  - izid strelov (stran 2): goli, obrambe, mimo, vratnica, blokirani,
  - seštevek igralk: goli/streli po pozicijah (7 m, 6 m, 9 m, krilo, prodor, protinapad),
    asistence, ukradene žoge, bloki,
  - seštevek vratark: obrambe/streli po pozicijah.

Uporaba:
  python3 tools/ehf_stat.py ehf-pdf ehf-benchmark.json
Prva mapa je mapa, ki jo napolni tools/ehf_pdf.py (PDF-ji in tekme.json).
Potrebuje pdftotext (paket poppler-utils).
"""
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

POS = ['7M', '6M', '9M', 'Wing', 'BT', 'FB']
# Vrstice pregleda na 1. strani: oznaka v PDF -> ključ.
OVERVIEW = {
    'Goals': 'goals', 'Shots': 'shots', 'Shot Percentage': 'shot_pct', 'Turnovers': 'turnovers',
    'Rule Technical Fouls': 'technical_fouls', 'Attack Percentage': 'attack_pct', 'Shots on Goal': 'shots_on_goal',
    'On Target Percentage': 'on_target_pct', 'Saves': 'saves', 'GK Save Percentage': 'gk_save_pct',
    '7m Goals': 'g7_goals', '7m Shots': 'g7_shots', '7m Percentage': 'g7_pct', 'Fast Break Goals': 'fast_break_goals',
    'Powerplay goals': 'powerplay_goals', 'Shorthanded goals': 'shorthanded_goals',
    'Most goals in succession': 'best_run', 'Yellow Cards': 'yellow', '2 min Suspension': 'two_min',
    'Red Cards': 'red', 'Team Timeouts': 'timeouts',
}
OUTCOMES = ['goals', 'saves', 'missed', 'posts', 'blocked']


def num(t):
    t = t.strip().rstrip('%')
    try:
        return float(t) if '.' in t else int(t)
    except ValueError:
        return None


def layout_pages(pdf):
    out = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout
    return out.split('\f')


def words(pdf):
    """Besede z lego: {stran: [(top, left, right, besedilo), ...]}."""
    out = subprocess.run(['pdftotext', '-tsv', pdf, '-'], capture_output=True, text=True, check=True).stdout
    pages = defaultdict(list)
    for line in out.splitlines()[1:]:
        f = line.split('\t')
        if len(f) < 12 or f[0] != '5':
            continue
        left, top, width = float(f[6]), float(f[7]), float(f[8])
        pages[int(f[1])].append((top, left, left + width, f[11]))
    return pages


def lines_of(ws):
    """Združi besede v vrstice po navpični legi."""
    rows = []
    for w in sorted(ws):
        if rows and abs(rows[-1][0] - w[0]) < 3:
            rows[-1][1].append(w)
        else:
            rows.append([w[0], [w]])
    return [sorted(r[1], key=lambda x: x[1]) for r in rows]


def parse_overview(page):
    home, away = {}, {}
    labels = sorted(OVERVIEW, key=len, reverse=True)
    for line in page.splitlines():
        s = line.strip()
        for lab in labels:
            m = re.search(r'(?:^|\s{2,})' + re.escape(lab) + r'(?:\s{2,}|$)', s)
            if m:
                left, right = s[:m.start()].split(), s[m.end():].split()
                if left and right:
                    home[OVERVIEW[lab]], away[OVERVIEW[lab]] = num(left[0]), num(right[-1])
                break
    return home, away


def parse_outcomes(page_words, shots_home, shots_away):
    """Stran 2: prvi blok 'Total' z goli, obrambami, mimo, vratnico in bloki (številka + [delež])."""
    ls = lines_of(page_words)
    start = next((i for i, l in enumerate(ls) if any(w[3].startswith('Shots') for w in l)), None)
    if start is None:
        return None, None
    mid = 306
    rows = []
    for l in ls[start + 1:]:
        texts = [w[3] for w in l]
        if any(t in ('1st', '2nd') for t in texts):
            break
        if not any(re.fullmatch(r'\[\d+%\]', t) for t in texts):
            continue
        h = [num(w[3]) for w in l if w[2] < mid and re.fullmatch(r'\d+', w[3])]
        a = [num(w[3]) for w in l if w[1] > mid and re.fullmatch(r'\d+', w[3])]
        rows.append((h[-1] if h else 0, a[0] if a else 0))
        if len(rows) == 5:
            break
    res = []
    for side, total in ((0, shots_home), (1, shots_away)):
        vals = [r[side] for r in rows]
        res.append(dict(zip(OUTCOMES, vals)) if len(vals) == 5 and sum(vals) == total else None)
    return res[0], res[1]


def merge_pct(line):
    """'25%' in '(1/4)' združi v eno vrednost z lego na sredini."""
    out, i = [], 0
    while i < len(line):
        t = line[i]
        if i + 1 < len(line) and re.fullmatch(r'\d+%', t[3]) and re.fullmatch(r'\(\d+/\d+\)', line[i + 1][3]):
            out.append((t[0], t[1], line[i + 1][2], line[i + 1][3].strip('()')))
            i += 2
        else:
            out.append(t)
            i += 1
    return out


def assign(header, values):
    """Vsako vrednost dodeli stolpcu glave, katerega sredina je najbližja."""
    cols = [((w[1] + w[2]) / 2, w[3]) for w in header]
    res = {}
    for v in values:
        c = (v[1] + v[2]) / 2
        name = min(cols, key=lambda x: abs(x[0] - c))[1]
        res[name] = v[3]
    return res


def frac(t):
    if t and re.fullmatch(r'\d+/\d+', t):
        a, b = t.split('/')
        return int(a), int(b)
    return 0, 0


def parse_tables(pages):
    """Seštevek igralk in vratark za obe ekipi, po vrstnem redu v PDF (domači, gostje)."""
    teams = []
    for p in sorted(pages):
        ls = lines_of(pages[p])
        if not any('Statistics:' in ' '.join(w[3] for w in l) for l in ls):
            continue
        gk_head = pl_head = None
        cur = {}
        for l in ls:
            texts = [w[3] for w in l]
            if 'Saves' in texts and 'GC' in texts:
                gk_head = [w for w in l if w[3] in ('Saves', 'Shots', '%', 'GC', *POS)]
            elif 'Pos.' in texts and 'Goals' in texts:
                pl_head = [w for w in l if w[3] in ('Goals', 'Shots', '%', '7M', '7M%', '6M', '9M', 'Wing', 'BT', 'FB', 'Ass.', 'ST', 'BL', 'YC', '2m', 'RC')]
            elif texts[:2] == ['Player', 'TOTALS'] and pl_head:
                v = assign(pl_head, l[2:])
                cur['players'] = {
                    'goals': num(v.get('Goals', '0')), 'shots': num(v.get('Shots', '0')),
                    'pos': {k: frac(v.get(k)) for k in POS},
                    'assists': num(v.get('Ass.', '0')) or 0, 'steals': num(v.get('ST', '0')) or 0, 'blocks': num(v.get('BL', '0')) or 0,
                }
            elif texts[:1] == ['TOTALS'] and gk_head and 'gk' not in cur:
                v = assign(gk_head, merge_pct(l[1:]))
                cur['gk'] = {'saves': num(v.get('Saves', '0')), 'shots': num(v.get('Shots', '0')),
                             'pos': {k: frac(v.get(k)) for k in POS}}
        if cur:
            teams.append(cur)
    return teams


def parse_match(pdf):
    lp = layout_pages(pdf)
    home, away = parse_overview(lp[0])
    pw = words(pdf)
    oh, oa = parse_outcomes(pw.get(2, []), home.get('shots'), away.get('shots'))
    home['outcomes'], away['outcomes'] = oh, oa
    t = parse_tables(pw)
    if len(t) >= 2:
        home.update(t[0])
        away.update(t[1])
    return home, away


def benchmark(rows):
    """Seštevki čez vse ekipe in tekme: povprečja na tekmo in deleži."""
    n = len(rows)
    tot = defaultdict(float)
    pos = {k: [0, 0] for k in POS}
    gk = {k: [0, 0] for k in POS}
    out_tot = defaultdict(int)
    out_n = 0
    for r in rows:
        for k, v in r.items():
            if isinstance(v, (int, float)) and not k.endswith('_pct'):
                tot[k] += v
        for k in POS:
            g, s = r.get('players', {}).get('pos', {}).get(k, (0, 0))
            pos[k][0] += g
            pos[k][1] += s
            g, s = r.get('gk', {}).get('pos', {}).get(k, (0, 0))
            gk[k][0] += g
            gk[k][1] += s
        for k in ('assists', 'steals', 'blocks'):
            tot[k] += r.get('players', {}).get(k, 0)
        if r.get('outcomes'):
            out_n += 1
            for k in OUTCOMES:
                out_tot[k] += r['outcomes'][k]
    pct = lambda a, b: round(100 * a / b, 1) if b else None
    shots_pos = sum(s for _, s in pos.values())
    return {
        'team_games': n,
        'per_game': {k: round(v / n, 2) for k, v in sorted(tot.items())},
        'totals': {k: int(v) for k, v in sorted(tot.items())},
        'pct': {
            'shot': pct(tot['goals'], tot['shots']), 'attack_est': pct(tot['goals'], tot['shots'] + tot['turnovers']),
            'on_target': pct(tot['shots_on_goal'], tot['shots']), 'gk_save': pct(tot['saves'], tot['shots_on_goal']),
            'g7': pct(tot['g7_goals'], tot['g7_shots']),
        },
        'positions': {k: {'goals': g, 'shots': s, 'goal_pct': pct(g, s), 'shot_share': pct(s, shots_pos)} for k, (g, s) in pos.items()},
        'gk_positions': {k: {'saves': g, 'shots': s, 'save_pct': pct(g, s)} for k, (g, s) in gk.items()},
        'shot_outcomes': {k: {'per_game': round(v / out_n, 2), 'share': pct(v, sum(out_tot.values()))} for k, v in out_tot.items()} if out_n else {},
    }


def main():
    folder, out = sys.argv[1], sys.argv[2]
    index = json.load(open(os.path.join(folder, 'tekme.json'), encoding='utf-8'))
    rows, bad = [], []
    for m in index:
        pdf = os.path.join(folder, m['statistika'])
        if not os.path.exists(pdf):
            continue
        try:
            h, a = parse_match(pdf)
        except Exception as e:  # noqa: BLE001 - ena pokvarjena datoteka ne sme ustaviti vsega
            bad.append(f"{m['statistika']}: {e}")
            continue
        for side, other, me, opp in ((h, a, m['domaci'], m['gostje']), (a, h, m['gostje'], m['domaci'])):
            if 'players' not in side or side.get('goals') is None:
                bad.append(f"{m['statistika']}: {me} brez seštevka igralk")
                continue
            rows.append(dict(matchID=m['matchID'], date=m['datum'], round=m.get('krog'), team=me, opponent=opp,
                             home=me == m['domaci'], **side))
    season = next((m.get('sezona') for m in index if m.get('sezona')), '')
    result = {
        'source': f'EHF Champions League Women {season}, Online Statistics (statistics.eurohandball.com)',
        'season': season,
        'last_match': max((r['date'] for r in rows), default=None),
        'matches': len({r['matchID'] for r in rows}),
        'benchmark': benchmark(rows),
        'rows': rows,
        'problems': bad,
    }
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, separators=(',', ':'))
    print(f"Tekem: {result['matches']}, vrstic ekip: {len(rows)}, težav: {len(bad)}")
    for b in bad[:10]:
        print('  !', b)


if __name__ == '__main__':
    main()
