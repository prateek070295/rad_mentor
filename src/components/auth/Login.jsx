import React, { useEffect, useState } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../../firebase";
import appLogo from "../../assets/images/logo 1.PNG";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const emailTrimmed = email.trim();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  const isPasswordValid = password.length >= 6;

  const emailValidationMessage =
    emailTouched && !isEmailValid ? "Enter a valid email address." : "";
  const passwordValidationMessage =
    passwordTouched && !isPasswordValid
      ? "Password must be at least 6 characters."
      : "";

  useEffect(() => {
    if (emailTouched && isEmailValid) {
      setError((prev) => (prev && prev.toLowerCase().includes("email") ? "" : prev));
    }
  }, [emailTouched, isEmailValid]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setResetSent(false);
    setEmailTouched(true);
    setPasswordTouched(true);

    if (!isEmailValid || !isPasswordValid) {
      setError("Please fix the highlighted fields before continuing.");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, emailTrimmed, password);
      setStatus("Welcome back! Redirecting...");
    } catch (err) {
      switch (err.code) {
        case "auth/user-not-found":
          setError("No account found with that email.");
          break;
        case "auth/wrong-password":
          setError("Incorrect password. Please try again.");
          break;
        case "auth/invalid-email":
          setError("Please enter a valid email address.");
          break;
        case "auth/too-many-requests":
          setError("Too many attempts. Please wait a moment and try again.");
          break;
        default:
          setError("Unable to sign in right now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError("");
    setStatus("");
    setResetSent(false);

    if (!emailTrimmed) {
      setError("Enter your email above to receive a reset link.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, emailTrimmed);
      setResetSent(true);
      setStatus("Password reset email sent. Check your inbox.");
    } catch (err) {
      switch (err.code) {
        case "auth/user-not-found":
          setError("We couldn't find an account with that email.");
          break;
        case "auth/invalid-email":
          setError("Please enter a valid email address.");
          break;
        default:
          setError("Unable to send reset email right now. Please try again.");
      }
    }
  };

  const handleCapsLockChange = (event) => {
    setCapsLockOn(event.getModifierState("CapsLock"));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 rounded-3xl bg-white/80 shadow-2xl backdrop-blur lg:grid-cols-2">
          <div className="relative hidden rounded-l-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-white/10" />
              <div className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-white/10" />
            </div>
            <div className="relative z-10 space-y-6">
              <img src={appLogo} alt="Rad Mentor" className="h-12 w-12" />
              <h2 className="text-3xl font-semibold leading-tight">
                Your Radiology Companion
              </h2>
              <p className="text-sm text-blue-100">
                Build structured study plans, keep your progress synced across devices, and learn with AI-powered tutoring designed for radiology residents.
              </p>
            </div>
            <div className="relative z-10 mt-12 text-sm text-blue-100">
              <p className="font-medium uppercase tracking-widest">Trusted by residents worldwide</p>
            </div>
          </div>

          <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
            <div className="mx-auto w-full max-w-md space-y-8">
              <div className="text-center lg:hidden">
                <img className="mx-auto h-12 w-12" src={appLogo} alt="Rad Mentor logo" />
                <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
                  Welcome back
                </h1>
                <p className="mt-2 text-sm text-gray-600">
                  Sign in with your Rad Mentor credentials.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              {status && !error && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {status}
                </div>
              )}

              <form className="space-y-6" onSubmit={handleSubmit} noValidate>
                <div className="space-y-5">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                      Email address
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      className={`mt-1 block w-full rounded-xl border px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm ${
                        emailValidationMessage ? "border-red-300" : "border-gray-300"
                      }`}
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      onBlur={() => setEmailTouched(true)}
                    />
                    {emailValidationMessage && (
                      <p className="mt-1 text-xs text-red-600">{emailValidationMessage}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      className={`mt-1 block w-full rounded-xl border px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm ${
                        passwordValidationMessage ? "border-red-300" : "border-gray-300"
                      }`}
                      placeholder="••••••••"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onBlur={() => setPasswordTouched(true)}
                      onKeyDown={handleCapsLockChange}
                      onKeyUp={handleCapsLockChange}
                    />
                    {passwordValidationMessage && (
                      <p className="mt-1 text-xs text-red-600">{passwordValidationMessage}</p>
                    )}
                    {capsLockOn && (
                      <p className="mt-1 text-xs font-semibold text-amber-600">Caps Lock is on.</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    className="text-sm font-medium text-blue-600 hover:text-blue-500"
                    onClick={handleResetPassword}
                  >
                    Forgot password?
                  </button>
                  {resetSent && <span className="text-xs text-gray-500">Reset email sent.</span>}
                </div>

                <div className="space-y-3">
                  <button
                    type="submit"
                    className="flex w-full justify-center rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
                    disabled={loading}
                  >
                    {loading ? "Signing in..." : "Sign in"}
                  </button>

                  <div className="flex items-center gap-3">
                    <span className="flex-1 border-t border-gray-200" />
                    <span className="text-xs uppercase tracking-wide text-gray-400">
                      or continue with
                    </span>
                    <span className="flex-1 border-t border-gray-200" />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2 text-sm font-medium text-gray-600 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400"
                      disabled
                    >
                      <span role="img" aria-label="Google">🔒</span>
                      Google
                    </button>
                    <button
                      type="button"
                      className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2 text-sm font-medium text-gray-600 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400"
                      disabled
                    >
                      <span role="img" aria-label="GitHub">🔒</span>
                      GitHub
                    </button>
                  </div>
                </div>

                <p className="text-center text-xs text-gray-400">
                  Need access? Contact the administrator to create your account.
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
