import { useState } from 'react'
import axios from 'axios'
import { Send, CheckCircle2, Loader2 } from 'lucide-react'

function App() {
  const [content, setContent] = useState('')
  // 状态机: 'idle' (空闲) | 'submitting' (提交中) | 'success' (成功展示)
  const [status, setStatus] = useState('idle') 

  const handleSubmit = async () => {
    if (!content.trim()) return
    
    setStatus('submitting')
    
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL;
      await axios.post(`${baseUrl}/events/add`, { content })
      
      setStatus('success')
      
      // 2秒后重置，回到输入状态，产生一种“事情已经过去了”的感觉
      setTimeout(() => {
        setContent('')
        setStatus('idle')
      }, 2500)
      
    } catch (error) {
      alert('抱歉，暂时没记住。请重试。') // MVP 简单错误处理
      setStatus('idle')
    }
  }

  // 成功页面 (极其克制)
  if (status === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 animate-fade-in">
        <CheckCircle2 className="w-16 h-16 text-primary mb-6" />
        <h2 className="text-2xl font-light text-text mb-2">已记住。</h2>
        <p className="text-muted text-center">
          下周三前，我会替你记着。<br/>
          你可以忘掉它了。
        </p>
      </div>
    )
  }

  // 输入页面
  return (
    <div className="min-h-screen flex flex-col px-6 py-10 relative">
      
      {/* 顶部简单的 Logo */}
      <div className="flex items-center justify-center mb-12 opacity-50">
        <span className="text-sm tracking-[0.2em] text-muted uppercase">ForgotYet</span>
      </div>

      {/* 核心输入区 */}
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <label className="text-muted text-sm mb-4 block pl-1">告诉我不久的将来要做什么...</label>
        
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="例如：下周三要给车做保养，或者提醒我明晚给妈妈打个电话。"
          className="w-full h-48 bg-surface/50 rounded-xl p-4 text-lg text-text placeholder-muted/30 resize-none transition-all focus:bg-surface focus:ring-1 focus:ring-primary/50"
          disabled={status === 'submitting'}
        />

        {/* 按钮区域 */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={!content.trim() || status === 'submitting'}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all duration-300
              ${content.trim() 
                ? 'bg-primary text-background shadow-[0_0_20px_rgba(56,189,248,0.3)] hover:shadow-[0_0_30px_rgba(56,189,248,0.5)] translate-y-0 opacity-100' 
                : 'bg-surface text-muted translate-y-4 opacity-0 pointer-events-none'}
            `}
          >
            {status === 'submitting' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>记录中...</span>
              </>
            ) : (
              <>
                <span>交给 System</span>
                <Send className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* 底部版权 */}
      <div className="text-center text-xs text-muted/20 pb-4">
        v0.1 · Minimal MVP
      </div>
    </div>
  )
}

export default App