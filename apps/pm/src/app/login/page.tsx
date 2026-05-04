"use client";

import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "חשבון Google שנבחר אינו משוייך ל-hiveurban.com.",
  Configuration: "שגיאת תצורה בהתחברות. פנה למנהל המערכת.",
  OAuthSignin: "לא ניתן להתחיל התחברות עם Google.",
  OAuthCallback: "שגיאה בחזרה מ-Google. נסה שוב.",
  Default: "ההתחברות נכשלה. נסה שוב.",
};

function LoginContent() {
  const params = useSearchParams();
  const errorCode = params.get("error");
  const errorMessage = errorCode
    ? ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.Default
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-10 rounded-2xl shadow-md flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold text-gray-800">🐝 Hive PM</h1>
        <p className="text-gray-500 text-sm">כניסה עם חשבון Hive Urban</p>
        {errorMessage && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-2 text-center">
            {errorMessage}
          </p>
        )}
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="flex items-center gap-3 bg-white border border-gray-300 rounded-lg px-6 py-3 text-gray-700 font-medium shadow-sm hover:shadow-md transition cursor-pointer"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
