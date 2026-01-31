import { useState, useRef, useEffect } from 'react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

function App() {
  // ================= 1. 状态管理 =================
  // 鉴权状态
  const [token, setToken] = useState(localStorage.getItem('fy_token') || '')
  const [authStep, setAuthStep] = useState(token ? 'LOGGED_IN' : 'EMAIL') // EMAIL, CODE, LOGGED_IN
  const [emailValue, setEmailValue] = useState(localStorage.getItem('fy_email') || '')
  const [codeValue, setCodeValue] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // 业务状态
  const [inputValue, setInputValue] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState('')

  // V1：最近记忆列表
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)


  // 语音状态
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef(null)
  const timerRef = useRef(null)
  const audioChunksRef = useRef([])

  // ================= 1.5. Effects & Helpers =================
  const fetchRecentEvents = async () => {
    if (!token) return
    setEventsLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/event/list?limit=10`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.code === 200) {
        setEvents(data.data || [])
      } else {
        console.warn(data.msg || 'fetch events failed')
      }
    } catch (e) {
      console.warn('fetch events error', e)
    } finally {
      setEventsLoading(false)
    }
  }

  useEffect(() => {
    if (authStep === 'LOGGED_IN') {
      fetchRecentEvents()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStep])

  // ================= 2. 鉴权业务 (OTP登录) =================
  const handleSendCode = async () => {
    if (!emailValue) return
    setAuthLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/send-code?email=${encodeURIComponent(emailValue)}`, { method: 'POST' })
      if (res.ok) {
        setAuthStep('CODE')
        localStorage.setItem('fy_email', emailValue)
      } else {
        alert('发送失败，请稍后重试')
      }
    } catch (err) {
      alert('网络错误')
    } finally {
      setAuthLoading(false)
    }
  }



  const handleLogin = async () => {
    if (!codeValue) return
    setAuthLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login?email=${encodeURIComponent(emailValue)}&code=${encodeURIComponent(codeValue)}`, { method: 'POST' })
      const data = await res.json()
      if (data.code === 200) {
        const jwt = data.data
        setToken(jwt)
        localStorage.setItem('fy_token', jwt)
        setAuthStep('LOGGED_IN')
      } else {
        alert(data.msg || '验证码错误')
      }
    } catch (err) {
      alert('登录失败')
    } finally {
      setAuthLoading(false)
    }
  }

  // ================= 3. 语音引擎 (录音与转录) =================
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await transcribeAudio(audioBlob)
        stream.getTracks().forEach(track => track.stop()) // 释放麦克风
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
      setRecordingTime(0)

      // 60秒硬性截断保护（防止恶意占用服务器）
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 60) {
            stopRecording()
            return 60
          }
          return prev + 1
        })
      }, 1000)

    } catch (err) {
      alert('无法访问麦克风，请检查浏览器权限。')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      clearInterval(timerRef.current)
    }
  }

  const transcribeAudio = async (blob) => {
    setIsSubmitting(true)
    setFeedbackMsg('🎙️ 正在将语音转化为文字...')
    
    const formData = new FormData()
    formData.append('file', blob, 'voice.webm')

    try {
      const res = await fetch(`${API_BASE_URL}/api/voice/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      })
      const data = await res.json()
      if (data.code ===  200) {
        const text = data.data
        setInputValue(text)
        // 自动提交事件
        await submitEvent(text)
      } else {
        alert(data.msg)
        setIsSubmitting(false)
        setFeedbackMsg('')
      }
    } catch (err) {
      alert('语音识别失败')
      setIsSubmitting(false)
      setFeedbackMsg('')
    }
  }

  // ================= 4. 核心业务 (提交事件) =================
  const submitEvent = async (textToSubmit) => {
    const finalContent = textToSubmit || inputValue
    if (!finalContent.trim()) return

    setIsSubmitting(true)
    setFeedbackMsg('✨ 正在为您生成专属时间胶囊...')

    try {
      const res = await fetch(`${API_BASE_URL}/api/event/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          content: finalContent
          // 注意：不需要传邮箱了，后端会从 Token 里取
        })
      })

      const data = await res.json()
      if (data.code === 200) {  
        setFeedbackMsg('✅ 已收录。不用再挂念它，去享受生活吧。')
        setInputValue('')
        await fetchRecentEvents()
        setTimeout(() => setFeedbackMsg(''), 4000)
      } else {
        alert(data.msg)
      }
    } catch (err) {
      alert('网络异常，请重试')
    } finally {
      setIsSubmitting(false)
    }
  }



  const submitFeedback = async (eventId, feedback) => {
    if (!eventId || !feedback) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/event/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ eventId, feedback })
      })
      const data = await res.json()
      if (data.code === 200) {
        // 乐观更新：直接改本地状态
        setEvents(prev => prev.map(e => e.id === eventId ? { ...e, feedback } : e))
        setFeedbackMsg('✅ 已记录反馈')
        setTimeout(() => setFeedbackMsg(''), 1500)
      } else {
        alert(data.msg || '反馈失败')
      }
    } catch (e) {
      alert('网络异常，反馈失败')
    }
  }


  // ================= 5. 渲染视图 =================
  
  // 视图A：未登录状态 (极简鉴权)
  if (authStep !== 'LOGGED_IN') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4 selection:bg-stone-200">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-stone-100 flex flex-col gap-6">
          <div className="text-center">
            <h1 className="text-2xl font-medium text-stone-800 tracking-tight">ForgotYet</h1>
            <p className="text-sm text-stone-400 mt-1">给未来的自己留个言</p>
          </div>

          {authStep === 'EMAIL' ? (
            <>
              <input
                type="email"
                placeholder="输入你的邮箱"
                className="w-full p-4 bg-stone-50 text-stone-700 text-lg rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-400 transition-all placeholder:text-stone-300"
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
              />
              <button
                onClick={handleSendCode}
                disabled={authLoading || !emailValue}
                className="w-full bg-stone-800 text-white p-4 rounded-xl font-medium text-lg hover:bg-stone-700 transition-all disabled:opacity-50"
              >
                {authLoading ? '发送中...' : '发送验证码'}
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                placeholder="输入 4 位验证码"
                className="w-full p-4 bg-stone-50 text-stone-700 text-lg rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-400 transition-all text-center tracking-widest"
                value={codeValue}
                onChange={(e) => setCodeValue(e.target.value)}
              />
              <button
                onClick={handleLogin}
                disabled={authLoading || !codeValue}
                className="w-full bg-stone-800 text-white p-4 rounded-xl font-medium text-lg hover:bg-stone-700 transition-all disabled:opacity-50"
              >
                {authLoading ? '登录中...' : '进入'}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // 视图B：已登录主界面
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4 selection:bg-stone-200">
      <div className="w-full max-w-xl bg-white p-8 rounded-3xl shadow-sm border border-stone-100 flex flex-col gap-6 relative overflow-hidden transition-all duration-300">
        
        {/* 顶部栏 */}
        <div className="flex justify-between items-center text-stone-400 text-sm">
          <span>{emailValue}</span>
          <button 
            onClick={() => {
              localStorage.removeItem('fy_token')
              setToken('')
              setAuthStep('EMAIL')
            }}
            className="hover:text-stone-600 transition-colors"
          >
            退出
          </button>
        </div>

        {/* 录音状态波纹指示器 */}
        {isRecording && (
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500 animate-pulse transition-all duration-300"></div>
        )}

        <textarea
          placeholder={isRecording ? `正在倾听... (${recordingTime}s)` : "随便说点什么？比如：下周五提醒我给老王打个电话"}
          className={`w-full h-40 resize-none p-4 bg-stone-50 text-stone-700 text-lg rounded-2xl border ${isRecording ? 'border-red-200 bg-red-50/30' : 'border-stone-100'} focus:outline-none focus:ring-2 focus:ring-stone-400 transition-all placeholder:text-stone-300`}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isSubmitting || isRecording}
        />

        {/* 反馈信息 */}
        {feedbackMsg && (
          <div className="text-sm text-stone-500 text-center animate-fade-in">
            {feedbackMsg}
          </div>
        )}

        {/* 操作区 */}
        <div className="flex gap-4">
          {/* 语音按钮 (支持桌面端鼠标按住，移动端手指按住) */}
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isSubmitting}
            className={`flex-1 p-4 rounded-2xl font-medium text-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${
              isRecording ? 'bg-red-500 text-white shadow-md' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            {isRecording ? (
              <>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                </span>
                松开发送 ({60 - recordingTime}s)
              </>
            ) : (
              <>🎙️ 按住说话</>
            )}
          </button>

          {/* 发送按钮 */}
          <button
            onClick={() => submitEvent()}
            disabled={!inputValue.trim() || isSubmitting || isRecording}
            className="flex-1 bg-stone-800 text-white p-4 rounded-2xl font-medium text-lg hover:bg-stone-700 transition-all active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? '飞鸽传书中...' : '发送'}
          </button>
        </div>
                {/* V1：最近记忆 */}
        <div className="mt-2 pt-4 border-t border-stone-100">
          <div className="flex items-center justify-between">
            <div className="text-sm text-stone-500">最近记忆</div>
            <button
              onClick={fetchRecentEvents}
              className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
              disabled={eventsLoading}
            >
              {eventsLoading ? '刷新中...' : '刷新'}
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3">
            {eventsLoading && (
               <div className="text-sm text-stone-400 py-8 text-center flex flex-col items-center gap-2">
                 <div className="w-6 h-6 border-2 border-stone-200 border-t-stone-500 rounded-full animate-spin"></div>
                 <span>读取记忆中...</span>
               </div>
            )}

            {!eventsLoading && events.length === 0 && (
              <div className="text-sm text-stone-400 py-4 text-center">
                还没有记忆，先写一条吧。
              </div>
            )}

            {!eventsLoading && events.map(ev => (
              <div key={ev.id} className="bg-stone-50 rounded-2xl border border-stone-100 p-4">
                <div className="text-stone-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {ev.rawInput}
                </div>

                <div className="mt-2 text-xs text-stone-400 flex flex-wrap gap-x-3 gap-y-1">
                  <span>event: {new Date(ev.eventTime).toLocaleString()}</span>
                  <span>trigger: {new Date(ev.triggerTime).toLocaleString()}</span>
                  <span>status: {ev.status}</span>
                  {ev.feedback && <span>feedback: {ev.feedback}</span>}
                </div>

                {ev.status === 'DELIVERED' && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => submitFeedback(ev.id, 'EARLY')}
                      className={`px-3 py-2 rounded-xl text-sm transition-all border ${
                        ev.feedback === 'EARLY'
                          ? 'bg-stone-800 text-white border-stone-800'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      早了
                    </button>
                    <button
                      onClick={() => submitFeedback(ev.id, 'GOOD')}
                      className={`px-3 py-2 rounded-xl text-sm transition-all border ${
                        ev.feedback === 'GOOD'
                          ? 'bg-stone-800 text-white border-stone-800'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      刚好
                    </button>
                    <button
                      onClick={() => submitFeedback(ev.id, 'LATE')}
                      className={`px-3 py-2 rounded-xl text-sm transition-all border ${
                        ev.feedback === 'LATE'
                          ? 'bg-stone-800 text-white border-stone-800'
                          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                      }`}
                    >
                      晚了
                    </button>
                  </div>
                )}

                {ev.triggerReason && (
                  <div className="mt-2 text-[11px] text-stone-400 bg-stone-100/50 p-2 rounded-lg border border-stone-100/50">
                    💡 触发原因: {ev.triggerReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

export default App