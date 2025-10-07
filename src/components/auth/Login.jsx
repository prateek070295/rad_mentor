import React, { useEffect, useMemo, useState } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth } from "../../firebase";
import appLogo from "../../assets/images/logo 1.PNG";
import authConfig from "../../config/authConfig";

const MIN_PASSWORD_LENGTH = 6;

const maskEmail = (value = "") => {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.includes("@")) {
    return trimmed;
  }

  const [localPart, ...domainParts] = trimmed.split("@");
  const domain = domainParts.join("@");
  if (!domain) {
    return trimmed;
  }

  const safeLocal =
    localPart.length <= 2
      ? `${localPart.charAt(0) || ""}***`
      : `${localPart.charAt(0)}${"*".repeat(Math.max(1, localPart.length - 2))}${
          localPart.slice(-1) || ""
        }`;

  const segments = domain.split(".");
  if (segments.length < 2) {
    return `${safeLocal}@${domain.charAt(0) || ""}***`;
  }

  const tld = segments.pop();
  const domainBody = segments.join(".");
  const maskedDomain =
    domainBody.length <= 2
      ? `${domainBody.charAt(0) || ""}***`
      : `${domainBody.charAt(0)}${"*".repeat(Math.max(1, domainBody.length - 2))}${
          domainBody.slice(-1) || ""
        }`;

  return `${safeLocal}@${maskedDomain}.${tld}`;
};

const normalizeCooldown = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 45;
  }
  return Math.max(15, Math.round(numeric));
};

const Login = () => {
  const {
    enableSelfSignup = false,
    supportEmail = "admin@radmentor.app",
    passwordResetCooldownSeconds = 45,
  } = authConfig || {};
  const resetWindowSeconds = normalizeCooldown(passwordResetCooldownSeconds);

  const [mode, setMode] = useState("signin");
  const isSignup = enableSelfSignup && mode === "signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [fullNameTouched, setFullNameTouched] = useState(false);

  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);
  const [lastResetEmail, setLastResetEmail] = useState("");

  const emailTrimmed = email.trim();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  const isPasswordValid = password.length >= MIN_PASSWORD_LENGTH;
  const isFullNameValid = fullName.trim().length >= 2;
  const passwordsMatch = !isSignup || password === confirmPassword;

  const emailValidationMessage =
    emailTouched && !isEmailValid ? "Enter a valid email address." : "";
  const passwordValidationMessage =
    passwordTouched && !isPasswordValid
      ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      : "";
  const fullNameValidationMessage =
    isSignup && fullNameTouched && !isFullNameValid
      ? "Please enter your full name."
      : "";
  const confirmValidationMessage =
    isSignup && confirmTouched && !passwordsMatch
      ? "Passwords do not match."
      : "";

  const maskedResetEmail = useMemo(
    () => maskEmail(lastResetEmail || emailTrimmed),
    [lastResetEmail, emailTrimmed],
  );

  useEffect(() => {
    if (!enableSelfSignup && mode !== "signin") {
      setMode("signin");
    }
  }, [enableSelfSignup, mode]);

  useEffect(() => {
    if (emailTouched && isEmailValid) {
      setError((prev) =>
        prev && prev.toLowerCase().includes("email") ? "" : prev,
      );
    }
  }, [emailTouched, isEmailValid]);

  useEffect(() => {
    if (!resetCooldown) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setResetCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [resetCooldown]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setResetSent(false);

    setEmailTouched(true);
    setPasswordTouched(true);
    if (isSignup) {
      setFullNameTouched(true);
      setConfirmTouched(true);
    }

    const basicInvalid = !isEmailValid || !isPasswordValid;
    const signupInvalid =
      isSignup && (!isFullNameValid || !passwordsMatch);
    if (basicInvalid || signupInvalid) {
      setError("Please fix the highlighted fields before continuing.");
      return;
    }

    setLoading(true);
    try {
      if (!isSignup) {
        await signInWithEmailAndPassword(auth, emailTrimmed, password);
        setStatus("Welcome back! Redirecting...");
        return;
      }

      const credential = await createUserWithEmailAndPassword(
        auth,
        emailTrimmed,
        password,
      );

      if (credential?.user && fullName.trim()) {
        try {
          await updateProfile(credential.user, {
            displayName: fullName.trim(),
          });
        } catch (profileError) {
          console.warn("Unable to update profile name:", profileError);
        }
      }

      setStatus("Account created! You're all set.");
    } catch (err) {
      switch (err?.code) {
        case "auth/user-not-found":
          setError("No account found with that email.");
          break;
        case "auth/wrong-password":
          setError("Incorrect password. Please try again.");
          break;
        case "auth/invalid-email":
          setError("Please enter a valid email address.");
          break;
        case "auth/invalid-credential":
        case "auth/invalid-login-credentials":
          setError("That email and password combination is not recognised.");
          break;
        case "auth/email-already-in-use":
          setError("An account with this email already exists.");
          break;
        case "auth/too-many-requests":
          setError("Too many attempts. Please wait a moment and try again.");
          break;
        case "auth/network-request-failed":
          setError("We couldn't reach Rad Mentor. Check your connection and try again.");
          break;
        default:
          setError(err?.message || "Unable to sign in right now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError("");
    setStatus("");
    setResetSent(false);

    if (resetCooldown > 0) {
      setError(`Please wait ${resetCooldown} seconds before requesting another reset email.`);
      return;
    }

    if (!emailTrimmed) {
      setError("Enter your email above to receive a reset link.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, emailTrimmed);
      setLastResetEmail(emailTrimmed);
      setResetSent(true);
      setStatus(`Password reset email sent to ${maskEmail(emailTrimmed)}. Check your inbox (and spam).`);
      setResetCooldown(resetWindowSeconds);
    } catch (err) {
      switch (err?.code) {
        case "auth/user-not-found":
          setError("We couldn't find an account with that email.");
          break;
        case "auth/invalid-email":
          setError("Please enter a valid email address.");
          break;
        case "auth/too-many-requests":
          setError("You've requested too many reset emails. Please try again later.");
          setResetCooldown(Math.max(resetWindowSeconds, 60));
          break;
        case "auth/network-request-failed":
          setError("We couldn't reach Rad Mentor. Check your connection and try again.");
          break;
        default:
          setError(err?.message || "Unable to send reset email right now. Please try again.");
      }
    }
  };

  const handleModeToggle = () => {
    if (!enableSelfSignup) {
      return;
    }
    setMode((prev) => (prev === "signup" ? "signin" : "signup"));
    setError("");
    setStatus("");
    setResetSent(false);
    setFullNameTouched(false);
    setConfirmTouched(false);
  };

  const handleCapsLockChange = (event) => {
    setCapsLockOn(event.getModifierState("CapsLock"));
  };

  const supportLink = supportEmail ? `mailto:${supportEmail}` : "";

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
                  {isSignup ? "Create your account" : "Welcome back"}
                </h1>
                <p className="mt-2 text-sm text-gray-600">
                  {isSignup
                    ? "Use your work email to get started. You'll be signed in automatically once setup is complete."
                    : "Sign in with your Rad Mentor credentials."}
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
                  {isSignup && (
                    <div>
                      <label htmlFor="full-name" className="block text-sm font-medium text-gray-700">
                        Full name
                      </label>
                      <input
                        id="full-name"
                        name="full-name"
                        type="text"
                        autoComplete="name"
                        required
                        className={`mt-1 block w-full rounded-xl border px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm ${
                          fullNameValidationMessage ? "border-red-300" : "border-gray-300"
                        }`}
                        placeholder="Dr. Maya Rao"
                        value={fullName}
                        onChange={(event) => setFullName(event.target.value)}
                        onBlur={() => setFullNameTouched(true)}
                      />
                      {fullNameValidationMessage && (
                        <p className="mt-1 text-xs text-red-600">{fullNameValidationMessage}</p>
                      )}
                    </div>
                  )}

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
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      required
                      className={`mt-1 block w-full rounded-xl border px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm ${
                        passwordValidationMessage ? "border-red-300" : "border-gray-300"
                      }`}
                      placeholder={
                        isSignup
                          ? `Create a password (min. ${MIN_PASSWORD_LENGTH} characters)`
                          : "Enter your password"
                      }
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

                  {isSignup && (
                    <div>
                      <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
                        Confirm password
                      </label>
                      <input
                        id="confirm-password"
                        name="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        required
                        className={`mt-1 block w-full rounded-xl border px-3 py-2 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm ${
                          confirmValidationMessage ? "border-red-300" : "border-gray-300"
                        }`}
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        onBlur={() => setConfirmTouched(true)}
                      />
                      {confirmValidationMessage && (
                        <p className="mt-1 text-xs text-red-600">{confirmValidationMessage}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    className="text-sm font-medium text-blue-600 hover:text-blue-500 disabled:text-blue-300"
                    onClick={handleResetPassword}
                    disabled={loading || resetCooldown > 0}
                  >
                    Forgot password?
                  </button>
                  {resetSent && (
                    <span className="text-xs text-gray-500">
                      Reset link sent to {maskedResetEmail}.
                    </span>
                  )}
                  {!resetSent && resetCooldown > 0 && (
                    <span className="text-xs text-gray-400">
                      You can request another link in {resetCooldown}s.
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <button
                    type="submit"
                    className="flex w-full justify-center rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
                    disabled={loading}
                  >
                    {loading
                      ? isSignup
                        ? "Creating account..."
                        : "Signing in..."
                      : isSignup
                        ? "Create account"
                        : "Sign in"}
                  </button>

                  {enableSelfSignup && (
                    <p className="text-center text-xs text-gray-500">
                      {isSignup ? "Already have an account?" : "Need an account?"}{" "}
                      <button
                        type="button"
                        className="font-medium text-blue-600 transition hover:text-blue-500"
                        onClick={handleModeToggle}
                      >
                        {isSignup ? "Sign in instead" : "Request access"}
                      </button>
                    </p>
                  )}

                  <div className="flex items-center gap-3">
                    <span className="flex-1 border-t border-gray-200" />
                    <span className="text-xs uppercase tracking-wide text-gray-400">
                      or continue with
                    </span>
                    <span className="flex-1 border-t border-gray-200" />
                  </div>

                  <div className="grid gap-3">
                    <button
                      type="button"
                      className="flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-2 text-sm font-medium text-gray-600 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400"
                      disabled
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-base font-semibold text-blue-600">
                        G
                      </span>
                      <span>Google</span>
                    </button>
                  </div>
                </div>

                <p className="text-center text-xs text-gray-400">
                  {enableSelfSignup ? (
                    supportEmail ? (
                      <>
                        Questions? Reach us at{" "}
                        <a
                          href={supportLink}
                          className="font-medium text-blue-600 hover:text-blue-500"
                        >
                          {supportEmail}
                        </a>
                        .
                      </>
                    ) : (
                      "Questions? Reach out to your Rad Mentor admin."
                    )
                  ) : supportEmail ? (
                    <>
                      Access is invite only. Email{" "}
                      <a
                        href={supportLink}
                        className="font-medium text-blue-600 hover:text-blue-500"
                      >
                        {supportEmail}
                      </a>{" "}
                      to request an account.
                    </>
                  ) : (
                    "Access is invite only. Contact your Rad Mentor administrator to join."
                  )}
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
