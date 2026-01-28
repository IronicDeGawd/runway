import * as React from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { Home } from "lucide-react";

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();

  React.useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Grid Pattern */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgb(82 82 91) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(82 82 91) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px'
        }}
      />

      {/* Animated Blobs */}
      <div className="absolute top-20 left-20 w-64 h-64 bg-neon/20 rounded-full blur-3xl animate-blob" />
      <div className="absolute bottom-20 right-20 w-80 h-80 bg-neon/10 rounded-full blur-3xl animate-blob animation-delay-2000" />

      <motion.div
        className="text-center z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="bg-panel rounded-panel p-12 max-w-lg">
          <motion.h1 
            className="text-9xl font-light text-neon mb-4"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            404
          </motion.h1>
          <h2 className="text-3xl font-semibold text-panel-foreground mb-4">Page Not Found</h2>
          <p className="text-zinc-600 mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-pill bg-neon text-primary-foreground hover:bg-neon/90 transition-all"
          >
            <Home className="w-5 h-5" />
            Return Home
          </button>
        </div>
      </motion.div>
    </div>
  );
}
