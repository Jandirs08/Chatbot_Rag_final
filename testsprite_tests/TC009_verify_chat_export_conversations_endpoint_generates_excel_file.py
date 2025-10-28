import requests
from requests.exceptions import RequestException

BASE_URL = "http://localhost:8080"
EXPORT_ENDPOINT = "/api/v1/chat/export-conversations"


def test_verify_chat_export_conversations_endpoint_generates_excel_file():
    url = BASE_URL + EXPORT_ENDPOINT
    headers = {
        "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json"
    }
    try:
        response = requests.get(url, headers=headers, timeout=30)
    except RequestException as e:
        assert False, f"Request to export conversations failed: {e}"

    # Check for success case: Excel file returned
    if response.status_code == 200:
        content_type = response.headers.get("Content-Type", "")
        # The content type for Excel might be one of the following:
        # application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
        # application/octet-stream (sometimes used)
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in content_type, (
            f"Expected Excel file content type, got {content_type}"
        )
        # Also check content is not empty
        assert response.content and len(response.content) > 0, "Excel file content is empty"
    elif response.status_code == 404:
        # No data available case
        # The response is described as 404 with no data
        # Possibly JSON error message is returned, try to parse
        try:
            data = response.json()
            # We expect some indication of no data; since no schema given, just ensure JSON parse works
            assert isinstance(data, dict), "404 response body is not a JSON object"
        except Exception:
            assert False, "404 response body is not valid JSON"
    else:
        # Unexpected status code
        assert False, f"Unexpected status code: {response.status_code}. Response text: {response.text}"


test_verify_chat_export_conversations_endpoint_generates_excel_file()