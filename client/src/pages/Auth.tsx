import { useState } from "react";
import { AuthForm } from "@/components/AuthForm";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (email: string, password: string) => {
    // TODO: Implement actual authentication with Supabase
    console.log("Auth submitted:", { email, password, mode });
    
    toast({
      title: mode === "login" ? "Logged in successfully" : "Account created",
      description: `Welcome${mode === "signup" ? " to SupportBot" : " back"}!`,
    });
    
    // Redirect to dashboard
    setLocation("/dashboard");
  };

  return (
    <AuthForm
      mode={mode}
      onSubmit={handleSubmit}
      onToggleMode={() => setMode(mode === "login" ? "signup" : "login")}
    />
  );
}
