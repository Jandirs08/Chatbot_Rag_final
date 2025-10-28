import requests
import os

BASE_URL = "http://localhost:8080"
UPLOAD_ENDPOINT = f"{BASE_URL}/api/v1/pdfs/upload"
DELETE_ENDPOINT_TEMPLATE = f"{BASE_URL}/api/v1/pdfs/{{filename}}"
LIST_ENDPOINT = f"{BASE_URL}/api/v1/pdfs/list"

TEST_PDF_CONTENT = b"%PDF-1.4\n%Test PDF\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n9\n%%EOF"

def verify_pdf_delete_endpoint_removes_specified_pdf():
    filename = None
    # Step 1: Upload a PDF file to get a filename to delete
    try:
        files = {"file": ("test_delete.pdf", TEST_PDF_CONTENT, "application/pdf")}
        resp_upload = requests.post(UPLOAD_ENDPOINT, files=files, timeout=30)
        assert resp_upload.status_code == 200, f"Upload failed with status {resp_upload.status_code}"
        upload_json = resp_upload.json()
        # Extract filename from file_path properly
        file_path = upload_json.get("file_path")
        assert file_path, "Upload response missing 'file_path'"
        # Extract the filename from file_path considering both '/' and '\' separators
        filename = file_path.replace('\\', '/').split('/')[-1].strip()
        assert filename, "Could not determine filename from upload response"

        # Step 2: Confirm the file is present in the list before deletion
        resp_list_before = requests.get(LIST_ENDPOINT, timeout=30)
        assert resp_list_before.status_code == 200
        list_json_before = resp_list_before.json()
        pdfs_before = [pdf["filename"].strip() for pdf in list_json_before.get("pdfs", []) if "filename" in pdf and isinstance(pdf["filename"], str)]
        assert filename in pdfs_before, f"Uploaded PDF '{filename}' not found in list before deletion"

        # Step 3: Delete the uploaded PDF
        delete_url = DELETE_ENDPOINT_TEMPLATE.format(filename=filename)
        resp_delete = requests.delete(delete_url, timeout=30)
        assert resp_delete.status_code == 200, f"Delete failed with status {resp_delete.status_code}"
        delete_json = resp_delete.json()
        msg = delete_json.get("message", "")
        assert msg, "Delete response missing 'message'"
        assert "deleted" in msg.lower() or "removed" in msg.lower(), f"Unexpected delete message: {msg}"

        # Step 4: Confirm the file is no longer in the list after deletion
        resp_list_after = requests.get(LIST_ENDPOINT, timeout=30)
        assert resp_list_after.status_code == 200
        list_json_after = resp_list_after.json()
        pdfs_after = [pdf["filename"].strip() for pdf in list_json_after.get("pdfs", []) if "filename" in pdf and isinstance(pdf["filename"], str)]
        assert filename not in pdfs_after, f"PDF '{filename}' still present in list after deletion"

    finally:
        # Cleanup: Attempt to delete the file in case it still exists to avoid test pollution
        if filename:
            try:
                delete_url = DELETE_ENDPOINT_TEMPLATE.format(filename=filename)
                requests.delete(delete_url, timeout=30)
            except Exception:
                pass

verify_pdf_delete_endpoint_removes_specified_pdf()
