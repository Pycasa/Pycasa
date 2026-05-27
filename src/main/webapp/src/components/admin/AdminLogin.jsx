
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, User, AlertCircle, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';

const AdminLogin = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const data = await api.auth.login(username, password);

      if (data.user) {
        onLoginSuccess();
      } else {
        throw new Error('Login failed - no user returned');
      }
    } catch (err) {
      console.error('Login failed:', err.message);
      setError(err.message || 'Invalid login credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F1ED] dark:bg-[hsl(220,15%,10%)] px-4 font-sans">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 border border-gray-100 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-2">
            <img
              src="/site-images/pycasa-logo.png"
              alt="Pycasa Logo"
              className="h-20 w-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Sign In</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1 text-xs">Contact your administrator to get access if you don't have an account.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-lg text-sm flex items-start animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <User className="absolute left-3 top-3 w-4 h-4 text-gray-400 dark:text-slate-500" />
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-10"
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400 dark:text-slate-500" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 focus:outline-none transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary-dark text-white h-11 font-medium transition-all"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Authenticating...
              </>
            ) : 'Login'}
          </Button>

          <div className="text-center pt-2">
            <p className="text-xs text-gray-400 dark:text-slate-500 flex items-center justify-center gap-1">
              <ShieldCheck className="w-4 h-4" /> Secured by Pycasa Protect
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
