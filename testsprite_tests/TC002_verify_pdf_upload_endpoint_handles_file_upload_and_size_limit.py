import requests
import io
import os

BASE_URL = "http://localhost:8080"
UPLOAD_ENDPOINT = "/api/v1/pdfs/upload"
LIST_ENDPOINT = "/api/v1/pdfs/list"
DELETE_ENDPOINT = "/api/v1/pdfs/{filename}"
RAG_STATUS_ENDPOINT = "/api/v1/rag/rag-status"

TIMEOUT = 30


def test_verify_pdf_upload_endpoint_handles_file_upload_and_size_limit():
    # Helper to delete pdf by filename
    def delete_pdf(filename):
        url = BASE_URL + DELETE_ENDPOINT.format(filename=filename)
        try:
            resp = requests.delete(url, timeout=TIMEOUT)
            resp.raise_for_status()
        except Exception:
            pass  # best effort delete to cleanup

    # Prepare a small valid PDF content (simple PDF header and minimal content)
    small_pdf_content = b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\nstartxref\n9\n%%EOF\n'
    small_pdf_filename = "test_upload_small.pdf"

    # Prepare a large PDF content to exceed size limits (assume >50MB to trigger 413)
    # We'll simulate a large file by repeating bytes - exact size depends on server limit,
    # but let's use 60MB as a common size limit example.
    large_pdf_content = b'%PDF-1.4\n' + (b'0' * (60 * 1024 * 1024)) + b'\n%%EOF\n'
    large_pdf_filename = "test_upload_large.pdf"

    # 1) Test successful upload of small PDF file
    files = {
        "file": (small_pdf_filename, io.BytesIO(small_pdf_content), "application/pdf")
    }
    uploaded_filename = None
    try:
        upload_url = BASE_URL + UPLOAD_ENDPOINT
        response = requests.post(upload_url, files=files, timeout=TIMEOUT)
        assert response.status_code == 200, f"Expected 200 OK on small file upload, got {response.status_code}"
        json_resp = response.json()
        # Validate response keys
        assert "message" in json_resp and isinstance(json_resp["message"], str), "Missing or invalid 'message' in upload response"
        assert "file_path" in json_resp and isinstance(json_resp["file_path"], str), "Missing or invalid 'file_path' in upload response"
        assert "pdfs_in_directory" in json_resp and isinstance(json_resp["pdfs_in_directory"], list), "Missing or invalid 'pdfs_in_directory' in upload response"
        # Determine uploaded file name from file_path
        uploaded_filepath = json_resp["file_path"]
        # Extract filename from file_path reliably
        uploaded_filename = os.path.basename(uploaded_filepath)
        assert uploaded_filename in json_resp["pdfs_in_directory"], "Uploaded filename not found in 'pdfs_in_directory'"
        # Validate that filename is the expected and matches uploaded small PDF
        assert uploaded_filename.endswith(".pdf"), "Uploaded filename does not end with .pdf"
        # Verify RAG ingestion registration by fetching RAG status and confirming the PDF presence
        rag_resp = requests.get(BASE_URL + RAG_STATUS_ENDPOINT, timeout=TIMEOUT)
        assert rag_resp.status_code == 200, f"RAG status call failed with status {rag_resp.status_code}"
        rag_json = rag_resp.json()
        pdf_names = [pdf["filename"] for pdf in rag_json.get("pdfs", [])]
        assert uploaded_filename in pdf_names, "Uploaded PDF not registered in RAG ingestion system"
    finally:
        if uploaded_filename:
            delete_pdf(uploaded_filename)

    # 2) Test error handling for large PDF file upload (expecting status 413)
    files = {
        "file": (large_pdf_filename, io.BytesIO(large_pdf_content), "application/pdf")
    }
    response = requests.post(BASE_URL + UPLOAD_ENDPOINT, files=files, timeout=TIMEOUT)
    # We accept 413 Payload Too Large per PRD; some servers may respond differently but 413 expected
    assert response.status_code == 413, f"Expected 413 Payload Too Large for large file, got {response.status_code}"


test_verify_pdf_upload_endpoint_handles_file_upload_and_size_limit()
