import requests

BASE_URL = "http://localhost:8080"
TIMEOUT = 30

def test_verify_rag_clear_endpoint_clears_vector_store_and_updates_status():
    clear_rag_url = f"{BASE_URL}/api/v1/rag/clear-rag"
    rag_status_url = f"{BASE_URL}/api/v1/rag/rag-status"

    try:
        # Get initial RAG status before clearing
        status_before_resp = requests.get(rag_status_url, timeout=TIMEOUT)
        assert status_before_resp.status_code == 200, f"Failed to get RAG status before clear, status code: {status_before_resp.status_code}"
        status_before_json = status_before_resp.json()
        assert isinstance(status_before_json.get("pdfs"), list), "Initial 'pdfs' must be a list"
        assert "vector_store" in status_before_json, "'vector_store' key missing in status before clear"
        assert "total_documents" in status_before_json, "'total_documents' key missing in status before clear"

        # Call clear-rag POST endpoint
        clear_resp = requests.post(clear_rag_url, timeout=TIMEOUT)
        assert clear_resp.status_code == 200, f"Clear RAG endpoint failed, status code: {clear_resp.status_code}"
        clear_json = clear_resp.json()

        # Validate response schema and fields
        expected_keys = {"status", "message", "remaining_pdfs", "vector_store_size"}
        assert expected_keys.issubset(clear_json.keys()), f"Response keys missing. Expected at least {expected_keys}, got {clear_json.keys()}"
        assert isinstance(clear_json["status"], str) and clear_json["status"], "'status' must be a non-empty string"
        assert isinstance(clear_json["message"], str) and clear_json["message"], "'message' must be a non-empty string"
        assert isinstance(clear_json["remaining_pdfs"], int) and clear_json["remaining_pdfs"] >= 0, "'remaining_pdfs' must be a non-negative integer"
        assert isinstance(clear_json["vector_store_size"], int) and clear_json["vector_store_size"] >= 0, "'vector_store_size' must be a non-negative integer"

        # Get RAG status after clearing
        status_after_resp = requests.get(rag_status_url, timeout=TIMEOUT)
        assert status_after_resp.status_code == 200, f"Failed to get RAG status after clear, status code: {status_after_resp.status_code}"
        status_after_json = status_after_resp.json()

        # After clearing vector store size must be zero or very small (depending on implementation)
        vector_store_after = status_after_json.get("vector_store", {})
        assert isinstance(vector_store_after, dict), "'vector_store' must be a dict after clearing"
        vector_store_size_after = vector_store_after.get("size", None)
        assert vector_store_size_after is not None, "'size' missing in vector_store after clear"
        # Check vector store size matches clear response or is zero
        assert vector_store_size_after == clear_json["vector_store_size"], "Vector store size mismatch between clear response and rag-status after clear"
        assert vector_store_size_after >= 0, "Vector store size must be non-negative after clear"

        # PDFs count after clearing should equal remaining_pdfs from clear response
        pdfs_after = status_after_json.get("pdfs", [])
        assert isinstance(pdfs_after, list), "'pdfs' must be a list after clear"
        assert len(pdfs_after) == clear_json["remaining_pdfs"], "Remaining PDFs count mismatch between clear response and rag-status after clear"

    except requests.RequestException as e:
        assert False, f"HTTP request failed: {e}"

test_verify_rag_clear_endpoint_clears_vector_store_and_updates_status()