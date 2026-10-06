import { useState, useEffect } from 'react';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check if the URL has a ?token=... (we just got redirected from GitHub)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');

    if (tokenFromUrl) {
      // Save it to localStorage so we stay logged in
      localStorage.setItem('devtwin_token', tokenFromUrl);
      // Clean up the URL so it looks nice
      window.history.replaceState({}, document.title, '/');
    }

    // 2. Fetch the user's data using the token
    const fetchUser = async () => {
      const token = localStorage.getItem('devtwin_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('http://localhost:5000/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
        } else {
          // Token might be expired or invalid
          localStorage.removeItem('devtwin_token');
        }
      } catch (error) {
        console.error('Failed to fetch user', error);
      }
      setLoading(false);
    };

    fetchUser();
  }, []);

  const handleLogin = () => {
    // Redirect the user to our backend route which starts the GitHub flow
    window.location.href = 'http://localhost:5000/api/auth/github';
  };

  const handleLogout = () => {
    localStorage.removeItem('devtwin_token');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <h1 className="text-2xl">Loading...</h1>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
      {!user ? (
        <div className="text-center">
          <h1 className="text-5xl font-bold text-blue-400 mb-8">DevTwin</h1>
          <p className="mb-6 text-gray-400">Connect your GitHub to build your AI portfolio.</p>
          <button 
            onClick={handleLogin}
            className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            Continue with GitHub
          </button>
        </div>
      ) : (
        <div className="text-center flex flex-col items-center">
          <img 
            src={user.avatarUrl} 
            alt="Profile" 
            className="w-24 h-24 rounded-full border-4 border-blue-400 mb-4"
          />
          <h1 className="text-3xl font-bold mb-2">Welcome, {user.name}!</h1>
          <p className="text-gray-400 mb-8">@{user.username}</p>
          <button 
            onClick={handleLogout}
            className="px-6 py-2 border border-red-500 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export default App;