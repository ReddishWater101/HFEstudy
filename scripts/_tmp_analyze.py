import pandas as pd
from collections import defaultdict

paths = [
    'docs/HFE_FinalProject/Mode A study Data.xlsx',
    'docs/HFE_FinalProject/Mode B all Study.xlsx',
]
frames = []
for p in paths:
    df = pd.read_excel(p)
    df.columns = [c.strip() for c in df.columns]
    frames.append(df[['Participant Name','timestamp','personId','mode','blockLabel','bucket']])
df = pd.concat(frames, ignore_index=True)

df['timestamp'] = df['timestamp'].astype(str).str.replace(r'\s+[A-Z]{2,4}$','',regex=True)
df['timestamp'] = pd.to_datetime(df['timestamp'])
df = df.sort_values(['Participant Name','personId','timestamp']).reset_index(drop=True)

# For each (participant, personId, mode) pair, find first exposure index where bucket == know-it.
# A "pair" is (participant, personId). Mode is constant per pair.
results = defaultdict(lambda: {1:0,2:0,3:0,4:0,'never':0,'total':0})

for (pname, pid), g in df.groupby(['Participant Name','personId']):
    g = g.sort_values('timestamp').reset_index(drop=True)
    mode = int(g['mode'].iloc[0])
    results[mode]['total'] += 1
    found = False
    for i, row in g.iterrows():
        idx = i + 1
        if idx > 4:
            break
        if str(row['bucket']).strip().lower() == 'know-it':
            if idx in (1,2,3,4):
                results[mode][idx] += 1
            found = True
            break
    if not found:
        results[mode]['never'] += 1

mode_names = {1:'P+T',2:'P+A',3:'NP+T',4:'NP+A'}
print(f"{'Mode':<6}{'n':<5}{'exp1':<8}{'exp2':<8}{'exp3':<8}{'exp4':<8}{'never':<8}")
for m in [1,2,3,4]:
    r = results[m]
    n = r['total']
    print(f"{mode_names[m]:<6}{n:<5}{r[1]:<8}{r[2]:<8}{r[3]:<8}{r[4]:<8}{r['never']:<8}")

print('\nPercentages:')
print(f"{'Mode':<6}{'exp1%':<8}{'exp2%':<8}{'exp3%':<8}{'exp4%':<8}{'never%':<8}")
for m in [1,2,3,4]:
    r = results[m]; n = r['total']
    print(f"{mode_names[m]:<6}{100*r[1]/n:<8.2f}{100*r[2]/n:<8.2f}{100*r[3]/n:<8.2f}{100*r[4]/n:<8.2f}{100*r['never']/n:<8.2f}")

print('\nHazard rates H[k] = first-learned at k / still-unlearned entering k:')
print(f"{'Mode':<6}{'H1':<8}{'H2':<8}{'H3':<8}{'H4':<8}")
hazards = {}
for m in [1,2,3,4]:
    r = results[m]; n = r['total']
    remaining = n
    h = []
    for k in [1,2,3,4]:
        learned = r[k]
        if remaining <= 0:
            h.append(0.0)
        else:
            h.append(learned/remaining)
        remaining -= learned
    hazards[m] = h
    print(f"{mode_names[m]:<6}{h[0]:<8.4f}{h[1]:<8.4f}{h[2]:<8.4f}{h[3]:<8.4f}")

print('\nTS-array form:')
for m in [1,2,3,4]:
    h = hazards[m]
    print(f"  {m}: knowItHazard: [{h[0]:.4f}, {h[1]:.4f}, {h[2]:.4f}, {h[3]:.4f}],  // {mode_names[m]}")
