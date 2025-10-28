import { useState } from "react";
import { AuthForm } from "@/components/AuthForm";
import { Redirect, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { session, loading } = useAuth();

  const handleSubmit = async (email: string, password: string) => {
    try {
      setIsLoading(true);

      let shouldRedirect = false;

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        toast({
          title: "Logged in successfully",
          description: "Welcome back to SupportBot!",
        });

        shouldRedirect = true;
      } else {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        const needsEmailConfirmation = !data.session;

        toast({
          title: "Account created",
          description: needsEmailConfirmation
            ? "Check your email to confirm your account."
            : "Welcome to SupportBot!",
        });

        shouldRedirect = !needsEmailConfirmation;
      }

      if (shouldRedirect) {
        setLocation("/documents");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Authentication failed";

      toast({
        title: "Uh oh!",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (session) {
    return <Redirect to="/documents" />;
  }

  return (
    <AuthForm
      mode={mode}
      onSubmit={handleSubmit}
      onToggleMode={() => setMode(mode === "login" ? "signup" : "login")}
      isLoading={isLoading}
    />
  );
}
