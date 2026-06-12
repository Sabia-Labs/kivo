"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GalleryVerticalEnd, Loader2, Apple, Code } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { useAuth, API_BASE } from "@/lib/auth";
import { apiErrorMessage } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";



function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-5">
      <circle cx="12" cy="12" r="11" fill="#FFFFFF" />
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path d="M11.4 2H2v9.4h9.4V2z" fill="#F25022" />
      <path d="M22 2h-9.4v9.4H22V2z" fill="#7FBA00" />
      <path d="M11.4 12.6H2V22h9.4v-9.4z" fill="#00A4EF" />
      <path d="M22 12.6h-9.4V22H22v-9.4z" fill="#FFB900" />
    </svg>
  );
}

function WeChatIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-5" fill="currentColor">
      <path d="M8.5,14.3c-0.2,0-0.4,0-0.6,0c-0.1,0.5-0.2,1.1-0.2,1.6c0,2.6,2.6,4.7,5.8,4.7c0.4,0,0.8,0,1.2-0.1l1.7,1c0.1,0.1,0.3,0,0.2-0.1l-0.4-1.3c1.5-1,2.4-2.5,2.4-4.2c0-2.6-2.6-4.7-5.8-4.7C9.7,11.2,8.5,12.6,8.5,14.3z M11.9,13.7c-0.3,0-0.5-0.2-0.5-0.5c0-0.3,0.2-0.5,0.5-0.5c0.3,0,0.5,0.2,0.5,0.5C12.4,13.5,12.2,13.7,11.9,13.7z M15.2,13.7c-0.3,0-0.5-0.2-0.5-0.5c0-0.3,0.2-0.5,0.5-0.5s0.5,0.2,0.5,0.5C15.7,13.5,15.5,13.7,15.2,13.7z M11.1,10.6c3.6,0,6.5,2.4,6.5,5.4c0,0.3,0,0.5-0.1,0.8c2.1-0.9,3.5-2.6,3.5-4.6c0-3.1-3-5.6-6.7-5.6c-0.4,0-0.7,0-1.1,0.1c0,0,0,0,0,0C12.4,8.2,11.1,8.3,9.5,8.3c-1.6,0-3-0.2-3-0.2s0,0,0,0C6.2,8.2,5.8,8.2,5.4,8.2c-3.7,0-6.7,2.5-6.7,5.6c0,2.1,1.4,3.9,3.6,4.8l-0.5,1.5c-0.1,0.2,0.1,0.3,0.2,0.2l2-1.1c0.5,0.1,1,0.1,1.4,0.1c0.1-0.5,0.3-1,0.5-1.5C4.2,16.5,2.7,15,2.7,13.8c0-2.2,2.4-3.9,5.3-3.9C9,9.9,10,10.6,11.1,10.6z M5.5,11.2c-0.3,0-0.6-0.2-0.6-0.6c0-0.3,0.3-0.6,0.6-0.6s0.6,0.3,0.6,0.6C6.1,11,5.8,11.2,5.5,11.2z M9.3,11.2c-0.3,0-0.6-0.2-0.6-0.6c0-0.3,0.3-0.6,0.6-0.6s0.6,0.3,0.6,0.6C9.9,11,9.6,11.2,9.3,11.2z"/>
    </svg>
  )
}

export default function LoginPage() {
  const { login } = useAuth();
  const { lang, t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(apiErrorMessage(data.error, t.login.failedSendCode));
        return;
      }
      
      toast.success(t.login.sentCode + " " + email);
      setStep(2);
    } catch {
      toast.error("Network error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 4) return;
    
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(apiErrorMessage(data.error, t.login.invalidCode));
        return;
      }

      login(data.data.token, data.data.user, data.data.teamId ?? null);
      toast.success(t.login.welcomeBack);
      const dest = data.data.teamId ? `/teams` : `/newteam`;
      router.push(dest);

    } catch {
      toast.error("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/dev-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(apiErrorMessage(data.error, "Dev login failed"));
        return;
      }
      login(data.data.token, data.data.user, data.data.teamId ?? null);
      toast.success("Dev login successful!");
      const dest = data.data.teamId ? `/teams` : `/newteam`;
      router.push(dest);
    } catch {
      toast.error("Network error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSSO = () => {
    toast.info("SSO Login coming soon");
  };

  const handleGoogleSSO = () => {
    window.location.href = `${API_BASE}/auth/google`;
  };

  const isDevMode = 
    process.env.NODE_ENV === "development" || 
    process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className={cn("flex flex-col gap-6")}>
          <form onSubmit={step === 1 ? handleEmailSubmit : handleOtpSubmit}>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <a href="/" className="flex flex-col items-center gap-2 font-medium">
                  <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <GalleryVerticalEnd className="size-5" />
                  </div>
                  <span className="sr-only">Kivo</span>
                </a>
                
                {step === 1 && (
                  <>
                    <h1 className="text-xl font-bold">{t.login.title}</h1>
                    <FieldDescription>
                      {t.login.noAccount} <Link href="/signup" className="hover:text-primary underline underline-offset-4">{t.login.signUp}</Link>
                    </FieldDescription>
                  </>
                )}
                
                {step === 2 && (
                  <>
                    <h1 className="text-xl font-bold">{t.login.checkEmail}</h1>
                    <FieldDescription>
                      {t.login.sentCode} <span className="font-medium text-foreground">{email}</span>.
                    </FieldDescription>
                  </>
                )}
              </div>

              {step === 1 && (
                <>
                  <Field>
                    <FieldLabel htmlFor="email">{t.login.emailLabel}</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t.login.emailPlaceholder}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </Field>
                  
                  <Field>
                    <Button type="submit" disabled={isLoading}>
                      {isLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      {t.login.continueWithEmail}
                    </Button>
                  </Field>

                  {isDevMode && (
                    <Field className="mt-2">
                      <Button type="button" variant="secondary" onClick={handleDevLogin} disabled={isLoading}>
                        <Code className="mr-2 size-4" /> {t.login.devLogin} (wei.chen)
                      </Button>
                    </Field>
                  )}

                  <FieldSeparator>{t.login.orContinueWith}</FieldSeparator>
                  
                  <Field className="grid gap-3">
                    <Button variant="outline" type="button" className="w-full font-medium" onClick={handleGoogleSSO}>
                      <GoogleIcon /> {t.login.google}
                    </Button>
                    <div className="grid grid-cols-3 gap-3">
                      <Button variant="outline" type="button" onClick={handleSSO} className="px-2 text-xs sm:text-sm">
                        <Apple className="size-5" /> Apple
                      </Button>
                      <Button variant="outline" type="button" onClick={handleSSO} className="px-2 text-xs sm:text-sm">
                        <MicrosoftIcon /> Microsoft
                      </Button>
                      <Button variant="outline" type="button" onClick={handleSSO} className="px-2 text-xs sm:text-sm">
                        <WeChatIcon /> WeChat
                      </Button>
                    </div>
                  </Field>
                </>
              )}

              {step === 2 && (
                <>
                  <Field className="items-center justify-center py-4">
                    <InputOTP maxLength={4} value={otp} onChange={setOtp} autoFocus disabled={isLoading}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                      </InputOTPGroup>
                    </InputOTP>
                  </Field>
                  <Field>
                    <Button type="submit" disabled={otp.length !== 4 || isLoading}>
                      {isLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      {t.login.verifyCode}
                    </Button>
                    <Button variant="ghost" type="button" onClick={() => setStep(1)} className="mt-2 text-muted-foreground" disabled={isLoading}>{t.login.back}</Button>
                  </Field>
                </>
              )}
            </FieldGroup>
          </form>
        </div>
      </div>
    </div>
  );
}
