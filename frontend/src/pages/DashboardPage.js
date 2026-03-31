import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  Loader2, AlertTriangle, Zap, DollarSign, Brain,
  BarChart3, Wrench, Clock, Share2, Globe, GlobeLock,
  Trash2, ChevronDown, ChevronUp, Activity, LogOut, Copy, Check,
  Download, Mail, Send, X, GitCompare, FileText, Sparkles
} from "lucide-react";

const API = process.env.REACT_APP_BACKEND_URL + "/api";
const FRONTEND_URL = window.location.origin;

const WORKFLOW_TEMPLATES = [
  {
    id: "cicd",
    label: "CI/CD Pipeline",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
    description: "Code push to production deployment",
    workflow: "Developer pushes code to GitHub -> CI triggers on push event -> Run unit tests -> Run integration tests -> Build Docker image -> Push to container registry -> Deploy to staging environment -> Run smoke tests on staging -> Manual approval gate -> Deploy to production -> Run health checks -> Notify team via Slack"
  },
  {
    id: "etl",
    label: "Data ETL",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    description: "Extract, transform & load data pipeline",
    workflow: "Schedule daily cron job at 2 AM UTC -> Extract data from PostgreSQL source tables -> Extract data from third-party REST API -> Validate raw data schema -> Transform: clean null values and normalize formats -> Transform: join datasets on customer_id -> Transform: aggregate metrics by region -> Load transformed data into data warehouse -> Update materialized views -> Generate data quality report -> Send report email to data team"
  },
  {
    id: "api-gateway",
    label: "API Gateway",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
    description: "Request routing with auth & rate limiting",
    workflow: "Client sends HTTP request -> API Gateway receives request -> Check rate limit (100 req/min per IP) -> Validate JWT access token -> Extract user permissions from token claims -> Route to appropriate microservice based on path -> Microservice processes request -> Cache response in Redis (TTL 5min) -> Transform response format -> Return response with CORS headers -> Log request metrics to monitoring"
  },
  {
    id: "ecommerce",
    label: "E-commerce Order",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20",
    description: "Order placement to fulfillment",
    workflow: "Customer clicks 'Place Order' -> Validate cart items and stock availability -> Calculate final price with discounts and tax -> Process payment via Stripe -> On payment success: create order record in database -> Reserve inventory -> Send order confirmation email to customer -> Notify warehouse system for fulfillment -> Generate shipping label -> Update order status to 'Processing' -> Track shipment status -> On delivery: send delivery confirmation"
  },
  {
    id: "ml-pipeline",
    label: "ML Pipeline",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20",
    description: "Training to model deployment flow",
    workflow: "Fetch training data from data lake -> Split into train/validation/test sets (70/15/15) -> Feature engineering: normalize, encode categoricals -> Train model using XGBoost -> Evaluate on validation set -> If accuracy > 0.85: proceed, else tune hyperparameters -> Run evaluation on test set -> Compare with current production model -> If improvement > 2%: approve for deployment -> Package model as Docker container -> Deploy to model serving endpoint -> A/B test with 10% traffic -> Monitor prediction drift and latency"
  },
  {
    id: "microservices",
    label: "Microservices",
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
    description: "Inter-service communication pattern",
    workflow: "User service receives signup request -> Validate input and create user record -> Publish 'user.created' event to message queue -> Notification service consumes event -> Send welcome email and push notification -> Analytics service consumes event -> Update user metrics dashboard -> Billing service consumes event -> Create trial subscription -> API Gateway updates route cache -> User service returns success response to client -> Health check monitors all services"
  },
];

function OutputCard({ title, icon: Icon, iconColor, items, staggerClass }) {
  return (
    <div className={`bg-[#1E293B] rounded-lg p-5 border border-[#334155] card-hover animate-slideUp ${staggerClass}`}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${iconColor.replace('text-', 'bg-').replace('400', '500/10')} border ${iconColor.replace('text-', 'border-').replace('400', '500/20')}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <h3 className="text-sm font-semibold text-[#F8FAFC] tracking-tight">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 items-start text-sm">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${iconColor.replace('text-', 'bg-')}`} />
            <span className="text-[#94A3B8] flex-1 leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HistoryItem({ item, onSelect, onDelete, onTogglePublic }) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(`${FRONTEND_URL}/shared/${item.share_token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#020617] rounded-md border border-[#334155] p-3 card-hover" data-testid={`history-item-${item.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onSelect(item.id)}>
          <p className="text-[#F8FAFC] text-sm font-medium truncate">{item.workflow_description}</p>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-xs text-[#64748B] flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(item.created_at).toLocaleDateString()}
            </span>
            {item.model_used && (
              <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                {item.model_used}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={() => onTogglePublic(item.id)} className="p-1.5 rounded-md hover:bg-[#334155] transition-colors" title={item.is_public ? "Make private" : "Make public"} data-testid={`toggle-public-${item.id}`}>
            {item.is_public ? <Globe className="w-3.5 h-3.5 text-emerald-400" /> : <GlobeLock className="w-3.5 h-3.5 text-[#64748B]" />}
          </button>
          {item.is_public && item.share_token && (
            <button onClick={copyLink} className="p-1.5 rounded-md hover:bg-[#334155] transition-colors" title="Copy share link" data-testid={`copy-share-${item.id}`}>
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-blue-400" />}
            </button>
          )}
          <button onClick={() => onDelete(item.id)} className="p-1.5 rounded-md hover:bg-rose-500/10 transition-colors" title="Delete" data-testid={`delete-history-${item.id}`}>
            <Trash2 className="w-3.5 h-3.5 text-[#64748B] hover:text-rose-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [workflowInput, setWorkflowInput] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedModel, setSelectedModel] = useState("claude");
  const [models, setModels] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const resultsRef = useRef(null);

  useEffect(() => {
    axios.get(`${API}/models`).then(res => setModels(res.data)).catch(() => {});
  }, []);

  const fetchHistory = async () => {
    try {
      const { data } = await axios.get(`${API}/workflow-history`, { withCredentials: true });
      setHistory(data);
      setHistoryLoaded(true);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  const toggleHistory = () => {
    if (!historyLoaded) fetchHistory();
    setShowHistory(s => !s);
  };

  const handleAnalyze = async () => {
    if (!workflowInput.trim()) {
      setError("Please enter a workflow description");
      return;
    }
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setShowTemplates(false);
    try {
      const { data } = await axios.post(`${API}/analyze-workflow`, {
        workflow_description: workflowInput,
        model: selectedModel
      }, { withCredentials: true });
      setAnalysis(data);
      if (historyLoaded) fetchHistory();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to analyze workflow. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = async () => {
    if (!resultsRef.current) return;
    setExporting(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const element = resultsRef.current;
      await html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: `workflow-analysis-${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, backgroundColor: "#0F172A", useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      }).from(element).save();
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setExporting(false);
    }
  };

  const sendEmailReport = async () => {
    if (!emailTo.trim() || !analysis?.id) return;
    setSendingEmail(true);
    setEmailStatus(null);
    try {
      await axios.post(`${API}/send-report`, {
        analysis_id: analysis.id,
        recipient_email: emailTo.trim()
      }, { withCredentials: true });
      setEmailStatus("success");
      setTimeout(() => { setShowEmailModal(false); setEmailStatus(null); setEmailTo(""); }, 2000);
    } catch (err) {
      setEmailStatus(err.response?.data?.detail || "Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  const loadHistoryDetail = async (id) => {
    try {
      const { data } = await axios.get(`${API}/workflow-history/${id}`, { withCredentials: true });
      setAnalysis(data);
      setWorkflowInput(data.workflow_description || "");
    } catch (err) {
      console.error("Failed to load analysis:", err);
    }
  };

  const deleteHistory = async (id) => {
    try {
      await axios.delete(`${API}/workflow-history/${id}`, { withCredentials: true });
      setHistory(h => h.filter(x => x.id !== id));
    } catch (err) {
      console.error("Failed to delete:", err);
    }
  };

  const togglePublic = async (id) => {
    try {
      const { data } = await axios.post(`${API}/workflow-history/${id}/toggle-public`, {}, { withCredentials: true });
      setHistory(h => h.map(x => x.id === id ? { ...x, is_public: data.is_public, share_token: data.share_token } : x));
    } catch (err) {
      console.error("Failed to toggle:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A]" data-testid="dashboard-page">
      {/* Header */}
      <header className="border-b border-[#334155] bg-[#0F172A] sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/20 rounded-md flex items-center justify-center">
              <Activity className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-[#F8FAFC]">WorkflowAI</h1>
              <p className="text-[10px] text-[#64748B] uppercase tracking-widest">Debugger & Optimizer</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/compare"
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 px-3 py-1.5 rounded-md transition-colors"
              data-testid="compare-models-link"
            >
              <GitCompare className="w-3 h-3" />
              <span className="hidden sm:inline">Compare Models</span>
            </Link>
            <span className="text-xs text-[#94A3B8] hidden sm:block" data-testid="user-display-name">
              {user?.name || user?.email}
            </span>
            <button
              data-testid="logout-button"
              onClick={logout}
              className="flex items-center gap-1.5 text-xs text-[#94A3B8] hover:text-[#F8FAFC] bg-[#1E293B] hover:bg-[#334155] border border-[#334155] px-3 py-1.5 rounded-md transition-colors"
            >
              <LogOut className="w-3 h-3" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Input Section */}
        <div className="bg-[#1E293B] rounded-lg p-6 mb-6 border border-[#334155]">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-base font-semibold text-[#F8FAFC] tracking-tight">Workflow Input</h2>
            <div className="flex items-center gap-2">
              {/* Model Selector */}
              <select
                data-testid="model-selector"
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="bg-[#020617] border border-[#334155] text-[#94A3B8] text-xs rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 cursor-pointer"
              >
                {models.length > 0 ? models.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                )) : (
                  <>
                    <option value="claude">Claude Sonnet 4.5</option>
                    <option value="gpt">GPT-5.2</option>
                    <option value="gemini">Gemini 3 Flash</option>
                  </>
                )}
              </select>

              <button
                data-testid="toggle-history-button"
                onClick={toggleHistory}
                className="flex items-center gap-1.5 text-xs text-[#94A3B8] hover:text-[#F8FAFC] bg-[#020617] border border-[#334155] px-3 py-1.5 rounded-md transition-colors"
              >
                <Clock className="w-3 h-3" />
                <span className="hidden sm:inline">History</span>
                {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>
          <textarea
            data-testid="workflow-input"
            value={workflowInput}
            onChange={e => setWorkflowInput(e.target.value)}
            placeholder="Describe your workflow... e.g., User submits form -> validate input -> save to DB -> send email -> update dashboard"
            className="w-full h-32 bg-[#020617] border border-[#334155] rounded-md px-4 py-3 text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 resize-none font-mono text-sm"
            disabled={loading}
          />

          {/* Quick Templates */}
          <div className="mt-3">
            <button
              data-testid="toggle-templates-button"
              onClick={() => setShowTemplates(s => !s)}
              className="flex items-center gap-1.5 text-xs text-[#94A3B8] hover:text-blue-400 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>Quick Templates</span>
              {showTemplates ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showTemplates && (
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 animate-fadeIn" data-testid="templates-grid">
                {WORKFLOW_TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    data-testid={`template-${t.id}`}
                    onClick={() => { setWorkflowInput(t.workflow); setShowTemplates(false); }}
                    className={`group text-left px-3 py-2.5 rounded-md border ${t.borderColor} ${t.bgColor} hover:brightness-125 transition-all duration-200`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <FileText className={`w-3 h-3 ${t.color}`} />
                      <span className={`text-xs font-medium ${t.color}`}>{t.label}</span>
                    </div>
                    <p className="text-[10px] text-[#64748B] leading-tight">{t.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-md text-rose-400 text-sm" data-testid="analysis-error">
              {error}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              data-testid="analyze-button"
              onClick={handleAnalyze}
              disabled={loading}
              className={`px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors duration-200 flex items-center gap-2 text-sm ${loading ? 'glow-pulse' : ''}`}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {loading ? "Analyzing..." : "Analyze Workflow"}
            </button>

            {analysis && (
              <>
              <button
                data-testid="export-pdf-button"
                onClick={exportPDF}
                disabled={exporting}
                className="px-4 py-2.5 bg-[#020617] hover:bg-[#334155] border border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC] font-medium rounded-md transition-colors duration-200 flex items-center gap-2 text-sm"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exporting ? "Exporting..." : "Export PDF"}
              </button>
              <button
                data-testid="email-report-button"
                onClick={() => setShowEmailModal(true)}
                className="px-4 py-2.5 bg-[#020617] hover:bg-[#334155] border border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC] font-medium rounded-md transition-colors duration-200 flex items-center gap-2 text-sm"
              >
                <Mail className="w-4 h-4" />
                Email Report
              </button>
              </>
            )}
          </div>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div className="bg-[#1E293B] rounded-lg p-5 mb-6 border border-[#334155] animate-fadeIn" data-testid="history-panel">
            <h3 className="text-sm font-semibold text-[#F8FAFC] mb-3 flex items-center gap-2 tracking-tight">
              <Clock className="w-4 h-4 text-[#64748B]" /> Previous Analyses
            </h3>
            {history.length === 0 ? (
              <p className="text-[#64748B] text-sm">No analyses yet. Run your first workflow analysis above.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {history.map(item => (
                  <HistoryItem key={item.id} item={item} onSelect={loadHistoryDetail} onDelete={deleteHistory} onTogglePublic={togglePublic} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Analysis Results - Control Room Grid */}
        {analysis && (
          <div ref={resultsRef} data-testid="analysis-results">
            <div className="flex items-center justify-between mb-4">
              {analysis.share_token && (
                <div className="flex items-center gap-2 text-xs text-[#64748B] animate-slideUp">
                  <Share2 className="w-3 h-3" />
                  ID: <code className="bg-[#020617] border border-[#334155] px-2 py-0.5 rounded text-[#94A3B8] font-mono">{analysis.share_token}</code>
                </div>
              )}
              {analysis.model_used && (
                <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full animate-slideUp">
                  {analysis.model_used}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <OutputCard title="Issues & Risks" icon={AlertTriangle} iconColor="text-rose-400" items={analysis.issues_risks || []} staggerClass="stagger-1" />
              <OutputCard title="Optimizations" icon={Zap} iconColor="text-blue-400" items={analysis.optimization_suggestions || []} staggerClass="stagger-2" />
              <OutputCard title="Cost & Efficiency" icon={DollarSign} iconColor="text-amber-400" items={analysis.cost_efficiency_insights || []} staggerClass="stagger-3" />

              {/* Improved Workflow - spans 2 cols */}
              <div className="md:col-span-2 lg:col-span-2 bg-[#1E293B] rounded-lg p-5 border border-[#334155] card-hover animate-slideUp stagger-4">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20">
                    <Brain className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#F8FAFC] tracking-tight">Improved Workflow</h3>
                </div>
                <div className="space-y-2.5">
                  {(analysis.improved_workflow || []).map((step, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span className="flex-shrink-0 w-6 h-6 bg-emerald-500/10 text-emerald-400 rounded-md flex items-center justify-center text-xs font-semibold border border-emerald-500/20">
                        {i + 1}
                      </span>
                      <p className="text-[#94A3B8] flex-1 text-sm leading-relaxed">{step}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Complexity */}
              <div className="bg-[#1E293B] rounded-lg p-5 border border-[#334155] card-hover animate-slideUp stagger-5">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-md flex items-center justify-center bg-violet-500/10 border border-violet-500/20">
                    <BarChart3 className="w-4 h-4 text-violet-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#F8FAFC] tracking-tight">Complexity</h3>
                </div>
                <div className="px-3 py-2 bg-violet-500/10 border border-violet-500/20 rounded-md text-violet-300 text-sm leading-relaxed">
                  {analysis.complexity_analysis}
                </div>
              </div>

              {/* Advanced - full width */}
              <div className="md:col-span-2 lg:col-span-3 animate-slideUp stagger-6">
                <OutputCard title="Advanced Engineering Suggestions" icon={Wrench} iconColor="text-cyan-400" items={analysis.advanced_suggestions || []} staggerClass="" />
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-[#334155] mt-16 py-5 text-center text-[#64748B] text-xs">
        WorkflowAI &mdash; Powered by AI + System Design Thinking
      </footer>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4" data-testid="email-modal">
          <div className="bg-[#1E293B] rounded-lg p-6 border border-[#334155] w-full max-w-sm animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#F8FAFC] tracking-tight flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-400" /> Send Report via Email
              </h3>
              <button onClick={() => { setShowEmailModal(false); setEmailStatus(null); }} className="p-1 rounded-md hover:bg-[#334155] transition-colors">
                <X className="w-4 h-4 text-[#64748B]" />
              </button>
            </div>

            {emailStatus === "success" ? (
              <div className="text-center py-4">
                <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-emerald-400 text-sm">Report sent successfully!</p>
              </div>
            ) : (
              <>
                {typeof emailStatus === "string" && emailStatus !== "success" && (
                  <div className="mb-3 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-md text-rose-400 text-xs">
                    {emailStatus}
                  </div>
                )}
                <div className="relative mb-4">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                  <input
                    data-testid="email-recipient-input"
                    type="email"
                    value={emailTo}
                    onChange={e => setEmailTo(e.target.value)}
                    className="w-full bg-[#020617] border border-[#334155] rounded-md pl-10 pr-4 py-2.5 text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
                    placeholder="recipient@example.com"
                  />
                </div>
                <button
                  data-testid="send-email-button"
                  onClick={sendEmailReport}
                  disabled={sendingEmail || !emailTo.trim()}
                  className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors duration-200 flex items-center justify-center gap-2 text-sm"
                >
                  {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sendingEmail ? "Sending..." : "Send Report"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
