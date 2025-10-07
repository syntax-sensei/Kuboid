import { Switch, Route, Redirect } from "wouter";
import type { ComponentType } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Documents from "@/pages/Documents";
import Widget from "@/pages/Widget";
import Analytics from "@/pages/Analytics";
import Integrations from "@/pages/Integrations";

function DashboardLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between px-6 py-3 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/documents" component={Documents} />
              <Route path="/widget" component={Widget} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/integrations" component={Integrations} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function withAuthGuard<T extends object>(Component: ComponentType<T>) {
  return function GuardedComponent(props: T) {
    const { session, loading } = useAuth();

    if (loading) {
      return (
        <div className="flex h-screen items-center justify-center text-muted-foreground">
          Loading...
        </div>
      );
    }

    if (!session) {
      return <Redirect to="/auth" />;
    }

    return <Component {...props} />;
  };
}

const GuardedDashboardLayout = withAuthGuard(DashboardLayout);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Switch>
              <Route path="/auth" component={Auth} />
              <Route path="/dashboard" component={GuardedDashboardLayout} />
              <Route path="/documents" component={GuardedDashboardLayout} />
              <Route path="/widget" component={GuardedDashboardLayout} />
              <Route path="/analytics" component={GuardedDashboardLayout} />
              <Route path="/integrations" component={GuardedDashboardLayout} />
              <Route path="/">
                <Redirect to="/auth" />
              </Route>
            </Switch>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
