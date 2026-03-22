import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import IdeaForgeLogo from "@/components/IdeaForgeLogo";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signIn();
      toast.success("Signed in with Google");
      navigate("/ideas");
    } catch (e) {
      console.error(e);
      toast.error("Google sign-in failed. Check your client ID and that popups are allowed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <IdeaForgeLogo className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
          <CardDescription>Sign in with your Google account to sync with Drive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" className="w-full" disabled={loading} onClick={handleGoogleSignIn}>
            {loading ? "Signing in…" : "Continue with Google"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
