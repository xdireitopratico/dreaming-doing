import json, urllib.request

val = None
with open('.env.local', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
            val = line.strip().split('=', 1)[1]
            break

if not val:
    print("No SUPABASE_SERVICE_ROLE_KEY found")
    exit(1)

url = "https://dpduljngdurfpmaclffa.supabase.co/rest/v1/agent_runs?id=eq.01KW47M2RM94EW81GDEG66K34R"
req = urllib.request.Request(url, headers={
    "apikey": val,
    "Authorization": f"Bearer {val}",
    "Accept": "application/vnd.pgrst.object+json"
})
try:
    resp = urllib.request.urlopen(req)
    print(resp.read().decode()[:2000])
except Exception as e:
    print("ERROR", e)
