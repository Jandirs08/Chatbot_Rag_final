from pathlib import Path
from rag.pdf_processor.pdf_loader import PDFContentLoader

# Initialize loader
loader = PDFContentLoader()
print('=' * 80)
print('TESTING ENHANCED CHUNKING STRATEGY')
print('=' * 80)
print(f'\nLoader initialized:')
print(f'  - chunk_size: {loader.chunk_size}')
print(f'  - chunk_overlap: {loader.chunk_overlap}')
print(f'  - min_chunk_length: {loader.min_chunk_length}')

# Use specific PDF from storage
pdf_path = Path('/app/storage/documents/pdfs/DocRag2.pdf')

if not pdf_path.exists():
    print(f'\nPDF not found: {pdf_path}')
    exit(1)

print(f'\nUsing PDF: {pdf_path.name}')

# Load and split
print('\nLoading and splitting PDF...')
chunks = loader.load_and_split_pdf(pdf_path)

if not chunks:
    print('No chunks generated')
    exit(1)

print(f'\n✓ Generated {len(chunks)} chunks')

# Analyze first 5 chunks
print(f'\n{"=" * 80}')
print('SAMPLE CHUNKS ANALYSIS')
print('=' * 80)

for i, chunk in enumerate(chunks[:5]):
    has_complete = chunk.metadata.get('has_complete_sentences', False)
    boundary_score = chunk.metadata.get('boundary_quality_score', 0.0)
    chunk_type = chunk.metadata.get('chunk_type', 'unknown')
    content = chunk.page_content
    last_100 = content[-100:] if len(content) > 100 else content
    
    print(f'\nChunk #{i + 1}:')
    print(f'  Type: {chunk_type}')
    print(f'  Length: {len(content)} chars, {chunk.metadata.get("word_count", 0)} words')
    print(f'  Complete sentences: {"✓" if has_complete else "✗"}')
    print(f'  Boundary score: {boundary_score:.2f}')
    print(f'  Page: {chunk.metadata.get("page_number", "N/A")}')
    print(f'  Ends with: ...{repr(last_100[-60:])}')

# Overall statistics
all_complete = sum(1 for c in chunks if c.metadata.get('has_complete_sentences', False))
avg_boundary = sum(c.metadata.get('boundary_quality_score', 0.0) for c in chunks) / len(chunks)

print(f'\n{"=" * 80}')
print('OVERALL STATISTICS')
print('=' * 80)
print(f'\nTotal chunks: {len(chunks)}')
print(f'Chunks with complete sentences: {all_complete} ({all_complete/len(chunks)*100:.1f}%)')
print(f'Average boundary quality score: {avg_boundary:.3f}')

# Chunk types distribution
all_types = {}
for c in chunks:
    ctype = c.metadata.get('chunk_type', 'unknown')
    all_types[ctype] = all_types.get(ctype, 0) + 1

print(f'\nChunk types distribution:')
for ctype, count in sorted(all_types.items(), key=lambda x: x[1], reverse=True):
    print(f'  {ctype}: {count} ({count/len(chunks)*100:.1f}%)')

# Show examples of incomplete sentence chunks (potential issues)
print(f'\n{"=" * 80}')
print('CHUNKS WITH INCOMPLETE SENTENCES (for review)')
print('=' * 80)
incomplete_count = 0
for i, chunk in enumerate(chunks):
    if not chunk.metadata.get('has_complete_sentences', False):
        incomplete_count += 1
        if incomplete_count <= 3:  # Show first 3
            content = chunk.page_content
            last_80 = content[-80:] if len(content) > 80 else content
            print(f'\nChunk #{i + 1} (boundary_score: {chunk.metadata.get("boundary_quality_score", 0.0):.2f}):')
            print(f'  Ends with: ...{repr(last_80)}')

print(f'\n{"=" * 80}')
print('✓ TEST COMPLETED SUCCESSFULLY')
print('=' * 80)
