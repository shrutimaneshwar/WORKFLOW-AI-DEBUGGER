"""
Test suite for WorkflowAI Quick Templates feature (Iteration 4)
Tests: API endpoints, models, auth, and basic functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealthAndModels:
    """Test health check and models endpoint"""
    
    def test_api_health(self):
        """Test /api/ returns API running message"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "running" in data["message"].lower()
        print(f"SUCCESS: API health check passed - {data['message']}")
    
    def test_models_endpoint(self):
        """Test /api/models returns 3 models"""
        response = requests.get(f"{BASE_URL}/api/models")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 3
        
        # Check model structure
        model_ids = [m["id"] for m in data]
        assert "claude" in model_ids
        assert "gpt" in model_ids
        assert "gemini" in model_ids
        
        # Check labels
        model_labels = {m["id"]: m["label"] for m in data}
        assert model_labels["claude"] == "Claude Sonnet 4.5"
        assert model_labels["gpt"] == "GPT-5.2"
        assert model_labels["gemini"] == "Gemini 3 Flash"
        print(f"SUCCESS: Models endpoint returned 3 models: {model_ids}")


class TestAuthentication:
    """Test authentication endpoints"""
    
    def test_login_success(self):
        """Test login with admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@workflowai.com",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert data["email"] == "admin@workflowai.com"
        assert "name" in data
        assert "role" in data
        assert data["role"] == "admin"
        print(f"SUCCESS: Login successful for {data['email']}")
    
    def test_login_invalid_credentials(self):
        """Test login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@workflowai.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
        print(f"SUCCESS: Invalid login rejected with 401")
    
    def test_auth_me_without_token(self):
        """Test /api/auth/me without authentication"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print(f"SUCCESS: /api/auth/me requires authentication")


class TestAuthenticatedEndpoints:
    """Test endpoints that require authentication"""
    
    @pytest.fixture(autouse=True)
    def setup_session(self):
        """Login and get session cookies"""
        self.session = requests.Session()
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin@workflowai.com",
            "password": "admin123"
        })
        if response.status_code != 200:
            pytest.skip("Login failed - skipping authenticated tests")
        yield
        # Logout after tests
        self.session.post(f"{BASE_URL}/api/auth/logout")
    
    def test_auth_me_with_token(self):
        """Test /api/auth/me with valid session"""
        response = self.session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "admin@workflowai.com"
        print(f"SUCCESS: /api/auth/me returned user data")
    
    def test_workflow_history_endpoint(self):
        """Test /api/workflow-history returns list"""
        response = self.session.get(f"{BASE_URL}/api/workflow-history")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"SUCCESS: /api/workflow-history returned {len(data)} items")
    
    def test_logout(self):
        """Test logout endpoint"""
        response = self.session.post(f"{BASE_URL}/api/auth/logout")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"SUCCESS: Logout successful")


class TestAnalyzeWorkflowEndpoint:
    """Test analyze-workflow endpoint (without actually running AI)"""
    
    def test_analyze_requires_auth(self):
        """Test /api/analyze-workflow requires authentication"""
        response = requests.post(f"{BASE_URL}/api/analyze-workflow", json={
            "workflow_description": "Test workflow",
            "model": "claude"
        })
        assert response.status_code == 401
        print(f"SUCCESS: /api/analyze-workflow requires authentication")


class TestCompareModelsEndpoint:
    """Test compare-models endpoint (without actually running AI)"""
    
    def test_compare_requires_auth(self):
        """Test /api/compare-models requires authentication"""
        response = requests.post(f"{BASE_URL}/api/compare-models", json={
            "workflow_description": "Test workflow"
        })
        assert response.status_code == 401
        print(f"SUCCESS: /api/compare-models requires authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
