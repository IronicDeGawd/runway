import * as React from "react";
import { api } from "@/lib/api";

interface LoginResult {
  mustResetPassword: boolean;
}

interface AuthContextType {
  isAuthenticated: boolean;
  mustResetPassword: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  clearMustResetPassword: () => void;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = React.useState(() => {
    return localStorage.getItem("token") !== null;
  });
  const [mustResetPassword, setMustResetPassword] = React.useState(() => {
    return localStorage.getItem("mustResetPassword") === "true";
  });

  const login = async (username: string, password: string): Promise<LoginResult> => {
    try {
      const response = await api.post("/auth/login", { username, password });
      if (response.data.success) {
        localStorage.setItem("token", response.data.token);
        const needsReset = response.data.mustResetPassword ?? false;
        if (needsReset) {
          localStorage.setItem("mustResetPassword", "true");
        }
        setMustResetPassword(needsReset);
        setIsAuthenticated(true);
        return { mustResetPassword: needsReset };
      } else {
        throw new Error("Invalid credentials");
      }
    } catch (error) {
      throw new Error("Authentication failed");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("mustResetPassword");
    setIsAuthenticated(false);
    setMustResetPassword(false);
  };

  const clearMustResetPassword = () => {
    localStorage.removeItem("mustResetPassword");
    setMustResetPassword(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, mustResetPassword, login, logout, clearMustResetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
