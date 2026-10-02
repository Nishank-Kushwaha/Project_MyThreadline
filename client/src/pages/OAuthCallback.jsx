import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setAccessToken } from "@/api/axios";
import { meRequest } from "@/api/authApi";
import { useAuth } from "@/context/AuthContext";

export default function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { updateUser } = useAuth();

  useEffect(() => {
    (async () => {
      const token = params.get("accessToken");
      if (!token) {
        navigate("/login?error=google");
        return;
      }
      setAccessToken(token);
      try {
        const { data } = await meRequest();
        updateUser(data.user);
        navigate("/");
      } catch {
        navigate("/login?error=google");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen items-center justify-center text-muted-foreground text-sm">
      Finishing sign-in…
    </div>
  );
}
