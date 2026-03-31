import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { Loader2, Lock, Activity, CheckCircle2, ArrowLeft } from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";

function formatApiError(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).filter(Boolean).join(" ");
  return String(detail);
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!token) {
      setError("Invalid or missing reset token");
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/auth/reset-password`, { token, new_password: password });
      setSuccess(true);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] auth-bg flex items-center justify-center px-6" data-testid="reset-password-page">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Activity className="w-5 h-5 text-blue-400" />
          <span className="text-xl font-bold tracking-tight text-[#F8FAFC]">WorkflowAI</span>
        </div>

        <div className="bg-[#1E293B] rounded-lg p-6 border border-[#334155]">
          {success ? (
            <div className="text-center animate-fadeIn" data-testid="reset-success">
              <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <h2 className="text-lg font-semibold text-[#F8FAFC] mb-2 tracking-tight">Password Reset</h2>
              <p className="text-[#94A3B8] text-sm mb-6">Your password has been reset successfully.</p>
              <Link to="/login" className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors">
                Sign In
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-[#F8FAFC] mb-1 tracking-tight">Set new password</h2>
              <p className="text-[#94A3B8] text-sm mb-5">Enter your new password below.</p>

              {error && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-md text-rose-400 text-sm" data-testid="reset-error">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#94A3B8] mb-1.5 uppercase tracking-wide">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                    <input
                      data-testid="reset-password-input"
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full bg-[#020617] border border-[#334155] rounded-md pl-10 pr-4 py-2.5 text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
                      placeholder="Min 6 characters"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#94A3B8] mb-1.5 uppercase tracking-wide">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                    <input
                      data-testid="reset-confirm-input"
                      type="password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      className="w-full bg-[#020617] border border-[#334155] rounded-md pl-10 pr-4 py-2.5 text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
                      placeholder="Confirm password"
                      required
                    />
                  </div>
                </div>

                <button
                  data-testid="reset-submit-button"
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 text-white font-medium rounded-md transition-colors duration-200 flex items-center justify-center gap-2 text-sm"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? "Resetting..." : "Reset Password"}
                </button>
              </form>

              <div className="mt-4 text-center">
                <Link to="/login" className="text-xs text-[#94A3B8] hover:text-[#F8FAFC] inline-flex items-center gap-1 transition-colors">
                  <ArrowLeft className="w-3 h-3" /> Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
