"""Build and audit self-hosted OFL subsets from the official Google Fonts service.

Use a Python environment with fonttools and brotli installed. --check is offline
and verifies all currently required characters against each asset's actual cmap.
"""
from argparse import ArgumentParser
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode, urlparse
import json
import re
import subprocess

try:
    from fontTools.ttLib import TTFont
except ImportError as exc:
    raise SystemExit('Run this script with a Python environment containing fonttools and brotli.') from exc

USER_AGENT = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
              'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36')
FONTS = [('Noto Serif SC', 600, 'noon-serif', 'notoserifsc'),
         ('Noto Sans SC', 400, 'noon-sans', 'notosanssc')]


def fetch(url):
    # The text-subset endpoint also negotiates its binary format by User-Agent.
    # Send the same modern UA for both CSS and font data, then inspect the bytes.
    if urlparse(url).scheme != 'https' or urlparse(url).hostname not in {
        'fonts.googleapis.com', 'fonts.gstatic.com', 'raw.githubusercontent.com'
    }:
        raise ValueError('Font download must use the configured official sources.')
    return subprocess.check_output([
        'curl', '--fail', '--silent', '--show-error', '--location', '--retry', '2',
        '--max-time', '40', '--user-agent', USER_AGENT, url,
    ])


def required_characters(root):
    texts = ''.join(p.read_text() for p in sorted((root / 'src').rglob('*'))
                    if p.suffix in {'.ts', '.css'})
    texts += (root / 'index.html').read_text()
    return ''.join(sorted(set(c for c in texts
                              if '\u3000' <= c <= '\uffff' or 32 <= ord(c) <= 126)))


def inspect(data, chars):
    font = TTFont(BytesIO(data))
    cmap = font.getBestCmap() or {}
    missing = sorted(set(map(ord, chars)) - set(cmap))
    font.close()
    if missing:
        names = ' '.join(f'U+{cp:04X}({chr(cp)})' for cp in missing)
        raise ValueError(f'Font is missing {len(missing)} required characters: {names}')
    return len(cmap)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check existing assets offline; do not download or write.')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    chars = required_characters(root)
    dest = root / 'public/fonts'
    if args.check:
        for family, _, name, _ in FONTS:
            data = (dest / f'{name}.woff2').read_bytes()
            if data[:4] != b'wOF2':
                raise ValueError(f'{name}.woff2 is not a WOFF2 file.')
            inspect(data, chars)
            print(f'{family}: verified WOFF2, {len(chars)} required characters covered')
        return

    dest.mkdir(exist_ok=True)
    staged = {}
    report = {
        'source': 'https://fonts.googleapis.com/css2',
        'requiredCharacters': len(chars),
        'requiredHanCharacters': sum('\u4e00' <= c <= '\u9fff' for c in chars),
        'requiredTextSha256': sha256(chars.encode()).hexdigest(),
        'coverageCheck': 'actual Unicode cmap; all required characters present',
        'fonts': [],
    }
    for family, weight, name, repo in FONTS:
        query = urlencode({'family': f'{family}:wght@{weight}', 'text': chars, 'display': 'swap'})
        css = fetch('https://fonts.googleapis.com/css2?' + query).decode()
        match = re.search(r'url\((https[^)]+)\)', css)
        if not match:
            raise ValueError(f'No font URL returned for {family}.')
        data = fetch(match.group(1))
        # Explicit conversion keeps the extension and CSS format truthful even
        # when an upstream response is a valid TrueType font rather than WOFF2.
        if data[:4] != b'wOF2':
            font = TTFont(BytesIO(data))
            font.flavor = 'woff2'
            output = BytesIO()
            font.save(output)
            font.close()
            data = output.getvalue()
        if data[:4] != b'wOF2':
            raise ValueError(f'WOFF2 encoding failed for {family}.')
        covered = inspect(data, chars)
        license_path = dest / f'{name}-OFL.txt'
        license_data = license_path.read_bytes() if license_path.exists() else fetch(
            f'https://raw.githubusercontent.com/google/fonts/main/ofl/{repo}/OFL.txt')
        staged[dest / f'{name}.woff2'] = data
        staged[license_path] = ('\n'.join(line.rstrip() for line in license_data.decode().splitlines()) + '\n').encode()
        report['fonts'].append({'family': family, 'weight': weight, 'file': f'{name}.woff2',
                                'format': 'WOFF2', 'bytes': len(data), 'cmapCharacters': covered,
                                'sha256': sha256(data).hexdigest()})
        print(f'{family}: {len(data):,} bytes, {len(chars)} required characters verified')
    # Keep the existing pair intact unless both new assets have passed coverage.
    for path, data in staged.items():
        path.write_bytes(data)
    (dest / 'subset-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
