import * as React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Lock, Shield, ArrowRight } from "lucide-react";
import { PDCPButton } from "@/components/pdcp/PDCPButton";
import { PDCPInput, PasswordInput, FormField } from "@/components/pdcp/FormControls";

export default function LoginPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      navigate("/");
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-primary/5 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-primary/3 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--text-primary)) 1px, transparent 1px),
                           linear-gradient(90deg, hsl(var(--text-primary)) 1px, transparent 1px)`,
          backgroundSize: "50px 50px"
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo and header */}
        <div className="text-center mb-8">
          <motion.div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-primary mb-4"
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <span className="text-accent-primary-foreground font-bold text-2xl">P</span>
          </motion.div>
          <motion.h1
            className="text-2xl font-bold text-text-primary mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Welcome to PDCP
          </motion.h1>
          <motion.p
            className="text-text-muted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            Portable Deployment Control Panel
          </motion.p>
        </div>

        {/* Login card */}
        <motion.div
          className="bg-panel border border-panel-border rounded-2xl p-6 shadow-elevated"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <form onSubmit={handleLogin} className="space-y-4">
            <FormField label="Username or Email">
              <PDCPInput
                type="text"
                placeholder="admin@pdcp.local"
                icon={<Lock className="w-4 h-4" />}
                defaultValue="admin@pdcp.local"
              />
            </FormField>

            <FormField label="Password">
              <PasswordInput
                placeholder="Enter your password"
                defaultValue="••••••••"
              />
            </FormField>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
                <input type="checkbox" className="rounded border-panel-border" defaultChecked />
                Remember me
              </label>
              <a href="#" className="text-accent-primary hover:underline">
                Forgot password?
              </a>
            </div>

            <PDCPButton
              type="submit"
              className="w-full"
              loading={isLoading}
            >
              {!isLoading && (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </PDCPButton>
          </form>

          {/* Security badge */}
          <motion.div
            className="mt-6 flex items-center justify-center gap-2 text-xs text-text-muted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <Shield className="w-3.5 h-3.5 text-accent-primary" />
            <span>Secured connection · TLS 1.3</span>
          </motion.div>
        </motion.div>

        {/* Footer */}
        <motion.p
          className="text-center text-xs text-text-muted mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          PDCP v2.0.0 · Running locally
        </motion.p>
      </motion.div>
    </div>
  );
}
