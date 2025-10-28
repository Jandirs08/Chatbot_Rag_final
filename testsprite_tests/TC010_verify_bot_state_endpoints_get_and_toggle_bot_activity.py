import requests

BASE_URL = "http://localhost:8080"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json"
}

def test_verify_bot_state_endpoints_get_and_toggle_bot_activity():
    # GET current bot state
    try:
        get_response = requests.get(f"{BASE_URL}/api/v1/bot/state", headers=HEADERS, timeout=TIMEOUT)
        get_response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"GET /api/v1/bot/state request failed: {e}"
    data_get = get_response.json()
    assert "is_active" in data_get and isinstance(data_get["is_active"], bool), "Response missing or invalid 'is_active'"
    assert "message" in data_get and isinstance(data_get["message"], str), "Response missing or invalid 'message'"

    original_state = data_get["is_active"]

    # POST toggle bot state
    try:
        post_response = requests.post(f"{BASE_URL}/api/v1/bot/toggle", headers=HEADERS, timeout=TIMEOUT)
        post_response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"POST /api/v1/bot/toggle request failed: {e}"
    data_post = post_response.json()
    assert "is_active" in data_post and isinstance(data_post["is_active"], bool), "Toggle response missing or invalid 'is_active'"
    assert "message" in data_post and isinstance(data_post["message"], str), "Toggle response missing or invalid 'message'"

    toggled_state = data_post["is_active"]
    assert toggled_state != original_state, "Bot state did not toggle"

    # GET bot state again to confirm toggle
    try:
        get_response_after_toggle = requests.get(f"{BASE_URL}/api/v1/bot/state", headers=HEADERS, timeout=TIMEOUT)
        get_response_after_toggle.raise_for_status()
    except requests.RequestException as e:
        assert False, f"GET /api/v1/bot/state after toggle request failed: {e}"
    data_get_after_toggle = get_response_after_toggle.json()
    assert "is_active" in data_get_after_toggle and isinstance(data_get_after_toggle["is_active"], bool), "Response missing or invalid 'is_active' after toggle"
    assert "message" in data_get_after_toggle and isinstance(data_get_after_toggle["message"], str), "Response missing or invalid 'message' after toggle"

    assert data_get_after_toggle["is_active"] == toggled_state, "Bot state after toggle GET does not match toggled state"

    # Toggle back to original state to maintain system consistency
    try:
        revert_toggle_response = requests.post(f"{BASE_URL}/api/v1/bot/toggle", headers=HEADERS, timeout=TIMEOUT)
        revert_toggle_response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"POST /api/v1/bot/toggle revert request failed: {e}"
    data_revert = revert_toggle_response.json()
    assert data_revert["is_active"] == original_state, "Bot state revert toggle failed"


test_verify_bot_state_endpoints_get_and_toggle_bot_activity()