import { useState, useEffect, useRef } from 'react';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // State for available GitHub repos
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoError, setRepoError] = useState(null);
  const [selectedRepos, setSelectedRepos] = useState(new Set());

  // State for imported projects
  const [importedProjects, setImportedProjects] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [embeddingProjectId, setEmbeddingProjectId] = useState(null);

  // State for AI Twin Chat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatBottomRef = useRef(null);

  // Suggested questions chips for quick testing
  const sampleQuestions = [
    "How did you implement authentication in your projects?",
    "How do you handle security and token blacklisting in Payment-Ledger-System?",
    "What technologies do you use for backend development?",
  ];

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl) {
      localStorage.setItem('devtwin_token', tokenFromUrl);
      window.history.replaceState({}, document.title, '/');
    }

    const fetchUser = async () => {
      const token = localStorage.getItem('devtwin_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('http://localhost:5000/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          fetchRepos(token);
          fetchImportedProjects(token);

          // Initialize friendly AI Twin greeting
          setChatMessages([
            {
              role: 'assistant',
              text: `Hey there! I am ${userData.name || userData.username}'s AI Twin. I've indexed your GitHub code repositories with vector embeddings. Ask me technical questions about your code architecture, error handling, or database design!`,
            },
          ]);
        } else {
          localStorage.removeItem('devtwin_token');
        }
      } catch (error) {
        console.error('Failed to fetch user', error);
      }
      setLoading(false);
    };

    fetchUser();
  }, []);

  // Auto-scroll chat to latest message
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatting]);

  // Poll imported projects if any project is currently analyzing
  useEffect(() => {
    const token = localStorage.getItem('devtwin_token');
    if (!token) return;

    const hasAnalyzing = importedProjects.some(
      (p) => p.status === 'pending' || p.status === 'analyzing'
    );

    if (!hasAnalyzing) return;

    const interval = setInterval(() => {
      fetchImportedProjects(token);
    }, 3000);

    return () => clearInterval(interval);
  }, [importedProjects]);

  const fetchRepos = async (token) => {
    setLoadingRepos(true);
    setRepoError(null);
    try {
      const response = await fetch('http://localhost:5000/api/repos/github', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const repoData = await response.json();
        setRepos(repoData);
      } else {
        const errData = await response.json().catch(() => ({}));
        setRepoError(errData.error || 'Failed to fetch repositories');
      }
    } catch (error) {
      console.error('Failed to fetch repos', error);
      setRepoError('Could not connect to server');
    }
    setLoadingRepos(false);
  };

  const fetchImportedProjects = async (token) => {
    try {
      const response = await fetch('http://localhost:5000/api/repos/imported', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const projects = await response.json();
        setImportedProjects(projects);
      }
    } catch (error) {
      console.error('Failed to fetch imported projects', error);
    }
  };

  const handleImport = async () => {
    const token = localStorage.getItem('devtwin_token');
    if (!token || selectedRepos.size === 0) return;

    setIsImporting(true);
    try {
      const selectedList = repos.filter((r) => selectedRepos.has(r.githubRepoId));
      
      const response = await fetch('http://localhost:5000/api/repos/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ repos: selectedList }),
      });

      if (response.ok) {
        setSelectedRepos(new Set());
        fetchImportedProjects(token);
      } else {
        alert('Failed to import repositories');
      }
    } catch (error) {
      console.error('Import error:', error);
    }
    setIsImporting(false);
  };

  const handleGenerateEmbeddings = async (projectId) => {
    const token = localStorage.getItem('devtwin_token');
    if (!token) return;

    setEmbeddingProjectId(projectId);
    try {
      const response = await fetch(`http://localhost:5000/api/repos/${projectId}/embed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        fetchImportedProjects(token);
      } else {
        alert('Failed to generate embeddings. Check your Gemini API key in server/.env');
      }
    } catch (err) {
      console.error('Embedding generation failed:', err);
    }
    setEmbeddingProjectId(null);
  };

  const handleSendChatMessage = async (questionText) => {
    const q = questionText || chatInput;
    if (!q || !q.trim() || !user) return;

    const userMsg = { role: 'user', text: q.trim() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsChatting(true);

    try {
      const response = await fetch(`http://localhost:5000/api/chat/${user.username}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.answer,
            sources: data.sources || [],
          },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: "Sorry, I ran into an error generating that response. Make sure the server is running and Gemini API key is configured.",
          },
        ]);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: "Could not connect to the AI Twin server.",
        },
      ]);
    }

    setIsChatting(false);
  };

  const handleLogin = () => {
    window.location.href = 'http://localhost:5000/api/auth/github';
  };

  const handleLogout = () => {
    localStorage.removeItem('devtwin_token');
    setUser(null);
    setRepos([]);
    setSelectedRepos(new Set());
    setImportedProjects([]);
    setChatMessages([]);
  };

  const toggleRepoSelection = (repoId) => {
    const newSelection = new Set(selectedRepos);
    if (newSelection.has(repoId)) {
      newSelection.delete(repoId);
    } else {
      newSelection.add(repoId);
    }
    setSelectedRepos(newSelection);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <h1 className="text-2xl animate-pulse">Loading DevTwin...</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans selection:bg-blue-500/30">
      
      {/* Navbar */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-blue-400">DevTwin</h1>
            <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-mono">v1.0</span>
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">@{user.username}</span>
              <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full border border-gray-700" />
              <button onClick={handleLogout} className="text-sm text-red-400 hover:text-red-300">Logout</button>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-10">
        {!user ? (
          /* Logged Out View */
          <div className="text-center mt-20">
            <h2 className="text-5xl font-extrabold mb-6">Build your <span className="text-blue-400">AI Portfolio</span></h2>
            <p className="mb-10 text-gray-400 text-lg max-w-2xl mx-auto">
              Let recruiters ask questions about your actual code. Connect your GitHub, select your best projects, and let DevTwin do the rest.
            </p>
            <button 
              onClick={handleLogin}
              className="px-8 py-4 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              Continue with GitHub
            </button>
          </div>
        ) : (
          /* Dashboard View */
          <div className="space-y-12">
            
            {/* Section 1: AI Knowledge Base (Imported Projects) */}
            {importedProjects.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white">AI Knowledge Base</h2>
                    <p className="text-sm text-gray-400">Your GitHub repositories indexed with vector embeddings for your AI Twin.</p>
                  </div>
                  <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full font-semibold">
                    {importedProjects.filter(p => p.status === 'completed').length} / {importedProjects.length} Ready
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {importedProjects.map((proj) => (
                    <div key={proj._id} className="p-5 rounded-xl border border-gray-800 bg-gray-900/40 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-white truncate pr-2">{proj.name}</h3>
                          
                          {/* Status Badge */}
                          {proj.status === 'analyzing' || proj.status === 'pending' ? (
                            <span className="flex items-center gap-1.5 text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2.5 py-0.5 rounded-full font-medium animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
                              Analyzing
                            </span>
                          ) : proj.status === 'completed' ? (
                            <span className="flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              Ready
                            </span>
                          ) : (
                            <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-2.5 py-0.5 rounded-full font-medium">
                              Failed
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-gray-400 mb-4 line-clamp-2">
                          {proj.description || 'No description provided.'}
                        </p>
                      </div>

                      <div className="border-t border-gray-800/80 pt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs text-gray-400">
                          <span>{proj.language || 'Code'}</span>
                          <span>{proj.filesCount} files • <strong className="text-blue-400">{proj.chunksCount || 0} vectors</strong></span>
                        </div>

                        {(!proj.chunksCount || proj.chunksCount === 0) && proj.status === 'completed' && (
                          <button
                            onClick={() => handleGenerateEmbeddings(proj._id)}
                            disabled={embeddingProjectId === proj._id}
                            className="w-full text-xs py-1.5 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-300 rounded font-medium transition-colors"
                          >
                            {embeddingProjectId === proj._id ? 'Generating Vectors...' : '⚡ Generate AI Embeddings'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Section 2: The AI Twin Recruiter Chat Box */}
                <div className="rounded-2xl border border-gray-800 bg-gray-900/60 shadow-2xl overflow-hidden">
                  
                  {/* Chat Header */}
                  <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/90 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img 
                          src={user.avatarUrl} 
                          alt="AI Twin" 
                          className="w-10 h-10 rounded-full border border-blue-500/40"
                        />
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-gray-900 rounded-full"></span>
                      </div>
                      <div>
                        <h3 className="font-bold text-white flex items-center gap-2">
                          <span>{user.name || user.username}'s AI Twin</span>
                          <span className="text-xs font-normal bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full">
                            RAG Powered
                          </span>
                        </h3>
                        <p className="text-xs text-gray-400">Simulate a technical interview! Ask about architecture, security, or implementation details.</p>
                      </div>
                    </div>
                  </div>

                  {/* Sample Question Chips */}
                  <div className="px-6 py-3 bg-gray-950/40 border-b border-gray-800/60 flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-gray-500">Try asking:</span>
                    {sampleQuestions.map((sq, i) => (
                      <button
                        key={i}
                        onClick={() => handleSendChatMessage(sq)}
                        disabled={isChatting}
                        className="text-xs px-3 py-1 rounded-full bg-gray-800/60 hover:bg-blue-500/20 border border-gray-700/60 hover:border-blue-500/40 text-gray-300 hover:text-blue-300 transition-colors text-left"
                      >
                        💡 {sq}
                      </button>
                    ))}
                  </div>

                  {/* Chat Messages Scroll Window */}
                  <div className="p-6 space-y-4 max-h-[460px] overflow-y-auto">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-xs flex-shrink-0">
                            🤖
                          </div>
                        )}

                        <div className={`max-w-2xl rounded-2xl p-4 text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-gray-800/80 text-gray-200 border border-gray-700/60 rounded-bl-none space-y-3'
                        }`}>
                          <div className="whitespace-pre-wrap">{msg.text}</div>

                          {/* Sources Cited */}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="pt-2 border-t border-gray-700/60">
                              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1">
                                <span>📚</span> Verified from Repository Code:
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {msg.sources.map((s, si) => (
                                  <span
                                    key={si}
                                    className="text-xs bg-gray-900 border border-gray-700 text-blue-300 px-2 py-0.5 rounded font-mono"
                                  >
                                    {s.filePath} ({s.projectName})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {isChatting && (
                      <div className="flex gap-3 justify-start items-center">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-xs flex-shrink-0 animate-pulse">
                          🤖
                        </div>
                        <div className="bg-gray-800/80 border border-gray-700/60 rounded-2xl rounded-bl-none px-4 py-3 text-xs text-gray-400 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                          <span>Searching code embeddings & formulating answer...</span>
                        </div>
                      </div>
                    )}

                    <div ref={chatBottomRef} />
                  </div>

                  {/* Chat Input Bar */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendChatMessage();
                    }}
                    className="p-4 border-t border-gray-800 bg-gray-900/90 flex gap-2"
                  >
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask Mohit's AI Twin anything about his projects or code..."
                      disabled={isChatting}
                      className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={isChatting || !chatInput.trim()}
                      className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-800 disabled:text-gray-500 text-white rounded-xl text-sm font-semibold transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)] cursor-pointer"
                    >
                      Ask Twin
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Section 3: Repository Selection */}
            <div>
              <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Select Repositories to Import</h2>
                  <p className="text-sm text-gray-400">Pick repositories from GitHub to feed into your AI twin.</p>
                </div>
                
                <button 
                  onClick={handleImport}
                  disabled={selectedRepos.size === 0 || isImporting}
                  className={`px-6 py-2.5 rounded-lg font-semibold transition-all ${
                    selectedRepos.size > 0 && !isImporting
                      ? 'bg-blue-500 hover:bg-blue-600 text-white cursor-pointer shadow-[0_0_15px_rgba(59,130,246,0.4)]' 
                      : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isImporting ? 'Starting Ingestion...' : `Import ${selectedRepos.size} Repositories`}
                </button>
              </div>

              {loadingRepos ? (
                <div className="text-center py-20 text-gray-400 animate-pulse">Fetching your GitHub repositories...</div>
              ) : repoError ? (
                <div className="text-center py-16 bg-gray-800/40 rounded-2xl border border-gray-800 p-8 max-w-md mx-auto">
                  <p className="text-red-400 mb-4">{repoError}</p>
                  <p className="text-gray-400 text-sm mb-6">Please re-login to give DevTwin permission to read your repositories.</p>
                  <button
                    onClick={handleLogin}
                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white font-medium transition-colors"
                  >
                    Authorize Repositories
                  </button>
                </div>
              ) : repos.length === 0 ? (
                <div className="text-center py-16 text-gray-500">No public repositories found on this GitHub account.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {repos.map(repo => {
                    const isSelected = selectedRepos.has(repo.githubRepoId);
                    const isAlreadyImported = importedProjects.some(p => p.githubRepoId === repo.githubRepoId);

                    return (
                      <div 
                        key={repo.githubRepoId} 
                        onClick={() => toggleRepoSelection(repo.githubRepoId)}
                        className={`p-6 rounded-xl border cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-blue-500 bg-blue-500/10' 
                            : isAlreadyImported
                            ? 'border-gray-800/60 bg-gray-900/40 opacity-80 hover:opacity-100 hover:border-gray-700'
                            : 'border-gray-800 bg-gray-800/30 hover:border-gray-700 hover:bg-gray-800/50'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="font-bold text-lg truncate pr-4">{repo.name}</h3>
                          <div className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border ${
                            isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-600'
                          }`}>
                            {isSelected && <span className="text-white text-xs">✓</span>}
                          </div>
                        </div>
                        
                        <p className="text-sm text-gray-400 mb-4 h-10 line-clamp-2">
                          {repo.description}
                        </p>
                        
                        <div className="flex items-center justify-between text-xs text-gray-500 font-medium">
                          <div className="flex items-center gap-4">
                            {repo.language && (
                              <div className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                                {repo.language}
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              ⭐ {repo.stars}
                            </div>
                          </div>
                          {isAlreadyImported && (
                            <span className="text-blue-400 font-medium">Imported</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

export default App;
