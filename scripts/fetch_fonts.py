"""Build small, self-hosted OFL font subsets for the static Chinese script."""
from pathlib import Path
from urllib.request import Request
from urllib.parse import urlencode
import re
import subprocess

def fetch(request):
    # curl supports command-scoped HTTPS_PROXY on macOS and Linux.
    url = request.full_url if isinstance(request, Request) else request
    args = ['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '2', '--max-time', '30']
    if isinstance(request, Request):
        for key, value in request.header_items():
            args += ['--header', f'{key}: {value}']
    return subprocess.check_output(args + [url])

root = Path(__file__).resolve().parents[1]
texts = ''.join(p.read_text() for p in (root/'src').glob('*') if p.suffix in ['.ts','.css'])
texts += (root/'index.html').read_text()
chars = ''.join(sorted(set(c for c in texts if '\u3000' <= c <= '\uffff' or 32 <= ord(c) <= 126)))
dest = root/'public/fonts'
dest.mkdir(exist_ok=True)
for family, weight, name, repo in [('Noto Serif SC',600,'noon-serif','notoserifsc'),('Noto Sans SC',400,'noon-sans','notosanssc')]:
    query = urlencode({'family':f'{family}:wght@{weight}', 'text':chars, 'display':'swap'})
    req = Request('https://fonts.googleapis.com/css2?'+query, headers={'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'})
    css = fetch(req).decode()
    url = re.search(r'url\((https[^)]+)\)',css).group(1)
    data = fetch(url)
    license_url = f'https://raw.githubusercontent.com/google/fonts/main/ofl/{repo}/OFL.txt'
    license_path = dest/f'{name}-OFL.txt'
    license_data = license_path.read_bytes() if license_path.exists() else fetch(license_url)
    (dest/f'{name}.woff2').write_bytes(data)
    license_path.write_text('\n'.join(line.rstrip() for line in license_data.decode().splitlines())+'\n')
    print(f'{family}: {len(data):,} bytes, {len(chars)} characters')
