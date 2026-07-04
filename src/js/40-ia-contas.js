/* ================= IA: contas/provedores ================= */
const PROVS = () => (DB.settings && DB.settings.providers) || [];
const getProv = id => PROVS().find(p=>p.id===id);
const provLabel = id => { const p=getProv(id); return p ? p.name : "conta removida"; };
const shortModel = m => (m||"").replace(/^claude-/,"").replace(/-\d{8}$/,"");

const PROV_PRESETS = {
  // grátis de verdade
  groq: { name:"Groq", kind:"openai", base:"https://api.groq.com/openai/v1", tag:"grátis",
    models:"llama-3.3-70b-versatile, llama-3.1-8b-instant", key:"console.groq.com/keys" },
  gemini: { name:"Google Gemini", kind:"openai", base:"https://generativelanguage.googleapis.com/v1beta/openai", tag:"grátis",
    models:"gemini-2.5-flash, gemini-2.5-pro", key:"aistudio.google.com/apikey" },
  openrouter: { name:"OpenRouter", kind:"openai", base:"https://openrouter.ai/api/v1", tag:"grátis",
    models:"meta-llama/llama-3.3-70b-instruct:free, deepseek/deepseek-chat", key:"openrouter.ai/keys" },
  // locais (US$0, sua máquina, sem chave)
  ollama: { name:"Ollama (local)", kind:"openai", base:"http://localhost:11434/v1", tag:"local",
    models:"llama3.2, qwen2.5, deepseek-r1", key:"—" },
  lmstudio: { name:"LM Studio (local)", kind:"openai", base:"http://localhost:1234/v1", tag:"local",
    models:"seu-modelo-local", key:"—" },
  // baratos (China / open-source)
  deepseek: { name:"DeepSeek", kind:"openai", base:"https://api.deepseek.com", tag:"barato",
    models:"deepseek-chat, deepseek-reasoner", key:"platform.deepseek.com" },
  qwen: { name:"Qwen (Alibaba)", kind:"openai", base:"https://dashscope-intl.aliyuncs.com/compatible-mode/v1", tag:"barato",
    models:"qwen-max, qwen-plus", key:"dashscope console" },
  kimi: { name:"Kimi (Moonshot)", kind:"openai", base:"https://api.moonshot.ai/v1", tag:"barato",
    models:"kimi-k2-0905-preview, moonshot-v1-8k", key:"platform.moonshot.ai" },
  together: { name:"Together", kind:"openai", base:"https://api.together.xyz/v1", tag:"barato",
    models:"meta-llama/Llama-3.3-70B-Instruct-Turbo", key:"api.together.xyz" },
  // pagos (padrão)
  anthropic: { name:"Claude (Anthropic)", kind:"anthropic", base:"", tag:"pago",
    models:"claude-sonnet-5, claude-haiku-4-5, claude-opus-4-8", key:"console.anthropic.com" },
  openai: { name:"OpenAI", kind:"openai", base:"https://api.openai.com/v1", tag:"pago·cors",
    models:"gpt-5, gpt-4.1-mini", key:"platform.openai.com" },
  xai: { name:"Grok (xAI)", kind:"openai", base:"https://api.x.ai/v1", tag:"pago",
    models:"grok-4, grok-3-mini", key:"console.x.ai" },
  mistral: { name:"Mistral", kind:"openai", base:"https://api.mistral.ai/v1", tag:"pago",
    models:"mistral-large-latest, mistral-small-latest", key:"console.mistral.ai" }
};
const PRESET_ORDER=["groq","gemini","openrouter","ollama","lmstudio","deepseek","qwen","kimi","together","anthropic","openai","xai","mistral"];
const TAG_COLOR={"grátis":"var(--ok)","local":"var(--ac2)","barato":"var(--warn)","pago":"var(--tx3)","pago·cors":"var(--tx3)"};
let editingProv=null;

function patDays(){ const t=parseInt(localStorage.getItem(LS_KEY+"-patexp")||"0",10); if(!t) return null; return Math.floor((t-Date.now())/86400000); }
