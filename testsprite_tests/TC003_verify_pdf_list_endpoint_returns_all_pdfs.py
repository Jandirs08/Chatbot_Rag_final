import requests

BASE_URL = "http://localhost:8080"
TIMEOUT = 30

def test_verify_pdf_list_endpoint_returns_all_pdfs():
    list_url = f"{BASE_URL}/api/v1/pdfs/list"
    upload_url = f"{BASE_URL}/api/v1/pdfs/upload"
    delete_url_template = f"{BASE_URL}/api/v1/pdfs/{{filename}}"

    # Prepare a small PDF content for upload
    sample_pdf_content = b"%PDF-1.4\n%Test PDF content\n%%EOF\n"
    sample_pdf_filename = "test_for_list_endpoint.pdf"

    headers = {}

    # Upload a PDF to ensure there is at least one PDF in the list
    files = {
        'file': (sample_pdf_filename, sample_pdf_content, 'application/pdf')
    }

    uploaded_filename = None
    try:
        upload_resp = requests.post(upload_url, files=files, headers=headers, timeout=TIMEOUT)
        assert upload_resp.status_code == 200, f"PDF upload failed with status {upload_resp.status_code}"
        upload_json = upload_resp.json()
        assert "message" in upload_json
        assert "file_path" in upload_json
        assert "pdfs_in_directory" in upload_json
        # Extract the uploaded filename from response - usually from last part of file_path or from pdfs_in_directory
        # We assume uploaded filename is the sample_pdf_filename as sent
        uploaded_filename = sample_pdf_filename

        # Now call list endpoint
        list_resp = requests.get(list_url, headers=headers, timeout=TIMEOUT)
        assert list_resp.status_code == 200, f"PDF list endpoint failed with status {list_resp.status_code}"

        list_json = list_resp.json()
        assert "pdfs" in list_json
        pdfs = list_json["pdfs"]
        assert isinstance(pdfs, list)

        # There should be at least one PDF (the one we uploaded)
        assert any(pdf.get("filename") == uploaded_filename for pdf in pdfs), "Uploaded PDF not found in list"

        # Validate the metadata for each pdf item according to schema
        for pdf in pdfs:
            assert isinstance(pdf, dict)
            for field in ["filename", "path", "size", "last_modified"]:
                assert field in pdf, f"Field '{field}' missing in pdf item"
            assert isinstance(pdf["filename"], str)
            assert isinstance(pdf["path"], str)
            assert isinstance(pdf["size"], int)
            # last_modified should be a string in ISO 8601 format; basic check
            assert isinstance(pdf["last_modified"], str)
            assert len(pdf["last_modified"]) > 0

    finally:
        # Clean up: delete the uploaded PDF if it was uploaded
        if uploaded_filename:
            delete_url = delete_url_template.format(filename=uploaded_filename)
            try:
                del_resp = requests.delete(delete_url, headers=headers, timeout=TIMEOUT)
                # Accept 200 as success, nothing else to assert here
            except Exception:
                pass

test_verify_pdf_list_endpoint_returns_all_pdfs()
