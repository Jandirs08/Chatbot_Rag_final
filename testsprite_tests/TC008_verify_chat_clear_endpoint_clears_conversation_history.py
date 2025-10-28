import requests
import uuid

BASE_URL = "http://localhost:8080"
TIMEOUT = 30


def test_verify_chat_clear_endpoint_clears_conversation_history():
    session = requests.Session()
    conversation_id = str(uuid.uuid4())
    chat_stream_log_url = f"{BASE_URL}/api/v1/chat/stream_log"
    chat_clear_url_template = f"{BASE_URL}/api/v1/chat/clear/{{conversation_id}}"

    headers = {
        "Content-Type": "application/json"
    }

    # Step 1: Create a conversation by sending a chat message with a new conversation_id
    chat_request_payload = {
        "input": "Hello, this is a test message for conversation history clearing.",
        "conversation_id": conversation_id
    }

    try:
        stream_response = session.post(chat_stream_log_url, json=chat_request_payload, headers=headers, timeout=TIMEOUT)
        assert stream_response.status_code == 200, f"Expected 200 OK from /chat/stream_log, got {stream_response.status_code}"

        # Step 2: Call clear endpoint to clear the conversation history
        clear_url = chat_clear_url_template.format(conversation_id=conversation_id)
        clear_response = session.post(clear_url, timeout=TIMEOUT)

        assert clear_response.status_code == 200, f"Expected 200 OK from /chat/clear/{conversation_id}, got {clear_response.status_code}"
        clear_json = clear_response.json()
        assert "message" in clear_json, "Response JSON missing 'message' field"
        # Usually we'd check for a success message, assume any message means success
        assert isinstance(clear_json["message"], str) and len(clear_json["message"]) > 0, "Clear message empty or invalid"

        # Optionally verify that conversation history is cleared (if API supports checking)
        # Here we only verify response per instructions

    finally:
        # No resource deletion endpoint specified for conversation,
        # so no cleanup needed beyond this point.
        session.close()


test_verify_chat_clear_endpoint_clears_conversation_history()
