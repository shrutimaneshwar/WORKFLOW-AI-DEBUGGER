from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import bcrypt
import jwt
import secrets
import json
import uuid
import asyncio
import resend
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from emergentintegrations.llm.chat import LlmChat, UserMessage

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ─── Auth Helpers ───

JWT_ALGORITHM = "HS256"

def get_jwt_secret():
    return os.environ["JWT_SECRET"]

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=900, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ─── Brute Force Protection ───

async def check_brute_force(ip: str, email: str):
    identifier = f"{ip}:{email}"
    record = await db.login_attempts.find_one({"identifier": identifier})
    if record and record.get("attempts", 0) >= 5:
        locked_until = record.get("locked_until")
        if locked_until and datetime.now(timezone.utc) < locked_until:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})

async def record_failed_attempt(ip: str, email: str):
    identifier = f"{ip}:{email}"
    record = await db.login_attempts.find_one({"identifier": identifier})
    if record:
        attempts = record.get("attempts", 0) + 1
        update = {"$set": {"attempts": attempts, "last_attempt": datetime.now(timezone.utc)}}
        if attempts >= 5:
            update["$set"]["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=15)
        await db.login_attempts.update_one({"identifier": identifier}, update)
    else:
        await db.login_attempts.insert_one({"identifier": identifier, "attempts": 1, "last_attempt": datetime.now(timezone.utc)})

async def clear_failed_attempts(ip: str, email: str):
    await db.login_attempts.delete_one({"identifier": f"{ip}:{email}"})

# ─── Models ───

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

AI_MODELS = {
    "claude": {"provider": "anthropic", "model": "claude-sonnet-4-5-20250929", "label": "Claude Sonnet 4.5"},
    "gpt": {"provider": "openai", "model": "gpt-5.2", "label": "GPT-5.2"},
    "gemini": {"provider": "gemini", "model": "gemini-3-flash-preview", "label": "Gemini 3 Flash"},
}

class WorkflowAnalysisRequest(BaseModel):
    workflow_description: str
    model: str = "claude"

class WorkflowAnalysisResponse(BaseModel):
    id: Optional[str] = None
    issues_risks: List[str]
    optimization_suggestions: List[str]
    cost_efficiency_insights: List[str]
    improved_workflow: List[str]
    complexity_analysis: str
    advanced_suggestions: List[str]
    workflow_description: Optional[str] = None
    created_at: Optional[str] = None
    share_token: Optional[str] = None

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

# ─── Auth Routes ───

@api_router.post("/auth/register")
async def register(request: RegisterRequest, response: Response):
    email = request.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "email": email,
        "name": request.name.strip(),
        "password_hash": hash_password(request.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token)
    return {"_id": user_id, "email": email, "name": request.name.strip(), "role": "user"}

@api_router.post("/auth/login")
async def login(request: LoginRequest, response: Response, req: Request):
    email = request.email.lower().strip()
    ip = req.headers.get("X-Forwarded-For", "").split(",")[0].strip() or (req.client.host if req.client else "unknown")
    await check_brute_force(ip, email)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(request.password, user["password_hash"]):
        await record_failed_attempt(ip, email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await clear_failed_attempts(ip, email)
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    set_auth_cookies(response, access_token, refresh_token)
    return {"_id": user_id, "email": email, "name": user.get("name", ""), "role": user.get("role", "user")}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return user

@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access_token = create_access_token(str(user["_id"]), user["email"])
        set_auth_cookies(response, access_token, token)
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@api_router.post("/auth/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    email = request.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        return {"message": "If that email exists, a reset link has been sent."}
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({
        "token": token,
        "user_id": str(user["_id"]),
        "email": email,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=1),
        "used": False
    })
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    logger.info(f"Password reset link: {frontend_url}/reset-password?token={token}")
    return {"message": "If that email exists, a reset link has been sent."}

@api_router.post("/auth/reset-password")
async def reset_password(request: ResetPasswordRequest):
    record = await db.password_reset_tokens.find_one({"token": request.token, "used": False})
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    if datetime.now(timezone.utc) > record["expires_at"]:
        raise HTTPException(status_code=400, detail="Reset token has expired")
    await db.users.update_one(
        {"_id": ObjectId(record["user_id"])},
        {"$set": {"password_hash": hash_password(request.new_password)}}
    )
    await db.password_reset_tokens.update_one({"token": request.token}, {"$set": {"used": True}})
    return {"message": "Password reset successfully"}

# ─── Health Check ───

@api_router.get("/")
async def root():
    return {"message": "WorkflowAI API is running"}

# ─── Workflow Analysis ───

@api_router.get("/models")
async def get_available_models():
    return [{"id": k, "label": v["label"]} for k, v in AI_MODELS.items()]

@api_router.post("/analyze-workflow")
async def analyze_workflow(request: WorkflowAnalysisRequest, user: dict = Depends(get_current_user)):
    try:
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="API key not configured")

        model_config = AI_MODELS.get(request.model, AI_MODELS["claude"])

        chat = LlmChat(
            api_key=api_key,
            session_id=f"workflow-analysis-{uuid.uuid4()}",
            system_message="""You are a senior AI systems engineer and automation expert specializing in workflow analysis.
Your task is to analyze workflows and provide deep, actionable insights.

You MUST respond in the following JSON format:
{
  "issues_risks": ["issue 1", "issue 2", ...],
  "optimization_suggestions": ["suggestion 1", "suggestion 2", ...],
  "cost_efficiency_insights": ["insight 1", "insight 2", ...],
  "improved_workflow": ["step 1", "step 2", ...],
  "complexity_analysis": "Brief complexity assessment",
  "advanced_suggestions": ["advanced tip 1", "advanced tip 2", ...]
}

Be technical, specific, and practical. Avoid generic advice."""
        ).with_model(model_config["provider"], model_config["model"])

        user_message = UserMessage(
            text=f"""Analyze this workflow and provide comprehensive insights:

WORKFLOW:
{request.workflow_description}

Provide your analysis in the exact JSON format specified. Focus on:
1. Issues/Risks: Identify logical errors, missing steps, failure points, edge cases
2. Optimization Suggestions: How to reduce steps, improve speed, increase efficiency
3. Cost & Efficiency Insights: Unnecessary API calls, delays, better alternatives
4. Improved Workflow: Rewrite in cleaner, optimized step-by-step format
5. Complexity Analysis: Brief assessment of workflow complexity
6. Advanced Suggestions: Advanced engineering practices, monitoring, scaling

Return ONLY valid JSON, no additional text."""
        )

        response_text = await chat.send_message(user_message)

        response_clean = response_text.strip()
        if response_clean.startswith("```json"):
            response_clean = response_clean[7:]
        if response_clean.startswith("```"):
            response_clean = response_clean[3:]
        if response_clean.endswith("```"):
            response_clean = response_clean[:-3]
        response_clean = response_clean.strip()

        analysis_data = json.loads(response_clean)

        # Save to history
        share_token = secrets.token_urlsafe(16)
        history_doc = {
            "user_id": user["_id"],
            "workflow_description": request.workflow_description,
            "model_used": model_config["label"],
            "issues_risks": analysis_data.get("issues_risks", []),
            "optimization_suggestions": analysis_data.get("optimization_suggestions", []),
            "cost_efficiency_insights": analysis_data.get("cost_efficiency_insights", []),
            "improved_workflow": analysis_data.get("improved_workflow", []),
            "complexity_analysis": analysis_data.get("complexity_analysis", ""),
            "advanced_suggestions": analysis_data.get("advanced_suggestions", []),
            "share_token": share_token,
            "is_public": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        result = await db.workflow_history.insert_one(history_doc)

        return {
            "id": str(result.inserted_id),
            "issues_risks": analysis_data.get("issues_risks", []),
            "optimization_suggestions": analysis_data.get("optimization_suggestions", []),
            "cost_efficiency_insights": analysis_data.get("cost_efficiency_insights", []),
            "improved_workflow": analysis_data.get("improved_workflow", []),
            "complexity_analysis": analysis_data.get("complexity_analysis", ""),
            "advanced_suggestions": analysis_data.get("advanced_suggestions", []),
            "workflow_description": request.workflow_description,
            "model_used": model_config["label"],
            "created_at": history_doc["created_at"],
            "share_token": share_token
        }

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Workflow analysis error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

# ─── Workflow History ───

@api_router.get("/workflow-history")
async def get_workflow_history(user: dict = Depends(get_current_user)):
    histories = await db.workflow_history.find(
        {"user_id": user["_id"]},
        {"_id": 1, "workflow_description": 1, "complexity_analysis": 1, "created_at": 1, "share_token": 1, "is_public": 1, "model_used": 1}
    ).sort("created_at", -1).limit(100).to_list(100)
    for h in histories:
        h["id"] = str(h.pop("_id"))
    return histories

@api_router.get("/workflow-history/{analysis_id}")
async def get_workflow_detail(analysis_id: str, user: dict = Depends(get_current_user)):
    try:
        doc = await db.workflow_history.find_one({"_id": ObjectId(analysis_id), "user_id": user["_id"]})
    except Exception:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")
    doc["id"] = str(doc.pop("_id"))
    return doc

@api_router.post("/workflow-history/{analysis_id}/toggle-public")
async def toggle_public(analysis_id: str, user: dict = Depends(get_current_user)):
    try:
        doc = await db.workflow_history.find_one({"_id": ObjectId(analysis_id), "user_id": user["_id"]})
    except Exception:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")
    new_state = not doc.get("is_public", False)
    await db.workflow_history.update_one({"_id": ObjectId(analysis_id)}, {"$set": {"is_public": new_state}})
    return {"is_public": new_state, "share_token": doc.get("share_token")}

@api_router.delete("/workflow-history/{analysis_id}")
async def delete_workflow(analysis_id: str, user: dict = Depends(get_current_user)):
    try:
        result = await db.workflow_history.delete_one({"_id": ObjectId(analysis_id), "user_id": user["_id"]})
    except Exception:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return {"message": "Deleted"}

# ─── Public Share ───

@api_router.get("/shared/{share_token}")
async def get_shared_analysis(share_token: str):
    doc = await db.workflow_history.find_one({"share_token": share_token, "is_public": True})
    if not doc:
        raise HTTPException(status_code=404, detail="Shared analysis not found or is private")
    doc["id"] = str(doc.pop("_id"))
    doc.pop("user_id", None)
    return doc

# ─── Email Report ───

class EmailReportRequest(BaseModel):
    analysis_id: str
    recipient_email: str

@api_router.post("/send-report")
async def send_email_report(request: EmailReportRequest, user: dict = Depends(get_current_user)):
    resend_key = os.environ.get("RESEND_API_KEY")
    if not resend_key:
        raise HTTPException(status_code=503, detail="Email service not configured. Add RESEND_API_KEY to enable.")

    resend.api_key = resend_key

    try:
        doc = await db.workflow_history.find_one({"_id": ObjectId(request.analysis_id), "user_id": user["_id"]})
    except Exception:
        raise HTTPException(status_code=404, detail="Analysis not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Build HTML email
    def render_list(items, color):
        return "".join(f'<li style="padding:4px 0;color:#94A3B8;font-size:14px;"><span style="color:{color};margin-right:6px;">&#8226;</span>{item}</li>' for item in items)

    def render_steps(items):
        return "".join(f'<div style="display:flex;gap:8px;padding:4px 0;"><span style="background:#065f46;color:#34d399;width:22px;height:22px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;">{i+1}</span><span style="color:#94A3B8;font-size:14px;">{step}</span></div>' for i, step in enumerate(items))

    html = f"""
    <div style="background:#0F172A;padding:32px;font-family:Arial,sans-serif;color:#F8FAFC;">
      <div style="max-width:600px;margin:0 auto;">
        <h1 style="font-size:20px;color:#3B82F6;margin-bottom:4px;">WorkflowAI Report</h1>
        <p style="color:#64748B;font-size:12px;margin-bottom:24px;">Generated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</p>

        <div style="background:#1E293B;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:16px;">
          <h3 style="color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Workflow</h3>
          <p style="color:#F8FAFC;font-size:14px;font-family:monospace;">{doc.get('workflow_description','')}</p>
        </div>

        <div style="background:#1E293B;border:1px solid #334155;border-left:3px solid #F43F5E;border-radius:8px;padding:16px;margin-bottom:12px;">
          <h3 style="color:#F43F5E;font-size:14px;margin-bottom:8px;">Issues & Risks</h3>
          <ul style="list-style:none;padding:0;margin:0;">{render_list(doc.get('issues_risks',[]), '#F43F5E')}</ul>
        </div>

        <div style="background:#1E293B;border:1px solid #334155;border-left:3px solid #3B82F6;border-radius:8px;padding:16px;margin-bottom:12px;">
          <h3 style="color:#3B82F6;font-size:14px;margin-bottom:8px;">Optimizations</h3>
          <ul style="list-style:none;padding:0;margin:0;">{render_list(doc.get('optimization_suggestions',[]), '#3B82F6')}</ul>
        </div>

        <div style="background:#1E293B;border:1px solid #334155;border-left:3px solid #F59E0B;border-radius:8px;padding:16px;margin-bottom:12px;">
          <h3 style="color:#F59E0B;font-size:14px;margin-bottom:8px;">Cost & Efficiency</h3>
          <ul style="list-style:none;padding:0;margin:0;">{render_list(doc.get('cost_efficiency_insights',[]), '#F59E0B')}</ul>
        </div>

        <div style="background:#1E293B;border:1px solid #334155;border-left:3px solid #10B981;border-radius:8px;padding:16px;margin-bottom:12px;">
          <h3 style="color:#10B981;font-size:14px;margin-bottom:8px;">Improved Workflow</h3>
          {render_steps(doc.get('improved_workflow',[]))}
        </div>

        <div style="background:#1E293B;border:1px solid #334155;border-left:3px solid #8B5CF6;border-radius:8px;padding:16px;margin-bottom:12px;">
          <h3 style="color:#8B5CF6;font-size:14px;margin-bottom:8px;">Complexity</h3>
          <p style="color:#C4B5FD;font-size:14px;">{doc.get('complexity_analysis','')}</p>
        </div>

        <div style="background:#1E293B;border:1px solid #334155;border-left:3px solid #06B6D4;border-radius:8px;padding:16px;margin-bottom:12px;">
          <h3 style="color:#06B6D4;font-size:14px;margin-bottom:8px;">Advanced Suggestions</h3>
          <ul style="list-style:none;padding:0;margin:0;">{render_list(doc.get('advanced_suggestions',[]), '#06B6D4')}</ul>
        </div>

        <p style="color:#64748B;font-size:11px;text-align:center;margin-top:24px;">Powered by WorkflowAI</p>
      </div>
    </div>
    """

    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    params = {
        "from": sender,
        "to": [request.recipient_email],
        "subject": f"WorkflowAI Analysis Report - {datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
        "html": html
    }

    try:
        email_result = await asyncio.to_thread(resend.Emails.send, params)
        return {"status": "success", "message": f"Report sent to {request.recipient_email}", "email_id": email_result.get("id")}
    except Exception as e:
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

# ─── App Setup ───

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.workflow_history.create_index("user_id")
    await db.workflow_history.create_index("share_token")
    await seed_admin()
    logger.info("WorkflowAI backend started")

async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@workflowai.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin user seeded: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info("Admin password updated")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
