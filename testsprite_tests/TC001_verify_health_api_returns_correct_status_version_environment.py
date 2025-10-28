import requests

BASE_URL = "http://localhost:8080"
HEALTH_ENDPOINT = "/api/v1/health/health"
TIMEOUT = 30

def test_verify_health_api_returns_correct_status_version_environment():
    url = BASE_URL + HEALTH_ENDPOINT
    headers = {
        "Accept": "application/json"
    }
    try:
        response = requests.get(url, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to Health API failed: {e}"
    
    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"
    try:
        json_data = response.json()
    except ValueError:
        assert False, "Response is not a valid JSON"
    
    # Validate required fields presence and type
    for field in ["status", "version", "environment"]:
        assert field in json_data, f"Response JSON missing required field '{field}'"
        assert isinstance(json_data[field], str), f"Field '{field}' is not a string"
        assert json_data[field].strip() != "", f"Field '{field}' should not be empty"
        
test_verify_health_api_returns_correct_status_version_environment()