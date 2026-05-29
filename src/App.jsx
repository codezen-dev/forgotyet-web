import { useState, useRef, useEffect, useCallback } from 'react'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

function App() {
  // ================= 1. 状态管理 =================
  // 鉴权状态
    const [token, setToken] = useState(localStorage.getItem('fy_token') || '')

  // 登录模式：EMAIL / SMS
  const [loginMode, setLoginMode] = useState(localStorage.getItem('fy_login_mode') || 'EMAIL')

  // authStep: EMAIL, CODE, PHONE, SMS_CODE, LOGGED_IN
  const [authStep, setAuthStep] = useState(token ? 'LOGGED_IN' : (loginMode === 'SMS' ? 'PHONE' : 'EMAIL'))

  const [emailValue, setEmailValue] = useState(localStorage.getItem('fy_email') || '')
  const [codeValue, setCodeValue] = useState('')

  // SMS 登录新增
  const [phoneValue, setPhoneValue] = useState(localStorage.getItem('fy_phone') || '')
  const [smsCodeValue, setSmsCodeValue] = useState('')

  // 短信登录阶段要求绑定邮箱（后端 sms/login 需要 email）
  const [bindEmailValue, setBindEmailValue] = useState(localStorage.getItem('fy_email') || '')

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

  // 判断这句话更像“补时间句”（而不是新事项）
  const looksLikeTimeOnly = (s) => {
    if (!s) return false
    const t = s.trim()
    // 很短且是时间表达，基本可以认为是补时间
    // 覆盖：明天/后天/下周一/下午3点/14:30/5分钟后/一小时后 等
    return /(\d+\s*(分钟|分|min|minute|小时|h|hour|天|日|周|星期|月))|(\d{1,2}\s*(点|点钟))|(\d{1,2}[:：]\d{2})|(今天|明天|后天|大后天|下周|下星期|下个月|周[一二三四五六日天]|星期[一二三四五六日天]|上午|早上|中午|下午|晚上|夜里|夜晚|稍后|一会|一会儿)/.test(t)
  }

  // 帮你定位 resolve 是否 404/401 等（避免“悄悄失败又创建了新事项”）
  const logResolveResult = async (res, data) => {
    try {
      console.log('[resolve-pending] httpStatus=', res.status, 'ok=', res.ok, 'payload=', data)
    } catch {
      return
    }
  }


  // ================= 1.5. Effects & Helpers =================
  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const isValidPhone = (phone) => /^1[3-9]\d{9}$/.test(phone)

  const formatLead = (eventTimeStr, triggerTimeStr) => {
  if (!eventTimeStr || !triggerTimeStr) return ''
  const e = new Date(eventTimeStr).getTime()
  const t = new Date(triggerTimeStr).getTime()
  if (Number.isNaN(e) || Number.isNaN(t)) return ''
  const diffMs = e - t
  if (diffMs <= 0) return 'lead≤0（检查）'

  const mins = Math.round(diffMs / 60000)
  if (mins < 60) return `提前${mins}分钟`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `提前${hours}小时`
  const days = Math.round(hours / 24)
  return `提前${days}天`
}

const safeText = (v) => (v === null || v === undefined || v === '') ? '' : String(v)

  const fetchRecentEvents = useCallback(async (isBackground = false) => {
    if (!token) return []
    // 如果是后台静默刷新，就不显示 loading 状态，避免界面闪烁
    if (!isBackground) setEventsLoading(true)
    
    try {
      // 加个时间戳防止缓存
      const res = await fetch(`${API_BASE_URL}/api/event/list?limit=10&_t=${Date.now()}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.code === 200) {
        const list = data.data || []
        setEvents(list)
        return list // 返回数据供调用方判断
      } else {
        console.warn(data.msg || 'fetch events failed')
      }
    } catch (e) {
      console.warn('fetch events error', e)
    } finally {
      if (!isBackground) setEventsLoading(false)
    }
    return []
  }, [token])

  useEffect(() => {
    if (authStep === 'LOGGED_IN') {
      fetchRecentEvents()
    }
  }, [authStep, fetchRecentEvents])
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && authStep === 'LOGGED_IN') {
        fetchRecentEvents()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [authStep, fetchRecentEvents])


  const [confirmingId, setConfirmingId] = useState(null)

  // ================= Toast Notification =================
  const [toast, setToast] = useState({ show: false, msg: '', type: 'info' })
  const toastTimerRef = useRef(null)

  const showToast = (msg, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ show: true, msg, type })
    toastTimerRef.current = setTimeout(() => {
      setToast(prev => ({ ...prev, show: false }))
    }, 3000)
  }

  const Toast = () => (
    <div 
      onClick={() => setToast(prev => ({ ...prev, show: false }))}
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-full shadow-xl flex items-center gap-3 transition-all duration-300 transform cursor-pointer max-w-[90vw] whitespace-nowrap overflow-hidden text-ellipsis ${toast.show ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'} ${toast.type === 'error' ? 'bg-red-50 text-red-600 border border-red-100 ring-1 ring-red-100' : 'bg-stone-800 text-white shadow-stone-200'}`}
      style={{ marginTop: 'env(safe-area-inset-top)' }}
    >
      <div className="shrink-0">
        {toast.type === 'error' ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      <span className="font-medium text-sm truncate">{toast.msg}</span>
    </div>
  )

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
        showToast('发送失败，请稍后重试', 'error')
      }
    } catch {
      showToast('网络错误', 'error')
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
        showToast(data.msg || '验证码错误', 'error')
      }
    } catch {
      showToast('登录失败', 'error')
    } finally {
      setAuthLoading(false)
    }
  }

    const handleSendSmsCode = async () => {
    if (!phoneValue) return
    setAuthLoading(true)
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/auth/sms/send-code?phone=${encodeURIComponent(phoneValue)}`,
        { method: 'POST' }
      )
      const data = await res.json().catch(() => ({}))
      if (res.ok && (data.code === 200 || data.msg === 'success' || data.success)) {
        setAuthStep('SMS_CODE')
        localStorage.setItem('fy_phone', phoneValue)
      } else {
        showToast(data.msg || '发送失败，请稍后重试', 'error')
      }
    } catch {
      showToast('网络错误', 'error')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSmsLogin = async () => {
    if (!phoneValue || !smsCodeValue || !bindEmailValue) return
    setAuthLoading(true)
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/auth/sms/login?phone=${encodeURIComponent(phoneValue)}&code=${encodeURIComponent(smsCodeValue)}&email=${encodeURIComponent(bindEmailValue)}`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (data.code === 200) {
        const jwt = data.data
        setToken(jwt)
        localStorage.setItem('fy_token', jwt)

        // ✅ 登录后顶部展示邮箱（而不是手机号）
        setEmailValue(bindEmailValue)
        localStorage.setItem('fy_email', bindEmailValue)

        setAuthStep('LOGGED_IN')
      } else {
        showToast(data.msg || '验证码错误', 'error')
      }
    } catch {
      showToast('登录失败', 'error')
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

    } catch {
      showToast('无法访问麦克风，请检查浏览器权限。', 'error')
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
        showToast(data.msg, 'error')
        setIsSubmitting(false)
        setFeedbackMsg('')
      }
    } catch {
      showToast('语音识别失败', 'error')
      setIsSubmitting(false)
      setFeedbackMsg('')
    }
  }

  // ================= 4. 核心业务 (提交事件) =================
  const submitEvent = async (textToSubmit) => {
    const finalContent = textToSubmit || inputValue
    if (!finalContent.trim()) return

    setIsSubmitting(true)

    try {
      const hasPending = events?.some(e => e.status === 'PENDING')

      // ✅ 只有“存在 pending”且“这句话像补时间”才尝试 resolve，避免串线
      const shouldTryResolve = hasPending && looksLikeTimeOnly(finalContent)

      if (shouldTryResolve) {
        setFeedbackMsg('🤔 正在尝试补全待定事项...')
        const res = await fetch(`${API_BASE_URL}/api/event/resolve-pending`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ content: finalContent }),
        })

        const data = await res.json()
        await logResolveResult(res, data) // ✅ 打印 status，排查 404/401

        // ✅ 更严格成功判定（你说你已做过，这里给一个稳的参考）
        const ok = (res.ok && (data?.code === 200 || data?.success === true))
        if (ok) {
          setFeedbackMsg('✅ 已补全待定事项')
          showToast(typeof data.data === 'string' ? data.data : (data.msg || '已补全待定事项'))
          setInputValue('')
          await fetchRecentEvents()
          setTimeout(() => setFeedbackMsg(''), 3000)
          return
        } else {
          // ✅ resolve 失败给个提示（你说你也做了）
          const msg = data?.msg || '补全失败，将按新事项创建'
          showToast(msg, 'warning')
          // 继续 fallback add
        }
      } else if (hasPending) {
        // 可选：存在 pending 但输入不像补时间 → 提醒用户“可以补时间”
        // 不影响创建新事项，只是“秘书提示”
        // showToast('我这边还有一个待定事项，你也可以直接补一个时间，比如：明天下午3点', 'info')
      }

      // 2) fallback：正常 add
      setFeedbackMsg('✨ 正在为您生成专属时间胶囊...')
      const res = await fetch(`${API_BASE_URL}/api/event/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content: finalContent })
      })

      const data = await res.json()
      if (data.code === 200) {
        setFeedbackMsg('✅ 已收录。不用再挂念它，去享受生活吧。')
        setInputValue('')
        await refreshAfterSubmit(finalContent)
        setTimeout(() => setFeedbackMsg(''), 4000)
      } else {
        showToast(data.msg, 'error')
      }
    } catch {
      showToast('网络异常，请重试', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const refreshAfterSubmit = async (rawInput) => {
  await fetchRecentEvents(true)

  let tries = 0
  const maxTries = 10

  const timer = setInterval(async () => {
    tries++
    if (tries > maxTries) {
      clearInterval(timer)
      return
    }

    const latestList = await fetchRecentEvents(true)

    const hit = latestList && latestList.find(e =>
      e.content === rawInput ||
      e.rawInput === rawInput ||
      (e.rawInput && e.rawInput.includes(rawInput))
    )

    if (hit) {
      clearInterval(timer)

      const lead = formatLead(hit.eventTime, hit.triggerTime)
      const bucket = safeText(hit.triggerBucket)
      const intent = safeText(hit.triggerIntent)
      const cpx = safeText(hit.complexity)

      showToast(`已生成计划：${lead}${bucket ? ` · ${bucket}` : ''}${intent ? ` · ${intent}` : ''}${cpx ? ` · ${cpx}` : ''}`)
    }
  }, 1500)
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
        showToast(data.msg || '反馈失败', 'error')
      }
    } catch {
      showToast('网络异常，反馈失败', 'error')
    }
  }
  const cancelEvent = async (eventId) => {
    if (!eventId) return
    try {
      const res = await fetch(`${API_BASE_URL}/api/event/${eventId}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await res.json()

      if (data.code === 200) {
        // 乐观更新：本地立刻标记取消
        setEvents(prev =>
          prev.map(e =>
            e.id === eventId ? { ...e, status: 'CANCELED' } : e
          )
        )
        setFeedbackMsg('✅ 已取消')
        setTimeout(() => setFeedbackMsg(''), 1500)
      } else {
        showToast(data.msg || '取消失败', 'error')
      }
    } catch {
      showToast('网络异常，取消失败', 'error')
    } finally {
      setConfirmingId(null)
    }
  }



  // ================= 5. 渲染视图 =================
  
  // 视图A：未登录状态 (极简鉴权)
  if (authStep !== 'LOGGED_IN') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4 selection:bg-stone-200">
        <Toast />
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-stone-100 flex flex-col gap-6">
          <div className="text-center">
            <h1 className="text-2xl font-medium text-stone-800 tracking-tight">ForgotYet</h1>
            <p className="text-sm text-stone-400 mt-1">给未来的自己留个言</p>
          </div>

          {/* 登录模式切换 Tab */}
          <div className="flex border-b border-stone-100">
            <button
              className={`flex-1 pb-3 text-sm font-medium transition-all ${loginMode === 'EMAIL' ? 'text-stone-800 border-b-2 border-stone-800' : 'text-stone-400 hover:text-stone-600'}`}
              onClick={() => {
                setLoginMode('EMAIL')
                setAuthStep('EMAIL')
                localStorage.setItem('fy_login_mode', 'EMAIL')
              }}
            >
              邮箱登录
            </button>
            <button
              className={`flex-1 pb-3 text-sm font-medium transition-all ${loginMode === 'SMS' ? 'text-stone-800 border-b-2 border-stone-800' : 'text-stone-400 hover:text-stone-600'}`}
              onClick={() => {
                setLoginMode('SMS')
                setAuthStep('PHONE')
                localStorage.setItem('fy_login_mode', 'SMS')
              }}
            >
              手机验证
            </button>
          </div>

          {/* 邮箱登录模式 */}
          {loginMode === 'EMAIL' && (
            <>
              {authStep === 'EMAIL' ? (
                <div className="flex flex-col gap-4 animate-fade-in">
                  <div className="flex flex-col gap-1">
                    <input
                      type="email"
                      placeholder="输入你的邮箱"
                      className={`w-full p-4 bg-stone-50 text-stone-700 text-lg rounded-xl border ${emailValue && !isValidEmail(emailValue) ? 'border-red-300 focus:ring-red-400' : 'border-stone-200 focus:ring-stone-400'} focus:outline-none focus:ring-2 transition-all placeholder:text-stone-300`}
                      value={emailValue}
                      onChange={(e) => setEmailValue(e.target.value)}
                    />
                    {emailValue && !isValidEmail(emailValue) && (
                      <span className="text-xs text-red-500 px-1">请输入正确的邮箱格式</span>
                    )}
                  </div>
                  <button
                    onClick={handleSendCode}
                    disabled={authLoading || !emailValue || !isValidEmail(emailValue)}
                    className="w-full bg-stone-800 text-white p-4 rounded-xl font-medium text-lg hover:bg-stone-700 transition-all disabled:opacity-50 disabled:hover:bg-stone-800"
                  >
                    {authLoading ? '发送中...' : '发送验证码'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4 animate-fade-in">
                  <div className="flex items-center justify-between text-sm text-stone-500 px-1">
                    <span>验证码已发送至 {emailValue}</span>
                    <button 
                      onClick={() => setAuthStep('EMAIL')}
                      className="text-stone-400 hover:text-stone-600 underline"
                    >
                      修改邮箱
                    </button>
                  </div>
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
                </div>
              )}
            </>
          )}

          {/* 手机登录模式 */}
          {loginMode === 'SMS' && (
            <>
              {authStep === 'PHONE' ? (
                <div className="flex flex-col gap-4 animate-fade-in">
                  <div className="flex flex-col gap-1">
                    <input
                      type="tel"
                      placeholder="输入你的手机号"
                      className={`w-full p-4 bg-stone-50 text-stone-700 text-lg rounded-xl border ${phoneValue && !isValidPhone(phoneValue) ? 'border-red-300 focus:ring-red-400' : 'border-stone-200 focus:ring-stone-400'} focus:outline-none focus:ring-2 transition-all placeholder:text-stone-300`}
                      value={phoneValue}
                      onChange={(e) => setPhoneValue(e.target.value)}
                    />
                    {phoneValue && !isValidPhone(phoneValue) && (
                      <span className="text-xs text-red-500 px-1">请输入正确的手机号格式</span>
                    )}
                  </div>
                  <button
                    onClick={handleSendSmsCode}
                    disabled={authLoading || !phoneValue || !isValidPhone(phoneValue)}
                    className="w-full bg-stone-800 text-white p-4 rounded-xl font-medium text-lg hover:bg-stone-700 transition-all disabled:opacity-50 disabled:hover:bg-stone-800"
                  >
                    {authLoading ? '发送中...' : '发送验证码'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4 animate-fade-in">
                  <div className="flex items-center justify-between text-sm text-stone-500 px-1">
                    <span>验证码已发送至 {phoneValue}</span>
                    <button 
                      onClick={() => setAuthStep('PHONE')}
                      className="text-stone-400 hover:text-stone-600 underline"
                    >
                      修改手机号
                    </button>
                  </div>
                  
                  <input
                    type="text"
                    placeholder="输入短信验证码"
                    className="w-full p-4 bg-stone-50 text-stone-700 text-lg rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-400 transition-all text-center tracking-widest"
                    value={smsCodeValue}
                    onChange={(e) => setSmsCodeValue(e.target.value)}
                  />
                  
                  {/* SMS 登录强制绑定邮箱 */}
                  <div className="flex flex-col gap-1">
                    <input
                      type="email"
                      placeholder="绑定邮箱 (必填)"
                      className={`w-full p-4 bg-stone-50 text-stone-700 text-lg rounded-xl border ${bindEmailValue && !isValidEmail(bindEmailValue) ? 'border-red-300 focus:ring-red-400' : 'border-stone-200 focus:ring-stone-400'} focus:outline-none focus:ring-2 transition-all placeholder:text-stone-300`}
                      value={bindEmailValue}
                      onChange={(e) => setBindEmailValue(e.target.value)}
                    />
                    {bindEmailValue && !isValidEmail(bindEmailValue) ? (
                      <span className="text-xs text-red-500 px-1">请输入正确的邮箱格式</span>
                    ) : (
                      <span className="text-xs text-stone-400 px-1">我们需要邮箱来确保你能收到重要提醒</span>
                    )}
                  </div>

                  <button
                    onClick={handleSmsLogin}
                    disabled={authLoading || !smsCodeValue || !bindEmailValue || !isValidEmail(bindEmailValue)}
                    className="w-full bg-stone-800 text-white p-4 rounded-xl font-medium text-lg hover:bg-stone-700 transition-all disabled:opacity-50 disabled:hover:bg-stone-800"
                  >
                    {authLoading ? '验证并登录...' : '进入'}
                  </button>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    )
  }

  // 视图B：已登录主界面
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4 selection:bg-stone-200">
      <Toast />
      <div className="w-full max-w-xl bg-white p-8 rounded-3xl shadow-sm border border-stone-100 flex flex-col gap-6 relative overflow-hidden transition-all duration-300">
        
        {/* 顶部栏 */}
        <div className="flex justify-between items-center text-stone-400 text-sm">
          <span>{emailValue}</span>
          <button 
            onClick={() => {
              localStorage.removeItem('fy_token')
              localStorage.removeItem('fy_login_mode')
              setToken('')
              setLoginMode('EMAIL')
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

          <div className="mt-3 flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-1">
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

                <div className="mt-2 text-xs text-stone-400 flex flex-wrap gap-x-3 gap-y-1 items-center">
                {ev.eventTime && <span>event: {new Date(ev.eventTime).toLocaleString()}</span>}
                {ev.triggerTime && <span>trigger: {new Date(ev.triggerTime).toLocaleString()}</span>}
                <span className="font-medium text-stone-500">
                  {formatLead(ev.eventTime, ev.triggerTime)}
                </span>
                <span>status: {ev.status}</span>
                {ev.feedback && <span>feedback: {ev.feedback}</span>}
              </div>

              {/* ✅ 策略 badges（后端没返回也不会显示） */}
              <div className="mt-2 flex flex-wrap gap-2">
                {ev.triggerBucket && (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-white border border-stone-200 text-stone-600">
                    bucket: {ev.triggerBucket}
                  </span>
                )}
                {ev.triggerIntent && (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-white border border-stone-200 text-stone-600">
                    intent: {ev.triggerIntent}
                  </span>
                )}
                {ev.complexity && (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-white border border-stone-200 text-stone-600">
                    complexity: {ev.complexity}
                  </span>
                )}
                {ev.prepRequired !== null && ev.prepRequired !== undefined && (
                  <span className="text-[11px] px-2 py-1 rounded-full bg-white border border-stone-200 text-stone-600">
                    prep: {String(ev.prepRequired)}
                  </span>
                )}
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
                {ev.status === 'SILENT' && (
                  <div className="mt-3 flex justify-end">
                    {confirmingId === ev.id ? (
                      <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg animate-fade-in">
                        <span className="text-xs text-red-600">确定取消？</span>
                        <button
                          onClick={() => cancelEvent(ev.id)}
                          className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors"
                        >
                          是
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="text-xs text-stone-500 hover:text-stone-700 px-2 py-0.5"
                        >
                          否
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(ev.id)}
                        className="text-xs text-stone-400 hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 group"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 group-hover:scale-110 transition-transform">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                        </svg>
                        取消提醒
                      </button>
                    )}
                  </div>
                )}

                {ev.status === 'CANCELED' && (
                  <div className="mt-3 text-sm text-stone-400">
                    已取消
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
