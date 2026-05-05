import { useState, useRef, useEffect } from 'react';

const SYSTEM_MESSAGE = {
  role: 'system',
  content: 'You are a helpful assistant. Be concise and clear.',
};

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  async function sendMessage(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    const userMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput('');
    setThinking(true);
    setStreaming(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [SYSTEM_MESSAGE, ...nextMessages],
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let firstChunk = true;

      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload);

            if (parsed.error) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: `Error: ${parsed.error}`,
                  isError: true,
                };
                return updated;
              });
              return;
            }

            if (parsed.delta) {
              if (firstChunk) {
                setThinking(false);
                firstChunk = false;
              }
              assistantContent += parsed.delta;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: assistantContent,
                };
                return updated;
              });
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (err) {
      setThinking(false);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}`, isError: true },
      ]);
    } finally {
      setThinking(false);
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  function clearConversation() {
    setMessages([]);
    setInput('');
    setThinking(false);
    setStreaming(false);
    inputRef.current?.focus();
  }

  return (
    <div className="app">
      <header className="header">
        <h1>AI Stream Chat</h1>
        {messages.length > 0 && (
          <button className="clear-btn" onClick={clearConversation} disabled={streaming}>
            Clear
          </button>
        )}
      </header>

      <main className="messages">
        {messages.length === 0 && (
          <div className="empty-state">Send a message to start chatting.</div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message message--${msg.role}${msg.isError ? ' message--error' : ''}`}>
            <span className="message__label">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
            <p className="message__content">{msg.content}</p>
          </div>
        ))}

        {thinking && (
          <div className="message message--assistant">
            <span className="message__label">Assistant</span>
            <p className="message__content thinking">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      <form className="input-area" onSubmit={sendMessage}>
        <input
          ref={inputRef}
          className="input-field"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          disabled={streaming}
          autoFocus
        />
        <button className="send-btn" type="submit" disabled={!input.trim() || streaming}>
          Send
        </button>
      </form>
    </div>
  );
}
