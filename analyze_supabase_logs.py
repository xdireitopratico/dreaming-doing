import json
from collections import Counter
from datetime import datetime

with open('/mnt/user-data/uploads/supabase_logs.json','r',encoding='utf-8') as f:
    logs = json.load(f)

print(f"Total log entries: {len(logs)}")
if logs:
    times = [datetime.fromisoformat(l['date'].replace('Z','+00:00')) for l in logs if 'date' in l]
    print(f"Time range: {min(times)} to {max(times)}")
    print(f"Duration: {(max(times)-min(times)).total_seconds()/60:.1f} minutes")

print("\n--- Top endpoints ---")
paths = Counter(l.get('pathname','') for l in logs)
for path, n in paths.most_common(20):
    print(f"{n:5d} {path}")

print("\n--- Status distribution ---")
statuses = Counter(str(l.get('status','')) for l in logs)
for s, n in statuses.most_common():
    print(f"{n:5d} {s}")

print("\n--- Error / warn messages ---")
for l in logs:
    msg = l.get('event_message','')
    if l.get('level') in ('error','warning') or str(l.get('status','')).startswith(('4','5','000')):
        print(f"[{l.get('level','')}/{l.get('status','')}] {msg[:180]}")
