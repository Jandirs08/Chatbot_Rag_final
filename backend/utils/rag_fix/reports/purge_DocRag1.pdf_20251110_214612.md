# Purge PDF: DocRag1.pdf

Timestamp: 2025-11-10T21:46:12.011042
Vector store path: ./backend/storage/vector_store/chroma_db
Embedding model: sentence-transformers/all-MiniLM-L6-v2
Distance strategy: cosine
Dry-run: No
Delete file: No

### ANTES

| Indicador | Valor |
|---|---|
| total_docs | 9 |
| docs_embedding_valid | 9 |
| docs_nulos | 0 |
| content_hash_duplicados | 0 |
| dummy_detectado | No |
| docs_del_pdf_objetivo | 9 |

Top 10 source/file_path por cantidad de docs:

| source/file_path | docs |
|---|---|
| /app/backend/storage/documents/pdfs/DocRag1.pdf | 9 |

### DESPUÉS

| Indicador | Valor |
|---|---|
| total_docs | 1 |
| docs_embedding_valid | 1 |
| docs_nulos | 0 |
| content_hash_duplicados | 0 |
| dummy_detectado | Sí |
| docs_del_pdf_objetivo | 0 |

Top 10 source/file_path por cantidad de docs:

| source/file_path | docs |
|---|---|
| system | 1 |

### Delta

| Indicador | Antes | Después | Delta |
|---|---|---|---|
| total_docs | 9 | 1 | -8 |
| docs_embedding_valid | 9 | 1 | -8 |
| docs_nulos | 0 | 0 | 0 |
| content_hash_duplicados | 0 | 0 | 0 |
| docs_del_pdf_objetivo | 9 | 0 | -9 |

### IDs borrados (primeros 50)

| id | source | file_path | content_hash |
|---|---|---|---|
| DocRag1.pdf_7238610054648456645 | DocRag1.pdf | /app/backend/storage/documents/pdfs/DocRag1.pdf | d1f16f419abca2dd06df850c36a092c4 |
| DocRag1.pdf_-964937834312823387 | DocRag1.pdf | /app/backend/storage/documents/pdfs/DocRag1.pdf | 574a8772d9b48b4212d3b3eb6c429ff5 |
| DocRag1.pdf_5955879117343293623 | DocRag1.pdf | /app/backend/storage/documents/pdfs/DocRag1.pdf | b4f3690f59823a569b601f50a990ebd4 |
| DocRag1.pdf_-2158596238144081652 | DocRag1.pdf | /app/backend/storage/documents/pdfs/DocRag1.pdf | 7e95a22271864a378b8b6ccb62386cca |
| DocRag1.pdf_-3323305017708083430 | DocRag1.pdf | /app/backend/storage/documents/pdfs/DocRag1.pdf | 36dc1c963b88aa320cf641533b51ba87 |
| DocRag1.pdf_6558082491571746824 | DocRag1.pdf | /app/backend/storage/documents/pdfs/DocRag1.pdf | f1e1e9bdb7405a7b7114b42b40ed4df2 |
| DocRag1.pdf_-8462684001825556784 | DocRag1.pdf | /app/backend/storage/documents/pdfs/DocRag1.pdf | d202f6ae4a5d45060a51f2161a0acc59 |
| DocRag1.pdf_-6246837102768596985 | DocRag1.pdf | /app/backend/storage/documents/pdfs/DocRag1.pdf | a06bc0a673fbcfd792f327a16dd2dcf3 |
| DocRag1.pdf_8331579480830823057 | DocRag1.pdf | /app/backend/storage/documents/pdfs/DocRag1.pdf | ffc6538ff60ea096d41a006923f422bb |
