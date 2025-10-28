import requests
import json

BASE_URL = "http://localhost:8080"
HEADERS = {"Content-Type": "application/json"}
TIMEOUT = 30


def test_verify_chat_stream_log_endpoint_streams_responses_and_handles_invalid_input():
    url = f"{BASE_URL}/api/v1/chat/stream_log"

    # Valid input test - input with required 'input' field
    valid_payload = {
        "input": "Hello, how do you work?"
    }
    try:
        with requests.post(url, json=valid_payload, headers=HEADERS, timeout=TIMEOUT, stream=True) as response:
            assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"

            # The endpoint streams response so we should get content incrementally
            streamed_data = ""
            for line in response.iter_lines(decode_unicode=True):
                if line:
                    try:
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                break
                            data_json = json.loads(data_str)
                            if "streamed_output" in data_json:
                                streamed_data += data_json["streamed_output"]
                            # else: skip silently
                    except json.JSONDecodeError:
                        pass
            assert len(streamed_data) > 0, "Streamed output is empty"
    except requests.RequestException as e:
        assert False, f"Valid input request failed: {e}"

    # Invalid input test - missing required 'input' field
    invalid_payload = {
        "conversation_id": "abc123"
    }
    try:
        response = requests.post(url, json=invalid_payload, headers=HEADERS, timeout=TIMEOUT)
        assert response.status_code == 422, f"Expected 422 for invalid input, got {response.status_code}"
        try:
            resp_json = response.json()
            assert "detail" in resp_json or len(resp_json) > 0
        except json.JSONDecodeError:
            pass
    except requests.RequestException as e:
        assert False, f"Invalid input request failed: {e}"


test_verify_chat_stream_log_endpoint_streams_responses_and_handles_invalid_input()
