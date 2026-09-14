import io
import sys
from pypdf import PdfReader

reader = PdfReader(io.BytesIO(sys.stdin.buffer.read()))
if len(reader.pages) > 40:
    raise ValueError('Please upload a résumé of at most 40 pages.')
print('\n'.join(page.extract_text() or '' for page in reader.pages)[:100000])
