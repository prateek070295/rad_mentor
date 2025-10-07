import React, { useState } from "react";
import { sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { auth } from "../firebase";

const AccountSettings = ({ user, onProfileUpdated }) => {
  const currentUser = user || auth.currentUser;
  const [displayName, setDisplayName] = useState(
    currentUser?.displayName || "",
  );
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetSuccess, setResetSuccess] = useState("");

  if (!currentUser) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800">Account</h2>
        <p className="mt-3 text-sm text-gray-600">
          You need to be signed in to manage your account.
        </p>
      </div>
    );
  }

  const email = currentUser.email || "";

  const handleProfileSave = async (event) => {
    event.preventDefault();
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError("Display name cannot be empty.");
      return;
    }
    if (trimmedName === currentUser.displayName) {
      setStatus("You're already using this name.");
      setError("");
      return;
    }
    setSaving(true);
    setStatus("");
    setError("");
    try {
      await updateProfile(currentUser, { displayName: trimmedName });
      setStatus("Display name updated successfully.");
      setResetSuccess("");
      onProfileUpdated?.(trimmedName);
    } catch (profileError) {
      setError(
        profileError?.message ||
          "Unable to update your display name right now. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setError("We do not have an email on file for your account.");
      return;
    }
    setSaving(true);
    setStatus("");
    setError("");
    setResetSuccess("");
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSuccess(`Password reset email sent to ${email}.`);
    } catch (resetError) {
      setError(
        resetError?.message ||
          "Unable to send password reset email right now. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-800">Account details</h2>
        <p className="mt-2 text-sm text-gray-500">
          Update your name or request a password reset from here.
        </p>
        <form className="mt-5 space-y-4" onSubmit={handleProfileSave}>
          <div>
            <label
              htmlFor="account-display-name"
              className="block text-sm font-medium text-gray-700"
            >
              Display name
            </label>
            <input
              id="account-display-name"
              name="account-display-name"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <p className="mt-1 text-sm text-gray-600">{email}</p>
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          {status && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {status}
            </div>
          )}
          {resetSuccess && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              {resetSuccess}
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-blue-100 disabled:text-blue-300"
              onClick={handlePasswordReset}
              disabled={saving}
            >
              Send password reset email
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AccountSettings;
