import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Documents from "@/pages/Documents";
import Widget from "@/pages/Widget";
import Analytics from "@/pages/Analytics";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={Auth} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/documents" component={Documents} />
      <Route path="/widget" component={Widget} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/">
        <Redirect to="/auth" />
      </Route>
    </Switch>
  );
}

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
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Switch>
            <Route path="/auth" component={Auth} />
            <Route path="/dashboard" component={DashboardLayout} />
            <Route path="/documents" component={DashboardLayout} />
            <Route path="/widget" component={DashboardLayout} />
            <Route path="/analytics" component={DashboardLayout} />
            <Route path="/">
              <Redirect to="/auth" />
            </Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
