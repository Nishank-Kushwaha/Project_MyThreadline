// src/pages/Login.jsx
import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { DriftingBubbles } from "@/components/magicui/drifting-bubbles";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // login?error=google
  const urlParams = new URLSearchParams(window.location.search);
  const googleError = urlParams.get("error");

  useEffect(() => {
    if (googleError) {
      setError("Failed to sign in with Google. Please try again.");
    }
  }, [googleError]);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(form);
      navigate("/");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Couldn't sign you in. Check your details and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-secondary/30 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <DriftingBubbles />
        <div className="relative z-10 text-2xl font-extrabold tracking-tight">
          Threadline
        </div>
        <div className="relative z-10 max-w-sm">
          <p className="text-3xl font-bold leading-snug">
            Every conversation, kept on its own thread.
          </p>
          <p className="mt-4 text-muted-foreground">
            Message one friend or a whole group, and pick up right where you
            left off.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-sm border-0 bg-transparent shadow-none lg:border lg:bg-card lg:shadow-sm">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Sign in to keep the conversation going.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or{" "}
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button
              variant="outline"
              className="w-full"
              type="button"
              onClick={() =>
                (window.location.href = `${import.meta.env.VITE_API_URL}/auth/google`)
              }
            >
              Continue with Google
            </Button>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link
                to="/register"
                className="font-medium text-primary hover:underline"
              >
                Create an account
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
