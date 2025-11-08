import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.error
from urllib.parse import urljoin
import uuid


def _print(msg):
    print(msg, flush=True)


def build_url(base_url: str, path: str) -> str:
    if not base_url.endswith('/'):
        base_url += '/'
    path = path.lstrip('/')
    return urljoin(base_url, path)


def http_json_request(method: str, url: str, headers: dict = None, data: dict | None = None, timeout: int = 30):
    req_headers = headers.copy() if headers else {}
    body_bytes = None
    if data is not None:
        body_bytes = json.dumps(data).encode('utf-8')
        req_headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url=url, method=method, headers=req_headers, data=body_bytes)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            charset = resp.headers.get_content_charset() or 'utf-8'
            text = resp.read().decode(charset)
            return resp.status, json.loads(text)
    except urllib.error.HTTPError as e:
        try:
            charset = e.headers.get_content_charset() or 'utf-8'
            text = e.read().decode(charset)
            payload = json.loads(text)
        except Exception:
            payload = {'detail': e.reason}
        return e.code, payload
    except urllib.error.URLError as e:
        return 0, {'detail': str(e)}


def http_multipart_upload(url: str, token: str, file_path: str, field_name: str = 'file', timeout: int = 60):
    boundary = '----WebKitFormBoundary' + uuid.uuid4().hex
    filename = os.path.basename(file_path)
    with open(file_path, 'rb') as f:
        file_bytes = f.read()
    # Build multipart body
    lines = []
    lines.append(f"--{boundary}")
    lines.append(f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"')
    lines.append('Content-Type: application/pdf')
    lines.append('')
    body_start = ('\r\n'.join(lines)).encode('utf-8')
    body_end = f"\r\n--{boundary}--\r\n".encode('utf-8')
    body = body_start + file_bytes + body_end

    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': f'multipart/form-data; boundary={boundary}',
    }
    req = urllib.request.Request(url=url, method='POST', headers=headers, data=body)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            charset = resp.headers.get_content_charset() or 'utf-8'
            text = resp.read().decode(charset)
            return resp.status, json.loads(text)
    except urllib.error.HTTPError as e:
        try:
            charset = e.headers.get_content_charset() or 'utf-8'
            text = e.read().decode(charset)
            payload = json.loads(text)
        except Exception:
            payload = {'detail': e.reason}
        return e.code, payload
    except urllib.error.URLError as e:
        return 0, {'detail': str(e)}


def login(base_url: str, email: str, password: str) -> dict:
    url = build_url(base_url, '/api/v1/auth/login')
    status, resp = http_json_request('POST', url, data={'email': email, 'password': password})
    if status != 200:
        raise RuntimeError(f"Login falló ({status}): {resp}")
    return resp


def auth_me(base_url: str, token: str) -> dict:
    url = build_url(base_url, '/api/v1/auth/me')
    status, resp = http_json_request('GET', url, headers={'Authorization': f'Bearer {token}'})
    if status != 200:
        raise RuntimeError(f"/auth/me falló ({status}): {resp}")
    return resp


def rag_status(base_url: str, token: str) -> dict:
    url = build_url(base_url, '/api/v1/rag/rag-status')
    status, resp = http_json_request('GET', url, headers={'Authorization': f'Bearer {token}'})
    if status != 200:
        raise RuntimeError(f"/rag-status falló ({status}): {resp}")
    return resp


def clear_rag(base_url: str, token: str) -> dict:
    url = build_url(base_url, '/api/v1/rag/clear-rag')
    status, resp = http_json_request('POST', url, headers={'Authorization': f'Bearer {token}'}, data={})
    if status != 200:
        raise RuntimeError(f"/clear-rag falló ({status}): {resp}")
    return resp


def list_pdfs(base_url: str, token: str) -> list:
    url = build_url(base_url, '/api/v1/pdfs/list')
    status, resp = http_json_request('GET', url, headers={'Authorization': f'Bearer {token}'})
    if status != 200:
        raise RuntimeError(f"/pdfs/list falló ({status}): {resp}")
    return [p['filename'] for p in resp.get('pdfs', [])]


def delete_pdf(base_url: str, token: str, filename: str) -> dict:
    url = build_url(base_url, f'/api/v1/pdfs/{filename}')
    status, resp = http_json_request('DELETE', url, headers={'Authorization': f'Bearer {token}'})
    if status != 200:
        raise RuntimeError(f"DELETE /pdfs/{filename} falló ({status}): {resp}")
    return resp


def retrieve_debug(base_url: str, token: str, query: str, k: int = 4, filter_criteria: dict | None = None, include_context: bool = True) -> dict:
    url = build_url(base_url, '/api/v1/rag/retrieve-debug')
    payload = {
        'query': query,
        'k': k,
        'filter_criteria': filter_criteria or {},
        'include_context': include_context,
    }
    status, resp = http_json_request('POST', url, headers={'Authorization': f'Bearer {token}'}, data=payload)
    if status != 200:
        raise RuntimeError(f"/retrieve-debug falló ({status}): {resp}")
    return resp


def poll_until(condition_fn, timeout_sec: int = 30, interval_sec: float = 2.0):
    start = time.time()
    while time.time() - start < timeout_sec:
        if condition_fn():
            return True
        time.sleep(interval_sec)
    return False


def main():
    parser = argparse.ArgumentParser(description='Valida el flujo RAG: login, PDFs, clear y retrieve-debug.')
    parser.add_argument('--base-url', default=os.getenv('BASE_URL', 'http://localhost:8000'), help='Base URL del backend (por defecto http://localhost:8000)')
    parser.add_argument('--email', default=os.getenv('AUTH_EMAIL'), help='Email de usuario admin')
    parser.add_argument('--password', default=os.getenv('AUTH_PASSWORD'), help='Password de usuario')
    parser.add_argument('--query', default='Prueba de recuperación', help='Consulta para retrieve-debug')
    parser.add_argument('--pdf', default=None, help='Ruta a un PDF para subir y probar')
    parser.add_argument('--clear-first', action='store_true', help='Limpiar RAG al inicio')
    parser.add_argument('--timeout', type=int, default=45, help='Timeout de polling para indexación/borrado')
    args = parser.parse_args()

    if not args.email or not args.password:
        _print('ERROR: Debes proporcionar --email y --password (o variables de entorno AUTH_EMAIL/AUTH_PASSWORD).')
        sys.exit(2)

    base = args.base_url

    _print('Iniciando login...')
    tokens = login(base, args.email, args.password)
    access = tokens.get('access_token')
    refresh = tokens.get('refresh_token')
    if not access:
        _print('ERROR: No se obtuvo access_token del backend')
        sys.exit(1)
    _print('Login ok. Verificando rol admin...')
    me = auth_me(base, access)
    is_admin = me.get('is_admin')
    if is_admin is None:
        # Algunos backends pueden anidar el perfil bajo 'user'
        is_admin = (me.get('user', {}) or {}).get('is_admin')
    if not bool(is_admin):
        _print(f'ERROR: Usuario no es admin (is_admin={is_admin}). Estas rutas requieren admin.')
        sys.exit(1)

    if args.clear_first:
        _print('Limpiando RAG: vector store y PDFs...')
        clr = clear_rag(base, access)
        _print(f"Resultado clear-rag: status={clr.get('status')} remaining_pdfs={clr.get('remaining_pdfs')} vector_store_size={clr.get('vector_store_size')}")

    _print('Estado RAG inicial...')
    status = rag_status(base, access)
    _print(json.dumps(status, ensure_ascii=False, indent=2))

    uploaded_filename = None
    if args.pdf:
        pdf_path = os.path.abspath(args.pdf)
        if not os.path.isfile(pdf_path):
            _print(f'ERROR: PDF no existe: {pdf_path}')
            sys.exit(1)
        _print(f'Subiendo PDF: {pdf_path}')
        up_status, up_resp = http_multipart_upload(build_url(base, '/api/v1/pdfs/upload'), access, pdf_path)
        if up_status != 200:
            _print(f'ERROR al subir PDF ({up_status}): {up_resp}')
            sys.exit(1)
        _print(f"Upload ok: {up_resp.get('message')}\nArchivo en servidor: {up_resp.get('file_path')}")
        uploaded_filename = os.path.basename(pdf_path)

        _print('Esperando a que el PDF aparezca en /pdfs/list...')
        ok = poll_until(lambda: uploaded_filename in list_pdfs(base, access), timeout_sec=args.timeout)
        _print(f'Listo en /pdfs/list: {ok}')

        # Opcional: forzar reindexación síncrona para asegurar chunks
        try:
            _print('Forzando reindexación síncrona del PDF...')
            reindex_resp = http_json_request('POST', build_url(base, '/api/v1/rag/reindex-pdf'), headers={'Authorization': f'Bearer {access}'}, data={'filename': uploaded_filename, 'force_update': True})
            if reindex_resp[0] == 200:
                _print(f"Reindex ok: {reindex_resp[1].get('message')} chunks_added={reindex_resp[1].get('chunks_added')}")
            else:
                _print(f"Advertencia: reindex falló ({reindex_resp[0]}): {reindex_resp[1]}")
        except Exception as e:
            _print(f'Advertencia: excepción en reindex: {e}')

    # Prueba de retrieve con o sin PDFs
    _print('Ejecutando retrieve-debug sin filtro...')
    ret = retrieve_debug(base, access, args.query, k=4, filter_criteria=None, include_context=True)
    retrieved_count = len(ret.get('retrieved', []) or [])
    _print(f'Retrieved documentos: {retrieved_count}')
    if uploaded_filename:
        _print(f'Ejecutando retrieve-debug filtrado por source={uploaded_filename}...')
        ret_f = retrieve_debug(base, access, args.query, k=4, filter_criteria={'source': uploaded_filename}, include_context=True)
        _print(f"Filtrado resultados: {len(ret_f.get('retrieved', []) or [])}")

    # Borrado y verificación de “esquirlas”
    if uploaded_filename:
        _print(f'Eliminando PDF {uploaded_filename}...')
        del_resp = delete_pdf(base, access, uploaded_filename)
        _print(f"Delete ok: {del_resp.get('message')}")

        _print('Poll hasta que retrieve filtrado no devuelva resultados...')
        ok = poll_until(lambda: len(retrieve_debug(base, access, args.query, k=4, filter_criteria={'source': uploaded_filename}).get('retrieved', []) or []) == 0, timeout_sec=args.timeout)
        _print(f'Sin resultados tras delete (filtrado): {ok}')

        _print('Limpiando vector store para asegurar no quedan esquirlas...')
        clr2 = clear_rag(base, access)
        _print(f"Clear-rag post-delete: status={clr2.get('status')} remaining_pdfs={clr2.get('remaining_pdfs')} vector_store_size={clr2.get('vector_store_size')}")

        _print('Verificando retrieve general vacío...')
        ret2 = retrieve_debug(base, access, args.query, k=4)
        _print(f"Resultados tras clear-rag: {len(ret2.get('retrieved', []) or [])}")

    _print('Resumen:')
    try:
        final_status = rag_status(base, access)
    except Exception:
        final_status = {'error': 'No se pudo obtener rag-status final'}
    summary = {
        'base_url': base,
        'uploaded_pdf': uploaded_filename,
        'rag_status_final': final_status,
        'note': 'Si aún hay resultados tras borrar/clear, podrían ser caché o índices persistentes.'
    }
    _print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()