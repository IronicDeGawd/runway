import * as React from "react";
import { api } from "@/lib/api";

interface AuthContextType {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = React.useState(() => {
    return localStorage.getItem("token") !== null;
  });

  const login = async (username: string, password: string) => {
    try {
      const response = await api.post("/auth/login", { username, password });
      if (response.data.success) {
        localStorage.setItem("token", response.data.token);
        setIsAuthenticated(true);
      } else {
        throw new Error("Invalid credentials");
      }
    } catch (error) {
      throw new Error("Authentication failed");
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
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
