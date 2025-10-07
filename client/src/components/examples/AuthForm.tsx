import { useState } from "react";
import { AuthForm } from "../AuthForm";

export default function AuthFormExample() {
  const [mode, setMode] = useState<"login" | "signup">("login");

  return (
    <AuthForm
      mode={mode}
      onSubmit={(email, password) => {
        console.log("Auth submitted:", { email, password, mode });
      }}
      onToggleMode={() => setMode(mode === "login" ? "signup" : "login")}
    />
  );
}
