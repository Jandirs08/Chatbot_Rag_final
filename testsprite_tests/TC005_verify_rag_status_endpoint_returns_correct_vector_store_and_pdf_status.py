import requests

BASE_URL = "http://localhost:8080"
TIMEOUT = 30

def test_verify_rag_status_endpoint_returns_correct_vector_store_and_pdf_status():
    url = f"{BASE_URL}/api/v1/rag/rag-status"
    headers = {
        "Accept": "application/json"
    }
    try:
        response = requests.get(url, headers=headers, timeout=TIMEOUT)
        assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
        data = response.json()

        # Validate required keys
        assert "pdfs" in data, "'pdfs' key missing in response"
        assert "vector_store" in data, "'vector_store' key missing in response"
        assert "total_documents" in data, "'total_documents' key missing in response"

        # Validate the types
        assert isinstance(data["pdfs"], list), "'pdfs' should be a list"
        assert isinstance(data["vector_store"], dict), "'vector_store' should be a dict"
        assert isinstance(data["total_documents"], int), "'total_documents' should be an int"

        # Validate vector_store keys and types
        vector_store = data["vector_store"]
        for key, expected_type in [("path", str), ("exists", bool), ("size", int)]:
            assert key in vector_store, f"'{key}' key missing in 'vector_store'"
            assert isinstance(vector_store[key], expected_type), f"'{key}' in 'vector_store' should be {expected_type.__name__}"

        # Validate each pdf detail in pdfs list
        for pdf in data["pdfs"]:
            for field, expected_type in [
                ("filename", str),
                ("path", str),
                ("size", int),
                ("last_modified", str),
            ]:
                assert field in pdf, f"'{field}' missing in pdf item"
                # Basic type check
                assert isinstance(pdf[field], expected_type), f"'{field}' in pdf should be {expected_type.__name__}"
            # Optionally check last_modified format (ISO 8601); skipping parsing here

        # total_documents should be consistent with length of pdfs
        assert data["total_documents"] == len(data["pdfs"]), (
            f"total_documents ({data['total_documents']}) does not match number of pdfs ({len(data['pdfs'])})"
        )

    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

test_verify_rag_status_endpoint_returns_correct_vector_store_and_pdf_status()