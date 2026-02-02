import * as React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { KeyRound, Eye, EyeOff, ShieldCheck, AlertCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { logout, clearMustResetPassword } = useAuth();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showCurrentPassword, setShowCurrentPassword] = React.useState(false);
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState(false);

  const passwordsMatch = newPassword === confirmPassword;
  const isPasswordValid = newPassword.length >= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!passwordsMatch) {
      setError("New passwords do not match");
      return;
    }

    if (!isPasswordValid) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.post("/auth/reset-password", {
        currentPassword,
        newPassword,
      });

      if (response.data.success) {
        // Update token with new one
        localStorage.setItem("token", response.data.token);
        // Clear the must reset password flag
        clearMustResetPassword();
        setSuccess(true);

        // Redirect to dashboard after short delay
        setTimeout(() => {
          navigate("/");
        }, 2000);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to reset password";
      const axiosError = err as { response?: { data?: { error?: string } } };
      setError(axiosError.response?.data?.error || errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated Blobs */}
        <div className="absolute top-20 left-20 w-64 h-64 bg-neon/20 rounded-full blur-3xl animate-blob" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-neon/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

        <motion.div
          className="relative z-10 w-full max-w-md"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="bg-panel rounded-panel p-8 shadow-2xl text-center">
            <motion.div
              className="inline-flex items-center justify-center w-16 h-16 rounded-pill bg-neon mb-4"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
            >
              <ShieldCheck className="w-8 h-8 text-primary-foreground" />
            </motion.div>
            <h1 className="text-3xl font-light text-panel-foreground mb-2">Password Updated</h1>
            <p className="text-zinc-600 mb-4">Your password has been reset successfully.</p>
            <p className="text-sm text-zinc-500">Redirecting to dashboard...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Blobs */}
      <div className="absolute top-20 left-20 w-64 h-64 bg-neon/20 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-neon/10 rounded-full blur-3xl animate-blob animation-delay-2000" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-neon/5 rounded-full blur-3xl animate-blob animation-delay-4000" />

      {/* Reset Password Card */}
      <motion.div
        className="relative z-10 w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-panel rounded-panel p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              className="inline-flex items-center justify-center w-16 h-16 rounded-pill bg-neon mb-4"
              whileHover={{ scale: 1.05 }}
            >
              <KeyRound className="w-8 h-8 text-primary-foreground" />
            </motion.div>
            <h1 className="text-3xl font-light text-panel-foreground mb-2">Reset Password</h1>
            <p className="text-zinc-600">Please set a new secure password to continue</p>
          </div>

          {/* Security Notice */}
          <motion.div
            className="mb-6 p-4 rounded-element bg-amber-50 border border-amber-200"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Security Notice</p>
                <p className="mt-1">You're using the default password. Please change it to secure your account.</p>
              </div>
            </div>
          </motion.div>

          {/* Reset Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <motion.div
                className="p-3 rounded-element bg-red-50 border border-red-200 text-red-700 text-sm"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.div>
            )}

            {/* Current Password */}
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-zinc-700 mb-2">
                Current Password
              </label>
              <div className="relative">
                <input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-4 py-3 pr-12 rounded-element bg-zinc-50 border border-zinc-200 text-panel-foreground placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-zinc-500 hover:text-zinc-700"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-zinc-700 mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min. 6 characters)"
                  className={cn(
                    "w-full px-4 py-3 pr-12 rounded-element bg-zinc-50 border text-panel-foreground placeholder:text-zinc-400 focus:outline-none transition-colors",
                    newPassword && !isPasswordValid
                      ? "border-red-300 focus:border-red-400"
                      : "border-zinc-200 focus:border-zinc-400"
                  )}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-zinc-500 hover:text-zinc-700"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {newPassword && !isPasswordValid && (
                <p className="mt-1 text-xs text-red-600">Password must be at least 6 characters</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-700 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className={cn(
                    "w-full px-4 py-3 pr-12 rounded-element bg-zinc-50 border text-panel-foreground placeholder:text-zinc-400 focus:outline-none transition-colors",
                    confirmPassword && !passwordsMatch
                      ? "border-red-300 focus:border-red-400"
                      : "border-zinc-200 focus:border-zinc-400"
                  )}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-zinc-500 hover:text-zinc-700"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
              )}
            </div>

            <motion.button
              type="submit"
              disabled={isLoading || !passwordsMatch || !isPasswordValid}
              className={cn(
                "w-full py-3 px-6 rounded-pill font-medium transition-all flex items-center justify-center gap-2",
                isLoading || !passwordsMatch || !isPasswordValid
                  ? "bg-zinc-300 text-zinc-500 cursor-not-allowed"
                  : "bg-neon text-primary-foreground hover:bg-neon/90"
              )}
              whileHover={!isLoading && passwordsMatch && isPasswordValid ? { scale: 1.02 } : {}}
              whileTap={!isLoading && passwordsMatch && isPasswordValid ? { scale: 0.98 } : {}}
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-pill animate-spin" />
                  Updating Password...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5" />
                  Update Password
                </>
              )}
            </motion.button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-zinc-200 text-center">
            <button
              onClick={handleLogout}
              className="text-sm text-zinc-600 hover:text-panel-foreground transition-colors"
            >
              Sign out and use a different account
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
