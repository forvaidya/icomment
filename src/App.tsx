import React, { useState, useEffect } from 'react';

interface User {
  id: string;
  username: string;
  type: 'local' | 'auth0';
  is_admin: boolean;
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/user');
        if (response.ok) {
          const userData = await response.json();
          setUser(userData.data);
        } else if (response.status === 401) {
          // Not authenticated - will trigger login flow
          console.log('User not authenticated');
        } else {
          throw new Error('Failed to fetch user');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  if (loading) {
    return (
      <div className="icomment-container">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-pulse mb-4">
              <svg className="w-16 h-16 mx-auto" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <g id="petals">
                  <ellipse cx="100" cy="40" rx="18" ry="35" fill="#a855f7" transform="rotate(0 100 100)" />
                  <ellipse cx="100" cy="40" rx="18" ry="35" fill="#a855f7" transform="rotate(72 100 100)" />
                  <ellipse cx="100" cy="40" rx="18" ry="35" fill="#a855f7" transform="rotate(144 100 100)" />
                  <ellipse cx="100" cy="40" rx="18" ry="35" fill="#9945e6" transform="rotate(216 100 100)" />
                  <ellipse cx="100" cy="40" rx="18" ry="35" fill="#9945e6" transform="rotate(288 100 100)" />
                </g>
                <circle cx="100" cy="100" r="22" fill="#fbbf24" />
                <circle cx="100" cy="100" r="15" fill="#f59e0b" />
              </svg>
            </div>
            <p className="text-gray-600 text-lg">Loading Guru...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="icomment-container">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-red-600 text-lg">Error: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="icomment-container min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      <header className="bg-white shadow-sm border-b border-purple-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-8 h-8 mr-3" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                <g id="petals">
                  <ellipse cx="100" cy="40" rx="18" ry="35" fill="#a855f7" transform="rotate(0 100 100)" />
                  <ellipse cx="100" cy="40" rx="18" ry="35" fill="#a855f7" transform="rotate(72 100 100)" />
                  <ellipse cx="100" cy="40" rx="18" ry="35" fill="#a855f7" transform="rotate(144 100 100)" />
                  <ellipse cx="100" cy="40" rx="18" ry="35" fill="#9945e6" transform="rotate(216 100 100)" />
                  <ellipse cx="100" cy="40" rx="18" ry="35" fill="#9945e6" transform="rotate(288 100 100)" />
                </g>
                <circle cx="100" cy="100" r="22" fill="#fbbf24" />
                <circle cx="100" cy="100" r="15" fill="#f59e0b" />
              </svg>
              <h1 className="text-2xl font-bold text-gray-900">Guru</h1>
            </div>
            {user && (
              <div className="text-right">
                <p className="text-sm text-gray-600">Logged in as</p>
                <p className="font-semibold text-gray-900">
                  {user.username}
                  {user.is_admin && <span className="ml-2 text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Admin</span>}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome to Guru</h2>
          <p className="text-lg text-gray-600 mb-8">
            A self-hosted, private commenting system for open dialogue and community wisdom
          </p>
          {!user ? (
            <button
              onClick={() => (window.location.href = '/api/auth/login')}
              className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition"
            >
              Sign In
            </button>
          ) : (
            <p className="text-green-600 font-semibold">✓ Ready to discuss</p>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
